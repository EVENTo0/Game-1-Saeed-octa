import { Game, MatchState } from './core/game.js';
import { HUD, Screens } from './ui/hud.js';
import { I18n } from './ui/i18n.js';
import { AudioSystem } from './audio/audio.js';
import { InputManager } from './ui/input.js';
import { TouchControls, isTouchDevice } from './ui/touchControls.js';
import { setHaptics } from './ui/haptics.js';
import { Profile, SKINS } from './meta/progression.js';
import { CONFIG } from './core/config.js';

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

function safeStorage() {
  try { const k = '__probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; }
  catch { return null; }
}
const profile = new Profile(safeStorage());
const skinById = (id) => SKINS.find((k) => k.id === id) ?? SKINS[0];
if (profile.data.skin !== 'classic') game.setSkin(skinById(profile.data.skin));
// Automation (smoke/preview) runs at a fixed resolution so screenshots compare.
game.dynamicResolution = !navigator.webdriver;

const touchMode = isTouchDevice();
input.mouseEnabled = !touchMode;
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
  game.state = MatchState.IDLE;
  game.player.reset();
  game.player.pos.x = game.map.spawns.player.x;
  game.player.pos.z = game.map.spawns.player.z;
  screens.show('menu');
  hud.show(false);
  setPlaying(false);
  syncLangButtons();
  game.planRoute();
  renderLobby();
  guardInput($('menu'));
}

// ------------------------------------------------------------------ lobby
const lang = () => i18n.lang;
const skinName = (k) => (lang() === 'ar' ? k.nameAr : k.nameEn);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function renderLobby() {
  const pr = profile.progress;
  $('lv-num').textContent = String(pr.level);
  $('lv-fill').style.width = `${(pr.into / pr.need) * 100}%`;
  $('lv-xp').textContent = `${pr.into} / ${pr.need} XP`;
  const d = profile.data;
  $('lv-record').textContent = d.matches
    ? `${i18n.t('record')} #${d.bestPlacement || '-'} · ${d.wins} ${i18n.t('wins')}`
    : '';
  $('app-version').textContent = `v${__APP_VERSION__}`;

  const list = $('skin-list');
  list.replaceChildren();
  for (const k of SKINS) {
    const b = document.createElement('button');
    const unlocked = profile.isUnlocked(k.id);
    b.className = `skin${k.id === d.skin ? ' on' : ''}${unlocked ? '' : ' locked'}`;
    b.style.setProperty('--sw', `linear-gradient(135deg, ${hex(k.primary)} 0 45%, ${hex(k.accent)} 45% 75%, ${hex(k.gold)} 75%)`);
    b.dataset.lv = `Lv ${k.level}`;
    b.title = unlocked ? skinName(k) : `${skinName(k)} — ${i18n.t('locked')} ${k.level}`;
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => {
      if (!profile.setSkin(k.id)) { hud.toast(`${i18n.t('locked')} ${k.level}`); return; }
      game.setSkin(k);
      renderLobby();
    });
    list.appendChild(b);
  }
  drawDropMap();
}

// Drop zone: null = auto (a random spot inside the first zone)
let dropPoint = null;
const dropCanvas = $('drop-map');
const MAP_HALF = game.map.half ?? 110;

