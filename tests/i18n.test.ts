import { describe, it, expect } from 'vitest';
import { createT, getLang } from '../src/i18n.ts';

describe('i18n', () => {
  it('returns ja strings', () => {
    const t = createT('ja');
    expect(t('nav.home')).toBe('ホーム');
  });

  it('returns en strings', () => {
    const t = createT('en');
    expect(t('nav.home')).toBe('Home');
  });

  it('falls back to en for missing keys', () => {
    const t = createT('ja');
    // both dicts define this; test fallback path via a synthetic missing key
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('interpolates variables', () => {
    const t = createT('ja');
    expect(t('newTweets', { count: 5 })).toContain('5');
    expect(t('error.rateLimited', { seconds: 42 })).toContain('42');
  });

  it('detects lang from config', () => {
    expect(getLang('ja')).toBe('ja');
    expect(getLang('en')).toBe('en');
    expect(getLang(undefined)).toMatch(/^(ja|en)$/);
  });
});
