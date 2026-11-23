/**
 * HUD layout editor, the way PUBG Mobile and CoD Mobile do it: the real HUD
 * with every control showing, drag any one to move it, pick one and set its
 * size. Saved per action in settings.layout as { dx, dy, s }.
 */
const EDITABLE = '#hud .tbtn[data-action], #pickup-prompt';

/** Push saved offsets and sizes onto the live controls. */
export function applyLayout(layout = {}) {
  for (const el of document.querySelectorAll(EDITABLE)) {
    const e = layout[el.dataset.action] ?? { dx: 0, dy: 0, s: 1 };
    el.style.setProperty('--dx', `${e.dx}px`);
    el.style.setProperty('--dy', `${e.dy}px`);
    el.style.setProperty('--us', String(e.s ?? 1));
  }
}

export class LayoutEditor {
  constructor(settings, i18n, { onClose = () => {} } = {}) {
    this.settings = settings;
    this.i18n = i18n;
    this.onClose = onClose;
    this.root = document.getElementById('layout-editor');
    this.hud = document.getElementById('hud');
    this.size = document.getElementById('le-size');
    this.selLabel = document.getElementById('le-sel');
    this.sel = null;
    this.drag = null;
    this.isOpen = false;
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this.size.addEventListener('input', () => {
      if (!this.sel) return;
      const s = parseFloat(this.size.value);
      this.settings.setLayout(this.sel.dataset.action, { s });
      applyLayout(this.settings.get('layout'));
    });
    document.getElementById('le-reset').addEventListener('click', () => {
      this.settings.resetLayout();
      applyLayout({});
      this._select(null);
    });
    document.getElementById('le-done').addEventListener('click', () => this.close());
  }
  open() {
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.hud.classList.add('editing', 'touch-active');
    document.getElementById('pickup-prompt').classList.remove('hidden');
    document.getElementById('pickup-text').textContent = this.i18n.t('pickup');
    document.addEventListener('pointerdown', this._down, { capture: true, passive: false });
    window.addEventListener('pointermove', this._move, { passive: false });
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);
    this._select(null);
    applyLayout(this.settings.get('layout'));
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.hud.classList.remove('editing');
    document.getElementById('pickup-prompt').classList.add('hidden');
    document.removeEventListener('pointerdown', this._down, { capture: true });
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._up);
    this._select(null);
    this.onClose();
  }
  _select(el) {
    this.sel?.classList.remove('le-on');
    this.sel = el;
    el?.classList.add('le-on');
    this.size.disabled = !el;
    const e = el ? this.settings.get('layout')[el.dataset.action] : null;
    this.size.value = String(e?.s ?? 1);
    this.selLabel.textContent = el ? this.i18n.t(`act_${el.dataset.action}`) : this.i18n.t('leHint');
  }
  _down(ev) {
    const el = ev.target?.closest?.(EDITABLE);
    if (!el) return;
    ev.preventDefault();
    ev.stopPropagation();
    this._select(el);
    const e = this.settings.get('layout')[el.dataset.action] ?? { dx: 0, dy: 0 };
    this.drag = { id: ev.pointerId, el, x0: ev.clientX, y0: ev.clientY, dx0: e.dx, dy0: e.dy, dx: e.dx, dy: e.dy };
  }
  _move(ev) {
    const d = this.drag;
    if (!d || ev.pointerId !== d.id) return;
    ev.preventDefault();
    // keep the control on screen
    // keep the control on screen: its untransformed centre is the rect centre minus the applied offset
    const r = d.el.getBoundingClientRect();
    const bx = r.left + r.width / 2 - d.dx, by = r.top + r.height / 2 - d.dy;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    d.dx = Math.round(clamp(d.dx0 + ev.clientX - d.x0, r.width / 2 - bx, window.innerWidth - r.width / 2 - bx));
    d.dy = Math.round(clamp(d.dy0 + ev.clientY - d.y0, r.height / 2 - by, window.innerHeight - r.height / 2 - by));
    d.el.style.setProperty('--dx', `${d.dx}px`);
    d.el.style.setProperty('--dy', `${d.dy}px`);
  }
  _up(ev) {
    const d = this.drag;
    if (!d || ev.pointerId !== d.id) return;
    this.drag = null;
    this.settings.setLayout(d.el.dataset.action, { dx: d.dx, dy: d.dy });
  }
}
