import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PrinterCardHeader } from '@/components/printers/PrinterCardHeader';
import type { PrinterCardHeaderProps } from '@/components/printers/PrinterCard.types';
import type { WorkflowPrinterAiStatus } from '@/types/api';
import { selectSettingsSearchResult } from '@/components/settings/SettingsSearchFocus';
jest.mock('@/components/printers/FirmwareBadge', () => ({ FirmwareBadge: () => null }));

const colors = {
  border: '#444444',
  error: '#cc0000',
  info: '#0000cc',
  success: '#00aa00',
  surfaceElevated: '#222222',
  text: '#ffffff',
  textSecondary: '#888888',
  warning: '#ffaa00',
};
const mockNavigate = jest.fn();
const mockRefetch = jest.fn();
let mockStatus: WorkflowPrinterAiStatus;
jest.mock('@/theme', () => ({ useTheme: () => ({ colors }) }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ authEnabled: false, hasPermission: () => true }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockStatus,
    isLoading: false,
    refetch: mockRefetch,
  }),
}));

describe('PrinterCardHeader live AI detection badge', () => {
  const baseProps = {
    printer: {
      id: 1,
      name: 'Printer Alpha',
      model: 'P1S',
      location: 'Lab',
      is_active: true,
    },
    badgeLabel: 'Idle',
    badgeColor: colors.success,
    hmsErrors: [],
    queueCount: 0,
    maintenanceCount: 0,
    printerImageSource: null,
    onShowHmsModal: jest.fn(),
    status: { connected: true, print_options: { spaghetti_detector: true } },
  } as unknown as PrinterCardHeaderProps;
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = {
      enabled: true,
      monitored_printers: null,
      per_printer: {},
      last_error: null,
    };
    selectSettingsSearchResult(null);
  });
  afterEach(() => selectSettingsSearchResult(null));

  it('does not turn enabled firmware detectors into a measured safe verdict', async () => {
    const screen = await render(<PrinterCardHeader {...baseProps} />);
    expect(screen.getByText('AI idle')).toHaveStyle({
      color: colors.textSecondary,
    });
    expect(screen.queryByText('AI safe')).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: /Open AI detection details/ }),
    );
    expect(
      screen.getByText(
        'No inference is available. This is not a measured safe result.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Score:/)).toBeNull();
  });

  it('opens measured verdict details and a working detection-settings shortcut', async () => {
    mockStatus.per_printer['1'] = {
      class: 'warning',
      score: 0.235,
      frame_count: 7,
    };
    const screen = await render(<PrinterCardHeader {...baseProps} />);
    expect(screen.getByText('AI warning')).toHaveStyle({
      color: colors.warning,
    });
    await fireEvent.press(
      screen.getByRole('button', { name: /Open AI detection details/ }),
    );
    expect(screen.getByText('Score: 0.235 • Frames analyzed: 7')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open failure detection settings'));
    expect(mockNavigate).toHaveBeenCalledWith('Settings');
  });

  it('shows a printer-specific failure reason instead of an unrelated global error or safe score', async () => {
    mockStatus.last_error = 'Other printer failed';
    mockStatus.per_printer['1'] = {
      class: 'error',
      score: 0,
      frame_count: 0,
      error: 'Snapshot timed out',
    };
    const screen = await render(<PrinterCardHeader {...baseProps} />);
    await fireEvent.press(
      screen.getByRole('button', { name: /Open AI detection details/ }),
    );
    expect(screen.getByText('Snapshot timed out')).toBeTruthy();
    expect(screen.queryByText(/Score:/)).toBeNull();
    expect(screen.queryByText('Other printer failed')).toBeNull();
  });

  it('hides the badge for an excluded printer or disabled service', async () => {
    mockStatus.monitored_printers = [];
    const screen = await render(<PrinterCardHeader {...baseProps} />);
    expect(screen.queryByText(/^AI /)).toBeNull();
    mockStatus.monitored_printers = null;
    mockStatus.enabled = false;
    await screen.rerender(<PrinterCardHeader {...baseProps} />);
    expect(screen.queryByText(/^AI /)).toBeNull();
  });

  it('does not classify an unfamiliar backend state as safe', async () => {
    mockStatus.per_printer['1'] = {
      class: 'unavailable',
      score: 0,
      frame_count: 0,
    };
    const screen = await render(<PrinterCardHeader {...baseProps} />);
    expect(screen.getByText('AI unknown')).toHaveStyle({
      color: colors.textSecondary,
    });
    await fireEvent.press(
      screen.getByRole('button', { name: /Open AI detection details/ }),
    );
    expect(screen.queryByText(/Score:/)).toBeNull();
  });

  it('retains the health-pill ordering around actual safe inference', async () => {
    mockStatus.per_printer['1'] = {
      class: 'safe',
      score: 0.001,
      frame_count: 5,
    };
    const screen = await render(<PrinterCardHeader {...baseProps} />);
    expect(
      screen
        .getAllByText(/^(Online|HMS OK|AI safe|Maintenance OK)$/)
        .map(node => node.props.children),
    ).toEqual(['Online', 'HMS OK', 'AI safe', 'Maintenance OK']);
  });
});
