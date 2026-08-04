import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ArchiveDetailScreen from '@/screens/ArchiveDetailScreen';
import { useServerStore } from '@/api/server';

const archive = {
  id: 7,
  filename: 'widget.3mf',
  print_name: 'Widget',
  timelapse_path: '/timelapse.mp4',
  photos: ['finished.jpg'],
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
  }),
  useRoute: () => ({
    params: { id: '7' },
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(() => Promise.resolve()),
  }),
  useQuery: ({ queryKey }: { queryKey: Array<string | number> }) =>
    queryKey[0] === 'archive'
      ? {
          data: archive,
          isLoading: false,
          isError: false,
          isRefetching: false,
          refetch: jest.fn(() => Promise.resolve()),
        }
      : {
          data: [],
          isLoading: false,
          isError: false,
          isRefetching: false,
          refetch: jest.fn(() => Promise.resolve()),
        },
  useMutation: () => ({
    isPending: false,
    mutateAsync: jest.fn(() => Promise.resolve()),
  }),
}));

jest.mock('@/api/client', () => ({
  api: {
    getArchiveThumbnail: () =>
      'https://bambuddy.test/api/v1/archives/7/thumbnail?token=media-token',
    getArchiveTimelapse: () =>
      'https://bambuddy.test/api/v1/archives/7/timelapse?token=media-token',
    getArchivePhotoUrl: (_archiveId: number, photo: string) =>
      `https://bambuddy.test/api/v1/archives/7/photos/${photo}?token=media-token`,
  },
}));

jest.mock('@/hooks/useStreamToken', () => ({
  useMediaToken: () => ({
    token: 'media-token',
    isReady: true,
  }),
}));

jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
  }),
}));

jest.mock('@/components/common/AppUI', () => {
  const ReactModule = require('react');
  const {
    Pressable: MockPressable,
    Text: MockText,
    View: MockView,
  } = require('react-native');
  return {
    KeyValueRow: () => null,
    PrimaryButton: ({
      label,
      onPress,
    }: {
      label: string;
      onPress: () => void;
    }) =>
      ReactModule.createElement(
        MockPressable,
        { accessibilityRole: 'button', onPress },
        ReactModule.createElement(MockText, null, label),
      ),
    SectionCard: ({
      title,
      children,
    }: {
      title: string;
      children: React.ReactNode;
    }) =>
      ReactModule.createElement(
        MockView,
        null,
        ReactModule.createElement(MockText, null, title),
        children,
      ),
  };
});

jest.mock('@/components/archives/EditArchiveModal', () => ({
  EditArchiveModal: () => null,
}));

jest.mock('@/components/archives/PrintLogModal', () => ({
  PrintLogModal: () => null,
}));

jest.mock('@/components/common/ConfirmModal', () => ({
  ConfirmModal: () => null,
}));

jest.mock('react-native-qrcode-svg', () => () => null);

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

jest.mock('react-native-webview', () => {
  const ReactModule = require('react');
  const { View: MockView } = require('react-native');
  return {
    WebView: (props: Record<string, unknown>) =>
      ReactModule.createElement(MockView, props),
  };
});

describe('ArchiveDetailScreen media failures', () => {
  beforeEach(() => {
    archive.photos = ['finished.jpg'];
    useServerStore.setState({
      serverUrl: 'https://bambuddy.test',
      loading: false,
    });
  });

  it('replaces a timelapse HTTP failure with an error and retry action', async () => {
    const result = await render(<ArchiveDetailScreen />);
    const webView = result.getByTestId('archive-timelapse-webview');
    const initialUrl = webView.props.source.uri;

    await fireEvent(webView, 'httpError');

    expect(result.getByText('Unable to load this timelapse.')).toBeTruthy();
    await fireEvent.press(result.getByText('Retry timelapse'));

    expect(
      result.getByTestId('archive-timelapse-webview').props.source.uri,
    ).not.toBe(initialUrl);
  });

  it('replaces a failed gallery image with an error and retry action', async () => {
    const result = await render(<ArchiveDetailScreen />);
    const photo = result.getByTestId('archive-photo-finished.jpg');
    const initialUrl = photo.props.source.uri;

    await fireEvent(photo, 'error');

    expect(result.getByText('Photo failed to load.')).toBeTruthy();
    await fireEvent.press(result.getByText('Retry photo'));

    expect(
      result.getByTestId('archive-photo-finished.jpg').props.source.uri,
    ).not.toBe(initialUrl);
  });

  it('labels an archive with no photos without showing a failure', async () => {
    archive.photos = [];

    const result = await render(<ArchiveDetailScreen />);

    expect(
      result.getByText('No photos have been added to this archive.'),
    ).toBeTruthy();
    expect(result.queryByText('Photo failed to load.')).toBeNull();
  });
});
