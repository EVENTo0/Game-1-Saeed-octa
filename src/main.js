import { Game, MatchState } from './core/game.js';
import { HUD, Screens } from './ui/hud.js';
import { I18n } from './ui/i18n.js';
import { AudioSystem } from './audio/audio.js';
import { InputManager } from './ui/input.js';
import { TouchControls, isTouchDevice } from './ui/touchControls.js';
import { setHaptics } from './ui/haptics.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const i18n = new I18n();
i18n.apply();

const audio = new AudioSystem();
const hud = new HUD(i18n);
const screens = new Screens();
const canvas = $('game-canvas');

const prefs = loadPrefs();
const game = new Game(canvas, { audio, hud, i18n, quality: prefs.quality });
const input = new InputManager();
input.sensitivity = prefs.sensitivity;
input.attachKeyboard(window, canvas);
const touch = new TouchControls($('hud'), input).attach();

const touchMode = isTouchDevice();
// Aim assist exists to make up for a thumb on glass; a mouse does not need it.
game.aimAssistEnabled = touchMode && prefs.assist !== false;
setHaptics(prefs.haptics !== false);
hud.setTouch(touchMode);
touch.setEnabled(false);

function loadPrefs() {
  const d = { sensitivity: 1, quality: 'med', volume: 0.5, assist: true, haptics: true };
  try { return { ...d, ...JSON.parse(localStorage.getItem('saeed_prefs') || '{}') }; }
  catch { return d; }
}
function savePrefs(p) {
  try { localStorage.setItem('saeed_prefs', JSON.stringify(p)); } catch { /* private mode */ }
}

// ------------------------------------------------------------------ flow
let uiState = 'splash';

function goSplash() { uiState = 'splash'; screens.show('splash'); hud.show(false); setPlaying(false); }
function goMenu() {
  uiState = 'menu';
  screens.show('menu');
  hud.show(false);
  setPlaying(false);
  syncLangButtons();
  guardInput($('menu'));
}

/** Swallow stray taps for a moment after a screen appears under the finger. */
function guardInput(el, ms = 300) {
  if (!el) return;
  el.classList.add('no-input');
  clearTimeout(el._guard);
  el._guard = setTimeout(() => el.classList.remove('no-input'), ms);
}
function goSettings() { uiState = 'settings'; screens.show('settings'); }

function setPlaying(on) {
  input.enabled = on;
  touch.setEnabled(on && touchMode);
  if (!on) input.reset();
}

function startMatch() {
  audio.unlock();
  screens.hideAll();
  hud.show(true);
  hud.showMansour(false);
  uiState = 'playing';
  game.startMatch();
  setPlaying(true);
  if (!touchMode) canvas.requestPointerLock?.();
}

function pauseMatch() {
  if (!game.pause()) return;
  uiState = 'paused';
  screens.show('pause');
  setPlaying(false);
  document.exitPointerLock?.();
}
function resumeMatch() {
  if (!game.resume()) return;
  uiState = 'playing';
  screens.hideAll();
  hud.show(true);
  setPlaying(true);
  if (!touchMode) canvas.requestPointerLock?.();
}

game.events.on('match:win', ({ kills, time }) => {
  $('win-kills').textContent = `${i18n.t('kills')}: ${kills}`;
  $('win-time').textContent = `${i18n.t('survived')}: ${fmtTime(time)}`;
  // let the victory animation play for a beat before the screen lands
  setTimeout(() => {
    if (game.state !== MatchState.WON) return;
    uiState = 'won';
    screens.show('victory');
    guardInput($('victory'), 500);
    setPlaying(false);
    document.exitPointerLock?.();
  }, 1400);
});
game.events.on('match:lose', ({ kills, time }) => {
  $('lose-kills').textContent = `${i18n.t('kills')}: ${kills}`;
  $('lose-time').textContent = `${i18n.t('survived')}: ${fmtTime(time)}`;
  setTimeout(() => {
    if (game.state !== MatchState.LOST) return;
    uiState = 'lost';
    screens.show('defeat');
    guardInput($('defeat'), 500);
    setPlaying(false);
    document.exitPointerLock?.();
  }, 1600);
});

