import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import Clipboard from '@react-native-clipboard/clipboard';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { integrationsApi } from '@/api/integrations';
import { api } from '@/api/client';
import { SmartPlugEditor } from '@/components/settings/SmartPlugEditor';
import { BulkPlugPower, PlugPowerControl, PrinterPowerIntegration, plugPowerState } from '@/components/settings/SmartPlugPowerControls';
import { VirtualPrinterAddress, VirtualPrinterDiagnostics, VirtualPrinterGlobalSetup } from '@/components/settings/VirtualPrinterIntegration';
import { shareBlob } from '@/utils/share';
import { HomeAssistantSettings } from '@/components/settings/HomeAssistantSettings';
import { clearTestQueryClients, createTestQueryClient } from '@/testUtils/queryClient';
import type { SmartPlug } from '@/types/api';
import type { SettingsScreenController } from '@/components/settings/useSettingsScreenController';

jest.mock('@react-native-clipboard/clipboard', () => ({ setString: jest.fn() }));
jest.mock('@/api/integrations', () => ({
  integrationsApi: {
    plugStatus: jest.fn(), control: jest.fn(), linkedPlug: jest.fn(), updatePlug: jest.fn(),
    haEntities: jest.fn(), haSensors: jest.fn(), scanStatus: jest.fn(), discoveredDevices: jest.fn(),
    savePlug: jest.fn(), testREST: jest.fn(), testTasmota: jest.fn(), startScan: jest.fn(), stopScan: jest.fn(),
    diagnoseVP: jest.fn(), diagnoseTarget: jest.fn(), testHA: jest.fn(),
    certificate: jest.fn(), vpSettings: jest.fn(), saveArchiveNaming: jest.fn(), tailscale: jest.fn(),
  },
}));
jest.mock('@/api/client', () => ({ api: { getPrinters: jest.fn() } }));
jest.mock('@/utils/share', () => ({ shareBlob: jest.fn() }));
let mockCanControl = true;
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission === 'smart_plugs:control' ? mockCanControl : true }) }));
jest.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));

const plug = {
  id: 4, name: 'Printer outlet', plug_type: 'rest', enabled: true, rest_method: 'GET', rest_on_url: 'http://outlet/on', rest_off_url: 'http://outlet/off',
  printer_id: 7, auto_off: false, auto_off_executed: false, last_state: 'ON',
} as SmartPlug;

async function mount(child: React.ReactNode) {
  return render(<QueryClientProvider client={createTestQueryClient()}>{child}</QueryClientProvider>);
}

