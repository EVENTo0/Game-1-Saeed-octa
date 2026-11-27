import { SCHEMA } from './settings.js';

/**
 * The settings screen, built from a declarative list so every option is laid
 * out the same way: tabs (graphics / controls / HUD / sound), segmented
 * choices, sliders with a live value, and switches. Each input gets the id
 * `set-<key>` so tests and the rest of the UI can find it.
 */
export const TABS = [
  { id: 'graphics', items: [
    { k: 'quality', type: 'seg' },
    { k: 'fpsCap', type: 'seg' },
    { k: 'camera', type: 'seg' },
    { k: 'brightness', type: 'range', pct: true },
    { k: 'showFps', type: 'toggle' },
  ] },
  { id: 'controls', items: [
    { k: 'sensitivity', type: 'range', pct: true },
    { k: 'adsSensitivity', type: 'range', pct: true },
    { k: 'scopeSensitivity', type: 'range', pct: true },
    { k: 'assist', type: 'toggle' },
    { k: 'autoPickup', type: 'toggle' },
    { k: 'leftFire', type: 'toggle' },
    { k: 'haptics', type: 'toggle' },
  ] },
  { id: 'hud', items: [
    { type: 'action', id: 'btn-layout', label: 'customizeLayout', primary: true },
    { k: 'buttonSize', type: 'range', pct: true },
    { k: 'buttonOpacity', type: 'range', pct: true },
    { k: 'hudScale', type: 'range', pct: true },
    { k: 'damageNumbers', type: 'toggle' },
    { type: 'action', id: 'btn-layout-reset', label: 'resetLayout' },
  ] },
  { id: 'audio', items: [
    { k: 'volume', type: 'range', pct: true },
    { type: 'lang' },
    { type: 'action', id: 'btn-reset-all', label: 'resetAll' },
  ] },
];

const optLabel = (k, v, t) => {
  if (k === 'fpsCap') return v === 0 ? t('opt_max') : `${v}`;
  return t(`opt_${v}`);
};

export function buildSettingsScreen(root, settings, i18n, { onAction = () => {}, onLang = () => {} } = {}) {
  const t = (k) => i18n.t(k);
  const tabsEl = root.querySelector('.set-tabs');
  const body = root.querySelector('.set-body');
  let current = 'graphics';

  function row(label, control, extra = '') {
    const r = document.createElement('div');
    r.className = `set-row ${extra}`;
    const l = document.createElement('span');
    l.className = 'set-label';
    l.textContent = label;
    r.append(l, control);
    return r;
  }

  function render() {
    tabsEl.replaceChildren(...TABS.map((tab) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `set-tab${tab.id === current ? ' on' : ''}`;
      b.dataset.tab = tab.id;
      b.setAttribute('role', 'tab');
      b.textContent = t(`tab_${tab.id}`);
      b.addEventListener('click', () => { current = tab.id; render(); });
      return b;
    }));
    const tab = TABS.find((x) => x.id === current);
    body.replaceChildren(...tab.items.map((it) => {
      if (it.type === 'action') {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = it.id;
        b.className = `menu-btn set-action${it.primary ? ' primary' : ''}`;
        b.textContent = t(it.label);
        b.addEventListener('click', () => onAction(it.id));
        return b;
      }
      if (it.type === 'lang') {
        const seg = document.createElement('div');
        seg.className = 'seg';
        for (const [code, name] of [['ar', 'العربية'], ['en', 'English']]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `seg-opt${i18n.lang === code ? ' on' : ''}`;
          b.textContent = name;
          b.addEventListener('click', () => { onLang(code); render(); });
          seg.appendChild(b);
        }
        return row(t('language'), seg);
      }
      const f = SCHEMA[it.k];
      const v = settings.get(it.k);
      if (it.type === 'seg') {
        const seg = document.createElement('div');
        seg.className = 'seg';
        seg.id = `set-${it.k}`;
        for (const o of f.options) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `seg-opt${o === v ? ' on' : ''}`;
          b.dataset.value = String(o);
          b.textContent = optLabel(it.k, o, t);
          b.addEventListener('click', () => { settings.set(it.k, o); render(); });
          seg.appendChild(b);
        }
        return row(t(`set_${it.k}`), seg);
      }
      if (it.type === 'range') {
        const wrap = document.createElement('div');
        wrap.className = 'range-wrap';
        const inp = document.createElement('input');
        inp.type = 'range'; inp.id = `set-${it.k}`;
        inp.min = String(f.min); inp.max = String(f.max); inp.step = String(f.step); inp.value = String(v);
        const out = document.createElement('output');
        const show = (x) => { out.textContent = it.pct ? `${Math.round(x * 100)}%` : String(x); };
        show(v);
        inp.addEventListener('input', () => { settings.set(it.k, parseFloat(inp.value)); show(settings.get(it.k)); });
        wrap.append(inp, out);
        return row(t(`set_${it.k}`), wrap);
      }
      // toggle: a real checkbox styled as a switch
      const lab = document.createElement('label');
      lab.className = 'switch';
      const inp = document.createElement('input');
      inp.type = 'checkbox'; inp.id = `set-${it.k}`; inp.checked = !!v;
      inp.addEventListener('change', () => settings.set(it.k, inp.checked));
      const knob = document.createElement('i');
      lab.append(inp, knob);
      return row(t(`set_${it.k}`), lab);
    }));
  }
  render();
  return { render, show(tab) { if (tab) current = tab; render(); } };
}
