import { catalogPath, compatiblePrinters, formatCount, formatDuration, htmlToText } from '@/api/makerworldCatalog';

describe('makerworldCatalog helpers', () => {
  it('builds feed and search paths', () => {
    expect(catalogPath('trending', '', 0)).toBe('/search-service/select/design/nav?navKey=Trending&offset=0&limit=20');
    expect(catalogPath('popular', '', 40)).toBe('/search-service/select/design2?keyword=&offset=40&limit=20&orderBy=downloadCount');
    expect(catalogPath('trending', 'vase', 0)).toBe('/search-service/select/design2?keyword=vase&offset=0&limit=20');
    expect(catalogPath('top', 'big box', 0)).toContain('keyword=big+box');
    expect(catalogPath('newest', '', 0)).not.toContain('orderBy');
  });
  it('formats numbers and durations', () => {
    expect(formatCount(950)).toBe('950');
    expect(formatCount(9362)).toBe('9.4k');
    expect(formatCount(2_000_000)).toBe('2M');
    expect(formatDuration(1707, { h: 'h', m: 'min' })).toBe('28 min');
    expect(formatDuration(5400, { h: 'h', m: 'min' })).toBe('1 h 30 min');
    expect(formatDuration(null, { h: 'h', m: 'min' })).toBeNull();
  });
  it('strips HTML summaries', () => {
    expect(htmlToText('<p><strong>Hi</strong>&nbsp;there</p><p>It&#39;s ok</p>')).toBe("Hi there\nIt's ok");
  });
  it('lists compatible printers once', () => {
    expect(compatiblePrinters({
      id: 1, profileId: 1, title: 'x',
      extention: { modelInfo: { compatibility: { devProductName: 'X2D' }, otherCompatibility: [{ devProductName: 'P1P' }, { devProductName: 'X2D' }] } },
    })).toEqual(['X2D', 'P1P']);
  });
});
