import { parseMakerworldModelUrl, pickOneTapInstance } from '@/utils/makerworldOneTap';

describe('parseMakerworldModelUrl', () => {
  it('reads model id from localized model pages', () => {
    expect(parseMakerworldModelUrl('https://makerworld.com/en/models/1234567-cool-vase?from=search')).toMatchObject({ modelId: 1234567, profileId: null });
    expect(parseMakerworldModelUrl('https://makerworld.com/models/42')).toMatchObject({ modelId: 42, profileId: null });
    expect(parseMakerworldModelUrl('https://www.makerworld.com/zh-hans/models/7-x')).toMatchObject({ modelId: 7 });
  });

  it('reads the selected print profile from the hash', () => {
    expect(parseMakerworldModelUrl('https://makerworld.com/en/models/1234567-vase#profileId-987654')).toMatchObject({ modelId: 1234567, profileId: 987654 });
  });

  it('ignores non-model pages and other hosts', () => {
    expect(parseMakerworldModelUrl('https://makerworld.com/en')).toBeNull();
    expect(parseMakerworldModelUrl('https://makerworld.com/en/search/models?keyword=vase')).toBeNull();
    expect(parseMakerworldModelUrl('https://evil.example/makerworld.com/models/1')).toBeNull();
    expect(parseMakerworldModelUrl(undefined)).toBeNull();
  });
});

describe('pickOneTapInstance', () => {
  const instances = [{ id: 1, profileId: 10 }, { id: 2, profileId: 20 }];
  it('prefers the selected profile and falls back to the first', () => {
    expect(pickOneTapInstance(instances, 20)).toBe(instances[1]);
    expect(pickOneTapInstance(instances, 99)).toBe(instances[0]);
    expect(pickOneTapInstance(instances, null)).toBe(instances[0]);
    expect(pickOneTapInstance([], 10)).toBeNull();
  });
});

describe('pickOneTapInstance with MakerWorld hash ids', () => {
  it('matches the instance id carried by #profileId-N', () => {
    const instances = [{ id: 3387944, profileId: 858421954 }, { id: 3388324, profileId: 1 }];
    expect(pickOneTapInstance(instances, 3388324)).toBe(instances[1]);
  });
  it('falls back to the default instance', () => {
    const instances = [{ id: 1, profileId: 1 }, { id: 2, profileId: 2, isDefault: true }];
    expect(pickOneTapInstance(instances, null)).toBe(instances[1]);
  });
});