// ------------------------------------------------------------------ buttons
// 'click' (not 'pointerdown'): dismissing on pointerdown lets the follow-up
// click fall through onto whichever menu button is now under the finger.
$('splash').addEventListener('click', () => { audio.unlock(); goMenu(); });
$('btn-play').addEventListener('click', startMatch);
$('btn-settings').addEventListener('click', goSettings);
$('btn-settings-back').addEventListener('click', () => (uiState === 'paused' ? screens.show('pause') : goMenu()));
$('btn-pause').addEventListener('click', () => { pauseMatch(); guardInput($('pause')); });
$('btn-resume').addEventListener('click', resumeMatch);
$('btn-restart').addEventListener('click', startMatch);
$('btn-quit').addEventListener('click', goMenu);
$('btn-play-again').addEventListener('click', startMatch);
$('btn-win-menu').addEventListener('click', goMenu);
$('btn-retry').addEventListener('click', startMatch);
$('btn-lose-menu').addEventListener('click', goMenu);

// med-kit button is inside the HUD, wired through the same input state
$('btn-heal').addEventListener('click', () => { input.state.use = true; });

// language
function syncLangButtons() {
  $('lang-ar').classList.toggle('active', i18n.lang === 'ar');
  $('lang-en').classList.toggle('active', i18n.lang === 'en');
}
$('lang-ar').addEventListener('click', () => { i18n.set('ar'); syncLangButtons(); });
$('lang-en').addEventListener('click', () => { i18n.set('en'); syncLangButtons(); });
syncLangButtons();

// settings
const sens = $('set-sens'), qual = $('set-quality'), vol = $('set-volume');
sens.value = String(prefs.sensitivity);
qual.value = prefs.quality;
vol.value = String(prefs.volume);
audio.setVolume(prefs.volume);
sens.addEventListener('input', () => {
  prefs.sensitivity = parseFloat(sens.value); input.sensitivity = prefs.sensitivity; savePrefs(prefs);
});
qual.addEventListener('change', () => { prefs.quality = qual.value; game.setQuality(qual.value); savePrefs(prefs); });
vol.addEventListener('input', () => { prefs.volume = parseFloat(vol.value); audio.setVolume(prefs.volume); savePrefs(prefs); });

const assistBox = $('set-assist'), hapticsBox = $('set-haptics');
assistBox.checked = prefs.assist !== false;
hapticsBox.checked = prefs.haptics !== false;
assistBox.addEventListener('change', () => {
  prefs.assist = assistBox.checked;
  game.aimAssistEnabled = touchMode && prefs.assist;
  savePrefs(prefs);
});
hapticsBox.addEventListener('change', () => {
  prefs.haptics = hapticsBox.checked;
  setHaptics(prefs.haptics);
  savePrefs(prefs);
});

// keyboard shortcuts that live outside gameplay
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (uiState === 'playing') pauseMatch();
    else if (uiState === 'paused') resumeMatch();
  }
  if (e.code === 'KeyP') hud.setFps(0, !$('fps-counter').classList.contains('hidden') ? false : true);
});
document.addEventListener('pointerlockchange', () => {
  if (uiState === 'playing' && !touchMode && !document.pointerLockElement) pauseMatch();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && uiState === 'playing') pauseMatch(); });

// ------------------------------------------------------------------ resize
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  game.resize(w, h);
  const portraitPhone = touchMode && h > w && Math.min(w, h) < 520;
  $('rotate-hint').classList.toggle('hidden', !portraitPhone);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
resize();

// ------------------------------------------------------------------ loop
let last = performance.now();
let fpsAcc = 0, fpsFrames = 0, fps = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;              // tab-switch guard
  if (dt <= 0) return;

  const cmd = input.consume();
  game.update(dt, cmd);
  if (uiState === 'playing' || uiState === 'won' || uiState === 'lost') hud.update(game);
  game.render();

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0; fpsFrames = 0;
    hud.setFps(fps, !$('fps-counter').classList.contains('hidden'));
  }
}
requestAnimationFrame(frame);

goSplash();

// Expose for the smoke test / debugging — not used by gameplay.
globalThis.SAEED = { game, input, hud, i18n, startMatch, goMenu, pauseMatch, resumeMatch };
