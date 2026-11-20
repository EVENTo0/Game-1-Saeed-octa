/**
 * End-to-end smoke test: boots the real production build in Chromium (WebGL via
 * SwiftShader), then drives the game exactly as a player would — touch joystick,
 * keyboard, shooting, looting, the zone, victory and defeat.
 *
 *   npm run build && npm run smoke
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, globSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const APP_URL = 'http://localhost:4173/';
const SHOTS = new globalThis.URL('./screenshots/', import.meta.url).pathname;
const results = [];
let consoleErrors = [];

const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  return !!cond;
};

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* not up yet */ }
    await sleep(350);
  }
  return false;
}

async function main() {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ missing — run `npm run build` first');
    process.exit(2);
  }
  mkdirSync(SHOTS, { recursive: true });

  const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--host'], {
    stdio: 'ignore', detached: true,
  });
  const up = await waitForServer(APP_URL);
  if (!up) { server.kill('SIGTERM'); console.error('preview server never started'); process.exit(2); }

  // Use the Chromium already present in the environment when its build number
  // does not match this Playwright release (CI images pin their own copy).
  const launchOpts = {
    args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--disable-dev-shm-usage'],
  };
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    launchOpts.executablePath = process.env.CHROMIUM_PATH;
  } else {
    const local = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome');
    if (local.length) launchOpts.executablePath = local[0];
  }
  const browser = await chromium.launch(launchOpts);

  // ------------------------------------------------ phone context (landscape)
  const phone = await browser.newContext({
    ...devices['Pixel 5 landscape'],
    hasTouch: true, isMobile: true,
  });
  const page = await phone.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(APP_URL, { waitUntil: 'load' });
  await sleep(1200);

  // ---------- boot ----------
  ok('game boots without a page error', consoleErrors.length === 0, consoleErrors[0] ?? '');
  ok('splash screen is shown', await page.isVisible('#splash'));
  await page.screenshot({ path: `${SHOTS}01-splash.png` });

  await page.locator('#splash').tap();
  await sleep(500);
  ok('main menu opens from splash', await page.isVisible('#menu'));
  ok('the splash tap does not fall through onto a menu button',
    !(await page.isVisible('#settings')) && (await page.isVisible('#btn-play')));

  // ---------- v2: lobby ----------
  ok('lobby shows the player level and four outfits', await page.evaluate(() =>
    document.getElementById('lv-num').textContent === '1' && document.querySelectorAll('#skin-list .skin').length === 4));
  ok('lobby shows the build version', /^v2\./.test(await page.textContent('#app-version')));
  const mapBox = await page.locator('#drop-map').boundingBox();
  await page.locator('#drop-map').tap({ position: { x: mapBox.width * 0.5, y: mapBox.height * 0.5 } });
  ok('tapping the drop map marks a landing spot', await page.evaluate(() =>
    document.getElementById('drop-note').textContent.length > 0));
  // The rest of this suite was written around the classic spawn, away from the
  // bots; land there so later checks are not decided by an early firefight.
  await page.evaluate(() => globalThis.SAEED.setDrop({ ...globalThis.SAEED.game.map.spawns.player }));

  // ---------- Arabic / RTL ----------
  const dir = await page.getAttribute('html', 'dir');
  const title = await page.textContent('#menu .brand');
  ok('Arabic is the default UI language (RTL)', dir === 'rtl' && title.includes('سعيد'), `dir=${dir} title=${title}`);
  await page.screenshot({ path: `${SHOTS}02-menu-ar.png` });

  await page.locator('#lang-en').tap();
  await sleep(200);
  const dirEn = await page.getAttribute('html', 'dir');
  const titleEn = await page.textContent('#menu .brand');
  ok('English toggle switches to LTR', dirEn === 'ltr' && titleEn.includes('SAEED'), `dir=${dirEn} title=${titleEn}`);
  await page.screenshot({ path: `${SHOTS}03-menu-en.png` });
  await page.locator('#lang-ar').tap();
  await sleep(200);
  ok('toggling back restores Arabic', (await page.getAttribute('html', 'dir')) === 'rtl');

  // ---------- start the match ----------
  await page.locator('#btn-play').tap();
  await sleep(900);
  ok('HUD is visible in-game', await page.isVisible('#hud'));
  ok('map + player spawned', await page.evaluate(() => {
    const g = globalThis.SAEED.game;
    return g.state === 'playing' && g.player.alive && g.colliders.length > 50;
  }));
  ok('nine named opponents are alive (ten players)', await page.evaluate(() => globalThis.SAEED.game.aliveBots) === 9);

  // ---------- v2.2: plane, jump, skydive ----------
  ok('the match opens on the plane', await page.evaluate(() => globalThis.SAEED.game.player.inPlane));
  ok('the HUD shows the plane status and a JUMP button', await page.isVisible('#drop-chip') && await page.isVisible('#btn-eject'));
  // the route was planned through the marked spot, so the auto-jump happens over it
  const jumped = await page.waitForFunction(() => globalThis.SAEED.game.player.dropping, null, { timeout: 120000 })
    .then(() => true).catch(() => false);
  ok('Saeed jumps over the marked landing spot', jumped);
  // dt is clamped, so under software rendering the fall takes longer in wall time
  const landed = await page.waitForFunction(() => {
    const p = globalThis.SAEED.game.player;
    return !p.dropping && !p.inPlane && p.grounded;
  }, null, { timeout: 180000 }).then(() => true).catch(() => false);
  ok('Saeed opens the canopy and lands', landed);
  const where = await page.evaluate(() => {
    const g = globalThis.SAEED.game; const p = g.player.pos; const s = g.map.spawns.player;
    return { off: Math.hypot(p.x - s.x, p.z - s.z), near: g.bots.filter((b) => Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 60).length };
  });
  ok('the glide lands on the marked spot', where.off < 6, `${where.off.toFixed(1)} m off`);
  ok('at most one bot lands near Saeed', where.near <= 1, `${where.near} within 60 m`);
  ok('bots held fire during the drop', await page.evaluate(() => globalThis.SAEED.game.player.health.value) === 100);
  // UI checks below take real time under software rendering; park the bots at
  // the map edge so a wandering bot cannot end the round mid-suite. The AI
  // check later brings one back on purpose.
  await page.evaluate(() => {
    const g = globalThis.SAEED.game;
    g.bots.forEach((b, i) => { b.pos.x = -100 + i * 4; b.pos.z = -100; b.lastKnown = null; });
    g.freezeBots = true;
  });
  ok('loot is placed around the map', await page.evaluate(() => globalThis.SAEED.game.loot.remaining) >= 15);
  await page.screenshot({ path: `${SHOTS}04-ingame.png` });

  // the canvas is actually drawing something (not a blank frame)
  const painted = await page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    const g = globalThis.SAEED.game;
    g.render();
    const gl = g.renderer.getContext();
    const px = new Uint8Array(4);
    gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2),
      1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { w: c.width, h: c.height, px: [...px] };
  });
  ok('3D scene renders pixels', painted.w > 0 && painted.px.slice(0, 3).some((v) => v > 10), JSON.stringify(painted.px));

  // ---------- touch controls ----------
  ok('touch controls are active on a phone', await page.evaluate(() =>
    document.getElementById('hud').classList.contains('touch-active')));

  // Arabic flips text direction — it must NOT flip the thumb controls.
  const layout = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    return {
      dir: document.documentElement.dir,
      stick: r('#joystick-zone').left,
      stickRight: r('#joystick-zone').right,
      fire: r('[data-action="fire"]').left,
      width: window.innerWidth,
    };
  });
  ok('movement stick stays on the LEFT in Arabic',
    layout.dir === 'rtl' && layout.stick < layout.width * 0.1 && layout.stickRight < layout.width * 0.6,
    JSON.stringify(layout));
  ok('action buttons stay on the RIGHT in Arabic', layout.fire > layout.width * 0.5, `fire x=${layout.fire}`);

  const before = await page.evaluate(() => ({ ...globalThis.SAEED.game.player.pos }));
  // drag the virtual joystick up-screen = move forward
  const box = await page.locator('#joystick-zone').boundingBox();
  const jx = box.x + box.width * 0.4, jy = box.y + box.height * 0.6;
  await page.mouse.move(jx, jy);
  await page.dispatchEvent('#joystick-zone', 'pointerdown', { pointerId: 1, clientX: jx, clientY: jy, isPrimary: true, pointerType: 'touch', bubbles: true });
  for (let i = 1; i <= 8; i++) {
    await page.evaluate(([x, y]) => window.dispatchEvent(new PointerEvent('pointermove',
      { pointerId: 1, clientX: x, clientY: y, bubbles: true })), [jx, jy - i * 9]);
    await sleep(70);
  }
  await sleep(500);
  const afterJoy = await page.evaluate(() => ({ ...globalThis.SAEED.game.player.pos }));
  const moved = Math.hypot(afterJoy.x - before.x, afterJoy.z - before.z);
  ok('virtual joystick moves Saeed', moved > 1.5, `moved ${moved.toFixed(2)}m`);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })));
  await page.screenshot({ path: `${SHOTS}05-touch-move.png` });

  // Look with REAL touches. CDP Input.dispatchTouchEvent is hit-tested like a
  // finger; synthetic events dispatched onto #hud hid a bug where the
  // click-through HUD never received real touches, so phones could not look.
  const cdp = await phone.newCDPSession(page);
  const finger = async (points, id = 11) => {
    const [x0, y0] = points[0];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id }] });
    for (const [x, y] of points.slice(1)) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id }] });
      await sleep(40);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
  };
  const vp = page.viewportSize();
  // open screen between the minimap and the button cluster
  const lx = vp.width * 0.56, ly = vp.height * 0.28;
  const hitLook = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return !el.closest('button');
  }, [lx, ly]);
  ok('the look area is open screen, not a button', hitLook);
  const yaw0 = await page.evaluate(() => globalThis.SAEED.game.player.yaw);
  await finger(Array.from({ length: 9 }, (_, i) => [lx - i * 16, ly]));
  const yaw1 = await page.evaluate(() => globalThis.SAEED.game.player.yaw);
  ok('a real finger drag turns the camera', Math.abs(yaw1 - yaw0) > 0.1, `Δyaw ${(yaw1 - yaw0).toFixed(3)}`);
  ok('dragging left turns the view left (yaw increases)', yaw1 > yaw0);
  await finger(Array.from({ length: 9 }, (_, i) => [lx - 100 + i * 16, ly]));
  const yaw2 = await page.evaluate(() => globalThis.SAEED.game.player.yaw);
  ok('dragging right turns the view right', yaw2 < yaw1, `Δyaw ${(yaw2 - yaw1).toFixed(3)}`);

  // the model must face away from the chase camera (regression: it faced the lens)
  const facing = await page.evaluate(() => {
    const g = globalThis.SAEED.game;
    const d = g.playerView.root.rotation.y - g.player.yaw;
    return Math.abs(Math.cos(d) + 1);           // 0 when exactly half a turn off
  });
  ok('player model faces away from the camera', facing < 1e-3, `|cos+1| ${facing.toFixed(5)}`);

  // dragging the thumb up looks up
  const pitch0 = await page.evaluate(() => globalThis.SAEED.game.player.pitch);
  await finger(Array.from({ length: 6 }, (_, i) => [lx, ly + 90 - i * 14]));
  const pitch1 = await page.evaluate(() => globalThis.SAEED.game.player.pitch);
  ok('dragging the thumb up looks up', pitch1 > pitch0 + 0.05, `Δpitch ${(pitch1 - pitch0).toFixed(3)}`);

  // fire-and-look: a drag that starts on the fire button shoots and aims
  // aim at the sky so the test burst cannot hit (and aggro) a bot
  await page.evaluate(() => { globalThis.SAEED.game.player.pitch = 0.7; });
  const fb = await page.locator('[data-action="fire"]').boundingBox();
  const fy0 = await page.evaluate(() => globalThis.SAEED.game.player.yaw);
  const fs0 = await page.evaluate(() => globalThis.SAEED.game.stats.shots);
  const fx = fb.x + fb.width / 2, fyy = fb.y + fb.height / 2;
  await finger(Array.from({ length: 10 }, (_, i) => [fx - i * 12, fyy]), 12);
  const fire = await page.evaluate(([y, s]) => ({ dYaw: globalThis.SAEED.game.player.yaw - y,
    shots: globalThis.SAEED.game.stats.shots - s }), [fy0, fs0]);
  ok('dragging from the fire button shoots and turns', fire.shots > 0 && Math.abs(fire.dYaw) > 0.1, JSON.stringify(fire));
  await page.evaluate(() => {
    const g = globalThis.SAEED.game;
    g.player.pitch = 0; g.player.health.value = g.player.health.max;
    const w = g.player.inventory.weapon; if (w) { w.mag = w.def.magSize; w.reloadTimer = 0; }
  });

  // action buttons
  const tapBtn = async (action) => {
    const sel = `[data-action="${action}"]`;
    const b = await page.locator(sel).boundingBox();
    await page.dispatchEvent(sel, 'pointerdown', { pointerId: 3, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2, isPrimary: true, pointerType: 'touch', bubbles: true });
    await sleep(120);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, bubbles: true })));
    await sleep(120);
  };
  await tapBtn('jump');
  ok('JUMP button leaves the ground', await page.evaluate(async () => {
    const p = globalThis.SAEED.game.player;
    return p.pos.y > 0.05 || p.vel.y > 0.5 || !p.grounded;
  }));
  await sleep(900);
  await tapBtn('crouch');
  ok('CROUCH button lowers Saeed', await page.evaluate(() => globalThis.SAEED.game.player.crouching));
  await tapBtn('crouch');
  await tapBtn('aim');
  ok('AIM button enters aim mode', await page.evaluate(() => globalThis.SAEED.game.player.aiming));
  await page.screenshot({ path: `${SHOTS}06-aim.png` });
  await tapBtn('aim');

  const magBefore = await page.evaluate(() => globalThis.SAEED.game.player.inventory.weapon.mag);
  await tapBtn('fire');
  await sleep(200);
  const magAfter = await page.evaluate(() => globalThis.SAEED.game.player.inventory.weapon.mag);
  ok('FIRE button shoots and spends ammo', magAfter < magBefore, `${magBefore} → ${magAfter}`);

  await tapBtn('reload');
  await sleep(200);
  ok('RELOAD button starts a reload', await page.evaluate(() =>
    globalThis.SAEED.game.player.inventory.weapon.reloading
    || globalThis.SAEED.game.player.inventory.weapon.mag === 30));
  await sleep(2200);

  // ---------- aim assist (touch only) ----------
  const assist = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const bot = g.bots.find((b) => b.alive);
    const ARENA = { x: 75, z: -60 };
    bot.pos.x = ARENA.x; bot.pos.z = ARENA.z; bot.pos.y = 0;
    g.player.pos.x = ARENA.x; g.player.pos.z = ARENA.z + 20; g.player.pos.y = 0;
    g.player.pitch = 0;
    const onTarget = Math.atan2(-(bot.pos.x - g.player.pos.x), -(bot.pos.z - g.player.pos.z));
    const enabledAtStart = g.aimAssistEnabled;

    // Aim slightly off target and see whether the assist closes the gap. The bot
    // charges the player the moment it sees them, so pin it in place for the
    // measurement — otherwise this measures the bot running, not the assist.
    const measure = async (enabled) => {
      g.aimAssistEnabled = enabled;
      g.player.yaw = onTarget + 0.10;
      g.player.aiming = true;
      globalThis.SAEED.input.state.aim = true;
      const pin = setInterval(() => {
        bot.pos.x = ARENA.x; bot.pos.z = ARENA.z; bot.pos.y = 0;
        g.player.pos.x = ARENA.x; g.player.pos.z = ARENA.z + 20; g.player.pos.y = 0;
      }, 16);
      await new Promise((r) => setTimeout(r, 700));
      clearInterval(pin);
      globalThis.SAEED.input.state.aim = false;
      return Math.abs(g.player.yaw - onTarget);
    };
    const withAssist = await measure(true);
    const without = await measure(false);
    g.aimAssistEnabled = enabledAtStart;
    return { enabledAtStart, withAssist, without };
  });
  ok('aim assist is on by default on a phone', assist.enabledAtStart);
  ok('aim assist pulls the crosshair onto a target', assist.withAssist < assist.without * 0.5,
    `off-target ${assist.withAssist.toFixed(4)} rad with assist vs ${assist.without.toFixed(4)} without`);
  ok('aim assist can be turned off in settings', await page.evaluate(async () => {
    const box = document.getElementById('set-assist');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 100));
    const off = globalThis.SAEED.game.aimAssistEnabled === false;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 100));
    return off && globalThis.SAEED.game.aimAssistEnabled === true;
  }));

  // ---------- directional damage indicator ----------
  const dmgDir = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const host = document.getElementById('damage-dirs');
    host.innerHTML = '';
    g.player.yaw = 0;                                  // facing -Z
    // attacker directly behind → indicator should point backwards (~pi)
    g.hud.showDamageFrom(g._screenAngleTo({ x: g.player.pos.x, z: g.player.pos.z + 10 }));
    const behind = host.lastChild?.style.transform ?? '';
    // attacker to the right → ~ +pi/2
    g.hud.showDamageFrom(g._screenAngleTo({ x: g.player.pos.x + 10, z: g.player.pos.z }));
    const right = host.lastChild?.style.transform ?? '';
    const rad = (t) => parseFloat((t.match(/rotate\(([-0-9.]+)rad\)/) || [])[1] ?? 'NaN');
    return { count: host.children.length, behind: rad(behind), right: rad(right) };
  });
  ok('damage indicator is created when hit', dmgDir.count >= 2);
  ok('damage indicator points behind for a shot from behind',
    Math.abs(Math.abs(dmgDir.behind) - Math.PI) < 0.2, `${dmgDir.behind.toFixed(2)} rad`);
  ok('damage indicator points right for a shot from the right',
    Math.abs(dmgDir.right - Math.PI / 2) < 0.2, `${dmgDir.right.toFixed(2)} rad`);

  // ---------- crosshair reacts to spread ----------
  const cross = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const el = document.getElementById('crosshair');
    const gap = () => parseFloat(getComputedStyle(el).getPropertyValue('--ch-gap'));
    g.player.aiming = false; g.player.vel.x = 0; g.player.vel.z = 0;
    globalThis.SAEED.input.state.aim = false;
    await new Promise((r) => setTimeout(r, 200));
    const hip = gap();
    globalThis.SAEED.input.state.aim = true;
    await new Promise((r) => setTimeout(r, 300));
    const ads = gap();
    globalThis.SAEED.input.state.aim = false;
    return { hip, ads };
  });
  ok('crosshair tightens when aiming down sights', cross.ads < cross.hip,
    `hip ${cross.hip}px vs ads ${cross.ads}px`);

  // ---------- loot pickup on touch ----------
  const pickedUp = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const item = g.loot.items.find((i) => !i.taken && i.type === 'medkit');
    g.player.pos.x = item.x; g.player.pos.z = item.z;
    await new Promise((r) => setTimeout(r, 150));
    const prompt = !document.getElementById('pickup-prompt').classList.contains('hidden');
    const beforeKits = g.player.inventory.medkits;
    globalThis.SAEED.input.state.interact = true;
    await new Promise((r) => setTimeout(r, 200));
    return { prompt, beforeKits, afterKits: g.player.inventory.medkits, taken: item.taken,
      state: g.state, hp: Math.round(g.player.health.value) };
  });
  ok('walking onto loot shows the التقاط prompt', pickedUp.prompt, JSON.stringify(pickedUp));
  ok('INTERACT picks the med kit up', pickedUp.afterKits === pickedUp.beforeKits + 1 && pickedUp.taken);

  // ---------- weapon pickup + switch ----------
  const weaponSwap = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const item = g.loot.items.find((i) => !i.taken && i.type === 'weapon' && i.weaponId !== 'OCTA_AR');
    g.player.pos.x = item.x; g.player.pos.z = item.z;
    await new Promise((r) => setTimeout(r, 150));
    globalThis.SAEED.input.state.interact = true;
    await new Promise((r) => setTimeout(r, 250));
    const ids = g.player.inventory.slots.map((w) => w.id);
    const first = g.player.inventory.weapon.id;
    globalThis.SAEED.input.state.swap = true;
    await new Promise((r) => setTimeout(r, 250));
    return { ids, first, second: g.player.inventory.weapon.id };
  });
  ok('second weapon goes into the free slot', weaponSwap.ids.length === 2, weaponSwap.ids.join(','));
  ok('weapon switch changes the active weapon', weaponSwap.first !== weaponSwap.second,
    `${weaponSwap.first} → ${weaponSwap.second}`);

  // ---------- healing ----------
  const healed = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    g.player.health.value = 40;
    const before = g.player.health.value;
    const kitsBefore = g.player.inventory.medkits;
    globalThis.SAEED.input.state.use = true;
    // Poll rather than sleeping a fixed time: dt is clamped to 100ms, so under
    // software rendering the game clock runs slower than the wall clock and a
    // fixed wait is not long enough for a 1.6s heal.
    const deadline = performance.now() + 12000;
    while (performance.now() < deadline && g.player.health.value <= before) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return { before, after: g.player.health.value, kitsBefore, kitsAfter: g.player.inventory.medkits };
  });
  ok('med kit is consumed when used', healed.kitsAfter === healed.kitsBefore - 1,
    `${healed.kitsBefore} → ${healed.kitsAfter}`);
  ok('med kit restores health', healed.after > healed.before, `${healed.before} → ${healed.after}`);

  // ---------- combat vs a bot ----------
  await page.evaluate(() => { globalThis.SAEED.game.freezeBots = false; });
  const combat = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const bot = g.bots.find((b) => b.alive);
    // Move the duel to an empty patch of desert. Anywhere else the bot may be
    // behind cover, and a blocked shot is correct behaviour, not a bug.
    const ARENA = { x: 75, z: -60 };
    bot.pos.x = ARENA.x; bot.pos.z = ARENA.z; bot.pos.y = 0;
    g.player.pos.x = ARENA.x; g.player.pos.z = ARENA.z + 12; g.player.pos.y = 0;
    g.player.yaw = 0; g.player.pitch = 0;
    g.player.inventory.switchTo(g.player.inventory.slots.findIndex((w) => w.id === 'OCTA_AR'));
    const w = g.player.inventory.weapon;
    w.mag = 30; w.reloadTimer = 0;
    const hpBefore = bot.health.value;
    for (let i = 0; i < 40; i++) {
      // stay on target and stay alive — the other bots really do shoot back
      g.player.health.value = g.player.health.max;
      g.player.pos.x = ARENA.x; g.player.pos.z = ARENA.z + 12; g.player.pos.y = 0;
      g.player.yaw = Math.atan2(-(bot.pos.x - g.player.pos.x), -(bot.pos.z - g.player.pos.z));
      g.player.pitch = 0;
      if (w.mag === 0) { w.mag = w.def.magSize; w.reloadTimer = 0; }
      w.cooldown = 0;
      g._fireHeld = false;
      g._tryFire();
      await new Promise((r) => setTimeout(r, 40));
      if (!bot.alive) break;
    }
    g.player.health.value = g.player.health.max;
    return { hpBefore, hpAfter: bot.health.value, alive: bot.alive, kills: g.player.kills, state: g.state };
  });
  ok('the match is still running after the duel', combat.state === 'playing', combat.state);
  ok('shooting damages an enemy', combat.hpAfter < combat.hpBefore, `${combat.hpBefore} → ${combat.hpAfter}`);
  ok('enough hits eliminate an enemy', !combat.alive && combat.kills >= 1);
  const alive = await page.evaluate(() => globalThis.SAEED.game.aliveBots);
  ok('enemy counter drops on the HUD', (await page.textContent('#enemy-count')) === String(alive) && alive < 9,
    await page.textContent('#enemy-count'));
  await page.screenshot({ path: `${SHOTS}07-combat.png` });

  // ---------- AI shoots back ----------
  const aiDamage = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const bot = g.bots.find((b) => b.alive);
    // isolate the duel: bots fight the NEAREST enemy, and the parked bots stand
    // a few metres apart, so a parked neighbour would win the bot's attention
    bot.pos.x = -40; bot.pos.z = 22; bot.pos.y = 0; bot.rival = null;
    g.player.health.value = 100;
    g.player.pos.x = bot.pos.x; g.player.pos.z = bot.pos.z + 8; g.player.pos.y = bot.pos.y;
    // This check verifies the real AI fire/damage path, not RNG luck. End spawn
    // protection explicitly and make this bot's accuracy roll deterministic only
    // for the duration of the smoke assertion. Runtime gameplay remains unchanged.
    g.matchTime = Math.max(g.matchTime, 4);
    const originalRng = bot.rng;
    bot.rng = () => 0;
    bot.fireTimer = 0;
    let hits = 0;
    const original = g._botShoot.bind(g);
    g._botShoot = (b, accurate, d) => { if (accurate) hits++; return original(b, accurate, d); };
    const start = performance.now();
    while (performance.now() - start < 6000 && hits === 0) {
      await new Promise((r) => setTimeout(r, 100));
      // keep the player next to the bot so the duel actually happens
      g.player.pos.x = bot.pos.x; g.player.pos.z = bot.pos.z + 8; g.player.pos.y = bot.pos.y;
    }
    const hp = g.player.health.value;
    g._botShoot = original;
    bot.rng = originalRng;
    g.player.health.value = g.player.health.max;
    return { hp, hits, botState: bot.state, state: g.state };
  });
  ok('AI detects the player and lands shots', aiDamage.hits > 0 && aiDamage.hp < 100,
    `${aiDamage.hits} hits, player hp ${aiDamage.hp.toFixed(1)}, bot=${aiDamage.botState}`);

  // ---------- zone ----------
  const zone = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    g.zone.phase = 0; g.zone.state = 'shrinking'; g.zone.timer = 0;
    // measure from after the reset: the ring may already have been shrinking
    await new Promise((r) => setTimeout(r, 250));
    const r0 = g.zone.radius;
    await new Promise((r) => setTimeout(r, 1400));
    const r1 = g.zone.radius;
    // stand well outside and take ring damage
    g.player.health.value = 100;
    g.player.pos.x = g.zone.center.x + g.zone.radius + 40;
    g.player.pos.z = g.zone.center.z;
    const warnBefore = document.getElementById('zone-warning').classList.contains('hidden');
    await new Promise((r) => setTimeout(r, 1500));
    const hp = g.player.health.value;
    g.player.health.value = g.player.health.max;
    g.player.pos.x = g.zone.center.x; g.player.pos.z = g.zone.center.z;
    return {
      r0, r1, hp, warnBefore,
      warning: !document.getElementById('zone-warning').classList.contains('hidden'),
      label: document.getElementById('zone-label').textContent,
    };
  });
  ok('safe zone shrinks over time', zone.r1 < zone.r0, `${zone.r0.toFixed(1)} → ${zone.r1.toFixed(1)}`);
  ok('outside the zone the player takes damage', zone.hp < 100, `hp ${zone.hp.toFixed(1)}`);
  ok('ZONE CLOSING warning appears in Arabic', zone.warning && /[؀-ۿ]/.test(zone.label), zone.label);
  await page.screenshot({ path: `${SHOTS}08-zone.png` });

  // ---------- pause / resume ----------
  await page.locator('#btn-pause').tap();
  await sleep(300);
  ok('pause screen opens', await page.isVisible('#pause')
    && await page.evaluate(() => globalThis.SAEED.game.state) === 'paused');
  await page.locator('#btn-resume').tap();
  await sleep(300);
  ok('resume returns to play', await page.evaluate(() => globalThis.SAEED.game.state) === 'playing');

  // ---------- v2.1: armour vest ----------
  const vest = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const it = g.loot.items.find((i) => i.type === 'armor' && !i.taken);
    g.player.inventory.armor = 0;
    g.player.pos.x = it.x + 0.6; g.player.pos.z = it.z + 0.6;
    await new Promise((r) => setTimeout(r, 300));
    globalThis.SAEED.input.state.interact = true;
    const deadline = performance.now() + 8000;
    while (performance.now() < deadline && g.player.inventory.armor === 0) await new Promise((r) => setTimeout(r, 100));
    const armor = g.player.inventory.armor;
    const hp = g.player.health.value;
    g.player.takeDamage(20);
    return { armor, lost: hp - g.player.health.value, bar: !document.getElementById('armor-bar').classList.contains('empty') };
  });
  ok('an armour vest can be picked up', vest.armor > 0 && vest.bar, JSON.stringify(vest));
  ok('armour soaks part of a hit', vest.lost > 0 && vest.lost < 20, `lost ${vest.lost}`);
  await page.evaluate(() => { const g = globalThis.SAEED.game; g.player.health.value = g.player.health.max; });

  // ---------- v2.1: supply drop ----------
  const drop = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const before = g.loot.items.length;
    g.airdrop.reset();                    // the long suite may already have seen one
    g.matchTime = Math.max(g.matchTime, g.airdrop.cfg.at);
    const t0 = performance.now();
    while (performance.now() - t0 < 8000 && g.airdrop.state === 'idle') await new Promise((r) => setTimeout(r, 100));
    const announced = g.airdrop.state === 'falling';
    g.airdrop.pos.y = Math.min(g.airdrop.pos.y, g.airdrop.ground + 0.5);   // skip most of the fall
    while (performance.now() - t0 < 20000 && g.airdrop.state !== 'landed') await new Promise((r) => setTimeout(r, 100));
    return { announced, landed: g.airdrop.state === 'landed', added: g.loot.items.length - before,
      special: g.loot.items.filter((i) => i.special).length };
  });
  ok('the supply drop is announced and falls', drop.announced, JSON.stringify(drop));
  ok('the supply drop lands and opens into rare loot', drop.landed && drop.added === 4 && drop.special === 4, JSON.stringify(drop));

  // ---------- v2.1: zone guidance ----------
  const arrow = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const z = g.zone;
    g.player.pos.x = z.center.x + z.radius + 25; g.player.pos.z = z.center.z; g.player.pos.y = 0;
    await new Promise((r) => setTimeout(r, 400));
    const visible = !document.getElementById('zone-arrow').classList.contains('hidden');
    const dist = document.getElementById('zone-dist').textContent;
    g.player.pos.x = z.center.x; g.player.pos.z = z.center.z;
    g.player.health.value = g.player.health.max;
    return { visible, dist };
  });
  ok('outside the zone an arrow shows the way back', arrow.visible && /^\d+m$/.test(arrow.dist), JSON.stringify(arrow));

  // ---------- victory ----------
  await page.evaluate(() => {
    const g = globalThis.SAEED.game;
    g.player.health.value = 100;
    g.player.pos.x = g.zone.center.x; g.player.pos.z = g.zone.center.z;
    g.bots.filter((b) => b.alive).forEach((b) => g._damageBot(b, 999));
  });
  await sleep(2200);
  ok('victory screen appears when every opponent is down', await page.isVisible('#victory'));
  const winText = await page.textContent('#victory .win');
  ok('victory headline reads مبروك يا سعيد!', winText.trim() === 'مبروك يا سعيد!', winText);
  ok('victory sub-line reads أنت بطل الجولة', (await page.textContent('#victory .sub')).trim() === 'أنت بطل الجولة');
  const res = await page.evaluate(() => ({
    place: document.getElementById('win-place').textContent,
    stats: document.querySelectorAll('#win-stats .stat').length,
    total: document.querySelector('#win-xp .xp-row.total b')?.textContent ?? '',
    xp: globalThis.SAEED.profile.data.xp,
    wins: globalThis.SAEED.profile.data.wins,
    feed: document.querySelectorAll('#kill-feed .kf-row').length,
  }));
  ok('results show 1st place and four stats', res.place.startsWith('#1') && res.stats === 4, JSON.stringify(res));
  ok('the win awards XP and is saved to the profile', /\+\d+ XP/.test(res.total) && res.xp > 0 && res.wins === 1, res.total);
  ok('eliminations appear in the kill feed', res.feed > 0);
  await page.screenshot({ path: `${SHOTS}09-victory.png` });

  // ---------- restart without a reload ----------
  const navBefore = await page.evaluate(() => performance.now());
  await page.locator('#btn-play-again').tap();
  await sleep(900);
  const restarted = await page.evaluate(() => {
    const g = globalThis.SAEED.game;
    return { state: g.state, bots: g.aliveBots, hp: g.player.health.value, loot: g.loot.remaining, t: performance.now() };
  });
  ok('PLAY AGAIN restarts in place (no page reload)', restarted.t > navBefore);
  ok('restart resets bots, health and loot (spawn grace keeps Saeed at full HP)',
    restarted.state === 'playing' && restarted.bots === 9 && restarted.hp === 100 && restarted.loot >= 15,
    JSON.stringify(restarted));

  // ---------- defeat ----------
  await page.evaluate(() => { globalThis.SAEED.game.player.takeDamage(999); });
  await sleep(2400);
  ok('defeat screen appears when Saeed dies', await page.isVisible('#defeat'));
  ok('defeat headline reads انتهت الجولة', (await page.textContent('#defeat .lose')).trim() === 'انتهت الجولة');
  await page.screenshot({ path: `${SHOTS}10-defeat.png` });
  await page.locator('#btn-retry').tap();
  await sleep(700);
  ok('retry starts a fresh round', await page.evaluate(() => globalThis.SAEED.game.state) === 'playing');

  // ---------- Uncle Mansour ----------
  const mansour = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const m = g.map.spawns.npcMansour;
    // the retry above starts a fresh round on the plane: put Saeed on the ground
    g.player.inPlane = false; g.player.dropping = false; g.player.pos.y = 0;
    g.player.pos.x = m.x + 2; g.player.pos.z = m.z + 2;
    await new Promise((r) => setTimeout(r, 400));
    const el = document.getElementById('mansour-bubble');
    return { visible: !el.classList.contains('hidden'), line: document.getElementById('mansour-line').textContent };
  });
  ok('Uncle Mansour greets Saeed near the village', mansour.visible);
  ok('Mansour says the coffee line', mansour.line.includes('وين القهوة'), mansour.line);
  await page.screenshot({ path: `${SHOTS}11-mansour.png` });

  // ---------- draw-call budget ----------
  const perfInfo = await page.evaluate(() => {
    const g = globalThis.SAEED.game;
    g.render();
    return {
      calls: g.renderer.info.render.calls,
      tris: g.renderer.info.render.triangles,
      merged: g.world.stats,
    };
  });
  ok('static world is merged into few draw calls',
    perfInfo.merged.meshesAfter < 40 && perfInfo.merged.meshesBefore > 80,
    `${perfInfo.merged.meshesBefore} meshes → ${perfInfo.merged.meshesAfter}`);
  // Budget, not a measurement of a real phone: this counts the shadow pass too.
  // Mid-range Android handles ~150 calls at this triangle count comfortably.
  ok('whole frame stays inside a mobile draw-call budget', perfInfo.calls < 150,
    `${perfInfo.calls} draw calls, ${perfInfo.tris} triangles`);

  // ---------- crash resilience ----------
  // Phones drop the GPU context under memory pressure; the game must survive it.
  const gl = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const ext = g.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!ext) return { skipped: true };
    ext.loseContext();
    await new Promise((r) => setTimeout(r, 500));
    const lost = g.contextLost;
    ext.restoreContext();
    await new Promise((r) => setTimeout(r, 1200));
    if (g.state === 'paused') globalThis.SAEED.resumeMatch();
    await new Promise((r) => setTimeout(r, 300));
    return { lost, restored: !g.contextLost, state: g.state };
  });
  ok('the game survives a lost GPU context', gl.skipped || (gl.lost && gl.restored && gl.state !== 'idle'), JSON.stringify(gl));
  ok('the mobile build skips MSAA to save GPU memory', await page.evaluate(() =>
    globalThis.SAEED.game.renderer.getContextAttributes().antialias === false));
  ok('a match in progress is flagged for crash recovery', await page.evaluate(() =>
    localStorage.getItem('saeed_running_v1') !== null || globalThis.SAEED.game.state !== 'playing'));

  // ---------- performance sample ----------
  const perf = await page.evaluate(async () => {
    let frames = 0;
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => { frames++; (performance.now() - t0 < 3000) ? requestAnimationFrame(tick) : res(); };
      requestAnimationFrame(tick);
    });
    return Math.round(frames / ((performance.now() - t0) / 1000));
  });
  console.log(`INFO  software-rendered FPS sample (SwiftShader, not a real phone GPU): ${perf}`);

  await phone.close();

  // ------------------------------------------------ desktop context
  const desk = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const dpage = await desk.newPage();
  const deskErrors = [];
  dpage.on('pageerror', (e) => deskErrors.push(e.message));
  dpage.on('console', (m) => { if (m.type() === 'error') deskErrors.push(m.text()); });
  await dpage.goto(APP_URL, { waitUntil: 'load' });
  await sleep(900);
  await dpage.click('#splash');
  await dpage.evaluate(() => globalThis.SAEED.setDrop({ ...globalThis.SAEED.game.map.spawns.player }));
  await dpage.click('#btn-play');
  await sleep(900);

  // Space jumps out of the plane on desktop
  await dpage.keyboard.press('Space');
  const djump = await dpage.waitForFunction(() => globalThis.SAEED.game.player.dropping, null, { timeout: 15000 })
    .then(() => true).catch(() => false);
  ok('desktop Space jumps out of the plane', djump);
  await dpage.waitForFunction(() => { const p = globalThis.SAEED.game.player; return !p.dropping && !p.inPlane; }, null, { timeout: 180000 }).catch(() => {});
  await dpage.evaluate(() => { globalThis.SAEED.game.freezeBots = true; });

  const dBefore = await dpage.evaluate(() => ({ ...globalThis.SAEED.game.player.pos }));
  await dpage.keyboard.down('KeyW');
  // Poll instead of sleeping: dt is clamped, so software rendering slows the
  // game clock below wall-clock time and a fixed wait moves the player too little.
  await dpage.waitForFunction(([x, z]) => {
    const p = globalThis.SAEED.game.player.pos;
    return Math.hypot(p.x - x, p.z - z) > 2.5;
  }, [dBefore.x, dBefore.z], { timeout: 10000 }).catch(() => {});
  await dpage.keyboard.up('KeyW');
  const dAfter = await dpage.evaluate(() => ({ ...globalThis.SAEED.game.player.pos }));
  ok('desktop WASD moves the player',
    Math.hypot(dAfter.x - dBefore.x, dAfter.z - dBefore.z) > 1.5,
    `${Math.hypot(dAfter.x - dBefore.x, dAfter.z - dBefore.z).toFixed(2)}m`);

  // crouch, fire and reload are disabled mid-air by design: land first
  await dpage.waitForFunction(() => { const p = globalThis.SAEED.game.player; return !p.dropping && !p.inPlane; }, null, { timeout: 180000 }).catch(() => {});
  await dpage.keyboard.press('KeyC');
  await sleep(200);
  ok('desktop C toggles crouch', await dpage.evaluate(() => globalThis.SAEED.game.player.crouching));
  await dpage.keyboard.press('KeyC');

  const dMag = await dpage.evaluate(() => globalThis.SAEED.game.player.inventory.weapon.mag);
  await dpage.evaluate(() => { globalThis.SAEED.input.state.fire = true; });
  await sleep(250);
  await dpage.evaluate(() => { globalThis.SAEED.input.state.fire = false; });
  ok('desktop fire spends ammo',
    await dpage.evaluate(() => globalThis.SAEED.game.player.inventory.weapon.mag) < dMag);

  await dpage.keyboard.press('KeyR');
  await sleep(200);
  ok('desktop R reloads', await dpage.evaluate(() =>
    globalThis.SAEED.game.player.inventory.weapon.reloading));

  await dpage.keyboard.press('Escape');
  await sleep(300);
  ok('desktop Escape pauses', await dpage.isVisible('#pause'));
  await dpage.screenshot({ path: `${SHOTS}12-desktop.png` });
  ok('desktop run produced no console errors', deskErrors.length === 0, deskErrors[0] ?? '');

  await desk.close();
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }

  // ---------- report ----------
  const fatal = consoleErrors.filter((e) => !/favicon|WebGL|SwiftShader|GroupMarker/i.test(e));
  ok('no runtime console errors during the whole session', fatal.length === 0, fatal.slice(0, 3).join(' | '));

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== SMOKE TEST: ${passed}/${results.length} PASS ===`);
  if (passed !== results.length) {
    console.log('Failures:');
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.name} ${r.extra}`));
  }
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
