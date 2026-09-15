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
  ok('five named opponents are alive', await page.evaluate(() => globalThis.SAEED.game.aliveBots) === 5);
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

  // look drag on the right half rotates the camera
  const yaw0 = await page.evaluate(() => globalThis.SAEED.game.player.yaw);
  const vp = page.viewportSize();
  const lx = vp.width * 0.75, ly = vp.height * 0.25;
  await page.dispatchEvent('#hud', 'pointerdown', { pointerId: 2, clientX: lx, clientY: ly, isPrimary: true, pointerType: 'touch', bubbles: true });
  for (let i = 1; i <= 6; i++) {
    await page.evaluate(([x, y]) => window.dispatchEvent(new PointerEvent('pointermove',
      { pointerId: 2, clientX: x, clientY: y, bubbles: true })), [lx - i * 16, ly]);
    await sleep(50);
  }
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, bubbles: true })));
  await sleep(200);
  const yaw1 = await page.evaluate(() => globalThis.SAEED.game.player.yaw);
  ok('drag on the right side turns the camera', Math.abs(yaw1 - yaw0) > 0.1, `Δyaw ${(yaw1 - yaw0).toFixed(3)}`);

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
    return { prompt, beforeKits, afterKits: g.player.inventory.medkits, taken: item.taken };
  });
  ok('walking onto loot shows the التقاط prompt', pickedUp.prompt);
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
    globalThis.SAEED.input.state.use = true;
    await new Promise((r) => setTimeout(r, 2200));
    return { before, after: g.player.health.value };
  });
  ok('med kit restores health', healed.after > healed.before, `${healed.before} → ${healed.after}`);

  // ---------- combat vs a bot ----------
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
  ok('enemy counter drops on the HUD', (await page.textContent('#enemy-count')) === '4',
    await page.textContent('#enemy-count'));
  await page.screenshot({ path: `${SHOTS}07-combat.png` });

  // ---------- AI shoots back ----------
  const aiDamage = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const bot = g.bots.find((b) => b.alive);
    g.player.health.value = 100;
    g.player.pos.x = bot.pos.x; g.player.pos.z = bot.pos.z + 8; g.player.pos.y = bot.pos.y;
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
    g.player.health.value = g.player.health.max;
    return { hp, hits, botState: bot.state, state: g.state };
  });
  ok('AI detects the player and lands shots', aiDamage.hits > 0 && aiDamage.hp < 100,
    `${aiDamage.hits} hits, player hp ${aiDamage.hp.toFixed(1)}, bot=${aiDamage.botState}`);

  // ---------- zone ----------
  const zone = await page.evaluate(async () => {
    const g = globalThis.SAEED.game;
    const r0 = g.zone.radius;
    g.zone.phase = 0; g.zone.state = 'shrinking'; g.zone.timer = 0;
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
    restarted.state === 'playing' && restarted.bots === 5 && restarted.hp === 100 && restarted.loot >= 15,
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
    perfInfo.merged.meshesAfter < 20 && perfInfo.merged.meshesBefore > 80,
    `${perfInfo.merged.meshesBefore} meshes → ${perfInfo.merged.meshesAfter}`);
  // Budget, not a measurement of a real phone: this counts the shadow pass too.
  // Mid-range Android handles ~150 calls at this triangle count comfortably.
  ok('whole frame stays inside a mobile draw-call budget', perfInfo.calls < 150,
    `${perfInfo.calls} draw calls, ${perfInfo.tris} triangles`);

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
  await dpage.click('#btn-play');
  await sleep(900);

  const dBefore = await dpage.evaluate(() => ({ ...globalThis.SAEED.game.player.pos }));
  await dpage.keyboard.down('KeyW');
  await sleep(900);
  await dpage.keyboard.up('KeyW');
  const dAfter = await dpage.evaluate(() => ({ ...globalThis.SAEED.game.player.pos }));
  ok('desktop WASD moves the player',
    Math.hypot(dAfter.x - dBefore.x, dAfter.z - dBefore.z) > 1.5,
    `${Math.hypot(dAfter.x - dBefore.x, dAfter.z - dBefore.z).toFixed(2)}m`);

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
