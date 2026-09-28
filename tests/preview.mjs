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

  const touchDrag = async (id, x, y, dx, dy, steps = 8) => {
    await page.dispatchEvent('#hud', 'pointerdown', { pointerId: id, clientX: x, clientY: y, isPrimary: true, pointerType: 'touch', bubbles: true });
    for (let i = 1; i <= steps; i++) {
      await ev(([px, py, pid]) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: pid, clientX: px, clientY: py, bubbles: true })),
        [x + (dx * i) / steps, y + (dy * i) / steps, id]);
      await sleep(60);
    }
    await ev((pid) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: pid, bubbles: true })), id);
    await sleep(250);
  };

  await page.goto(URL_, { waitUntil: 'load' });
  await sleep(1500);
  await shot('شاشة البداية', 'Splash — Arabic first, EVENTO studio credit');
  check('boots without page errors', errors.length === 0, errors[0] ?? '');

  await page.locator('#splash').tap(); await sleep(600);
  await shot('القائمة الرئيسية', 'Main menu (RTL)');
  await page.locator('#lang-en').tap(); await sleep(300);
  await shot('Main menu — English', 'Language toggle flips to LTR');
  await page.locator('#lang-ar').tap(); await sleep(300);

  await page.locator('#btn-play').tap(); await sleep(1800);
  const face = await ev(() => { const g = globalThis.SAEED.game; return Math.abs(Math.cos(g.playerView.root.rotation.y - g.player.yaw) + 1); });
  check('character faces away from camera', face < 1e-3);
  await shot('بداية الجولة', 'Spawn: Saeed seen from behind, OCTA at the shoulder, HUD live');

  // ---- look around (touch drag, right side) ----
  const lx = vp.w * 0.7, ly = vp.h * 0.4;
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
  await shot('إطلاق النار', 'Muzzle flash, tracers and impacts');
  const hp1 = await ev(() => globalThis.SAEED.game.__duel.health.value);
  check('shots damage an opponent', hp1 < hp0, `${hp0} → ${hp1}`);
  await ev(() => { globalThis.SAEED.input.state.aim = false; });

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
  await shot('النصر', 'Victory screen');
  check('victory screen shows', await page.isVisible('#victory'));

  check('no page errors during the run', errors.length === 0, errors[0] ?? '');

  await ctx.close(); await browser.close();
  try { process.kill(-server.pid); } catch { /* already gone */ }

  const vids = readdirSync(`${OUT}video`).filter((f) => f.endsWith('.webm'));
  if (vids[0]) renameSync(`${OUT}video/${vids[0]}`, `${OUT}video/session.webm`);

  const manifest = {
    generatedAt: new Date().toISOString(),
    commit: (await import('node:child_process')).execSync('git rev-parse --short HEAD').toString().trim(),
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
