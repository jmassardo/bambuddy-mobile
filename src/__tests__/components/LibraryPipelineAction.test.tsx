import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { LibraryPipelineAction } from '@/components/files/LibraryPipelineAction';

const mockPipeline = jest.fn();
let mockPermissions = ['pipelines:read', 'pipelines:run'];
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: (permission: string) => mockPermissions.includes(permission),
  }),
}));
jest.mock('@/theme', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/components/slicing/RunWithPipelineModal', () => ({
  RunWithPipelineModal: (props: Record<string, unknown>) => {
    mockPipeline(props);
    const { Text, Pressable } = require('react-native');
    return (
      <Pressable onPress={props.onClose}>
        <Text>Close pipeline</Text>
      </Pressable>
    );
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions = ['pipelines:read', 'pipelines:run'];
});

it.each(['design.3mf', 'part.stl', 'part.step', 'part.STP'])(
  'launches the reusable pipeline modal for %s with the actual library source',
  async filename => {
    const screen = await render(
      <LibraryPipelineAction fileId={7} filename={filename} isFolder={false} />,
    );
    expect(mockPipeline).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Run with pipeline'));
    expect(mockPipeline).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        sourceType: 'file',
        sourceId: 7,
        sourceName: filename,
      }),
    );
    await fireEvent.press(screen.getByText('Close pipeline'));
    expect(screen.queryByText('Close pipeline')).toBeNull();
  },
);

it.each([
  ['toolpath.gcode.3mf', false],
  ['toolpath.gcode', false],
  ['drawing.pdf', false],
  ['folder.stl', true],
])(
  'does not offer pipelines for %s (folder %s)',
  async (filename, isFolder) => {
    const screen = await render(
      <LibraryPipelineAction
        fileId={7}
        filename={filename}
        isFolder={isFolder}
      />,
    );
    expect(screen.queryByText('Run with pipeline')).toBeNull();
  },
);

it.each([['pipelines:read'], ['pipelines:run'], []])(
  'requires read and run permissions (%j)',
  async (...permissions) => {
    mockPermissions = permissions;
    const screen = await render(
      <LibraryPipelineAction fileId={7} filename="part.stl" isFolder={false} />,
    );
    expect(screen.queryByText('Run with pipeline')).toBeNull();
    expect(mockPipeline).not.toHaveBeenCalled();
  },
);
