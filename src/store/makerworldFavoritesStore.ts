import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CatalogHit } from '@/api/makerworldCatalog';

// Favorites are kept on the device (MakerWorld's own collections need a MakerWorld login).
export const FAVORITES_KEY = '@bambuddy_mobile:makerworld_favorites';

export type FavoriteModel = CatalogHit & { savedAt: number };

interface FavoritesState {
  items: FavoriteModel[];
  loaded: boolean;
  load: () => Promise<void>;
  isFavorite: (id: number) => boolean;
  toggle: (model: CatalogHit) => Promise<boolean>;
}

function sanitize(raw: unknown): FavoriteModel[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is FavoriteModel =>
    Boolean(item) && typeof item.id === 'number' && typeof item.title === 'string');
}

export const useMakerworldFavorites = create<FavoritesState>((set, get) => ({
  items: [],
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const stored = await AsyncStorage.getItem(FAVORITES_KEY);
      set({ items: stored ? sanitize(JSON.parse(stored)) : [] });
    } catch {
      set({ items: [] });
    } finally {
      set({ loaded: true });
    }
  },
  isFavorite: id => get().items.some(item => item.id === id),
  toggle: async model => {
    const exists = get().isFavorite(model.id);
    const items = exists
      ? get().items.filter(item => item.id !== model.id)
      : [{
        id: model.id,
        title: model.title,
        cover: model.cover,
        likeCount: model.likeCount,
        downloadCount: model.downloadCount,
        printCount: model.printCount,
        designCreator: model.designCreator,
        savedAt: Date.now(),
      }, ...get().items];
    set({ items });
    try {
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
    } catch {
      // Keep the in-memory state; it will be retried on the next change.
    }
    return !exists;
  },
}));
