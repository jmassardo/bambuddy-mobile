import React from 'react';
import { render } from '@testing-library/react-native';
import { PrinterCardHeader } from '@/components/printers/PrinterCardHeader';

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

jest.mock('@/theme', () => ({
  useTheme: () => ({ colors }),
}));

describe('PrinterCardHeader AI failure detection pill', () => {
  const printer = {
    id: 1,
    name: 'Printer Alpha',
    model: 'P1S',
    location: 'Lab',
    is_active: true,
  } as any;

  const allDetectorsDisabled = {
    spaghetti_detector: false,
    first_layer_inspector: false,
    printing_monitor: false,
    nozzle_clumping_detector: false,
    pileup_detector: false,
    airprint_detector: false,
  };

  const baseProps = {
    printer,
    badgeLabel: 'Idle',
    badgeColor: colors.success,
    hmsErrors: [],
    queueCount: 0,
    maintenanceCount: 0,
    printerImageSource: null,
    onShowHmsModal: jest.fn(),
  };

  it('shows enabled styling when any supported AI detector is enabled', async () => {
    const { getByText } = await render(
      <PrinterCardHeader
        {...baseProps}
        status={{
          connected: true,
          print_options: {
            ...allDetectorsDisabled,
            spaghetti_detector: true,
          },
        } as any}
      />,
    );

    expect(getByText('AI detection on')).toHaveStyle({ color: colors.success });
  });

  it('shows disabled styling when all supported AI detectors are disabled', async () => {
    const { getByText } = await render(
      <PrinterCardHeader
        {...baseProps}
        status={{
          connected: true,
          print_options: allDetectorsDisabled,
        } as any}
      />,
    );

    expect(getByText('AI detection off')).toHaveStyle({ color: colors.textSecondary });
  });

  it('does not show the pill without print options or while offline', async () => {
    const { queryByText, rerender } = await render(
      <PrinterCardHeader
        {...baseProps}
        status={{ connected: true, print_options: null } as any}
      />,
    );

    expect(queryByText(/AI detection/)).toBeNull();

    await rerender(
      <PrinterCardHeader
        {...baseProps}
        status={{
          connected: false,
          print_options: {
            ...allDetectorsDisabled,
            first_layer_inspector: true,
          },
        } as any}
      />,
    );

    expect(queryByText(/AI detection/)).toBeNull();
  });

  it('describes the active detectors in its accessibility label', async () => {
    const { getByLabelText } = await render(
      <PrinterCardHeader
        {...baseProps}
        status={{
          connected: true,
          print_options: {
            ...allDetectorsDisabled,
            spaghetti_detector: true,
            first_layer_inspector: true,
          },
        } as any}
      />,
    );

    expect(
      getByLabelText(
        'AI failure detection enabled. Active detectors: spaghetti detection, first layer inspection',
      ),
    ).toBeTruthy();
  });

  it('keeps the existing health pills in order around the AI status', async () => {
    const { getAllByText } = await render(
      <PrinterCardHeader
        {...baseProps}
        status={{
          connected: true,
          print_options: {
            ...allDetectorsDisabled,
            pileup_detector: true,
          },
        } as any}
      />,
    );
    const healthPills = getAllByText(
      /^(Online|HMS OK|AI detection on|Maintenance OK)$/,
    )
      .map(text => text.props.children)

    expect(healthPills).toEqual([
      'Online',
      'HMS OK',
      'AI detection on',
      'Maintenance OK',
    ]);
  });
});
