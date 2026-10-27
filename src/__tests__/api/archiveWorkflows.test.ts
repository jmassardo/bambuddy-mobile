import { archiveWorkflows } from '@/api/archiveWorkflows';
import { archivesApi } from '@/api/archives';
import { request, uploadFile } from '@/api/http';
import { useServerStore } from '@/api/server';

jest.mock('@/api/http', () => ({
  request: jest.fn(),
  requestBlob: jest.fn(),
  uploadFile: jest.fn(),
  getAuthToken: () => 'auth-token',
  buildMediaUrl: (path: string) => `https://farm.test/api/v1${path}`,
  ApiError: class extends Error {},
}));
const mockRequest = jest.mocked(request);

beforeEach(() => {
  jest.clearAllMocks();
  useServerStore.setState({ serverUrl: 'https://farm.test' });
});

it('fetches complete archive history beyond 300 and stops only after the actual last page', async () => {
  const rows = Array.from({ length: 653 }, (_, id) => ({ id }));
  mockRequest.mockImplementation(async endpoint => {
    const offset = Number(
      new URL(String(endpoint), 'https://farm.test').searchParams.get('offset'),
    );
    return rows.slice(offset, offset + 200);
  });
  const result = await archiveWorkflows.allArchives();
  expect(result).toHaveLength(653);
  expect(result[652].id).toBe(652);
  expect(mockRequest.mock.calls.map(call => call[0])).toEqual(
    [0, 200, 400, 600].map(offset => `/archives/?limit=200&offset=${offset}`),
  );
});

it('uses scoped run history and real print-log filter and ordering contracts', async () => {
  mockRequest.mockResolvedValue({
    items: [{ id: 7, archive_id: 8 }],
    total: 1,
  });
  expect(await archivesApi.getArchivePrintLog(8)).toEqual([
    { id: 7, archive_id: 8 },
  ]);
  expect(mockRequest).toHaveBeenLastCalledWith('/archives/8/runs');
  await archivesApi.getPrintLogs({
    search: 'name',
    printerId: 2,
    createdByUsername: 'alice',
    dateTo: '2026-10-27T23:59:59',
    limit: 50,
    offset: 550,
    sortBy: 'energy',
    sortDir: 'asc',
  });
  const query = new URL(
    String(mockRequest.mock.calls.at(-1)?.[0]),
    'https://farm.test',
  ).searchParams;
  expect(Object.fromEntries(query)).toEqual({
    search: 'name',
    printer_id: '2',
    created_by_username: 'alice',
    date_to: '2026-10-27T23:59:59',
    limit: '50',
    offset: '550',
    sort_by: 'energy',
    sort_dir: 'asc',
  });
});

it('submits pending metadata, source attachment, timelapse selection and tag rename to supported endpoints', async () => {
  await archiveWorkflows.accept(5, {
    tags: 'red',
    notes: 'reviewed',
    project_id: 3,
  });
  expect(mockRequest).toHaveBeenLastCalledWith('/pending-uploads/5/archive', {
    method: 'POST',
    body: JSON.stringify({ tags: 'red', notes: 'reviewed', project_id: 3 }),
  });
  await archiveWorkflows.renameTag('client/a', 'client/b');
  expect(mockRequest).toHaveBeenLastCalledWith('/archives/tags/client%2Fa', {
    method: 'PUT',
    body: '{"new_name":"client/b"}',
  });
  await archiveWorkflows.selectTimelapse(9, 'plate 2.mp4');
  expect(mockRequest).toHaveBeenLastCalledWith(
    '/archives/9/timelapse/select?filename=plate%202.mp4',
    { method: 'POST' },
  );
  const file = {
    uri: 'file:///design.3mf',
    name: 'design.3mf',
    type: 'application/octet-stream',
  };
  await archiveWorkflows.attach(9, 'source', file);
  expect(uploadFile).toHaveBeenLastCalledWith('/archives/9/source', file);
});

it('edits and deletes log rows independently of archives', async () => {
  await archiveWorkflows.updateRun(14, {
    status: 'failed',
    failure_reason: 'warping',
  });
  expect(mockRequest).toHaveBeenLastCalledWith('/print-log/14', {
    method: 'PATCH',
    body: '{"status":"failed","failure_reason":"warping"}',
  });
  await archiveWorkflows.deleteRun(14);
  expect(mockRequest).toHaveBeenLastCalledWith('/print-log/14', {
    method: 'DELETE',
  });
});

it('processes real video seconds, speed and named audio multipart instead of changing nonexistent metadata', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'completed',
        output_path: 'original.mp4',
        message: 'Done',
      }),
    } as Response);
  const result = await archiveWorkflows.processTimelapse(
    9,
    { trimStart: 1.125, trimEnd: 8.625, speed: 2 },
    { uri: 'file:///music.mp3', name: 'music.mp3', type: 'audio/mpeg' },
  );
  expect(result.status).toBe('completed');
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://farm.test/api/v1/archives/9/timelapse/process');
  expect(options?.headers).toEqual({ Authorization: 'Bearer auth-token' });
  const form = options?.body as unknown as {
    keys(): Iterable<string>;
    get(name: string): unknown;
  };
  expect([...form.keys()]).toEqual([
    'trim_start',
    'trim_end',
    'speed',
    'save_mode',
    'audio',
  ]);
  expect(form.get('trim_start')).toBe('1.125');
  expect(form.get('trim_end')).toBe('8.625');
  expect(form.get('save_mode')).toBe('replace');
  expect(mockRequest).not.toHaveBeenCalled();
  fetchMock.mockRestore();
});
