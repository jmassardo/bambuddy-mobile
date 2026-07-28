import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { ExternalCamerasSettingsSection } from '@/components/settings/ExternalCamerasSettingsSection';
import type { SettingsScreenController } from '@/components/settings/useSettingsScreenController';

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
    isDark: true,
  }),
}));

jest.mock('@/components/common/AppUI', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    SectionCard: ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) =>
      React.createElement(View, null, React.createElement(Text, null, title), subtitle ? React.createElement(Text, null, subtitle) : null, children),
    PrimaryButton: ({ label, onPress, loading, disabled }: { label: string; onPress?: () => void; loading?: boolean; disabled?: boolean }) =>
      React.createElement(Text, { onPress, accessibilityState: { disabled: !!disabled }, testID: `btn-${label}` }, loading ? 'loading' : label),
    StatusBadge: ({ label }: { label: string }) => React.createElement(Text, null, label),
  };
});

jest.mock('@/components/common/StateScreens', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    EmptyState: ({ title, message }: { title: string; message: string }) =>
      React.createElement(React.Fragment, null, React.createElement(Text, null, title), React.createElement(Text, null, message)),
  };
});

function textContent(node: ReactTestInstance): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function findText(root: ReactTestRenderer.ReactTestRenderer, value: string) {
  return root.root.findAllByType(Text).find(node => textContent(node) === value) ?? null;
}

function buildMockController(overrides?: {
  cameras?: Array<Record<string, unknown>>;
  printerLabelById?: Record<string, string>;
  testIsPending?: boolean;
  testVariables?: number;
}): SettingsScreenController {
  const cameras = overrides?.cameras ?? [];
  const printerLabelById = overrides?.printerLabelById ?? {};

  return {
    colors: new Proxy({}, { get: () => '#888888' }) as SettingsScreenController['colors'],
    derived: {
      externalCameraItems: cameras,
      printerLabelById,
      sectionSummaries: {},
      isDirtySection: false,
      advancedAuth: undefined,
      ldapStatus: undefined,
      twoFAStatus: undefined,
      virtualPrinterItems: [],
      virtualPrinterModels: [],
      currentUserRow: null,
      securityRows: [],
      smtpPortBySecurity: { starttls: 587, ssl: 465, none: 25 },
      printerOptions: [],
    } as unknown as SettingsScreenController['derived'],
    mutations: {
      testExternalCameraMutation: {
        isPending: overrides?.testIsPending ?? false,
        variables: overrides?.testVariables ?? undefined,
        mutateAsync: jest.fn().mockResolvedValue({ success: true, message: 'OK' }),
      },
    } as unknown as SettingsScreenController['mutations'],
    actions: {
      openExternalCameraModal: jest.fn(),
      setPendingDeleteExternalCamera: jest.fn(),
    } as unknown as SettingsScreenController['actions'],
  } as unknown as SettingsScreenController;
}

