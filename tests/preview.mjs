/**
 * Pre-release preview: plays a scripted session in the real production build
 * on a phone-sized viewport, recording a video and labelled screenshots, then
 * writes preview/manifest.json and preview/index.html for the owner to review
 * before anything is shipped.
 *
 *   npm run build && npm run preview:report
 */
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, globSync, readdirSync, renameSync, writeFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 4175;
const URL_ = `http://localhost:${PORT}/`;
const OUT = new globalThis.URL('../preview/', import.meta.url).pathname;
const shots = [];
const checks = [];
const errors = [];

async function main() {
  if (!existsSync('dist/index.html')) { console.error('dist/ missing — run `npm run build` first'); process.exit(2); }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(`${OUT}shots`, { recursive: true });
  mkdirSync(`${OUT}video`, { recursive: true });

  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], { stdio: 'ignore', detached: true });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(URL_)).ok; } catch { await sleep(350); } }
  if (!up) { console.error('preview server did not start'); process.exit(2); }

  const opts = { args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--disable-dev-shm-usage'] };
  const local = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome');
  if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
  else if (local.length) opts.executablePath = local[0];
  const browser = await chromium.launch(opts);

  const ctx = await browser.newContext({
    ...devices['Pixel 5 landscape'], hasTouch: true, isMobile: true,
    recordVideo: { dir: `${OUT}video`, size: { width: 851, height: 393 } },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  let n = 0;
  const shot = async (title, note) => {
    const file = `shots/${String(++n).padStart(2, '0')}.png`;
    await page.screenshot({ path: OUT + file });
    shots.push({ file, title, note });
  };
  const check = (name, pass, detail = '') => { checks.push({ name, pass: !!pass, detail }); return pass; };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const vp = { w: 851, h: 393 };

  const cdp = await ctx.newCDPSession(page);
  // Real, hit-tested touches (what a finger does), not events dispatched onto an element.
  const touchDrag = async (id, x, y, dx, dy, steps = 8) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps, id }] });
      await sleep(60);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
  };


  await page.goto(URL_, { waitUntil: 'load' });
  await sleep(1500);
  await shot('شاشة البداية', 'Splash — Arabic first, EVENTO studio credit');
  check('boots without page errors', errors.length === 0, errors[0] ?? '');

  await page.locator('#splash').tap(); await sleep(1200);
  await shot('الردهة', 'Lobby: Saeed on a turntable, level and XP, outfits, drop-zone map, version tag');
  check('lobby lists four outfits', await ev(() => document.querySelectorAll('#skin-list .skin').length) === 4);
  await page.locator('#lang-en').tap(); await sleep(500);
  await shot('Lobby — English', 'Language toggle flips the whole lobby to LTR');
  await page.locator('#lang-ar').tap(); await sleep(400);
  const mb = await page.locator('#drop-map').boundingBox();
  await page.locator('#drop-map').tap({ position: { x: mb.width * 0.39, y: mb.height * 0.86 } });
  await sleep(400);
  await shot('اختيار موقع الهبوط', 'Tap the map to mark where Saeed lands');
  // land on the classic spawn so the scripted scenes below stay comparable run to run
  await ev(() => globalThis.SAEED.setDrop({ ...globalThis.SAEED.game.map.spawns.player }));

  await shot('مسار الطائرة', 'Lobby map: twelve named locations, the flight path and the marked landing spot');

  await page.locator('#btn-play').tap(); await sleep(1500);
  check('match opens on the plane', await ev(() => globalThis.SAEED.game.player.inPlane));
  await shot('الطائرة', 'On the plane: JUMP button, flight path on the minimap, the island below');
  await page.waitForFunction(() => globalThis.SAEED.game.player.dropping, null, { timeout: 120000 }).catch(() => {});
  await sleep(1200);
  await shot('القفز الحر', 'Freefall from 166 m: altitude chip, OPEN CANOPY button, glide toward the marker');
  await page.waitForFunction(() => globalThis.SAEED.game.player.chute, null, { timeout: 120000 }).catch(() => {});
  await sleep(900);
  await shot('المظلة', 'Canopy open in EVENTO purple and gold');
  const landed = await page.waitForFunction(() => { const p = globalThis.SAEED.game.player; return !p.dropping && !p.inPlane; }, null, { timeout: 180000 }).then(() => true).catch(() => false);
  check('Saeed lands safely on the marked spot', landed && await ev(() => {
    const g = globalThis.SAEED.game; const s = g.map.spawns.player;
    return Math.hypot(g.player.pos.x - s.x, g.player.pos.z - s.z) < 6;
  }));
  // the scripted scenes below should not be decided by a passing bot
  await ev(() => { globalThis.SAEED.game.freezeBots = true; });
  await sleep(700);
  const face = await ev(() => { const g = globalThis.SAEED.game; return Math.abs(Math.cos(g.playerView.root.rotation.y - g.player.yaw) + 1); });
  check('character faces away from camera', face < 1e-3);
  await shot('الهبوط', 'Touchdown: "safe landing" toast, Saeed seen from behind, OCTA at the shoulder');

  // ---- look around (touch drag, right side) ----
  const lx = vp.w * 0.56, ly = vp.h * 0.3;            // open screen, clear of the buttons
  const y0 = await ev(() => globalThis.SAEED.game.player.yaw);
  await touchDrag(2, lx, ly, -170, 0);
  const y1 = await ev(() => globalThis.SAEED.game.player.yaw);
  check('drag left turns view left', y1 > y0, `Δyaw ${(y1 - y0).toFixed(2)}`);
  await shot('النظر لليسار', 'Look left');
  await touchDrag(3, lx, ly, 340, 0, 12);
  const y2 = await ev(() => globalThis.SAEED.game.player.yaw);
  check('drag right turns view right', y2 < y1, `Δyaw ${(y2 - y1).toFixed(2)}`);
  await shot('النظر لليمين', 'Look right');
  const p0 = await ev(() => globalThis.SAEED.game.player.pitch);
  await touchDrag(4, lx, ly + 90, 0, -110);
  const p1 = await ev(() => globalThis.SAEED.game.player.pitch);
  check('drag up looks up', p1 > p0, `Δpitch ${(p1 - p0).toFixed(2)}`);
  await shot('النظر للأعلى', 'Look up');
  await touchDrag(5, lx, ly - 60, 0, 200, 10);
  const p2 = await ev(() => globalThis.SAEED.game.player.pitch);
  check('drag down looks down', p2 < p1, `Δpitch ${(p2 - p1).toFixed(2)}`);
  await shot('النظر للأسفل', 'Look down');

  // ---- move with the floating stick ----
  await ev(() => { const p = globalThis.SAEED.game.player; p.yaw = 0; p.pitch = 0; });
  const m0 = await ev(() => ({ ...globalThis.SAEED.game.player.pos }));
  const jx = vp.w * 0.18, jy = vp.h * 0.72;
  await page.dispatchEvent('#joystick-zone', 'pointerdown', { pointerId: 1, clientX: jx, clientY: jy, isPrimary: true, pointerType: 'touch', bubbles: true });
  await ev(([x, y]) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: x, clientY: y, bubbles: true })), [jx, jy - 60]);
  await sleep(1800);
  await shot('الحركة', 'Floating joystick pushed forward — Saeed runs away from the camera');
  const m1 = await ev(() => ({ ...globalThis.SAEED.game.player.pos }));
  await ev(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })));
  check('joystick forward moves away from camera', m1.z < m0.z - 0.5, `Δz ${(m1.z - m0.z).toFixed(2)}`);

  // ---- aim + firefight in an open patch ----
  await ev(() => {
    const g = globalThis.SAEED.game;
    const bot = g.bots.find((b) => b.alive);
    const A = { x: 75, z: -60 };
    bot.pos.x = A.x; bot.pos.z = A.z;
    g.player.pos.x = A.x; g.player.pos.z = A.z + 14; g.player.yaw = 0; g.player.pitch = 0;
    globalThis.SAEED.input.state.aim = true;
  });
  await sleep(1200);
  await shot('التصويب', 'Aim-down-sights: closer camera, narrower FOV, opponent ahead');
  const hp0 = await ev(() => { const g = globalThis.SAEED.game; g.__duel = g.bots.find((b) => b.alive); return g.__duel.health.value; });
  await ev(async () => {
    const g = globalThis.SAEED.game;
    const bot = g.bots.find((b) => b.alive);
    g.player.inventory.switchTo(g.player.inventory.slots.findIndex((x) => x.id === 'OCTA_AR'));
    const w = g.player.inventory.weapon;
    for (let i = 0; i < 40; i++) {
      g.player.pos.x = bot.pos.x; g.player.pos.z = bot.pos.z + 12; g.player.pos.y = 0; g.player.pitch = 0; g.player.health.value = 100;
      g.player.yaw = Math.atan2(-(bot.pos.x - g.player.pos.x), -(bot.pos.z - g.player.pos.z));
      w.mag = w.def.magSize; w.reloadTimer = 0; w.cooldown = 0; g._fireHeld = false; g._tryFire();
      await new Promise((r) => setTimeout(r, 40));
      if (!bot.alive) break;
    }
  });
  await shot('إسقاط', 'Elimination banner, red kill hitmarker and the kill feed');
  const hp1 = await ev(() => globalThis.SAEED.game.__duel.health.value);
  check('shots damage an opponent', hp1 < hp0, `${hp0} → ${hp1}`);
  await ev(() => { globalThis.SAEED.input.state.aim = false; });

  // ---- v2.1: armour vest ----
  await ev(() => {
    const g = globalThis.SAEED.game;
    const it = g.loot.items.find((i) => i.type === 'armor' && !i.taken);
    g.player.pos.x = it.x + 0.6; g.player.pos.z = it.z + 0.6; g.player.health.value = 100;
    globalThis.SAEED.input.state.interact = true;
  });
  await page.waitForFunction(() => globalThis.SAEED.game.player.inventory.armor > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(500);
  await shot('الدرع الواقي', 'Armour vest picked up: blue armour bar above health');
  check('armour vest picked up', await ev(() => globalThis.SAEED.game.player.inventory.armor) > 0);

  // ---- v2.1: supply drop ----
  await ev(() => {
    const g = globalThis.SAEED.game;
    g.airdrop.reset();
    g.matchTime = Math.max(g.matchTime, g.airdrop.cfg.at);
  });
  await page.waitForFunction(() => globalThis.SAEED.game.airdrop.state === 'falling', null, { timeout: 15000 }).catch(() => {});
  await ev(() => {
    const g = globalThis.SAEED.game; const a = g.airdrop;
    a.pos.y = a.ground + 16;
    g.player.pos.x = a.pos.x + 7; g.player.pos.z = a.pos.z + 10; g.player.pos.y = 0;
    g.player.yaw = Math.atan2(-(a.pos.x - g.player.pos.x), -(a.pos.z - g.player.pos.z)); g.player.pitch = 0.32;
    g.player.health.value = 100;
  });
  await sleep(700);
  await shot('الإمداد الجوي', 'Supply drop inbound under its canopy; gold marker on the minimap');
  await ev(() => { const a = globalThis.SAEED.game.airdrop; a.pos.y = a.ground + 0.3; });
  await page.waitForFunction(() => globalThis.SAEED.game.airdrop.state === 'landed', null, { timeout: 15000 }).catch(() => {});
  await ev(() => { const g = globalThis.SAEED.game; g.player.pitch = 0.05; g.player.health.value = 100; });
  await sleep(700);
  await shot('غنائم الإمداد', 'Landed: rare loot with light beams, epic weapon in gold');
  check('supply drop landed with loot', await ev(() => globalThis.SAEED.game.loot.items.filter((i) => i.special).length) === 4);

  // ---- v2.1: outside the zone ----
  await ev(() => {
    const g = globalThis.SAEED.game; const z = g.zone;
    g.player.pos.x = z.center.x + z.radius + 30; g.player.pos.z = z.center.z + 10; g.player.pos.y = 0;
    g.player.yaw = 0.6; g.player.health.value = 100;
  });
  await sleep(800);
  await shot('خارج المنطقة', 'Outside the zone: arrow and distance back to safety');
  check('zone arrow shows outside the zone', await ev(() => !document.getElementById('zone-arrow').classList.contains('hidden')));
  await ev(() => { const g = globalThis.SAEED.game; g.player.pos.x = g.zone.center.x; g.player.pos.z = g.zone.center.z; g.player.health.value = 100; });

  // ---- loot ----
  await ev(() => {
    const g = globalThis.SAEED.game;
    const it = g.loot.items.find((i) => i.type === 'weapon') ?? g.loot.items[0];
    g.player.pos.x = it.x + 1.2; g.player.pos.z = it.z + 1.2;
  });
  await sleep(900);
  await shot('الغنائم', 'Loot pickup prompt near a weapon crate');

  // ---- Uncle Mansour ----
  await ev(() => {
    const g = globalThis.SAEED.game; const m = g.map.spawns.npcMansour;
    g.player.pos.x = m.x + 2; g.player.pos.z = m.z + 2; g.player.yaw = 2.2;
  });
  await sleep(1100);
  await shot('عم منصور', 'Uncle Mansour — "وين القهوة؟"');

  // ---- v2.2: scope, hiding, the new locations ----
  await ev(() => {
    const g = globalThis.SAEED.game; const p = g.map.pois.find((x) => x.id === 'hills');
    g.player.pos.x = p.x; g.player.pos.z = p.z; g.player.pos.y = 8.8;
    g.player.inventory.addWeapon('SAEED_50'); g._equipWeaponModel();
    g.player.yaw = 2.4; g.player.pitch = -0.05; g.player.health.value = 100;
    globalThis.SAEED.input.state.aim = true;
  });
  await sleep(1200);
  await shot('المنظار', 'SAEED-50 scope from the top of Rocky Hills: first-person zoom, reticle');
  check('scope view replaces the crosshair', await ev(() => !document.getElementById('scope').classList.contains('hidden')));
  await ev(() => { globalThis.SAEED.input.state.aim = false; });
  await ev(() => {
    const g = globalThis.SAEED.game; const b = g.map.bushes[3];
    g.player.pos.x = b.x; g.player.pos.z = b.z; g.player.pos.y = 0;
    globalThis.SAEED.input.state.crouch = true; g.player.yaw = 0.8; g.player.health.value = 100;
  });
  await sleep(900);
  await shot('الاختباء', 'Crouched in a bush: HIDDEN, bots only spot you from 7 m');
  check('crouching in a bush hides Saeed', await ev(() => globalThis.SAEED.game.player.concealed));
  await ev(() => { globalThis.SAEED.input.state.crouch = false; });
  for (const [id, title, yaw, dx, dz] of [
    ['town', 'البلدة القديمة', 0, 6, 46], ['fort', 'الحصن', 0, 44, 10], ['port', 'الميناء', 0, -46, 20],
    ['souq', 'السوق', 0, -44, 4], ['base', 'القاعدة العسكرية', 0, 14, -36],
  ]) {
    await ev(([id, , dx, dz]) => {
      const g = globalThis.SAEED.game; const p = g.map.pois.find((x) => x.id === id);
      g.player.pos.x = p.x + dx; g.player.pos.z = p.z + dz; g.player.pos.y = 0;
      // face the location so the shot frames it
      g.player.yaw = Math.atan2(-(p.x - g.player.pos.x), -(p.z - g.player.pos.z));
      g.player.pitch = 0.06; g.player.health.value = 100;
    }, [id, yaw, dx, dz]);
    await sleep(1000);
    await shot(title, `Location tour: ${id}`);
  }

  // ---- zone ----
  await ev(() => { const g = globalThis.SAEED.game; for (let i = 0; i < 1500 && !(g.zone.state === 'shrinking' && g.zone.phase >= 1); i++) g.zone.update(0.1); g.player.pos.x = g.zone.center.x + 60; g.player.pos.z = g.zone.center.z; g.player.health.value = 100; });
  await sleep(900);
  await shot('المنطقة تضيق', 'Safe zone closing: warning, minimap ring, zone wall');

  // ---- victory ----
  await ev(() => {
    const g = globalThis.SAEED.game; g.player.health.value = 100;
    g.bots.filter((b) => b.alive).forEach((b) => g._damageBot(b, 999));
  });
  await sleep(3200);
  await shot('النصر والنتائج', 'Victory results: placement, stats, itemised XP, level bar, unlocks');
  check('victory screen shows', await page.isVisible('#victory'));
  check('a win awards XP', await ev(() => globalThis.SAEED.profile.data.xp) > 0);

  // ---- second round: death, kill-cam, defeat results ----
  await page.locator('#btn-play-again').tap(); await sleep(800);
  await page.waitForFunction(() => !globalThis.SAEED.game.player.dropping, null, { timeout: 90000 }).catch(() => {});
  await ev(() => {
    const g = globalThis.SAEED.game;
    const b = g.bots.find((x) => x.alive);
    b.pos.x = g.player.pos.x + 9; b.pos.z = g.player.pos.z - 6;
    g.killer = b; g.player.takeDamage(999);
  });
  await sleep(500);
  await shot('لقطة الإسقاط', 'Kill-cam: the camera turns to face whoever eliminated Saeed');
  await page.waitForSelector('#defeat:not(.hidden)', { timeout: 20000 }).catch(() => {});
  await sleep(600);
  await shot('نتائج الخسارة', 'Defeat results: placement, who eliminated Saeed, XP still earned');
  check('defeat screen names the killer', (await page.textContent('#lose-by')).length > 4);

  check('no page errors during the run', errors.length === 0, errors[0] ?? '');

  await ctx.close(); await browser.close();
  try { process.kill(-server.pid); } catch { /* already gone */ }

  const vids = readdirSync(`${OUT}video`).filter((f) => f.endsWith('.webm'));
  if (vids[0]) renameSync(`${OUT}video/${vids[0]}`, `${OUT}video/session.webm`);

  const manifest = {
    generatedAt: new Date().toISOString(),
    commit: (await import('node:child_process')).execSync('git rev-parse --short HEAD').toString().trim(),
    version: JSON.parse(readFileSync('package.json', 'utf8')).version,
    device: 'Pixel 5 landscape (851×393), software-rendered WebGL',
    video: vids[0] ? 'video/session.webm' : null,
    shots, checks,
  };
  writeFileSync(`${OUT}manifest.json`, JSON.stringify(manifest, null, 2));
  const failed = checks.filter((c) => !c.pass);
  console.log(`${checks.length - failed.length}/${checks.length} checks passed, ${shots.length} screenshots, video: ${manifest.video ?? 'none'}`);
  failed.forEach((c) => console.log(`FAIL ${c.name} ${c.detail}`));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
