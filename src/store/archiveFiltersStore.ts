import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FILTERS_STORAGE_KEY = '@bambuddy_mobile:archives_filters';

export type ArchiveStatusFilter =
  | 'all'
  | 'completed'
  | 'failed'
  | 'running'
  | 'paused'
  | 'canceled'
  | 'favorite'
  | 'duplicate';

export type RangeFilter = 'all' | '7d' | '30d' | '90d' | 'custom';

export type AIFilter = 'all' | 'ai' | 'human' | 'any';

export type ArchiveFilters = {
  statusFilter: ArchiveStatusFilter;
  rangeFilter: RangeFilter;
  printerFilter: number | 'all';
  filamentTypeFilter: string;
  tagFilter: string | null;
  aiFilter: AIFilter;
  search: string;
};

type FiltersStore = {
  filters: ArchiveFilters;
  loadFilters: () => Promise<void>;
  setFilters: (filters: Partial<ArchiveFilters>) => Promise<void>;
  clearFilters: () => Promise<void>;
};

const DEFAULT_FILTERS: ArchiveFilters = {
  statusFilter: 'all',
  rangeFilter: 'all',
  printerFilter: 'all',
  filamentTypeFilter: 'all',
  tagFilter: null,
  aiFilter: 'all',
  search: '',
};

async function loadFromStorage(): Promise<ArchiveFilters> {
  try {
    const raw = await AsyncStorage.getItem(FILTERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ArchiveFilters>;
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_FILTERS, ...parsed };
      }
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_FILTERS;
}

async function saveToStorage(filters: ArchiveFilters): Promise<void> {
  try {
    await AsyncStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // ignore storage errors
  }
}

export const useArchiveFiltersStore = create<FiltersStore>((set, get) => ({
  filters: DEFAULT_FILTERS,

  loadFilters: async () => {
    const filters = await loadFromStorage();
    set({ filters });
  },

  setFilters: async (partial) => {
    const next = { ...get().filters, ...partial };
    set({ filters: next });
    await saveToStorage(next);
  },

  clearFilters: async () => {
    set({ filters: DEFAULT_FILTERS });
    await saveToStorage(DEFAULT_FILTERS);
  },
}));