describe('ExternalCamerasSettingsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderSection(controller: SettingsScreenController) {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ExternalCamerasSettingsSection controller={controller} />);
    });
    return renderer;
  }

  it('renders the section title and subtitle', () => {
    const controller = buildMockController();
    const renderer = renderSection(controller);

    expect(findText(renderer, 'External cameras')).not.toBeNull();
    expect(findText(renderer, 'Manage IP camera streams and map each camera to a printer.')).not.toBeNull();
  });

  it('renders empty state when there are no cameras', () => {
    const controller = buildMockController({ cameras: [] });
    const renderer = renderSection(controller);

    expect(findText(renderer, 'No external cameras')).not.toBeNull();
    expect(findText(renderer, 'Add external camera streams to monitor printers beyond the built-in feed.')).not.toBeNull();
  });

  it('renders the "Add external camera" button', () => {
    const controller = buildMockController();
    const renderer = renderSection(controller);

    expect(findText(renderer, 'Add external camera')).not.toBeNull();
  });

  it('calls openExternalCameraModal when Add button is pressed', () => {
    const controller = buildMockController();
    const renderer = renderSection(controller);
    const btn = findText(renderer, 'Add external camera');

    act(() => {
      btn!.props.onPress();
    });

    expect(controller.actions.openExternalCameraModal).toHaveBeenCalledTimes(1);
    expect(controller.actions.openExternalCameraModal).toHaveBeenCalledWith();
  });

  it('renders camera items with name, URL, and type badge', () => {
    const cameras = [
      { id: 1, name: 'Front Cam', stream_url: 'http://10.0.0.1/mjpeg', camera_type: 'mjpeg', printer_id: 0 },
      { id: 2, name: 'Side Cam', stream_url: 'rtsp://10.0.0.2/stream', camera_type: 'rtsp', printer_id: 5 },
    ];
    const controller = buildMockController({ cameras, printerLabelById: { '5': 'Printer Five' } });
    const renderer = renderSection(controller);

    expect(findText(renderer, 'Front Cam')).not.toBeNull();
    expect(findText(renderer, 'http://10.0.0.1/mjpeg')).not.toBeNull();
    expect(findText(renderer, 'MJPEG')).not.toBeNull();
    expect(findText(renderer, 'Printer: Unassigned')).not.toBeNull();

    expect(findText(renderer, 'Side Cam')).not.toBeNull();
    expect(findText(renderer, 'rtsp://10.0.0.2/stream')).not.toBeNull();
    expect(findText(renderer, 'RTSP')).not.toBeNull();
    expect(findText(renderer, 'Printer: Printer Five')).not.toBeNull();
  });

  it('shows "Unknown printer" when printer_id is positive but not found', () => {
    const cameras = [
      { id: 1, name: 'Cam', stream_url: 'http://x/y', camera_type: 'mjpeg', printer_id: 99 },
    ];
    const controller = buildMockController({ cameras, printerLabelById: {} });
    const renderer = renderSection(controller);

    expect(findText(renderer, 'Printer: Unknown printer')).not.toBeNull();
  });

  it('calls openExternalCameraModal with camera when Edit is pressed', () => {
    const cameras = [
      { id: 1, name: 'Cam1', stream_url: 'http://a/b', camera_type: 'mjpeg', printer_id: 0 },
    ];
    const controller = buildMockController({ cameras });
    const renderer = renderSection(controller);
    const editBtn = findText(renderer, 'Edit');

    act(() => {
      editBtn!.props.onPress();
    });

    expect(controller.actions.openExternalCameraModal).toHaveBeenCalledWith(cameras[0]);
  });

  it('calls setPendingDeleteExternalCamera when Delete is pressed', () => {
    const cameras = [
      { id: 1, name: 'Cam1', stream_url: 'http://a/b', camera_type: 'mjpeg', printer_id: 0 },
    ];
    const controller = buildMockController({ cameras });
    const renderer = renderSection(controller);
    const deleteBtn = findText(renderer, 'Delete');

    act(() => {
      deleteBtn!.props.onPress();
    });

    expect(controller.actions.setPendingDeleteExternalCamera).toHaveBeenCalledWith(cameras[0]);
  });

  it('calls testExternalCameraMutation.mutateAsync when Test connection is pressed', () => {
    const cameras = [
      { id: 7, name: 'TestCam', stream_url: 'http://a/b', camera_type: 'snapshot', printer_id: 0 },
    ];
    const controller = buildMockController({ cameras });
    const renderer = renderSection(controller);
    const testBtn = findText(renderer, 'Test connection');

    act(() => {
      testBtn!.props.onPress();
    });

    expect(controller.mutations.testExternalCameraMutation.mutateAsync).toHaveBeenCalledWith(7);
  });

  it('shows loading state when test mutation is pending for the camera', () => {
    const cameras = [
      { id: 3, name: 'Cam', stream_url: 'http://x/y', camera_type: 'mjpeg', printer_id: 0 },
    ];
    const controller = buildMockController({ cameras, testIsPending: true, testVariables: 3 });
    const renderer = renderSection(controller);

    // The mock PrimaryButton shows 'loading' text when loading=true
    expect(findText(renderer, 'loading')).not.toBeNull();
    expect(findText(renderer, 'Test connection')).toBeNull();
  });

  it('does not render empty state when cameras exist', () => {
    const cameras = [
      { id: 1, name: 'Cam', stream_url: 'http://a/b', camera_type: 'mjpeg', printer_id: 0 },
    ];
    const controller = buildMockController({ cameras });
    const renderer = renderSection(controller);

    expect(findText(renderer, 'No external cameras')).toBeNull();
  });
});
