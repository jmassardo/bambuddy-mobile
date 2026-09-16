import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CUSTOM_NAV_ITEMS_KEY = '@bambuddy_mobile:custom_nav_items';

export type CustomNavItem = {
  id: string;
  name: string;
  url: string;
  icon: string;
  open_in_new_tab: boolean;
  sort_order: number;
  created_at: string;
};

type CustomNavStore = {
  items: CustomNavItem[];
  addItem: (item: Omit<CustomNavItem, 'id' | 'created_at'>) => void;
  updateItem: (id: string, item: Partial<Omit<CustomNavItem, 'id' | 'created_at'>>) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, direction: -1 | 1) => void;
  loadItems: () => Promise<void>;
  syncItems: () => Promise<void>;
};

function generateId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadFromStorage(): Promise<CustomNavItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_NAV_ITEMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CustomNavItem[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

async function saveToStorage(items: CustomNavItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CUSTOM_NAV_ITEMS_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

export const useCustomNavStore = create<CustomNavStore>((set, get) => ({
  items: [],

  loadItems: async () => {
    const items = await loadFromStorage();
    set({ items });
  },

  syncItems: async () => {
    await saveToStorage(get().items);
  },

  addItem: async (item) => {
    const items = get().items;
    const newItem: CustomNavItem = {
      ...item,
      id: generateId(),
      sort_order: item.sort_order ?? items.length + 1,
      created_at: new Date().toISOString(),
    };
    set({ items: [...items, newItem] });
    await saveToStorage([...items, newItem]);
  },

  updateItem: async (id, updates) => {
    const items = get().items.map(item =>
      item.id === id ? { ...item, ...updates } : item,
    );
    set({ items });
    await saveToStorage(items);
  },

  removeItem: async (id) => {
    const items = get().items.filter(item => item.id !== id);
    set({ items });
    await saveToStorage(items);
  },

  moveItem: async (id, direction) => {
    const items = get().items;
    const index = items.findIndex(item => item.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) {
      return;
    }
    const nextItems = [...items];
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(targetIndex, 0, moved);
    set({ items: nextItems });
    await saveToStorage(nextItems);
  },
}));
