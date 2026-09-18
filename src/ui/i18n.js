// Arabic-first localisation. AR is the default; EN is the fallback.
export const STRINGS = {
  ar: {
    title: 'سعيد رويال',
    studio: 'إيفينتو لتطوير المشاريع',
    play: 'ابدأ',
    settings: 'الإعدادات',
    resume: 'متابعة',
    restart: 'إعادة الجولة',
    quit: 'القائمة الرئيسية',
    paused: 'إيقاف مؤقت',
    victoryTitle: 'مبروك يا سعيد!',
    victorySub: 'أنت بطل الجولة',
    victoryTag: 'VICTORY',
    defeatTitle: 'انتهت الجولة',
    defeatSub: 'حظاً أوفر في الجولة القادمة',
    defeatTag: 'TRY AGAIN',
    playAgain: 'العب مرة أخرى',
    pickup: 'التقاط',
    use: 'استخدام',
    health: 'الصحة',
    ammo: 'الذخيرة',
    enemies: 'الأعداء',
    medkit: 'حقيبة إسعاف',
    zoneClosing: 'المنطقة تضيق',
    zoneOutside: 'أنت خارج المنطقة الآمنة!',
    zoneSafe: 'المنطقة آمنة',
    reloading: 'إعادة تعبئة…',
    noWeapon: 'لا يوجد سلاح',
    healing: 'جاري العلاج…',
    killed: 'تم إسقاط',
    weaponFound: 'حصلت على',
    ammoFound: 'ذخيرة',
    medkitFound: 'حقيبة إسعاف',
    mansour: 'عم منصور',
    mansourLine: 'يا سعيد... خل عنك البطولة، وين القهوة؟',
    octa: 'أوكتا',
    sensitivity: 'حساسية النظر',
    aimAssist: 'مساعدة التصويب',
    haptics: 'الاهتزاز',
    quality: 'جودة الرسوم',
    qualityLow: 'منخفضة',
    qualityMed: 'متوسطة',
    qualityHigh: 'عالية',
    back: 'رجوع',
    loading: 'جاري التحميل…',
    tapToStart: 'اضغط للبدء',
    controlsHint: 'حرّك بالعصا اليسرى — انظر بالسحب على اليمين',
    kills: 'الإسقاطات',
    survived: 'زمن الجولة',
    landscapeHint: 'أدر الجهاز أفقياً للحصول على أفضل تجربة',
  },
  en: {
    title: 'SAEED ROYALE',
    studio: 'EVENTO Project Development',
    play: 'PLAY',
    settings: 'SETTINGS',
    resume: 'RESUME',
    restart: 'RESTART',
    quit: 'MAIN MENU',
    paused: 'PAUSED',
    victoryTitle: 'VICTORY!',
    victorySub: 'You are the champion of the round',
    victoryTag: 'مبروك يا سعيد!',
    defeatTitle: 'ROUND OVER',
    defeatSub: 'Better luck next round',
    defeatTag: 'انتهت الجولة',
    playAgain: 'PLAY AGAIN',
    pickup: 'PICK UP',
    use: 'USE',
    health: 'HEALTH',
    ammo: 'AMMO',
    enemies: 'ENEMIES',
    medkit: 'MED KIT',
    zoneClosing: 'ZONE CLOSING',
    zoneOutside: 'YOU ARE OUTSIDE THE SAFE ZONE!',
    zoneSafe: 'ZONE SAFE',
    reloading: 'RELOADING…',
    noWeapon: 'NO WEAPON',
    healing: 'HEALING…',
    killed: 'ELIMINATED',
    weaponFound: 'PICKED UP',
    ammoFound: 'AMMO',
    medkitFound: 'MED KIT',
    mansour: 'Uncle Mansour',
    mansourLine: '"Saeed... forget the championship, where is the coffee?"',
    octa: 'OCTA',
    sensitivity: 'LOOK SENSITIVITY',
    aimAssist: 'AIM ASSIST',
    haptics: 'HAPTICS',
    quality: 'GRAPHICS QUALITY',
    qualityLow: 'LOW',
    qualityMed: 'MEDIUM',
    qualityHigh: 'HIGH',
    back: 'BACK',
    loading: 'LOADING…',
    tapToStart: 'TAP TO START',
    controlsHint: 'Left stick to move — drag on the right to look',
    kills: 'KILLS',
    survived: 'TIME',
    landscapeHint: 'Rotate your device to landscape for the best experience',
  },
};

const LS_KEY = 'saeed_royale_lang';

export class I18n {
  constructor(lang) {
    this.lang = lang || this.stored() || 'ar';
    this.listeners = new Set();
  }
  stored() {
    try { return localStorage.getItem(LS_KEY); } catch { return null; }
  }
  get rtl() { return this.lang === 'ar'; }
  t(key) { return STRINGS[this.lang]?.[key] ?? STRINGS.en[key] ?? key; }
  /** Both languages at once, for HUD lines that show AR + EN together. */
  both(key) {
    const a = STRINGS.ar[key], e = STRINGS.en[key];
    return this.lang === 'ar' ? `${a} · ${e}` : `${e} · ${a}`;
  }
  set(lang) {
    if (!STRINGS[lang] || lang === this.lang) return false;
    this.lang = lang;
    try { localStorage.setItem(LS_KEY, lang); } catch { /* private mode */ }
    this.apply();
    this.listeners.forEach((f) => f(lang));
    return true;
  }
  toggle() { return this.set(this.lang === 'ar' ? 'en' : 'ar'); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  /** Push lang/dir onto <html> so CSS logical properties flip automatically. */
  apply(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc) return;
    doc.documentElement.lang = this.lang;
    doc.documentElement.dir = this.rtl ? 'rtl' : 'ltr';
    doc.documentElement.dataset.lang = this.lang;
    doc.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = this.t(el.dataset.i18n);
    });
    doc.querySelectorAll('[data-i18n-both]').forEach((el) => {
      el.textContent = this.both(el.dataset.i18nBoth);
    });
  }
}
