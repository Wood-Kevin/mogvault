import { describe, it, expect } from 'vitest';
import { isRegion, regionHost, regionLocale, namespace } from './regions';

describe('isRegion', () => {
  it('accepts all four valid regions', () => {
    expect(isRegion('us')).toBe(true);
    expect(isRegion('eu')).toBe(true);
    expect(isRegion('kr')).toBe(true);
    expect(isRegion('tw')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isRegion('')).toBe(false);
  });

  it('rejects unknown regions', () => {
    expect(isRegion('xx')).toBe(false);
    expect(isRegion('cn')).toBe(false);
  });

  it('rejects uppercase — strict lowercase only', () => {
    expect(isRegion('US')).toBe(false);
    expect(isRegion('EU')).toBe(false);
  });
});

describe('regionHost', () => {
  it('builds the correct host for each region', () => {
    expect(regionHost('us')).toBe('https://us.api.blizzard.com');
    expect(regionHost('eu')).toBe('https://eu.api.blizzard.com');
    expect(regionHost('kr')).toBe('https://kr.api.blizzard.com');
    expect(regionHost('tw')).toBe('https://tw.api.blizzard.com');
  });
});

describe('regionLocale', () => {
  it('returns the correct locale per region', () => {
    expect(regionLocale('us')).toBe('en_US');
    expect(regionLocale('eu')).toBe('en_GB');
    expect(regionLocale('kr')).toBe('ko_KR');
    expect(regionLocale('tw')).toBe('zh_TW');
  });
});

describe('namespace', () => {
  it('joins kind and region with a hyphen', () => {
    expect(namespace('profile', 'eu')).toBe('profile-eu');
    expect(namespace('static', 'us')).toBe('static-us');
    expect(namespace('dynamic', 'kr')).toBe('dynamic-kr');
  });
});
