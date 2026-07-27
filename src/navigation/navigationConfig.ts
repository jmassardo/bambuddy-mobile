import type { ExternalLink } from '@/types/api';
import type { MainTabParamList, RootStackParamList } from './types';

export type BuiltInNavId =
  | 'dashboard'
  | 'queue'
  | 'archives'
  | 'files'
  | 'more'
  | 'settings'
  | 'users'
  | 'notifications'
  | 'inventory'
  | 'maintenance'
  | 'projects'
  | 'profiles'
  | 'makerworld'
  | 'stats'
  | 'system'
  | 'spoolbuddy'
  | 'scanner';

type NavLocation = 'tab' | 'more';

export type BuiltInNavigationItem = {
  id: BuiltInNavId;
  label: string;
  subtitle: string;
  icon: string;
  location: NavLocation;
  tabRoute?: keyof MainTabParamList;
  stackRoute?: keyof RootStackParamList;
  lockVisibility?: boolean;
};

export const BUILT_IN_NAV_ITEMS: readonly BuiltInNavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', subtitle: 'Printer status and quick controls', icon: 'printer', location: 'tab', tabRoute: 'Dashboard' },
  { id: 'queue', label: 'Queue', subtitle: 'Queued jobs and reorder controls', icon: 'list-ordered', location: 'tab', tabRoute: 'Queue' },
  { id: 'archives', label: 'Archives', subtitle: 'Completed print history', icon: 'archive', location: 'tab', tabRoute: 'Archives' },
  { id: 'files', label: 'Files', subtitle: 'Uploaded files and folders', icon: 'folder', location: 'tab', tabRoute: 'Files' },
  { id: 'more', label: 'More', subtitle: 'Additional pages and tools', icon: 'menu', location: 'tab', tabRoute: 'More', lockVisibility: true },
  { id: 'settings', label: 'Settings', subtitle: 'Server, integrations, backup, API keys', icon: 'settings', location: 'more', stackRoute: 'Settings', lockVisibility: true },
  { id: 'users', label: 'Users', subtitle: 'Accounts, roles, LDAP, password reset', icon: 'users', location: 'more', stackRoute: 'Users' },
  { id: 'notifications', label: 'Notifications', subtitle: 'Email delivery preferences', icon: 'bell', location: 'more', stackRoute: 'Notifications' },
  { id: 'inventory', label: 'Inventory', subtitle: 'Spools, locations, bulk edits, forecast', icon: 'package', location: 'more', stackRoute: 'Inventory' },
  { id: 'maintenance', label: 'Maintenance', subtitle: 'Per-printer tasks and service intervals', icon: 'wrench', location: 'more', stackRoute: 'Maintenance' },
  { id: 'projects', label: 'Projects', subtitle: 'Project plans, BOMs, print progress', icon: 'layers', location: 'more', stackRoute: 'Projects' },
  { id: 'profiles', label: 'Profiles', subtitle: 'Cloud, Orca, local, and K profiles', icon: 'copy', location: 'more', stackRoute: 'Profiles' },
  { id: 'makerworld', label: 'MakerWorld', subtitle: 'Resolve, import, and browse recent models', icon: 'globe', location: 'more', stackRoute: 'MakerWorld' },
  { id: 'stats', label: 'Stats', subtitle: 'Print activity, filament trends, breakdowns', icon: 'bar-chart', location: 'more', stackRoute: 'Stats' },
  { id: 'system', label: 'System', subtitle: 'Health, resources, logs, support tools', icon: 'cpu', location: 'more', stackRoute: 'System' },
  { id: 'spoolbuddy', label: 'SpoolBuddy', subtitle: 'SpoolBuddy devices, status, and configuration', icon: 'nfc', location: 'more', stackRoute: 'SpoolBuddy', lockVisibility: true },
  { id: 'scanner', label: 'Scanner', subtitle: 'Scan QR and NFC related data', icon: 'qr-code', location: 'more', stackRoute: 'Scanner' },
];

const BUILT_IN_BY_ID = new Map(BUILT_IN_NAV_ITEMS.map(item => [item.id, item]));
const BUILT_IN_IDS = BUILT_IN_NAV_ITEMS.map(item => item.id);

export type NavigationLayout = {
  orderedBuiltIns: BuiltInNavigationItem[];
  hiddenBuiltIns: BuiltInNavigationItem[];
  tabItems: BuiltInNavigationItem[];
  moreItems: BuiltInNavigationItem[];
  externalLinks: ExternalLink[];
};

export function parseNavigationOrder(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(value => String(value).trim()).filter(Boolean);
      }
    } catch {
      // Fall through to CSV parsing.
    }
  }

  return trimmed
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

export function serializeNavigationOrder(ids: string[]): string {
  return ids.map(id => id.trim()).filter(Boolean).join(',');
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }
  return output;
}

function normalizeOrder(raw: string | null | undefined): BuiltInNavId[] {
  const parsed = unique(parseNavigationOrder(raw));
  return parsed.filter((id): id is BuiltInNavId => BUILT_IN_BY_ID.has(id as BuiltInNavId));
}

function sortExternalLinks(links: ExternalLink[]): ExternalLink[] {
  return [...links].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.name.localeCompare(b.name);
  });
}

export function getNavigationLayout(input: {
  defaultSidebarOrder?: string | null;
  externalLinks?: ExternalLink[] | null;
  maxTabs?: number;
}): NavigationLayout {
  const maxTabs = Math.max(1, input.maxTabs ?? 5);
  const normalizedOrder = normalizeOrder(input.defaultSidebarOrder);
  const hasExplicitOrder = normalizedOrder.length > 0;

  const visibleIds = new Set<BuiltInNavId>(
    hasExplicitOrder ? normalizedOrder : BUILT_IN_IDS,
  );

  for (const item of BUILT_IN_NAV_ITEMS) {
    if (item.lockVisibility) {
      visibleIds.add(item.id);
    }
  }

  const orderedVisibleIds = hasExplicitOrder
    ? [...normalizedOrder, ...BUILT_IN_IDS.filter(id => visibleIds.has(id) && !normalizedOrder.includes(id))]
    : [...BUILT_IN_IDS];

  const orderedBuiltIns = orderedVisibleIds
    .map(id => BUILT_IN_BY_ID.get(id))
    .filter((item): item is BuiltInNavigationItem => Boolean(item));

  const hiddenBuiltIns = BUILT_IN_NAV_ITEMS.filter(item => !visibleIds.has(item.id));

  const tabCandidates = orderedBuiltIns.filter(item => item.location === 'tab' && item.tabRoute);
  const tabItems = tabCandidates.slice(0, maxTabs);

  // Safety: avoid rendering a tab navigator with zero screens.
  if (tabItems.length === 0) {
    const moreItem = BUILT_IN_BY_ID.get('more');
    if (moreItem) {
      tabItems.push(moreItem);
    }
  }

  const tabItemIds = new Set(tabItems.map(item => item.id));
  const moreItems = orderedBuiltIns.filter(item => item.location === 'more' && !tabItemIds.has(item.id));

  return {
    orderedBuiltIns,
    hiddenBuiltIns,
    tabItems,
    moreItems,
    externalLinks: sortExternalLinks(input.externalLinks ?? []),
  };
}
