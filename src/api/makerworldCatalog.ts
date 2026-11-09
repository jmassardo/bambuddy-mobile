// Read-only client for MakerWorld's public catalog API (the same JSON the
// makerworld.com site uses). Downloads/imports still go through the Bambuddy
// server, which holds the Bambu Cloud token.

const BASE = 'https://makerworld.com/api/v1';

export type CatalogFeed = 'trending' | 'popular' | 'top' | 'newest';

export type CatalogCreator = { uid?: number; name: string; avatar?: string; handle?: string };

export type CatalogHit = {
  id: number;
  title: string;
  cover: string;
  likeCount: number;
  downloadCount: number;
  printCount: number;
  collectionCount?: number;
  designCreator?: CatalogCreator;
  nsfw?: boolean;
};

export type CatalogPage = { total: number; hits: CatalogHit[] };

export type CatalogFilament = { type?: string; color?: string; usedG?: string; usedM?: string };

export type CatalogInstance = {
  id: number;
  profileId: number;
  title: string;
  cover?: string;
  isDefault?: boolean;
  materialCnt?: number;
  needAms?: boolean;
  prediction?: number | null; // print time, seconds
  weight?: number | null; // grams
  downloadCount?: number;
  printCount?: number;
  instanceFilaments?: CatalogFilament[] | null;
  pictures?: Array<{ url: string }> | null;
  extention?: {
    modelInfo?: {
      compatibility?: { devProductName?: string; nozzleDiameter?: number } | null;
      otherCompatibility?: Array<{ devProductName?: string; nozzleDiameter?: number }> | null;
    } | null;
  } | null;
};

export type CatalogDesign = {
  id: number;
  title: string;
  coverUrl?: string;
  summary?: string;
  license?: string;
  tags?: string[] | null;
  likeCount: number;
  downloadCount: number;
  printCount: number;
  collectionCount?: number;
  designCreator?: CatalogCreator;
  defaultInstanceId?: number;
  designExtension?: { design_pictures?: Array<{ url: string }> | null } | null;
  instances: CatalogInstance[];
};

export const CATALOG_PAGE_SIZE = 20;

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function normalizePage(raw: Partial<CatalogPage> | null | undefined): CatalogPage {
  const hits = Array.isArray(raw?.hits) ? raw!.hits.filter(hit => hit && typeof hit.id === 'number' && !hit.nsfw) : [];
  return { total: typeof raw?.total === 'number' ? raw.total : hits.length, hits };
}

const FEED_ORDER: Record<Exclude<CatalogFeed, 'trending'>, string | null> = {
  popular: 'downloadCount',
  top: 'likeCount',
  newest: null,
};

export function catalogPath(feed: CatalogFeed, keyword: string, offset: number, limit = CATALOG_PAGE_SIZE) {
  const query = keyword.trim();
  if (feed === 'trending' && !query) {
    return `/search-service/select/design/nav?navKey=Trending&offset=${offset}&limit=${limit}`;
  }
  const params = new URLSearchParams({ keyword: query, offset: String(offset), limit: String(limit) });
  const order = feed === 'trending' ? null : FEED_ORDER[feed];
  if (order) params.set('orderBy', order);
  return `/search-service/select/design2?${params.toString()}`;
}

export const makerworldCatalogApi = {
  page: async (feed: CatalogFeed, keyword: string, offset: number, signal?: AbortSignal) =>
    normalizePage(await getJson<Partial<CatalogPage>>(catalogPath(feed, keyword, offset), signal)),
  design: async (id: number, signal?: AbortSignal) => {
    const design = await getJson<CatalogDesign>(`/design-service/design/${id}`, signal);
    return { ...design, instances: Array.isArray(design.instances) ? design.instances : [] };
  },
};

export function modelWebUrl(modelId: number, instanceId?: number | null) {
  return `https://makerworld.com/models/${modelId}${instanceId ? `#profileId-${instanceId}` : ''}`;
}

export function formatCount(value: number | undefined | null) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function formatDuration(seconds: number | undefined | null, units: { h: string; m: string }) {
  const total = Math.round(Number(seconds) || 0);
  if (total <= 0) return null;
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return hours ? `${hours} ${units.h} ${minutes} ${units.m}` : `${Math.max(1, minutes)} ${units.m}`;
}

/** Turns MakerWorld's HTML summary into readable plain text. */
export function htmlToText(html: string | undefined | null) {
  if (!html) return '';
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function compatiblePrinters(instance: CatalogInstance | null | undefined) {
  const info = instance?.extention?.modelInfo;
  const names = [info?.compatibility?.devProductName, ...(info?.otherCompatibility ?? []).map(item => item?.devProductName)]
    .filter((name): name is string => Boolean(name));
  return Array.from(new Set(names));
}
