import { slicingApi } from '@/api/slicing';
import { request } from '@/api/http';
import type { SliceRequest } from '@/types/api';
jest.mock('@/api/http', () => ({ request: jest.fn().mockResolvedValue({}) }));
const mockedRequest = jest.mocked(request);
beforeEach(() => mockedRequest.mockClear());
describe('Slicing and pipeline server contract', () => {
  it.each(['file', 'archive'] as const)(
    'submits the identical full slice payload for a %s source',
    async sourceType => {
      const body: SliceRequest = {
        printer_preset: { source: 'cloud', id: '123' },
        process_preset: { source: 'local', id: '45' },
        filament_presets: [{ source: 'orca_cloud', id: 'xyz' }],
        filament_colours: ['#FF00FFFF'],
        plate: 0,
        auto_arrange: true,
        auto_orient: true,
        process_overrides: { enable_support: '1' },
        design_overrides: [],
      };
      await slicingApi.slice(
        { sourceType, sourceId: 7, sourceName: 'part.3mf' },
        body,
      );
      expect(mockedRequest).toHaveBeenLastCalledWith(
        `${sourceType === 'file' ? '/library/files' : '/archives'}/7/slice`,
        { method: 'POST', body: JSON.stringify(body) },
      );
    },
  );
  it('queries full positional slots on the actual selected source plate', async () => {
    await slicingApi.requirements(
      { sourceType: 'archive', sourceId: 8, sourceName: 'parts.3mf' },
      4,
      'request:4',
    );
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/archives/8/filament-requirements?plate_id=4&full_slots=true&request_id=request%3A4',
      {},
      null,
    );
  });
  it.each(['file', 'archive'] as const)(
    'uses source identity and bounded copies in %s preflight/run, not project_id',
    async sourceType => {
      const source = { sourceType, sourceId: 9, sourceName: 'project.3mf' };
      const identity =
        sourceType === 'file'
          ? { source_library_file_id: 9 }
          : { source_archive_id: 9 };
      await slicingApi.eligibility(3, source);
      expect(mockedRequest).toHaveBeenLastCalledWith(
        '/slicer-pipelines/3/check-eligibility',
        { method: 'POST', body: JSON.stringify(identity) },
      );
      await slicingApi.run(3, source, 6, true);
      expect(mockedRequest).toHaveBeenLastCalledWith(
        '/slicer-pipelines/3/run',
        {
          method: 'POST',
          body: JSON.stringify({ ...identity, copies: 6, force: true }),
        },
      );
    },
  );
  it('encodes filters, pages history and calls server actions without re-enqueueing successful copies', async () => {
    await slicingApi.runs({
      offset: 20,
      limit: 20,
      target_model_class: 'A1 Mini',
      status: 'failed',
      pipeline_id: 5,
    });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/pipeline-runs?offset=20&limit=20&target_model_class=A1%20Mini&status=failed&pipeline_id=5',
    );
    await slicingApi.retry(42);
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/pipeline-runs/42/retry-failed',
      { method: 'POST' },
    );
    await slicingApi.cancel(43);
    expect(mockedRequest).toHaveBeenLastCalledWith('/pipeline-runs/43/cancel', {
      method: 'POST',
    });
    await slicingApi.clear();
    expect(mockedRequest).toHaveBeenLastCalledWith('/pipeline-runs/clear', {
      method: 'POST',
    });
  });
});
