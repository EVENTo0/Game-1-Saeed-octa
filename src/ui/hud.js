import { WEAPONS } from '../weapons/weapons.js';
import { CONFIG } from '../core/config.js';

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
      damageDirs: $('damage-dirs'),
      damageNums: $('damage-numbers'), hitmarker: $('hitmarker'),
      killFeed: $('kill-feed'), banner: $('elim-banner'),
      bannerTitle: $('elim-title'), bannerSub: $('elim-sub'),
      scope: $('scope'), compass: $('compass'), kills: $('kill-count'),
      weaponPanel: $('weapon-panel'), slot2: $('weapon-slot2'), slot2Name: $('slot2-name'),
      eject: $('btn-eject'), ejectLabel: $('eject-label'), conceal: $('conceal-chip'),
      armorBar: $('armor-bar'), armorFill: $('armor-fill'),
      zoneArrow: $('zone-arrow'), zoneArrowIcon: $('zone-arrow-icon'), zoneDist: $('zone-dist'),
      hint: $('coach-hint'), dropChip: $('drop-chip'), dropAlt: $('drop-alt'),
      fps: $('fps-counter'),
    };
    this.ctx = this.el.minimap?.getContext('2d') ?? null;
    this.cctx = this.el.compass?.getContext('2d') ?? null;
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
  /**
   * Show where a hit came from. Without this the player just loses health with
   * no idea which direction to turn — the single most disorienting thing about
   * taking fire in third person.
   * @param {number} angle radians, 0 = directly ahead, positive = to the right
   */
  showDamageFrom(angle) {
    if (!this.el.damageDirs || !Number.isFinite(angle)) return;
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.transform = `rotate(${angle}rad)`;
    this.el.damageDirs.appendChild(el);
    setTimeout(() => el.remove(), 900);
    while (this.el.damageDirs.children.length > 4) this.el.damageDirs.firstChild.remove();
  }

  /** Crosshair flash plus an X hitmarker; a kill gets the bigger red one. */
  markHit(kill = false) {
    this.el.crosshair.classList.add('hit');
    clearTimeout(this._cross);
    this._cross = setTimeout(() => this.el.crosshair.classList.remove('hit'), 120);
    const hm = this.el.hitmarker;
    if (!hm) return;
    hm.classList.remove('show', 'kill');
    void hm.offsetWidth;                       // restart the animation
    hm.classList.add('show');
    if (kill) hm.classList.add('kill');
  }

  /** Floating damage number at a screen position (CSS px). */
  damageNumber(x, y, amount, kill = false) {
    const box = this.el.damageNums;
    if (!box || !(amount > 0)) return;
    const d = document.createElement('div');
    d.className = `dmg-num${kill ? ' kill' : amount >= 40 ? ' big' : ''}`;
    d.textContent = String(Math.round(amount));
    d.style.left = `${x + (Math.random() - 0.5) * 24}px`;
    d.style.top = `${y}px`;
    box.appendChild(d);
    setTimeout(() => d.remove(), 800);
    while (box.children.length > 10) box.firstChild.remove();
  }

  /** One line in the kill feed: killer → victim [weapon]. */
  killFeed(killer, victim, weapon = '', mine = false) {
    const feed = this.el.killFeed;
    if (!feed) return;
    const row = document.createElement('div');
    row.className = `kf-row${mine ? ' mine' : ''}`;
    const a = document.createElement('b'); a.textContent = killer;
    const arrow = document.createElement('span'); arrow.className = 'kf-x'; arrow.textContent = '✕';
    const v = document.createElement('b'); v.textContent = victim;
    row.append(a, arrow, v);
    if (weapon) { const w = document.createElement('small'); w.textContent = weapon; row.append(w); }
    feed.prepend(row);
    setTimeout(() => row.remove(), 5000);
    while (feed.children.length > 4) feed.lastChild.remove();
  }

  /** Centre banner for eliminations and the death call-out. */
  banner(title, sub = '', kind = '') {
    const b = this.el.banner;
    if (!b) return;
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    b.className = `show ${kind}`;
    clearTimeout(this._ban);
    this._ban = setTimeout(() => { b.className = 'hidden'; }, 1900);
  }

  /** Coaching line for a first match; empty text hides it. */
  hint(text) {
    if (!this.el.hint) return;
    this.el.hint.textContent = text || '';
    this.el.hint.classList.toggle('hidden', !text);
  }

  /** Cinematic title card: round number and the location you landed in. */
  titleCard(round, name) {
    const el = document.getElementById('title-card');
    if (!el) return;
    document.getElementById('tc-round').textContent = round;
    document.getElementById('tc-name').textContent = name;
    el.className = 'show';
    clearTimeout(this._tc);
    this._tc = setTimeout(() => { el.className = 'hidden'; }, 3200);
  }

  clearFeedback() {
    this.el.killFeed?.replaceChildren();
    this.el.damageNums?.replaceChildren();
    if (this.el.banner) this.el.banner.className = 'hidden';
    this.hint('');
  }
  showMansour(on, quest = 'find') {
    this.el.mansour.classList.toggle('hidden', !on);
    if (on) {
      this.el.mansourName.textContent = this.i18n.t('mansour');
      this.el.mansourLine.textContent = this.i18n.t(quest === 'done' ? 'mansourThanks' : quest === 'carry' ? 'mansourCarry' : 'mansourLine');
    }
  }
  mansourLine(text) {
    this.el.mansourLine.textContent = text;
    this.el.mansour.classList.remove('hidden');
  }

  update(game) {
    const t = (k) => this.i18n.t(k);
    const p = game.player;

    // health
    const hp = Math.ceil(p.health.value);
    this.el.health.style.width = `${p.health.ratio * 100}%`;
    this.el.health.classList.toggle('low', p.health.ratio < 0.35);
    this.el.healthValue.textContent = String(hp);
    const armor = p.inventory.armor ?? 0;
    if (this.el.armorBar) {
      this.el.armorBar.classList.toggle('empty', armor <= 0);
      this.el.armorFill.style.width = `${(armor / CONFIG.armor.max) * 100}%`;
    }
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
    const gc = document.getElementById('grenade-count');
    if (gc) {
      gc.textContent = String(p.inventory.grenades);
      document.getElementById('btn-grenade').classList.toggle('empty', p.inventory.grenades <= 0 || !!p.vehicle);
      document.getElementById('btn-grenade').classList.toggle('toggled', !!game._aimingGrenade);
    }
    // driving: speedometer, and the weapon buttons step back
    const sp = document.getElementById('speedo');
    if (sp) {
      sp.classList.toggle('hidden', !p.vehicle);
      if (p.vehicle) {
        document.getElementById('speedo-v').textContent = String(Math.round(Math.abs(p.vehicle.speed) * 3.6));
        document.getElementById('speedo-hp').style.width = `${(p.vehicle.hp / p.vehicle.cfg.hp) * 100}%`;
      }
    }
    document.getElementById('hud')?.classList.toggle('driving', !!p.vehicle);
    // side quest objective
    const qc = document.getElementById('quest-chip');
    const qt = game.questTarget?.();
    if (qc) {
      qc.classList.toggle('hidden', !qt || p.inPlane || p.dropping);
      if (qt) {
        document.getElementById('quest-text').textContent = t(qt.kind === 'dallah' ? 'questFind' : 'questReturn');
        document.getElementById('quest-dist').textContent = `${Math.round(Math.hypot(qt.x - p.pos.x, qt.z - p.pos.z))}m`;
      }
    }
    if (this.el.kills) this.el.kills.textContent = String(p.kills);
    // rarity colour on the weapon card, and the holstered weapon underneath
    const RAR = { common: '#b8c2d6', rare: '#8a6bff', epic: '#f2c14e' };
    if (this.el.weaponPanel) this.el.weaponPanel.style.borderInlineStartColor = w ? (RAR[w.def.rarity] ?? RAR.common) : 'transparent';
    const other = p.inventory.slots.find((s) => s !== w);
    if (this.el.slot2) {
      this.el.slot2.classList.toggle('hidden', !other);
      if (other) this.el.slot2Name.textContent = `⇄ ${this.i18n.lang === 'ar' ? other.def.nameAr : other.def.nameEn}`;
    }

    // Crosshair opens with the shot cone the weapon ACTUALLY has right now, so
    // the player can see that moving and hip firing cost them accuracy.
    if (this.el.crosshair) {
      let gap = 5;
      if (w && !w.isMelee) {
        const moving = Math.min(1, p.speed / CONFIG.player.runSpeed);
        gap = 4 + w.spreadFor(p.aiming) * 230 + moving * 9;
      }
      this.el.crosshair.style.setProperty('--ch-gap', `${gap.toFixed(1)}px`);
    }

    // enemies
    this.el.enemies.textContent = String(game.aliveBots);

    // plane and skydive
    if (this.el.dropChip) {
      this.el.dropChip.classList.toggle('hidden', !(p.dropping || p.inPlane));
      if (p.inPlane) this.el.dropAlt.textContent = t('inPlane');
      else if (p.dropping) {
        this.el.dropAlt.textContent = `${Math.max(0, Math.round(p.pos.y))}m · ${p.chute ? t('chuteOpen') : t('freefall')}`;
      }
    }
    if (this.el.eject) {
      const canChute = p.dropping && !p.chute && p.pos.y > 12;
      this.el.eject.classList.toggle('hidden', !(p.inPlane || canChute));
      this.el.ejectLabel.textContent = p.inPlane ? t('jumpNow') : t('openChute');
    }
    this.el.conceal?.classList.toggle('hidden', !p.concealed);
    const scoped = !!p.scopeFov;
    this.el.scope?.classList.toggle('hidden', !scoped);
    this.el.crosshair?.classList.toggle('hidden', scoped);

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

    // outside the zone: an arrow toward safety and how far it is
    if (this.el.zoneArrow) {
      this.el.zoneArrow.classList.toggle('hidden', !outside || !p.alive);
      if (outside) {
        const ang = game._screenAngleTo(z.center);
        this.el.zoneArrowIcon.style.transform = `rotate(${ang}rad)`;
        const d = Math.max(0, Math.hypot(p.pos.x - z.center.x, p.pos.z - z.center.z) - z.radius);
        this.el.zoneDist.textContent = `${Math.ceil(d)}m`;
      }
    }

    // pickup / ride / exit prompt
    const item = p.scopeFov ? null : game.nearbyLoot;   // nothing over the scope
    if (item) {
      this.el.pickup.classList.remove('hidden');
      this.el.pickupText.textContent = `${t('pickup')} · ${game.lootLabel(item)}`;
    } else if (game.nearbyBuggy) {
      this.el.pickup.classList.remove('hidden');
      this.el.pickupText.textContent = t('drive');
    } else if (p.vehicle) {
      this.el.pickup.classList.remove('hidden');
      this.el.pickupText.textContent = t('exitVehicle');
    } else {
      this.el.pickup.classList.add('hidden');
    }

    this.drawMinimap(game);
    this.drawCompass(game);
  }

  /**
   * Compass strip: heading under the centre line, cardinal letters, ticks every
   * 15 degrees, and markers for the safe zone, supply drop and landing mark.
   */
  drawCompass(game) {
    const ctx = this.cctx;
    if (!ctx) return;
    const W = this.el.compass.width, H = this.el.compass.height;
    const p = game.player;
    const heading = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;   // 0 = north (-Z), clockwise
    const span = 150;                                                  // degrees visible
    const pxPerDeg = W / span;
    const x = (deg) => {
      let d = deg - heading;
      d = ((d + 540) % 360) - 180;
      return W / 2 + d * pxPerDeg;
    };
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,7,19,.55)';
    ctx.fillRect(0, 0, W, H);
    const ar = this.i18n.lang === 'ar';
    const names = ar ? { 0: 'ش', 90: 'ق', 180: 'ج', 270: 'غ' } : { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    ctx.textAlign = 'center';
    for (let d = 0; d < 360; d += 15) {
      const px = x(d);
      if (px < -10 || px > W + 10) continue;
      const major = d % 90 === 0, mid = d % 45 === 0;
      ctx.strokeStyle = major ? '#f0d488' : 'rgba(239,234,255,.55)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(px, H - 2); ctx.lineTo(px, H - (major ? 12 : mid ? 9 : 6)); ctx.stroke();
      if (major && Math.abs(px - W / 2) > 14) { ctx.fillStyle = '#f0d488'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText(names[d], px, 14); }
      else if (mid && Math.abs(px - W / 2) > 22) { ctx.fillStyle = 'rgba(239,234,255,.8)'; ctx.font = '600 10px system-ui, sans-serif'; ctx.fillText(String(d), px, 12); }
    }
    const bearingTo = (t) => ((Math.atan2(t.x - p.pos.x, -(t.z - p.pos.z)) * 180 / Math.PI) + 360) % 360;
    const marker = (t, color) => {
      const px = x(bearingTo(t));
      if (px < 4 || px > W - 4) return;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(px, H - 13); ctx.lineTo(px - 5, H - 21); ctx.lineTo(px + 5, H - 21); ctx.fill();
    };
    marker(game.zone.targetCenter ?? game.zone.center, '#9b7bff');
    if (game.airdrop?.active) marker(game.airdrop.pos, '#f2c14e');
    if (game.dropTarget && (p.inPlane || p.dropping)) marker(game.dropTarget, '#3fd68a');
    const qt = game.questTarget?.();
    if (qt && !p.inPlane && !p.dropping) marker(qt, '#ff9f43');
    // heading readout
    ctx.fillStyle = '#fff';
    ctx.fillRect(W / 2 - 1, H - 14, 2, 14);
    ctx.font = '800 11px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(String(Math.round(heading) % 360), W / 2, 13);
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
    // flight path while on the plane or falling
    if (game.route && (game.player.inPlane || game.player.dropping)) {
      ctx.strokeStyle = 'rgba(232,189,71,.85)'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(wx(game.route.from.x), wz(game.route.from.z));
      ctx.lineTo(wx(game.route.to.x), wz(game.route.to.z)); ctx.stroke(); ctx.setLineDash([]);
    }
    if (game.dropTarget && (game.player.inPlane || game.player.dropping)) {
      ctx.fillStyle = '#e8bd47';
      ctx.beginPath(); ctx.arc(wx(game.dropTarget.x), wz(game.dropTarget.z), 3.5, 0, Math.PI * 2); ctx.fill();
    }

    // supply drop: public information, always marked
    const ad = game.airdrop;
    if (ad?.active) {
      const dx = wx(ad.pos.x), dz = wz(ad.pos.z);
      const r = Math.hypot(dx, dz);
      const k = r > c - 6 ? (c - 6) / r : 1;        // pin to the rim when off the dial
      ctx.save();
      ctx.translate(dx * k, dz * k);
      ctx.rotate(-game.player.yaw);
      ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#150f28'; ctx.lineWidth = 1.5;
      ctx.fillRect(-4.5, -4.5, 9, 9); ctx.strokeRect(-4.5, -4.5, 9, 9);
      ctx.restore();
    }

    // Mansour's quest: the dallah, then Mansour himself (orange diamond)
    const qt = game.questTarget?.();
    if (qt && !game.player.inPlane) {
      const dx = wx(qt.x), dz = wz(qt.z);
      const r = Math.hypot(dx, dz);
      const k = r > c - 6 ? (c - 6) / r : 1;
      ctx.save();
      ctx.translate(dx * k, dz * k);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ff9f43'; ctx.strokeStyle = '#150f28'; ctx.lineWidth = 1.5;
      ctx.fillRect(-4, -4, 8, 8); ctx.strokeRect(-4, -4, 8, 8);
      ctx.restore();
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
    this.ids = ['splash', 'menu', 'story', 'settings', 'pause', 'victory', 'defeat'];
    this.map = Object.fromEntries(this.ids.map((id) => [id, $(id)]));
  }
  show(id) {
    this.ids.forEach((k) => this.map[k]?.classList.toggle('hidden', k !== id));
    this.current = id;
  }
  hideAll() { this.ids.forEach((k) => this.map[k]?.classList.add('hidden')); this.current = null; }
}
