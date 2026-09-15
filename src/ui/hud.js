import { WEAPONS } from '../weapons/weapons.js';

const $ = (id) => document.getElementById(id);

/** All DOM reads/writes for the in-game HUD live here. */
export class HUD {
  constructor(i18n) {
    this.i18n = i18n;
    this.el = {
      hud: $('hud'),
      health: $('health-fill'), healthValue: $('health-value'),
      weaponName: $('weapon-name'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
      ammoLine: $('ammo-line'), medkits: $('medkit-count'),
      enemies: $('enemy-count'),
      zoneChip: $('zone-chip'), zoneLabel: $('zone-label'), zoneTimer: $('zone-timer'),
      zoneWarning: $('zone-warning'),
      pickup: $('pickup-prompt'), pickupText: $('pickup-text'),
      toasts: $('toast-stack'), vignette: $('damage-vignette'),
      crosshair: $('crosshair'), minimap: $('minimap'),
      mansour: $('mansour-bubble'), mansourName: $('mansour-name'), mansourLine: $('mansour-line'),
      fps: $('fps-counter'),
    };
    this.ctx = this.el.minimap?.getContext('2d') ?? null;
    this.hitFlash = 0;
    this._lastHealth = 100;
  }
  show(on) {
    this.el.hud.classList.toggle('hidden', !on);
    this.el.hud.setAttribute('aria-hidden', String(!on));
  }
  setTouch(on) { this.el.hud.classList.toggle('touch-active', on); }

  toast(text, kind = '') {
    if (!this.el.toasts) return;
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 2600);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }
  flashDamage() {
    this.el.vignette.classList.add('hit');
    clearTimeout(this._vig);
    this._vig = setTimeout(() => this.el.vignette.classList.remove('hit'), 90);
  }
  markHit() {
    this.el.crosshair.classList.add('hit');
    clearTimeout(this._cross);
    this._cross = setTimeout(() => this.el.crosshair.classList.remove('hit'), 120);
  }
  showMansour(on) {
    this.el.mansour.classList.toggle('hidden', !on);
    if (on) {
      this.el.mansourName.textContent = this.i18n.t('mansour');
      this.el.mansourLine.textContent = this.i18n.t('mansourLine');
    }
  }

  update(game) {
    const t = (k) => this.i18n.t(k);
    const p = game.player;

    // health
    const hp = Math.ceil(p.health.value);
    this.el.health.style.width = `${p.health.ratio * 100}%`;
    this.el.health.classList.toggle('low', p.health.ratio < 0.35);
    this.el.healthValue.textContent = String(hp);
    this._lastHealth = hp;

    // weapon / ammo
    const w = p.inventory.weapon;
    if (!w) {
      this.el.weaponName.textContent = t('noWeapon');
      this.el.ammoMag.textContent = '—'; this.el.ammoReserve.textContent = '—';
      this.el.ammoLine.className = 'empty';
    } else {
      const def = WEAPONS[w.id];
      this.el.weaponName.textContent = this.i18n.lang === 'ar' ? def.nameAr : def.nameEn;
      if (w.reloading) {
        this.el.ammoMag.textContent = '…'; this.el.ammoLine.className = 'reloading';
      } else {
        this.el.ammoMag.textContent = w.isMelee ? '∞' : String(w.mag);
        this.el.ammoLine.className = (!w.isMelee && w.mag === 0) ? 'empty' : '';
      }
      this.el.ammoReserve.textContent = w.isMelee ? '∞' : String(w.reserve);
    }
    this.el.medkits.textContent = String(p.inventory.medkits);

    // enemies
    this.el.enemies.textContent = String(game.aliveBots);

    // zone
    const z = game.zone;
    const shrinking = z.state === 'shrinking';
    const outside = z.isOutside(p.pos.x, p.pos.z);
    this.el.zoneChip.classList.toggle('warn', shrinking || outside);
    this.el.zoneLabel.textContent = outside ? t('zoneOutside') : shrinking ? t('zoneClosing') : t('zoneSafe');
    const left = Math.ceil(z.timeLeft);
    this.el.zoneTimer.textContent = z.isFinal ? '—' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    this.el.zoneWarning.textContent = outside ? t('zoneOutside') : t('zoneClosing');
    this.el.zoneWarning.classList.toggle('hidden', !(shrinking || outside));

    // pickup prompt
    const item = game.nearbyLoot;
    if (item) {
      this.el.pickup.classList.remove('hidden');
      this.el.pickupText.textContent = `${t('pickup')} · ${game.lootLabel(item)}`;
    } else {
      this.el.pickup.classList.add('hidden');
    }

    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.ctx;
    if (!ctx) return;
    const size = this.el.minimap.width;
    const c = size / 2;
    const scale = size / 250;               // world 250m across the dial
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(game.player.yaw);            // rotate world so player faces up

    const wx = (x) => (x - game.player.pos.x) * scale;
    const wz = (z) => (z - game.player.pos.z) * scale;

    // zone ring
    const z = game.zone;
    ctx.beginPath();
    ctx.arc(wx(z.center.x), wz(z.center.z), z.radius * scale, 0, Math.PI * 2);
    ctx.strokeStyle = z.state === 'shrinking' ? '#ff4d6d' : '#7a5cff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // loot
    ctx.fillStyle = '#d4a72c';
    for (const it of game.loot.items) {
      if (it.taken) continue;
      const dx = wx(it.x), dz = wz(it.z);
      if (Math.hypot(dx, dz) > c) continue;
      ctx.fillRect(dx - 1.2, dz - 1.2, 2.4, 2.4);
    }
    // bots (only those the player can currently see — no wallhack)
    ctx.fillStyle = '#ff4d6d';
    for (const b of game.bots) {
      if (!b.alive || !b.visibleToPlayer) continue;
      const dx = wx(b.pos.x), dz = wz(b.pos.z);
      if (Math.hypot(dx, dz) > c) continue;
      ctx.beginPath(); ctx.arc(dx, dz, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // player arrow, always centred pointing up
    ctx.fillStyle = '#efeaff';
    ctx.beginPath();
    ctx.moveTo(c, c - 6); ctx.lineTo(c - 4.5, c + 5); ctx.lineTo(c + 4.5, c + 5);
    ctx.closePath(); ctx.fill();
  }

  setFps(v, visible) {
    if (!this.el.fps) return;
    this.el.fps.classList.toggle('hidden', !visible);
    this.el.fps.textContent = `${v} FPS`;
  }
}

/** Simple screen router for splash/menu/settings/pause/victory/defeat. */
export class Screens {
  constructor() {
    this.ids = ['splash', 'menu', 'settings', 'pause', 'victory', 'defeat'];
    this.map = Object.fromEntries(this.ids.map((id) => [id, $(id)]));
  }
  show(id) {
    this.ids.forEach((k) => this.map[k]?.classList.toggle('hidden', k !== id));
    this.current = id;
  }
  hideAll() { this.ids.forEach((k) => this.map[k]?.classList.add('hidden')); this.current = null; }
}
