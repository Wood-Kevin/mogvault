export const REGIONS = ['us', 'eu', 'kr', 'tw'] as const;
export type Region = typeof REGIONS[number];

export function isRegion(value: string): value is Region {
  return (REGIONS as readonly string[]).includes(value);
}

export function regionHost(region: Region): string {
  return `https://${region}.api.blizzard.com`;
}

const LOCALE_MAP: Record<Region, string> = {
  us: 'en_US',
  eu: 'en_GB',
  kr: 'ko_KR',
  tw: 'zh_TW',
};

export function regionLocale(region: Region): string {
  return LOCALE_MAP[region];
}

export function namespace(kind: 'static' | 'dynamic' | 'profile', region: Region): string {
  return `${kind}-${region}`;
}
