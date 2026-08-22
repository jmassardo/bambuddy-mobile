import React from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  type View,
} from 'react-native';
import ReactTestRenderer, {
  act,
  type ReactTestInstance,
} from 'react-test-renderer';

type ConfirmModalExport =
  typeof import('@/components/common/ConfirmModal').ConfirmModal;
let ConfirmModal: ConfirmModalExport;

jest.mock('react-native/Libraries/Components/View/View', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(
      (
        {
          children,
          ...props
        }: { children: React.ReactNode } & Record<string, unknown>,
        ref: React.ForwardedRef<unknown>,
      ) => ReactModule.createElement('View', { ...props, ref }, children),
    ),
  };
});

jest.mock('react-native/Libraries/Text/Text', () => {
  const ReactModule = require('react');
  const { View: ViewComponent } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(
      (
        {
          children,
          ...props
        }: { children: React.ReactNode } & Record<string, unknown>,
        ref: React.ForwardedRef<unknown>,
      ) =>
        ReactModule.createElement(ViewComponent, { ...props, ref }, children),
    ),
  };
});

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const ReactModule = require('react');
  const { View: ViewComponent } = require('react-native');
  const MockModal = ({
    children,
    visible,
    ...props
  }: {
    children: React.ReactNode;
    visible: boolean;
  } & Record<string, unknown>) =>
    visible
      ? ReactModule.createElement(
          ViewComponent,
          { ...props, testID: 'mock-modal' },
          children,
        )
      : null;
  return { __esModule: true, default: MockModal };
});

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => {
  const ReactModule = require('react');
  const { View: ViewComponent } = require('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      ...props
    }: { children: React.ReactNode } & Record<string, unknown>) =>
      ReactModule.createElement(ViewComponent, props, children),
  };
});

jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: new Proxy({}, { get: () => '#888888' }),
    isDark: true,
  }),
}));

let titleNativeNode: number | null = 101;

