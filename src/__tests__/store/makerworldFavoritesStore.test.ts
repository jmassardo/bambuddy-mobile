import AsyncStorage from '@react-native-async-storage/async-storage';
import { FAVORITES_KEY, useMakerworldFavorites } from '@/store/makerworldFavoritesStore';

const model = { id: 42, title: 'Vase', cover: 'https://x/c.png', likeCount: 1, downloadCount: 2, printCount: 3 };
const setItem = AsyncStorage.setItem as jest.Mock;
const getItem = AsyncStorage.getItem as jest.Mock;

describe('makerworld favorites store', () => {
  beforeEach(() => {
    setItem.mockClear();
    getItem.mockReset();
    getItem.mockResolvedValue(null);
    useMakerworldFavorites.setState({ items: [], loaded: false });
  });

  it('adds, persists and removes a favorite', async () => {
    expect(await useMakerworldFavorites.getState().toggle(model)).toBe(true);
    expect(useMakerworldFavorites.getState().isFavorite(42)).toBe(true);
    const [key, value] = setItem.mock.calls[0];
    expect(key).toBe(FAVORITES_KEY);
    expect(JSON.parse(value)[0]).toMatchObject({ id: 42, title: 'Vase' });

    expect(await useMakerworldFavorites.getState().toggle(model)).toBe(false);
    expect(useMakerworldFavorites.getState().items).toHaveLength(0);
    expect(JSON.parse(setItem.mock.calls[1][1])).toEqual([]);
  });

  it('loads saved favorites and ignores broken entries', async () => {
    getItem.mockResolvedValueOnce(JSON.stringify([{ ...model, savedAt: 1 }, { nope: true }]));
    await useMakerworldFavorites.getState().load();
    expect(useMakerworldFavorites.getState().items.map(item => item.id)).toEqual([42]);
    expect(useMakerworldFavorites.getState().loaded).toBe(true);
  });
});