describe('native integration controls', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCanControl = true;
    jest.mocked(integrationsApi.plugStatus).mockResolvedValue({ state: null, reachable: false, energy: null, device_name: null });
    jest.mocked(integrationsApi.control).mockResolvedValue({ success: true, action: 'off' });
    jest.mocked(api.getPrinters).mockResolvedValue([]);
    jest.mocked(integrationsApi.scanStatus).mockResolvedValue({ running: false, scanned: 0, total: 0 });
    jest.mocked(integrationsApi.discoveredDevices).mockResolvedValue([]);
  });
  afterEach(async () => { await cleanup(); clearTestQueryClients(); jest.runOnlyPendingTimers(); jest.useRealTimers(); });

  it('keeps unknown state distinct from OFF and confirms individual power changes', async () => {
    expect(plugPowerState({ state: null, reachable: true, device_name: null, energy: null }, 'ON')).toBe('Unknown');
    const screen = await mount(<PlugPowerControl plug={plug} canControl />);
    expect(await screen.findByText(/Unknown/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Turn off'));
    expect(integrationsApi.control).not.toHaveBeenCalled();
    expect(screen.getByText('Turn off Printer outlet?')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Turn off').at(-1)!);
    await waitFor(() => expect(integrationsApi.control).toHaveBeenCalledWith(4, 'off'));
  });

  it('never offers power control for MQTT monitor-only devices', async () => {
    const screen = await mount(<PlugPowerControl plug={{ ...plug, plug_type: 'mqtt' }} canControl />);
    expect(await screen.findByText('MQTT monitor-only')).toBeTruthy();
    expect(screen.queryByText('Turn off')).toBeNull();
  });

  it('bulk confirmation names only capable devices and reports partial failures', async () => {
    jest.mocked(integrationsApi.control).mockImplementation(async id => {
      if (id === 5) throw new Error('device unreachable');
      return { success: true, action: 'off' };
    });
    const screen = await mount(<BulkPlugPower plugs={[plug, { ...plug, id: 5, name: 'Fan' }, { ...plug, id: 6, plug_type: 'mqtt', name: 'Meter' }, { ...plug, id: 8, name: 'ON only', rest_off_url: null }]} canControl />);
    await fireEvent.press(screen.getByText('All off'));
    expect(screen.getByText('Only these enabled, switchable devices will change:\nPrinter outlet\nFan')).toBeTruthy();
    expect(integrationsApi.control).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Confirm power change'));
    expect(await screen.findByText('Printer outlet: success\nFan: device unreachable')).toBeTruthy();
    expect(integrationsApi.control).toHaveBeenCalledTimes(2);
  });

  it('uses the explicitly linked printer plug and guards already-executed auto-off', async () => {
    jest.mocked(integrationsApi.linkedPlug).mockResolvedValue({ ...plug, auto_off_executed: true });
    const screen = await mount(<PrinterPowerIntegration printerId={7} />);
    expect(await screen.findByText('Auto-off already executed')).toBeTruthy();
    expect(integrationsApi.linkedPlug).toHaveBeenCalledWith(7);
    await fireEvent(screen.getByRole('switch'), 'valueChange', false);
    expect(integrationsApi.updatePlug).not.toHaveBeenCalled();
  });

  it('updates auto-off only with control permission and blocks duplicate pending changes', async () => {
    jest.mocked(integrationsApi.linkedPlug).mockResolvedValue(plug);
    jest.mocked(integrationsApi.updatePlug).mockImplementation(() => new Promise(() => {}));
    const screen = await mount(<PrinterPowerIntegration printerId={7} />);
    expect(await screen.findByText('Auto-off after print')).toBeTruthy();
    mockCanControl = false;
    await screen.rerender(<QueryClientProvider client={createTestQueryClient()}><PrinterPowerIntegration printerId={7} /></QueryClientProvider>);
    await screen.findByText('Auto-off after print');
    await fireEvent(screen.getByRole('switch'), 'valueChange', true);
    expect(integrationsApi.updatePlug).not.toHaveBeenCalled();
    mockCanControl = true;
    await screen.rerender(<QueryClientProvider client={createTestQueryClient()}><PrinterPowerIntegration printerId={7} /></QueryClientProvider>);
    await screen.findByText('Auto-off after print');
    await fireEvent(screen.getByRole('switch'), 'valueChange', true);
    await waitFor(() => expect(integrationsApi.updatePlug).toHaveBeenCalledWith(4, { auto_off: true }));
    await fireEvent(screen.getByRole('switch'), 'valueChange', false);
    expect(integrationsApi.updatePlug).toHaveBeenCalledTimes(1);
  });

  it('discovers and selects a Tasmota device and can stop scanning', async () => {
    jest.mocked(integrationsApi.startScan).mockResolvedValue({ running: true, scanned: 1, total: 254 });
    jest.mocked(integrationsApi.stopScan).mockResolvedValue({ running: false, scanned: 1, total: 254 });
    jest.mocked(integrationsApi.discoveredDevices).mockResolvedValue([{ name: 'Lab relay', ip_address: '192.168.1.40', module: 1, state: 'OFF', discovered_at: null }]);
    const screen = await mount(<SmartPlugEditor existingPlugs={[]} canControl onClose={jest.fn()} />);
    await fireEvent.press(screen.getByText('Discover Tasmota plugs'));
    await waitFor(() => expect(integrationsApi.startScan).toHaveBeenCalled());
    await fireEvent.press(await screen.findByText('Lab relay (192.168.1.40)'));
    expect(screen.getByDisplayValue('192.168.1.40')).toBeTruthy();
    expect(screen.getByDisplayValue('Lab relay')).toBeTruthy();
    await fireEvent.press(screen.getByText('Stop discovery'));
    await waitFor(() => expect(integrationsApi.stopScan).toHaveBeenCalled());
  });

  it('filters duplicate HA switch choices and incompatible/duplicate sensor selections', async () => {
    jest.mocked(integrationsApi.haEntities).mockResolvedValue([
      { entity_id: 'switch.used', friendly_name: 'Used switch', domain: 'switch', state: 'on' },
      { entity_id: 'switch.free', friendly_name: 'Free switch', domain: 'switch', state: 'on' },
      { entity_id: 'sensor.temperature', friendly_name: 'Temperature', domain: 'sensor', state: '20' },
    ]);
    jest.mocked(integrationsApi.haSensors).mockResolvedValue([
      { entity_id: 'sensor.watts', friendly_name: 'Watts', unit_of_measurement: 'W', state: '10' },
      { entity_id: 'sensor.kwh', friendly_name: 'Energy', unit_of_measurement: 'kWh', state: '3' },
    ]);
    const screen = await mount(<SmartPlugEditor plug={{ ...plug, plug_type: 'homeassistant', ha_entity_id: 'switch.free', ha_energy_today_entity: 'sensor.kwh' }} existingPlugs={[{ ...plug, id: 9, ha_entity_id: 'switch.used' }]} canControl onClose={jest.fn()} />);
    expect(await screen.findByText('Free switch (switch.free)')).toBeTruthy();
    expect(screen.queryByText('Used switch (switch.used)')).toBeNull();
    expect(screen.queryByText('Temperature (sensor.temperature)')).toBeNull();
    expect(screen.getAllByText('Energy (sensor.kwh, kWh)')).toHaveLength(1);
    expect(screen.getAllByText('Watts (sensor.watts, W)')).toHaveLength(1);
  });

  it('keeps unsaved REST input and displays the actual negative test result', async () => {
    jest.mocked(integrationsApi.testREST).mockResolvedValue({ success: false, error: 'HTTP 401: invalid credentials' });
    const screen = await mount(<SmartPlugEditor plug={plug} existingPlugs={[plug]} canControl onClose={jest.fn()} />);
    await fireEvent.changeText(screen.getByDisplayValue('http://outlet/on'), 'http://outlet/new');
    await fireEvent.press(screen.getByText('Test unsaved connection'));
    expect(await screen.findByText('HTTP 401: invalid credentials')).toBeTruthy();
    expect(screen.getByDisplayValue('http://outlet/new')).toBeTruthy();
    expect(integrationsApi.testREST).toHaveBeenCalledWith('http://outlet/new', 'GET', null);
  });

  it('runs real target diagnostics, shows check detail and settles for retry', async () => {
    jest.mocked(integrationsApi.diagnoseTarget).mockResolvedValue({
      printer_id: 7, ip_address: '192.168.1.7', overall: 'problems',
      checks: [{ id: 'port_mqtt', status: 'fail', params: { port: 8883 } }],
    });
    const screen = await mount(<VirtualPrinterDiagnostics id={7} target />);
    await fireEvent.press(screen.getByText('Test target connection'));
    expect(await screen.findByText('Overall diagnosis: problems')).toBeTruthy();
    expect(screen.getByText(/Allow TCP 8883/)).toBeTruthy();
    expect(screen.getByText('Retry diagnostics')).not.toBeDisabled();
    expect(integrationsApi.diagnoseTarget).toHaveBeenCalledWith(7);
  });

  it('copies/shares the actual CA and persists archive-name source through global VP settings', async () => {
      jest.mocked(integrationsApi.certificate).mockResolvedValue({ pem: '-----BEGIN CERTIFICATE-----\nSERVER-CA\n-----END CERTIFICATE-----', fingerprint_sha256: 'AB:CD:EF', not_valid_after: '2027-01-01' });
      jest.mocked(integrationsApi.vpSettings).mockResolvedValue({ archive_name_source: 'metadata' });
      jest.mocked(integrationsApi.saveArchiveNaming).mockResolvedValue({});
      jest.mocked(shareBlob).mockResolvedValue(undefined);
      const screen = await mount(<VirtualPrinterGlobalSetup canEdit />);
      expect(await screen.findByText('SHA-256: AB:CD:EF')).toBeTruthy();
      await fireEvent.press(screen.getByText('Copy CA certificate'));
      expect(Clipboard.setString).toHaveBeenCalledWith('-----BEGIN CERTIFICATE-----\nSERVER-CA\n-----END CERTIFICATE-----');
      await fireEvent.press(screen.getByText('Share / save CA certificate'));
      await waitFor(() => expect(shareBlob).toHaveBeenCalledWith(expect.any(Blob), 'bambuddy-ca.crt'));
      await fireEvent.press(screen.getByText('Uploaded filename'));
      await waitFor(() => expect(integrationsApi.saveArchiveNaming).toHaveBeenCalledWith('filename', expect.anything()));
  });

  it('copies the real advertised FQDN rather than inventing a slicer address', async () => {
      jest.mocked(integrationsApi.tailscale).mockResolvedValue({ available: true, fqdn: 'lab.tailnet.ts.net', error: null });
      const screen = await mount(<VirtualPrinterAddress disabled={false} />);
      await fireEvent.press(await screen.findByText('Copy slicer address: lab.tailnet.ts.net'));
      expect(Clipboard.setString).toHaveBeenCalledWith('lab.tailnet.ts.net');
  });

  it('honors individually environment-managed HA values and reports test failures', async () => {
    jest.mocked(integrationsApi.testHA).mockResolvedValue({ success: false, error: 'Cannot reach Home Assistant', message: null });
    const controller = {
      state: { draft: { ha_enabled: true, ha_url: 'http://ha.local', ha_token: 'secret', ha_url_from_env: true, ha_token_from_env: false } },
      actions: { setDraft: jest.fn() }, colors: { text: '#ffffff' },
      permissions: { canUpdateSettings: true, canControlSmartPlugs: true },
    } as unknown as SettingsScreenController;
    const screen = await mount(<HomeAssistantSettings controller={controller} />);
    expect(screen.getByDisplayValue('http://ha.local').props.editable).toBe(false);
    expect(screen.getByDisplayValue('secret').props.editable).toBe(true);
    await fireEvent.press(screen.getByText('Test Home Assistant connection'));
    expect(await screen.findByText('Cannot reach Home Assistant')).toBeTruthy();
    expect(integrationsApi.testHA).toHaveBeenCalledWith('http://ha.local', 'secret');
  });
});