function drawDropMap() {
  const ctx = dropCanvas.getContext('2d');
  const W = dropCanvas.width;
  const k = W / (MAP_HALF * 2);
  const px = (x) => (x + MAP_HALF) * k;
  const pz = (z) => (z + MAP_HALF) * k;
  ctx.fillStyle = '#b89668'; ctx.fillRect(0, 0, W, W);
  const o = game.map.oasis;
  ctx.fillStyle = '#3f9fb0';
  ctx.beginPath(); ctx.arc(px(o.x), pz(o.z), o.r * k, 0, Math.PI * 2); ctx.fill();
  for (const c of game.map.colliders) {
    if (c.tag === 'bounds') continue;
    ctx.fillStyle = c.top > 2.5 ? '#5a4330' : '#8d7150';
    ctx.fillRect(px(c.x - c.hw), pz(c.z - c.hd), Math.max(1, c.hw * 2 * k), Math.max(1, c.hd * 2 * k));
  }
  ctx.fillStyle = '#9a8566';
  for (const p of game.map.props) {
    if (p.kind !== 'road') continue;
    ctx.save(); ctx.strokeStyle = '#a08a68'; ctx.lineWidth = Math.max(1, 6 * k);
    ctx.beginPath(); ctx.moveTo(px(p.x1), pz(p.z1)); ctx.lineTo(px(p.x2), pz(p.z2)); ctx.stroke(); ctx.restore();
  }
  // flight path with the plane's direction
  const r = game.route;
  if (r) {
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(px(r.from.x), pz(r.from.z)); ctx.lineTo(px(r.to.x), pz(r.to.z)); ctx.stroke();
    ctx.setLineDash([]);
    const hx = px(r.to.x - r.dir.x * 90), hz = pz(r.to.z - r.dir.z * 90), a = Math.atan2(r.dir.z, r.dir.x);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(hx + Math.cos(a) * 7, hz + Math.sin(a) * 7);
    ctx.lineTo(hx + Math.cos(a + 2.5) * 6, hz + Math.sin(a + 2.5) * 6);
    ctx.lineTo(hx + Math.cos(a - 2.5) * 6, hz + Math.sin(a - 2.5) * 6); ctx.fill();
  }
  // location names
  ctx.font = `600 ${Math.max(8, Math.round(W / 26))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (const p of game.map.pois ?? []) {
    const label = lang() === 'ar' ? p.nameAr : p.nameEn;
    ctx.fillStyle = 'rgba(20,14,38,.75)';
    const tw = ctx.measureText(label).width + 6;
    ctx.fillRect(px(p.x) - tw / 2, pz(p.z) - 7, tw, 13);
    ctx.fillStyle = '#f0d488';
    ctx.fillText(label, px(p.x), pz(p.z) + 3);
  }
  if (dropPoint) {
    const x = px(dropPoint.x), y = pz(dropPoint.z);
    ctx.fillStyle = '#e8bd47'; ctx.strokeStyle = '#150f28'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
  }
  $('drop-note').textContent = i18n.t(dropPoint ? 'dropChosen' : 'dropHint');
}
dropCanvas.addEventListener('pointerdown', (e) => {
  const r = dropCanvas.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width, fz = (e.clientY - r.top) / r.height;
  const lim = MAP_HALF - 8;
  const x = Math.max(-lim, Math.min(lim, fx * MAP_HALF * 2 - MAP_HALF));
  const z = Math.max(-lim, Math.min(lim, fz * MAP_HALF * 2 - MAP_HALF));
  dropPoint = { x, z };
  drawDropMap();
});



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
  hud.clearFeedback();
  uiState = 'playing';
  game.startMatch({ drop: dropPoint, route: game.route });
  coach.start();
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

// ------------------------------------------------------------------ results
function renderResults(prefix, sum) {
  const t = (k) => i18n.t(k);
  const res = profile.recordMatch(sum);
  $(`${prefix}-place`).innerHTML = `#${sum.placement}<small> / ${CONFIG.bots.count + 1}</small>`;
  const stats = [
    ['kills', String(sum.kills)],
    ['damage', String(Math.round(sum.damage))],
    ['accuracy', `${Math.round(sum.accuracy * 100)}%`],
    ['survived', fmtTime(sum.time)],
  ];
  const sb = $(`${prefix}-stats`);
  sb.replaceChildren(...stats.map(([k, v]) => {
    const d = document.createElement('div'); d.className = 'stat';
    const b = document.createElement('b'); b.textContent = v;
    const sm = document.createElement('small'); sm.textContent = t(k);
    d.append(b, sm); return d;
  }));
  const xb = $(`${prefix}-xp`);
  const rows = res.reward.items.map((i) => [t(i.key), `+${i.xp}`, '']);
  rows.push([t('xpTotal'), `+${res.reward.total} XP`, 'total']);
  xb.replaceChildren(...rows.map(([a, b, cls]) => {
    const r = document.createElement('div'); r.className = `xp-row ${cls}`;
    const sa = document.createElement('span'); sa.textContent = a;
    const bb = document.createElement('b'); bb.textContent = b;
    r.append(sa, bb); return r;
  }));
  const lvl = document.createElement('div'); lvl.className = 'xp-level';
  const lab = document.createElement('span'); lab.textContent = `${t('level')} ${res.after.level}`;
  const bar = document.createElement('div'); bar.className = 'level-bar';
  const fill = document.createElement('div'); fill.className = 'xp-fill';
  bar.append(fill); lvl.append(lab, bar); xb.append(lvl);
  const startPct = res.leveledUp ? 0 : (res.before.into / res.before.need) * 100;
  fill.style.width = `${startPct}%`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.width = `${(res.after.into / res.after.need) * 100}%`;
  }));
  if (res.leveledUp) {
    const n = document.createElement('div'); n.className = 'xp-news';
    n.textContent = `${t('levelUp')} ${res.after.level}`
      + (res.newSkins.length ? ` · ${t('unlocked')}: ${res.newSkins.map(skinName).join('، ')}` : '');
    xb.append(n);
  }
  if (prefix === 'lose') $('lose-by').textContent = `${t('eliminatedBy')}: ${sum.killer}`;
}

