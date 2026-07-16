import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { AddPrinterModal } from '@/components/printers/AddPrinterModal';

const mockDiagnoseConnection = jest.fn();
const mockGetDiscoveryInfo = jest.fn();
const mockStopDiscovery = jest.fn();
const mockStopSubnetScan = jest.fn();

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockModal = ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
    visible ? React.createElement(View, null, children) : null;
  return { __esModule: true, default: MockModal };
});

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) =>
      React.createElement(View, props, children),
  };
});

jest.mock('@/api/client', () => ({
  api: {
    diagnoseConnection: (...args: unknown[]) => mockDiagnoseConnection(...args),
    getDiscoveryInfo: (...args: unknown[]) => mockGetDiscoveryInfo(...args),
    stopDiscovery: (...args: unknown[]) => mockStopDiscovery(...args),
    stopSubnetScan: (...args: unknown[]) => mockStopSubnetScan(...args),
  },
}));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
    isDark: true,
  }),
}));

function textContent(node: ReactTestInstance): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function findText(root: ReactTestRenderer.ReactTestRenderer, value: string) {
  return root.root.findAllByType(Text).find(node => textContent(node) === value) ?? null;
}

function findPressableForText(root: ReactTestRenderer.ReactTestRenderer, value: string) {
  const matches = root.root.findAllByType(Text).filter(node => textContent(node) === value);
  for (const match of matches.reverse()) {
    let current: ReactTestInstance | null = match;
    while (current) {
      if (typeof current.props.onPress === 'function') return current;
      current = current.parent;
    }
  }
  throw new Error(`Pressable for text "${value}" not found`);
}

function findInput(root: ReactTestRenderer.ReactTestRenderer, placeholder: string) {
  return root.root.findAllByType(TextInput).find(node => node.props.placeholder === placeholder);
}

describe('AddPrinterModal', () => {
  const onAdd = jest.fn();
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDiagnoseConnection.mockResolvedValue({ checks: [] });
    mockGetDiscoveryInfo.mockResolvedValue({ is_docker: false, subnets: [] });
    mockStopDiscovery.mockResolvedValue(undefined);
    mockStopSubnetScan.mockResolvedValue(undefined);
  });

  function renderModal() {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AddPrinterModal visible onAdd={onAdd} onClose={onClose} existingSerials={[]} />,
      );
    });
    return renderer;
  }

  async function fillRequiredFields(renderer: ReactTestRenderer.ReactTestRenderer) {
    await act(async () => {
      findInput(renderer, 'My Printer')?.props.onChangeText('Farm One');
      findInput(renderer, '192.168.1.100 or printer.local')?.props.onChangeText('192.168.1.50');
      findInput(renderer, '01P00A000000000')?.props.onChangeText('SERIAL123');
      findInput(renderer, 'From printer settings')?.props.onChangeText('ACCESS');
    });
  }

  it('renders the expected form fields', () => {
    const renderer = renderModal();

    expect(findText(renderer, 'Add Printer')).not.toBeNull();
    expect(findInput(renderer, 'My Printer')).toBeTruthy();
    expect(findInput(renderer, '192.168.1.100 or printer.local')).toBeTruthy();
    expect(findInput(renderer, '01P00A000000000')).toBeTruthy();
    expect(findInput(renderer, 'From printer settings')).toBeTruthy();
    expect(findInput(renderer, 'e.g. Garage, Print Farm')).toBeTruthy();
  });

  it('keeps the submit button disabled until all required fields are present', async () => {
    const renderer = renderModal();

    expect(findPressableForText(renderer, 'Add Printer').props.disabled).toBe(true);

    await fillRequiredFields(renderer);

    expect(findPressableForText(renderer, 'Add Printer').props.disabled).toBe(false);
  });

  it('does not submit when required fields are missing', () => {
    const renderer = renderModal();

    act(() => {
      findPressableForText(renderer, 'Add Printer').props.onPress();
    });

    expect(onAdd).not.toHaveBeenCalled();
    expect(mockDiagnoseConnection).not.toHaveBeenCalled();
  });

  it('calls onAdd with the normalized payload on submit', async () => {
    const renderer = renderModal();

    await act(async () => {
      findInput(renderer, 'My Printer')?.props.onChangeText('  Farm One  ');
      findInput(renderer, '192.168.1.100 or printer.local')?.props.onChangeText(' 192.168.1.50 ');
      findInput(renderer, '01P00A000000000')?.props.onChangeText(' SERIAL123 ');
      findInput(renderer, 'From printer settings')?.props.onChangeText('ACCESS');
      findInput(renderer, 'e.g. Garage, Print Farm')?.props.onChangeText(' Print Farm ');
    });

    await act(async () => {
      await findPressableForText(renderer, 'Add Printer').props.onPress();
    });

    expect(mockDiagnoseConnection).toHaveBeenCalledWith({
      ip_address: '192.168.1.50',
      serial_number: 'SERIAL123',
      access_code: 'ACCESS',
    });
    expect(onAdd).toHaveBeenCalledWith({
      name: 'Farm One',
      serial_number: 'SERIAL123',
      ip_address: '192.168.1.50',
      access_code: 'ACCESS',
      model: '',
      location: 'Print Farm',
      auto_archive: true,
    });
  });
});
