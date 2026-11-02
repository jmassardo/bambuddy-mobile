import { workflowSettingsApi } from '@/api/workflowSettings';
import { settingsApi } from '@/api/settings';
import { request } from '@/api/http';
import {
  apiExplorerApi,
  buildExplorerRequest,
  listOperations,
  schemaExample,
} from '@/api/apiExplorer';
import { useServerStore } from '@/api/server';

jest.mock('@/api/http', () => ({
  request: jest.fn(),
  requestWithFallback: jest.fn(),
}));
const mockRequest = jest.mocked(request);

describe('workflow settings API roundtrips', () => {
  beforeEach(() => mockRequest.mockReset());

  it('uses the dedicated retention endpoint without losing destructive-policy flags', async () => {
    const config = { enabled: true, days: 365, purge_stats: false };
    mockRequest.mockResolvedValue(config);
    expect(await workflowSettingsApi.getArchiveRetention()).toEqual(config);
    expect(
      await workflowSettingsApi.saveArchiveRetention({
        ...config,
        purge_stats: true,
      }),
    ).toEqual(config);
    expect(mockRequest).toHaveBeenLastCalledWith('/archives/purge/settings', {
      method: 'PUT',
      body: JSON.stringify({ ...config, purge_stats: true }),
    });
  });

  it('includes even an explicitly empty token in a draft connection test', async () => {
    await workflowSettingsApi.testDetection('http://obico:3333', '');
    expect(mockRequest).toHaveBeenCalledWith('/obico/test-connection', {
      method: 'POST',
      body: '{"url":"http://obico:3333","token":""}',
    });
  });

  it('persists server scalar and JSON settings without Boolean coercion or nested JSON conversion', async () => {
    const settings = {
      default_bed_levelling: 'auto',
      default_flow_cali: 'off',
      default_nozzle_offset_cali: 'on',
      default_confirm_outcome: true,
      confirm_outcome_external_prints: false,
      confirm_default_good_on_plate_clear: true,
      queue_max_concurrent_uploads: 16,
      queue_keep_bed_warm: true,
      queue_keep_warm_bed_temp: 90,
      queue_keep_warm_max_minutes: 120,
      preheat_filament_targets: '{"ASA":45,"default":0}',
      queue_drying_enabled: true,
      queue_drying_block: false,
      ambient_drying_enabled: true,
      ambient_drying_sustained_minutes: 15,
      print_drying_enabled: false,
      drying_presets:
        '{"PLA":{"n3f":45,"n3s":45,"n3f_hours":12,"n3s_hours":12}}',
      ams_humidity_thresholds: '{"default":60,"PLA":50}',
      nozzle_temp_presets: '[100,200,300]',
      finish_photo_restore_plate: true,
      library_archive_mode: 'ask',
      library_disk_warning_gb: 2.5,
      obico_ml_token: 'draft-token',
      obico_enabled_printers: '[1,7]',
      gcode_snippets: '{"P1S":{"start_gcode":"G28\\nM400","end_gcode":"M84"}}',
    };
    mockRequest.mockResolvedValue(settings);
    const returned = await settingsApi.updateSettings(settings);
    expect(returned).toEqual(settings);
    expect(mockRequest).toHaveBeenCalledWith('/settings/', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  });
});

describe('live OpenAPI explorer', () => {
  const operation = {
    parameters: [
      { name: 'id', in: 'path' as const, required: true },
      { name: 'name', in: 'query' as const },
      { name: 'Authorization', in: 'header' as const },
    ],
  };
  beforeEach(() =>
    useServerStore.setState({ serverUrl: 'https://server.example' }),
  );
  afterEach(() => jest.restoreAllMocks());

  it('encodes path/query values, enforces required parameters and never attaches session credentials', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => '{"detail":"bad data"}',
      headers: {
        forEach: (callback: (value: string, key: string) => void) =>
          callback('application/json', 'content-type'),
      },
    } as Response);
    const response = await apiExplorerApi.execute(
      '/api/v1/printers/{id}',
      'get',
      operation,
      {
        'path:id': 'A/B',
        'query:name': 'a & b',
        'header:Authorization': 'session-secret',
      },
      '',
      'explicit-test-key',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://server.example/api/v1/printers/A%2FB?name=a%20%26%20b',
      expect.objectContaining({
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          'X-API-Key': 'explicit-test-key',
        },
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        status: 422,
        body: '{"detail":"bad data"}',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.duration).toBeGreaterThanOrEqual(0);
    expect(() =>
      buildExplorerRequest('/api/v1/printers/{id}', operation, {}, ''),
    ).toThrow('Required path parameter: id');
  });

  it('rejects external URLs, traversal and invalid JSON before network access', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    expect(() =>
      buildExplorerRequest('https://other.example/api/v1/', {}, {}, 'secret'),
    ).toThrow();
    expect(() =>
      buildExplorerRequest('/api/v1/../secret', {}, {}, 'secret'),
    ).toThrow();
    await expect(
      apiExplorerApi.execute(
        '/api/v1/printers/',
        'post',
        {},
        {},
        '{invalid',
        'key',
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('browses only HTTP operations and resolves referenced request schemas', () => {
    const document = {
      paths: {
        '/api/v1/printers/': {
          get: { summary: 'List printers', tags: ['printers'] },
          parameters: {},
        },
      },
      components: {
        schemas: {
          Job: {
            type: 'object',
            properties: {
              copies: { type: 'integer', default: 2 },
              active: { type: 'boolean' },
            },
          },
        },
      },
    };
    expect(listOperations(document)).toHaveLength(1);
    expect(
      schemaExample(document, { $ref: '#/components/schemas/Job' }),
    ).toEqual({ copies: 2, active: false });
  });
});