game.events.on('match:win', (sum) => {
  coach.stop();
  renderResults('win', sum);
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
game.events.on('match:lose', (sum) => {
  coach.stop();
  renderResults('lose', sum);
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
// plane jump / open canopy: one big button, works for touch and mouse
$('btn-eject').addEventListener('click', () => { input.state.jump = true; });

// language
function syncLangButtons() {
  $('lang-ar').classList.toggle('active', i18n.lang === 'ar');
  $('lang-en').classList.toggle('active', i18n.lang === 'en');
}
$('lang-ar').addEventListener('click', () => { i18n.set('ar'); syncLangButtons(); renderLobby(); });
$('lang-en').addEventListener('click', () => { i18n.set('en'); syncLangButtons(); renderLobby(); });
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

// ------------------------------------------------------------------ first-match coaching
// Teaches by doing: each line waits until the player has actually done it.
const coach = {
  stage: null,
  start() {
    this.stage = profile.data.tutorialDone ? null : 'steer';
    this.mark = null;
    this.yaw0 = game.player.yaw;
    this.timer = 0;
  },
  stop() { this.stage = null; hud.hint(''); },
  key(k) { return i18n.t(touchMode ? k : `${k}Kb`); },
  update(dt) {
    if (!this.stage || uiState !== 'playing') return;
    const p = game.player;
    this.timer += dt;
    if (this.stage === 'steer') {
      hud.hint(p.inPlane ? this.key('planeHint') : this.key('hintSteer'));
      if (!p.dropping && !p.inPlane) { this.stage = 'move'; this.mark = { ...p.pos }; this.timer = 0; }
    } else if (this.stage === 'move') {
      hud.hint(this.key('hintMove'));
      if (Math.hypot(p.pos.x - this.mark.x, p.pos.z - this.mark.z) > 3) { this.stage = 'look'; this.yaw0 = p.yaw; }
    } else if (this.stage === 'look') {
      hud.hint(this.key('hintLook'));
      if (Math.abs(p.yaw - this.yaw0) > 0.6) { this.stage = 'fire'; this.shots0 = game.stats.shots; }
    } else if (this.stage === 'fire') {
      hud.hint(this.key('hintFire'));
      if (game.stats.shots > this.shots0) { this.stop(); profile.completeTutorial(); }
    }
  },
};

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
  coach.update(dt);
  input.lookScale = game.lookScale();
  if (uiState === 'playing') game.adaptResolution(fps || 60, dt);
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
globalThis.SAEED = { game, input, hud, i18n, profile, startMatch, goMenu, pauseMatch, resumeMatch, setDrop: (p, { routeThrough = true } = {}) => {
    dropPoint = p; if (p && routeThrough) game.planRoute(p); drawDropMap();
  } };
