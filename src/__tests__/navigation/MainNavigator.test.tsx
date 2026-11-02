import React from 'react';
import { render } from '@testing-library/react-native';
import MainNavigator from '@/navigation/MainNavigator';
import { BUILT_IN_NAV_ITEMS } from '@/navigation/navigationConfig';

let mockVisibleIds = ['files', 'queue', 'more'];
let mockLanguage = 'fr';
const mockRoutes: string[] = [];

jest.mock('@/screens/DashboardScreen', () => () => null);
jest.mock('@/screens/QueueScreen', () => () => null);
jest.mock('@/screens/ArchivesScreen', () => () => null);
jest.mock('@/screens/FilesScreen', () => () => null);
jest.mock('@/screens/MoreScreen', () => () => null);
jest.mock('@/components/settings/SmartPlugPowerControls', () => ({
  QuickSmartPlugPanel: () => require('react').createElement(require('react-native').Text, { accessibilityRole: 'button' }, 'Quick power switches'),
}));
jest.mock('@/api/server', () => ({
  useServerStore: (selector: (state: { demoMode: boolean }) => unknown) => selector({ demoMode: false }),
}));
jest.mock('@/navigation/useNavigationItems', () => ({
  useNavigationItems: () => ({
    items: require('@/navigation/navigationConfig').BUILT_IN_NAV_ITEMS.filter((item: { id: string }) => mockVisibleIds.includes(item.id)),
  }),
}));
jest.mock('@/i18n', () => ({ useTranslation: () => ({ text: (value: string) => `${mockLanguage}:${value}` }) }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: { text: 'white' } }) }));
jest.mock('@react-navigation/elements', () => ({
  getHeaderTitle: (options: { title: string }) => options.title,
  Header: ({ headerTitle, headerRight }: { headerTitle: () => React.ReactNode; headerRight: () => React.ReactNode }) =>
    require('react').createElement(require('react-native').View, null, headerTitle(), headerRight()),
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children, screenOptions }: {
      children: React.ReactNode;
      screenOptions: (props: { route: { name: string } }) => {
        tabBarAccessibilityLabel: string;
        header: (props: { layout: { width: number; height: number }; options: object }) => React.ReactNode;
      };
    }) => require('react').Children.map(children, (child: React.ReactElement<{ name: string }>) => {
      const { name } = child.props;
      mockRoutes.push(name);
      const options = screenOptions({ route: { name } });
      const headerOptions = {
        ...options,
        headerRight: () => require('react').createElement(require('react-native').Text, null, 'Existing live status'),
      };
      return require('react').createElement(require('react-native').View, { accessibilityLabel: options.tabBarAccessibilityLabel }, options.header({ layout: { width: 390, height: 844 }, options: headerOptions }));
    }),
    Screen: () => null,
  }),
}));

describe('MainNavigator', () => {
  beforeEach(() => {
    mockVisibleIds = ['files', 'queue', 'more'];
    mockLanguage = 'fr';
    mockRoutes.length = 0;
  });

  it('only registers permitted visible tabs and exposes translated accessible labels and quick power controls', async () => {
    const view = await render(<MainNavigator />);
    expect(mockRoutes).toEqual(BUILT_IN_NAV_ITEMS.filter(item => mockVisibleIds.includes(item.id)).map(item => item.tabRoute));
    expect(mockRoutes).not.toContain('Dashboard');
    expect(view.getByLabelText('fr:Files')).toBeTruthy();
    expect(view.getAllByRole('button', { name: 'Quick power switches' })).toHaveLength(3);
    expect(view.getAllByText('Existing live status')).toHaveLength(3);
    mockLanguage = 'de';
    await view.rerender(<MainNavigator />);
    expect(view.getByLabelText('de:Files')).toBeTruthy();
    expect(view.queryByLabelText('fr:Files')).toBeNull();
  });
});
