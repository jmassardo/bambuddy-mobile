import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Chip, MenuItem, PrimaryButton, SearchBar } from '@/components/common/AppUI';
import { SearchBar as StandaloneSearchBar } from '@/components/common/SearchBar';
import { ErrorState, OfflineState } from '@/components/common/StateScreens';
import { translateNative } from '@/i18n';
import { colors } from '@/theme/tokens';

let mockTheme: 'light' | 'dark' = 'light';
jest.mock('@/theme', () => ({
  useTheme: () => ({
    colors: require('@/theme/tokens').colors[mockTheme],
    isDark: mockTheme === 'dark',
  }),
}));

describe('shared controls', () => {
  beforeEach(() => {
    mockTheme = 'light';
  });

  it.each([
    ['shared', SearchBar],
    ['standalone', StandaloneSearchBar],
  ] as const)('clears the %s search field with its accessible action', async (_name, Component) => {
    function SearchHarness() {
      const [value, setValue] = useState('PLA');
      return <Component value={value} onChangeText={setValue} placeholder="Find filament" />;
    }
    const ui = await render(<SearchHarness />);
    expect(ui.getByDisplayValue('PLA')).toBeTruthy();
    await fireEvent.press(ui.getByRole('button', { name: translateNative('native.a6ccc01fea9133be') }));
    expect(ui.getByPlaceholderText('Find filament').props.value).toBe('');
    expect(ui.queryByRole('button', { name: translateNative('native.a6ccc01fea9133be') })).toBeNull();
  });

  it('prevents disabled chip actions while preserving its selection', async () => {
    const onPress = jest.fn();
    const ui = await render(<Chip label="P1S" selected disabled onPress={onPress} />);
    await fireEvent.press(ui.getByRole('button', { name: 'P1S' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(ui.getByRole('button', { name: 'P1S' }).props.accessibilityState).toMatchObject({
      disabled: true, selected: true,
    });

    await ui.rerender(<Chip label="P1S" selected onPress={onPress} />);
    await fireEvent.press(ui.getByRole('button', { name: 'P1S' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([{ disabled: true }, { loading: true }])('prevents unavailable menu actions: %p', async state => {
    const onPress = jest.fn();
    const ui = await render(<MenuItem icon="power" label="Sign out" onPress={onPress} {...state} />);
    await fireEvent.press(ui.getByRole('button', { name: 'Sign out' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(ui.getByRole('button', { name: 'Sign out' }).props.accessibilityState).toMatchObject({
      disabled: true, busy: Boolean('loading' in state && state.loading),
    });
  });

  it.each(['light', 'dark'] as const)('keeps destructive and disabled labels readable in %s mode', async theme => {
    mockTheme = theme;
    const onPress = jest.fn();
    const ui = await render(<>
      <PrimaryButton label="Delete" variant="danger" onPress={onPress} />
      <PrimaryButton label="Unavailable" disabled onPress={onPress} />
    </>);
    expect(ui.getByText('Delete')).toHaveStyle({ color: colors[theme].textInverse });
    expect(ui.getByText('Unavailable')).toHaveStyle({ color: colors[theme].textSecondary });
    await fireEvent.press(ui.getByRole('button', { name: 'Unavailable' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each([ErrorState, OfflineState])('exposes an accessible retry action for %p', async Component => {
    const onRetry = jest.fn();
    const ui = await render(<Component message="Connection failed" onRetry={onRetry} />);
    await fireEvent.press(ui.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