function textContent(node: ReactTestInstance): string {
  return node.children
    .map(child => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function findText(root: ReactTestRenderer.ReactTestRenderer, value: string) {
  return (
    root.root.findAllByType(Text).find(node => textContent(node) === value) ??
    null
  );
}

function findAction(root: ReactTestRenderer.ReactTestRenderer, label: string) {
  return root.root.find(
    node =>
      node.props.accessibilityRole === 'button' &&
      node.props.accessibilityLabel === label,
  );
}

function findNativeModal(root: ReactTestRenderer.ReactTestRenderer) {
  return root.root.findByProps({ testID: 'mock-modal' });
}

function flattenStyle(node: ReactTestInstance) {
  return StyleSheet.flatten(node.props.style);
}

describe('ConfirmModal', () => {
  const defaultProps: React.ComponentProps<typeof ConfirmModal> = {
    visible: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    title: 'Delete printer?',
    message: 'This cannot be undone.',
    confirmLabel: 'Delete',
    cancelLabel: 'Keep',
  };
  let setAccessibilityFocusSpy: jest.SpiedFunction<
    typeof AccessibilityInfo.setAccessibilityFocus
  >;

  beforeAll(() => {
    ConfirmModal = require('@/components/common/ConfirmModal').ConfirmModal;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    titleNativeNode = 101;
    setAccessibilityFocusSpy = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    setAccessibilityFocusSpy.mockRestore();
  });

  function renderModal(
    props?: Partial<React.ComponentProps<typeof ConfirmModal>>,
  ) {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <ConfirmModal {...defaultProps} {...props} />,
        {
          createNodeMock: () => titleNativeNode,
        },
      );
    });
    return renderer;
  }

  function updateModal(
    renderer: ReactTestRenderer.ReactTestRenderer,
    props?: Partial<React.ComponentProps<typeof ConfirmModal>>,
  ) {
    act(() => {
      renderer.update(<ConfirmModal {...defaultProps} {...props} />);
    });
  }

  function runFocusTimers() {
    act(() => {
      jest.advanceTimersByTime(1);
    });
  }

  it('preserves required props and legacy default labels and variant', () => {
    const renderer = renderModal({
      confirmLabel: undefined,
      cancelLabel: undefined,
    });

    expect(findText(renderer, 'Delete printer?')).not.toBeNull();
    expect(findText(renderer, 'This cannot be undone.')).not.toBeNull();
    expect(findText(renderer, 'Confirm')).not.toBeNull();
    expect(findText(renderer, 'Cancel')).not.toBeNull();
    expect(
      renderer.root.findByProps({ accessibilityLabel: 'Danger confirmation' }),
    ).toBeTruthy();
  });

  it.each([
    ['danger', 'Danger confirmation'],
    ['warning', 'Warning confirmation'],
    ['info', 'Info confirmation'],
  ] as const)(
    'renders the %s variant with non-color context',
    (variant, context) => {
      const renderer = renderModal({ variant });
      const icon = renderer.root.findByProps({ accessibilityLabel: context });

      expect(icon.props.accessible).toBe(true);
      expect(icon.props.accessibilityRole).toBe('image');
    },
  );

  it('preserves custom labels and callbacks', () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    const renderer = renderModal({ onClose, onConfirm });

    act(() => {
      findAction(renderer, 'Delete').props.onPress();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('accepts an optional View-compatible return focus ref', () => {
    const returnFocusRef = React.createRef<View>();

    expect(() => renderModal({ returnFocusRef })).not.toThrow();
    expect(() => renderModal({ returnFocusRef: undefined })).not.toThrow();
  });

  it('exposes dialog isolation, header semantics, and named button states', () => {
    const renderer = renderModal();
    const dialog = renderer.root.findByProps({ role: 'dialog' });
    const titleHeader = renderer.root.findByProps({
      accessibilityRole: 'header',
    });
    const titleText = findText(renderer, 'Delete printer?');
    const cancel = findAction(renderer, 'Keep');
    const confirm = findAction(renderer, 'Delete');

    expect(dialog.props.accessibilityViewIsModal).toBe(true);
    expect(titleHeader.props.accessibilityLabel).toBe('Delete printer?');
    expect(titleText?.props.allowFontScaling).toBe(true);
    expect(titleText?.props.numberOfLines).toBeUndefined();
    expect(cancel.props.accessibilityState).toEqual({ disabled: false });
    expect(confirm.props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
  });

  it('focuses the title after a false-to-true presentation', () => {
    const renderer = renderModal({ visible: false });

    updateModal(renderer, { visible: true });
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    expect(setAccessibilityFocusSpy).not.toHaveBeenCalled();
    runFocusTimers();

    expect(setAccessibilityFocusSpy).toHaveBeenCalledWith(101);
  });

  it('returns focus once per visible-to-hidden cycle', () => {
    const trigger = 202 as unknown as View;
    const returnFocusRef: React.RefObject<View | null> = { current: trigger };
    const renderer = renderModal({ returnFocusRef });
    runFocusTimers();
    setAccessibilityFocusSpy.mockClear();

    updateModal(renderer, { visible: false, returnFocusRef });
    runFocusTimers();
    updateModal(renderer, { visible: false, returnFocusRef });
    runFocusTimers();

    expect(setAccessibilityFocusSpy).toHaveBeenCalledTimes(1);
    expect(setAccessibilityFocusSpy).toHaveBeenCalledWith(202);

    updateModal(renderer, { visible: true, returnFocusRef });
    runFocusTimers();
    setAccessibilityFocusSpy.mockClear();
    updateModal(renderer, { visible: false, returnFocusRef });
    runFocusTimers();
    expect(setAccessibilityFocusSpy).toHaveBeenCalledTimes(1);
  });

  it('safely handles missing, stale, null-handle, and throwing focus targets', () => {
    const staleRef: React.RefObject<View | null> = { current: null };
    titleNativeNode = null;
    const renderer = renderModal({ visible: false, returnFocusRef: staleRef });

    updateModal(renderer, { visible: true, returnFocusRef: staleRef });
    runFocusTimers();
    updateModal(renderer, { visible: false, returnFocusRef: staleRef });
    expect(() => runFocusTimers()).not.toThrow();
    expect(setAccessibilityFocusSpy).not.toHaveBeenCalled();

    const trigger = {} as View;
    const throwingRef: React.RefObject<View | null> = { current: trigger };
    updateModal(renderer, { visible: true, returnFocusRef: throwingRef });
    expect(() => runFocusTimers()).not.toThrow();
    updateModal(renderer, { visible: false, returnFocusRef: throwingRef });
    expect(() => runFocusTimers()).not.toThrow();
    expect(setAccessibilityFocusSpy).not.toHaveBeenCalled();

    const inaccessibleRef = Object.defineProperty({}, 'current', {
      get: () => {
        throw new Error('trigger unmounted');
      },
    }) as React.RefObject<View | null>;
    updateModal(renderer, { visible: true, returnFocusRef: inaccessibleRef });
    runFocusTimers();
    updateModal(renderer, { visible: false, returnFocusRef: inaccessibleRef });
    expect(() => runFocusTimers()).not.toThrow();
  });

  it('cancels stale entry and return focus on hide, reopen, and unmount', () => {
    const trigger = 303 as unknown as View;
    const returnFocusRef: React.RefObject<View | null> = { current: trigger };
    const renderer = renderModal({ visible: false, returnFocusRef });

    updateModal(renderer, { visible: true, returnFocusRef });
    updateModal(renderer, { visible: false, returnFocusRef });
    updateModal(renderer, { visible: true, returnFocusRef });
    runFocusTimers();
    expect(setAccessibilityFocusSpy).toHaveBeenCalledTimes(1);

    updateModal(renderer, { visible: false, returnFocusRef });
    act(() => renderer.unmount());
    expect(() => runFocusTimers()).not.toThrow();
    expect(setAccessibilityFocusSpy).toHaveBeenCalledTimes(1);
  });

  it('centralizes cancel and native close without duplicate onClose', () => {
    const onClose = jest.fn();
    const renderer = renderModal({ onClose });

    act(() => {
      findAction(renderer, 'Keep').props.onPress();
      findNativeModal(renderer).props.onRequestClose();
      findAction(renderer, 'Keep').props.onPress();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus after cancel, native close, and confirmation dismissal without adding onClose', () => {
    const trigger = 404 as unknown as View;
    const returnFocusRef: React.RefObject<View | null> = { current: trigger };
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    const cancelRenderer = renderModal({ onClose, onConfirm, returnFocusRef });
    act(() => findAction(cancelRenderer, 'Keep').props.onPress());
    updateModal(cancelRenderer, {
      visible: false,
      onClose,
      onConfirm,
      returnFocusRef,
    });
    runFocusTimers();
    expect(onClose).toHaveBeenCalledTimes(1);

    const nativeRenderer = renderModal({ onClose, onConfirm, returnFocusRef });
    act(() => findNativeModal(nativeRenderer).props.onRequestClose());
    updateModal(nativeRenderer, {
      visible: false,
      onClose,
      onConfirm,
      returnFocusRef,
    });
    runFocusTimers();
    expect(onClose).toHaveBeenCalledTimes(2);

    const confirmRenderer = renderModal({ onClose, onConfirm, returnFocusRef });
    act(() => findAction(confirmRenderer, 'Delete').props.onPress());
    updateModal(confirmRenderer, {
      visible: false,
      onClose,
      onConfirm,
      returnFocusRef,
    });
    runFocusTimers();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(setAccessibilityFocusSpy).toHaveBeenCalledWith(404);
  });

  it('guards rapid confirmation and conflicting close synchronously', () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    const renderer = renderModal({ onClose, onConfirm });
    const confirm = findAction(renderer, 'Delete');

    act(() => {
      confirm.props.onPress();
      confirm.props.onPress();
      findAction(renderer, 'Keep').props.onPress();
      findNativeModal(renderer).props.onRequestClose();
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(findAction(renderer, 'Delete').props.disabled).toBe(true);
  });

  it('keeps both actions disabled and the confirm name busy while loading', () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    const renderer = renderModal({ loading: true, onClose, onConfirm });
    const cancel = findAction(renderer, 'Keep');
    const confirm = findAction(renderer, 'Delete');

    expect(findText(renderer, 'Delete')).toBeNull();
    expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(cancel.props.disabled).toBe(true);
    expect(cancel.props.accessibilityState).toEqual({ disabled: true });
    expect(confirm.props.disabled).toBe(true);
    expect(confirm.props.accessibilityLabel).toBe('Delete');
    expect(confirm.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });

    act(() => {
      cancel.props.onPress();
      confirm.props.onPress();
      findNativeModal(renderer).props.onRequestClose();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('rethrows a synchronous confirm error, unlocks, and allows one retry', () => {
    const error = new Error('confirmation failed');
    const onConfirm = jest.fn().mockImplementationOnce(() => {
      throw error;
    });
    const renderer = renderModal({ onConfirm });

    expect(() => {
      act(() => findAction(renderer, 'Delete').props.onPress());
    }).toThrow(error);
    expect(findAction(renderer, 'Delete').props.disabled).toBe(false);

    act(() => {
      findAction(renderer, 'Delete').props.onPress();
      findAction(renderer, 'Delete').props.onPress();
    });
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('allows one deliberate retry after loading changes from true to false while visible', () => {
    const onConfirm = jest.fn();
    const renderer = renderModal({ onConfirm });

    act(() => findAction(renderer, 'Delete').props.onPress());
    updateModal(renderer, { loading: true, onConfirm });
    updateModal(renderer, { loading: false, onConfirm });
    act(() => {
      findAction(renderer, 'Delete').props.onPress();
      findAction(renderer, 'Delete').props.onPress();
    });

    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('uses a bounded growing ScrollView, wrapping actions, unclipped text, and 44-point targets', () => {
    const renderer = renderModal();
    const dialog = renderer.root.findByProps({ role: 'dialog' });
    const scrollView = renderer.root.findByType(ScrollView);
    const title = findText(renderer, 'Delete printer?');
    const message = findText(renderer, 'This cannot be undone.');
    const wrappingActions = renderer.root.find(
      node =>
        flattenStyle(node)?.flexWrap === 'wrap' &&
        flattenStyle(node)?.flexDirection === 'row',
    );

    expect(flattenStyle(dialog).maxHeight).toBe('80%');
    expect(flattenStyle(scrollView).flexShrink).toBe(1);
    expect(
      StyleSheet.flatten(scrollView.props.contentContainerStyle).flexGrow,
    ).toBe(1);
    expect(flattenStyle(wrappingActions).width).toBe('100%');
    expect(title?.props.numberOfLines).toBeUndefined();
    expect(message?.props.numberOfLines).toBeUndefined();
    expect(message?.props.allowFontScaling).toBe(true);

    for (const action of [
      findAction(renderer, 'Keep'),
      findAction(renderer, 'Delete'),
    ]) {
      expect(flattenStyle(action).minWidth).toBeGreaterThanOrEqual(44);
      expect(flattenStyle(action).minHeight).toBeGreaterThanOrEqual(44);
      expect(flattenStyle(action).flexBasis).toBeGreaterThanOrEqual(44);
    }
  });
});
