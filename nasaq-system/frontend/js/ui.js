// Shared UI helpers: escaping, dates, badges, modal, toast, notifications page, settings page.
import { api, session } from './api.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDate(new Date());
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
export const weekStart = (s) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() - d.getDay()); return isoDate(d); };
export const dayName = (s, len = 'short') => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: len });
export const fmtDate = (s) => (s ? new Date(s.length === 10 ? s + 'T00:00:00' : s.replace(' ', 'T')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (s) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const monthISO = () => todayISO().slice(0, 7);
export const monthLabel = (ym) => new Date(ym + '-01T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

// ---------- small renderers ----------
export const initials = (name) => (name || '?').replace(/^Dr\.?\s*/i, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const badge = (status, label) => `<span class="badge b-${esc(status)}">${esc(label || String(status).replace('_', ' '))}</span>`;
export const certChips = (csv) => `<div class="chips">${(csv || '').split(',').filter(Boolean).map((c) => `<span class="chip">${esc(c.trim())}</span>`).join('') || '<span class="muted">—</span>'}</div>`;
export const stars = (n) => (n ? `<span class="stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>` : '');
export const stat = (value, label, hl = false) => `<div class="stat${hl ? ' hl' : ''}"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div></div>`;
export const shiftLabel = (s) => `<b class="t-${esc(s.shift_type)}">${esc(s.shift_type)}</b> · ${esc(s.start_time)}–${esc(s.end_time)}`;
export const TYPE_LABEL = { swap: 'Shift swap', leave: 'Leave', coverage: 'Coverage (take shift)' };
export const loading = () => '<div class="empty">Loading…</div>';

// ---------- toast ----------
export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// ---------- modal ----------
/**
 * openModal({ title, body, footer, wide, onMount }) → { el, close }
 * footer is HTML; buttons with data-close close the modal.
 */
export function openModal({ title, body, footer = '', wide = false, onMount }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${title}</h3><button class="close-x" data-close aria-label="Close">×</button></div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}</div>`;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  $('#modal-root').appendChild(overlay);
  const ctx = { el: overlay, close };
  onMount?.(ctx);
  return ctx;
}

export function confirmModal(title, message, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    const m = openModal({
      title, body: `<p style="margin:0">${message}</p>`,
      footer: `<button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cm-ok">${esc(okLabel)}</button>`,
    });
    $('#cm-ok', m.el).onclick = () => { m.close(); resolve(true); };
    m.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === m.el) resolve(false); });
  });
}

/** Wire a busy state to a button while an async action runs. */
export async function busy(btn, fn) {
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = 'Please wait…';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
}

// ---------- notifications ----------
export function renderNotifList(items) {
  if (!items.length) return '<div class="empty">No notifications yet</div>';
  return items.map((n) => `<div class="notif ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-link="${esc(n.link || '')}">
    <span class="dot"></span><div><div>${esc(n.message)}</div><div class="muted small">${fmtDateTime(n.created_at)}</div></div></div>`).join('');
}

export async function notificationsPage(el, navigate) {
  const { items } = await api.notifications();
  el.innerHTML = `<div class="card" style="padding:0">
    <div class="card-head" style="padding:16px 18px 0"><h3>All notifications</h3><button class="btn sm" id="all-read">Mark all as read</button></div>
    <div id="nlist">${renderNotifList(items)}</div></div>`;
  $('#all-read', el).onclick = async () => { await api.readAll(); window.dispatchEvent(new Event('nasaq:refresh-bell')); notificationsPage(el, navigate); };
  bindNotifClicks($('#nlist', el), navigate);
}

export function bindNotifClicks(root, navigate) {
  root.querySelectorAll('.notif').forEach((n) => n.addEventListener('click', async () => {
    await api.readNotification(n.dataset.id).catch(() => {});
    window.dispatchEvent(new Event('nasaq:refresh-bell'));
    const link = n.dataset.link;
    if (link) navigate(link.split(':')[0]);
  }));
}

// ---------- settings (both roles) ----------
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}

export function settingsPage(el) {
  const u = session.user;
  const isDoctor = u.role === 'doctor';
  el.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <form class="card form" id="set-form">
      <h3>Personalization</h3>
      <label class="switch"><input type="checkbox" name="dark" ${u.theme === 'dark' ? 'checked' : ''}/> Dark mode</label>
      ${isDoctor ? `<label class="switch"><input type="checkbox" name="willing_overtime" ${u.willing_overtime ? 'checked' : ''}/> I'm willing to work overtime / take extra shifts</label>
      <p class="muted small" style="margin:-6px 0 0">Doctors who opt in get a higher priority when the supervisor looks for replacements.</p>` : ''}
      <label>Email<input name="email" type="email" value="${esc(u.email)}" /></label>
      <label>Phone<input name="phone" value="${esc(u.phone)}" /></label>
      <div><button class="btn primary">Save settings</button></div>
    </form>
    <form class="card form" id="pw-form">
      <h3>Change password</h3>
      <label>Current password<input name="current_password" type="password" required /></label>
      <label>New password<input name="new_password" type="password" minlength="6" required /></label>
      <p class="form-error" id="pw-err"></p>
      <div><button class="btn primary">Update password</button></div>
    </form></div>`;

  $('#set-form', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const { user } = await api.saveSettings({
        email: f.email.value, phone: f.phone.value, theme: f.dark.checked ? 'dark' : 'light',
        ...(isDoctor ? { willing_overtime: f.willing_overtime.checked } : {}),
      });
      session.user = user; applyTheme(user.theme); toast('Settings saved', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  };
  $('#pw-form', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api.changePassword({ current_password: f.current_password.value, new_password: f.new_password.value });
      f.reset(); $('#pw-err', el).textContent = ''; toast('Password updated', 'ok');
    } catch (err) { $('#pw-err', el).textContent = err.message; }
  };
}

/** Attachment link HTML for a request */
export const attachmentLink = (r) => (r.attachment_path
  ? `<a href="${api.attachmentUrl(r.id)}" target="_blank" rel="noopener">📎 ${esc(r.attachment_name || 'Attachment')}</a>` : '');
