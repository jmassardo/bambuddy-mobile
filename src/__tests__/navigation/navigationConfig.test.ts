import { getNavigationLayout, parseNavigationOrder, serializeNavigationOrder } from '@/navigation/navigationConfig';
import type { ExternalLink } from '@/types/api';

describe('navigationConfig', () => {
  describe('parseNavigationOrder', () => {
    it('parses csv values', () => {
      expect(parseNavigationOrder('dashboard, queue ,more')).toEqual(['dashboard', 'queue', 'more']);
    });

    it('parses json arrays', () => {
      expect(parseNavigationOrder('["dashboard","files","more"]')).toEqual(['dashboard', 'files', 'more']);
    });

    it('returns empty for empty values', () => {
      expect(parseNavigationOrder('')).toEqual([]);
      expect(parseNavigationOrder(undefined)).toEqual([]);
      expect(parseNavigationOrder(null)).toEqual([]);
    });
  });

  describe('serializeNavigationOrder', () => {
    it('serializes ids to csv', () => {
      expect(serializeNavigationOrder(['dashboard', 'queue', 'more'])).toBe('dashboard,queue,more');
    });
  });

  describe('getNavigationLayout', () => {
    it('shows all built-ins by default', () => {
      const layout = getNavigationLayout({});
      expect(layout.hiddenBuiltIns).toHaveLength(0);
      expect(layout.tabItems.map(item => item.id)).toEqual(['dashboard', 'queue', 'archives', 'files', 'more']);
      expect(layout.moreItems.map(item => item.id)).toEqual([
        'settings',
        'users',
        'notifications',
        'inventory',
        'maintenance',
        'projects',
        'profiles',
        'makerworld',
        'stats',
        'energy',
        'system',
        'scanner',
      ]);
    });

    it('applies explicit visibility/order and keeps locked items visible', () => {
      const layout = getNavigationLayout({ defaultSidebarOrder: 'queue,files' });
      expect(layout.orderedBuiltIns.map(item => item.id)).toEqual(['queue', 'files', 'more', 'settings']);
      expect(layout.hiddenBuiltIns.map(item => item.id)).toContain('dashboard');
      expect(layout.orderedBuiltIns.map(item => item.id)).toContain('more');
      expect(layout.orderedBuiltIns.map(item => item.id)).toContain('settings');
    });

    it('sorts external links by sort_order then name', () => {
      const links: ExternalLink[] = [
        {
          id: 3,
          name: 'Grafana',
          url: 'https://grafana.local',
          icon: 'bar-chart',
          open_in_new_tab: true,
          custom_icon: null,
          sort_order: 2,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'Home Assistant',
          url: 'https://ha.local',
          icon: 'home',
          open_in_new_tab: false,
          custom_icon: null,
          sort_order: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 1,
          name: 'Alerts',
          url: 'https://alerts.local',
          icon: 'bell',
          open_in_new_tab: true,
          custom_icon: null,
          sort_order: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];

      const layout = getNavigationLayout({ externalLinks: links });
      expect(layout.externalLinks.map(item => item.id)).toEqual([1, 2, 3]);
    });
  });
});
