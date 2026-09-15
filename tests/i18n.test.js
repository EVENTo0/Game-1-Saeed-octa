import { describe, it, expect } from 'vitest';
import { I18n, STRINGS } from '../src/ui/i18n.js';

describe('i18n', () => {
  it('defaults to Arabic', () => {
    expect(new I18n().lang).toBe('ar');
  });

  it('every Arabic key has an English counterpart and vice versa', () => {
    const ar = Object.keys(STRINGS.ar).sort();
    const en = Object.keys(STRINGS.en).sort();
    expect(ar).toEqual(en);
  });

  it('no string is left empty in either language', () => {
    for (const lang of ['ar', 'en']) {
      for (const [k, v] of Object.entries(STRINGS[lang])) {
        expect(typeof v, `${lang}.${k}`).toBe('string');
        expect(v.trim().length, `${lang}.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('Arabic strings actually contain Arabic script', () => {
    const arabic = /[؀-ۿ]/;
    const keys = ['title', 'play', 'victoryTitle', 'defeatTitle', 'pickup', 'zoneClosing', 'mansourLine'];
    for (const k of keys) expect(arabic.test(STRINGS.ar[k]), k).toBe(true);
  });

  it('carries the required victory and Mansour lines verbatim', () => {
    expect(STRINGS.ar.victoryTitle).toBe('مبروك يا سعيد!');
    expect(STRINGS.ar.victorySub).toBe('أنت بطل الجولة');
    expect(STRINGS.ar.defeatTitle).toBe('انتهت الجولة');
    expect(STRINGS.ar.playAgain).toBe('العب مرة أخرى');
    expect(STRINGS.ar.pickup).toBe('التقاط');
    expect(STRINGS.ar.zoneClosing).toBe('المنطقة تضيق');
    expect(STRINGS.ar.mansourLine).toBe('يا سعيد... خل عنك البطولة، وين القهوة؟');
  });

  it('reports RTL for Arabic and LTR for English', () => {
    const i = new I18n('ar');
    expect(i.rtl).toBe(true);
    i.lang = 'en';
    expect(i.rtl).toBe(false);
  });

  it('falls back to English for an unknown key', () => {
    const i = new I18n('ar');
    expect(i.t('definitelyMissing')).toBe('definitelyMissing');
    expect(i.t('play')).toBe('ابدأ');
  });

  it('shows both languages together for HUD lines', () => {
    const i = new I18n('ar');
    expect(i.both('zoneClosing')).toBe('المنطقة تضيق · ZONE CLOSING');
  });
});
