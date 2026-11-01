import { integrationsApi } from '@/api/integrations';
import { request } from '@/api/http';
import { buildPlugPayload, makePlugDraft } from '@/components/settings/smartPlugForm';
import type { SmartPlug } from '@/types/api';

jest.mock('@/api/http', () => ({ request: jest.fn() }));
const mockRequest = jest.mocked(request);

describe('integration payloads', () => {
  beforeEach(() => mockRequest.mockReset());

  it('saves nested MQTT energy/state-only mappings, conversion and nullable association', async () => {
    const draft = { ...makePlugDraft(), name: 'Meter', plug_type: 'mqtt', mqtt_energy_topic: 'meter/json', mqtt_energy_path: 'data.energy', mqtt_energy_multiplier: '0.001', mqtt_state_topic: 'meter/state', mqtt_state_path: 'relay.enabled', mqtt_state_on_value: 'true', controls_printer_power: false };
    const payload = buildPlugPayload(draft);
    mockRequest.mockResolvedValue(payload);
    await integrationsApi.savePlug(payload, 12);
    expect(mockRequest).toHaveBeenCalledWith('/smart-plugs/12', {
      method: 'PATCH', body: expect.any(String),
    });
    expect(JSON.parse(mockRequest.mock.calls[0][1]!.body as string)).toMatchObject({
      mqtt_energy_topic: 'meter/json', mqtt_energy_path: 'data.energy', mqtt_energy_multiplier: 0.001,
      mqtt_state_path: 'relay.enabled', mqtt_state_on_value: 'true', mqtt_power_topic: null,
      printer_id: null, controls_printer_power: false,
    });
  });

  it.each([
    {
      overrides: {},
      effective: { mqtt_power_topic: 'legacy/measurements', mqtt_energy_topic: 'legacy/measurements', mqtt_state_topic: 'legacy/measurements' },
    },
    {
      overrides: { mqtt_power_topic: 'dedicated/power', mqtt_state_topic: 'dedicated/state' },
      effective: { mqtt_power_topic: 'dedicated/power', mqtt_energy_topic: 'legacy/measurements', mqtt_state_topic: 'dedicated/state' },
    },
  ])('preserves every effective legacy MQTT subscription when renaming ($overrides)', ({ overrides, effective }) => {
    const plug = {
      name: 'Legacy meter', plug_type: 'mqtt', mqtt_topic: 'legacy/measurements',
      mqtt_power_topic: null, mqtt_energy_topic: null, mqtt_state_topic: null,
      mqtt_power_path: 'data.power', mqtt_energy_path: 'data.energy', mqtt_state_path: 'relay.enabled',
      mqtt_energy_multiplier: 0.001, mqtt_state_on_value: 'true', ...overrides,
    } as SmartPlug;
    const draft = { ...makePlugDraft(plug), name: 'Renamed meter' };
    const payload = buildPlugPayload(draft);
    expect(payload).toMatchObject({
      name: 'Renamed meter', mqtt_topic: null, ...effective,
      mqtt_power_path: 'data.power', mqtt_energy_path: 'data.energy', mqtt_state_path: 'relay.enabled',
      mqtt_energy_multiplier: 0.001, mqtt_state_on_value: 'true',
    });
    expect(buildPlugPayload(makePlugDraft({ ...plug, ...payload }))).toEqual(payload);
  });

  it.each([null, 'POST', 'GET'] as const)('preserves the effective REST method when editing %s', rest_method => {
    const plug = {
      name: 'REST outlet', plug_type: 'rest', rest_method,
      rest_on_url: 'https://outlet.local/relay', rest_off_url: 'https://outlet.local/relay',
      rest_on_body: '{"on":true}', rest_off_body: '{"on":false}',
    } as SmartPlug;
    expect(buildPlugPayload(makePlugDraft(plug))).toMatchObject({
      rest_method: rest_method || 'POST', rest_on_body: '{"on":true}', rest_off_body: '{"on":false}',
    });
  });

  it('round-trips authenticated POST, bodies, all REST measurements and policies', () => {
    const draft = {
      ...makePlugDraft(), name: 'Shelly', plug_type: 'rest', rest_method: 'POST',
      rest_on_url: 'https://plug.local/rpc', rest_on_body: '{"id":0,"on":true}',
      rest_off_url: 'https://plug.local/rpc', rest_off_body: '{"id":0,"on":false}',
      rest_headers: '{"Authorization":"Bearer secret","Content-Type":"application/json"}',
      rest_status_url: 'https://plug.local/status', rest_status_path: 'result.output', rest_status_on_value: 'true',
      rest_power_path: 'result.apower', rest_power_multiplier: '1',
      rest_energy_path: 'result.today', rest_energy_multiplier: '0.001',
      rest_energy_total_path: 'result.aenergy.total', rest_energy_total_multiplier: '0.001',
      printer_id: '7', controls_printer_power: false, off_delay_mode: 'temperature', off_temp_threshold: '65',
      auto_off_persistent: true, auto_off_after_drying: true, off_delay_after_drying_minutes: '0',
      power_alert_enabled: true, power_alert_high: '400', power_alert_low: '0',
      schedule_enabled: true, schedule_on_time: '07:30', schedule_off_time: '23:59',
    };
    const payload = buildPlugPayload(draft);
    expect(payload).toMatchObject({
      rest_method: 'POST', rest_on_body: '{"id":0,"on":true}', rest_off_body: '{"id":0,"on":false}',
      rest_energy_total_path: 'result.aenergy.total', rest_energy_total_multiplier: 0.001,
      rest_status_on_value: 'true', power_alert_low: 0, printer_id: 7, controls_printer_power: false,
      auto_off_persistent: true, off_temp_threshold: 65, off_delay_after_drying_minutes: 0, schedule_on_time: '07:30',
    });
    expect(buildPlugPayload(makePlugDraft({ ...payload, id: 8 } as SmartPlug))).toEqual(payload);
  });

  it.each([
    ['mqtt_power_multiplier', '0'], ['off_delay_minutes', '61'], ['off_temp_threshold', '29'],
    ['off_delay_after_drying_minutes', '121'], ['power_alert_high', '-1'],
    ['schedule_on_time', '24:00'], ['rest_headers', '["not an object"]'],
  ])('rejects invalid %s without mutating draft', (field, value) => {
    const draft = { ...makePlugDraft(), name: 'Power', plug_type: 'rest', rest_on_url: 'http://plug/on', [field]: value };
    if (field.startsWith('mqtt_')) draft.plug_type = 'mqtt';
    const copy = { ...draft };
    expect(() => buildPlugPayload(draft)).toThrow();
    expect(draft).toEqual(copy);
  });

  it('uses the real target/VP diagnostic, CA, naming, discovery and HA endpoints', async () => {
    mockRequest.mockResolvedValue({});
    await integrationsApi.diagnoseVP(4);
    await integrationsApi.diagnoseTarget(7);
    await integrationsApi.certificate();
    await integrationsApi.saveArchiveNaming('filename');
    await integrationsApi.testHA('http://ha.local:8123', 'token');
    await integrationsApi.haEntities('desk & lamp');
    await integrationsApi.startScan();
    await integrationsApi.stopScan();
    expect(mockRequest.mock.calls.map(call => call[0])).toEqual([
      '/virtual-printers/4/diagnostic', '/printers/7/diagnostic', '/virtual-printers/ca-certificate',
      '/settings/virtual-printer?archive_name_source=filename', '/smart-plugs/ha/test-connection',
      '/smart-plugs/ha/entities?search=desk%20%26%20lamp', '/smart-plugs/discover/scan', '/smart-plugs/discover/stop',
    ]);
    expect(mockRequest.mock.calls[4][1]).toEqual({ method: 'POST', body: JSON.stringify({ url: 'http://ha.local:8123', token: 'token' }) });
  });

  it('surfaces a negative command acknowledgement rather than pretending power changed', async () => {
    mockRequest.mockResolvedValue({ success: false });
    await expect(integrationsApi.control(7, 'off')).rejects.toThrow('did not confirm');
  });

  it('sends only the draft REST test contract supported by the server', async () => {
    mockRequest.mockResolvedValue({ success: false, error: 'HTTP 401' });
    await expect(integrationsApi.testREST('https://plug/status', 'POST', '{"Authorization":"abc"}')).resolves.toEqual({ success: false, error: 'HTTP 401' });
    expect(mockRequest).toHaveBeenCalledWith('/smart-plugs/rest/test-connection', { method: 'POST', body: JSON.stringify({ url: 'https://plug/status', method: 'POST', headers: '{"Authorization":"abc"}' }) });
  });
});
