// Entry point: login, session, app shell, routing, notification bell.
import { api, session } from './api.js';
import { $, esc, initials, toast, applyTheme, renderNotifList, bindNotifClicks } from './ui.js';
import { doctorPages } from './doctor.js';
import { supervisorPages } from './supervisor.js';

let pages = [];
let bellTimer = null;

// ---------- login ----------
function showLogin() {
  clearInterval(bellTimer);
  applyTheme('light');
  $('#app-view').classList.add('hidden');
  $('#login-view').classList.remove('hidden');
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  $('#login-error').textContent = '';
  btn.disabled = true;
  try {
    const { token, user } = await api.login(f.username.value, f.password.value);
    session.token = token;
    session.user = user;
    f.reset();
    startApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  } finally { btn.disabled = false; }
});

document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
  const f = $('#login-form');
  f.username.value = b.dataset.demo;
  f.password.value = 'nasaq123';
  f.requestSubmit();
}));

function logout() {
  session.token = null;
  session.user = null;
  location.hash = '';
  showLogin();
}
$('#logout-btn').onclick = logout;
window.addEventListener('nasaq:logout', () => { toast('Session expired, please sign in again', 'error'); logout(); });

// ---------- app shell ----------
function startApp() {
  const u = session.user;
  applyTheme(u.theme);
  pages = u.role === 'supervisor' ? supervisorPages : doctorPages;

  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#me-card').innerHTML = `<div class="avatar">${esc(initials(u.full_name))}</div>
    <div><div class="name">${esc(u.full_name)}</div><div class="muted small">${u.role === 'supervisor' ? 'Supervisor' : 'Doctor'} · ${esc(u.department)}</div></div>`;
  $('#nav').innerHTML = pages.map((p) => `<button class="nav-item" data-page="${p.id}"><span class="ico">${p.icon}</span>${esc(p.label)}<span class="pill hidden" data-pill="${p.id}"></span></button>`).join('');
  $('#nav').querySelectorAll('.nav-item').forEach((b) => (b.onclick = () => navigate(b.dataset.page)));

  refreshBell();
  clearInterval(bellTimer);
  bellTimer = setInterval(refreshBell, 30000);
  route();
}

export function navigate(id, params) {
  window.__navParams = params || null;
  if (location.hash === `#${id}`) route(); else location.hash = id;
}

async function route() {
  if (!session.user) return;
  const id = location.hash.slice(1) || pages[0].id;
  const page = pages.find((p) => p.id === id) || pages[0];
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page.id));
  $('#page-title').textContent = page.label;
  $('.sidebar').classList.remove('open');
  const el = $('#content');
  el.innerHTML = '<div class="empty">Loading…</div>';
  const params = window.__navParams; window.__navParams = null;
  try {
    await page.render(el, navigate, params);
  } catch (err) {
    el.innerHTML = `<div class="card empty">⚠ ${esc(err.message)}</div>`;
  }
}
window.addEventListener('hashchange', route);
window.addEventListener('nasaq:rerender', route);

// ---------- notification bell ----------
async function refreshBell() {
  if (!session.token) return;
  try {
    const { items, unread } = await api.notifications();
    const c = $('#bell-count');
    c.textContent = unread > 9 ? '9+' : unread;
    c.classList.toggle('hidden', !unread);
    const pill = document.querySelector('[data-pill="notifications"]');
    if (pill) { pill.textContent = unread; pill.classList.toggle('hidden', !unread); }
    const panel = $('#bell-panel');
    panel.innerHTML = `<div class="head">Notifications <a href="#notifications" id="see-all">See all</a></div>${renderNotifList(items.slice(0, 8))}`;
    bindNotifClicks(panel, (p) => { panel.classList.add('hidden'); navigate(p); });
    $('#see-all').onclick = () => panel.classList.add('hidden');
  } catch { /* offline */ }
}
window.addEventListener('nasaq:refresh-bell', refreshBell);

$('#bell-btn').onclick = (e) => { e.stopPropagation(); $('#bell-panel').classList.toggle('hidden'); };
document.addEventListener('click', (e) => { if (!e.target.closest('.bell-wrap')) $('#bell-panel').classList.add('hidden'); });
$('#menu-btn').onclick = () => $('.sidebar').classList.toggle('open');
$('#theme-btn').onclick = async () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { session.user = (await api.saveSettings({ theme: next })).user; } catch { /* ignore */ }
};

// ---------- boot ----------
(async function boot() {
  if (!session.token) return showLogin();
  try {
    session.user = (await api.me()).user;
    startApp();
  } catch { showLogin(); }
})();
