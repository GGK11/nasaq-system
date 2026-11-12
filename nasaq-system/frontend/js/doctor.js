// Doctor (staff) dashboard: profile, shifts table, swap board, requests, notifications, settings.
import { api, session } from './api.js';
import {
  $, esc, badge, certChips, stat, stars, shiftLabel, fmtDate, fmtDateTime, dayName, todayISO, addDays, weekStart,
  monthLabel, initials, openModal, confirmModal, toast, busy, notificationsPage, settingsPage, attachmentLink, TYPE_LABEL,
} from './ui.js';

// ============ Profile ============
async function profilePage(el) {
  const { user: u, supervisor, stats: s, excuses, reports, month } = await api.doctor.profile();
  el.innerHTML = `
  <div class="grid">
    <div class="card">
      <div class="profile-head">
        <div class="avatar lg">${esc(initials(u.full_name))}</div>
        <div style="flex:1">
          <h2>${esc(u.full_name)}</h2>
          <div class="muted">${esc(u.title)} · ${esc(u.department)}</div>
          ${u.willing_overtime ? '<div class="mt" style="margin-top:6px">' + badge('available', 'Available for overtime') + '</div>' : ''}
        </div>
      </div>
      <div class="info-grid mt">
        <div><div class="k">Qualifications</div><div class="v">${esc(u.qualifications)}</div></div>
        <div><div class="k">Certifications</div><div class="v">${certChips(u.certifications)}</div></div>
        <div><div class="k">Experience</div><div class="v">${esc(u.experience_years)} years</div></div>
        <div><div class="k">Supervisor</div><div class="v">${esc(supervisor?.full_name || '—')}</div></div>
        <div><div class="k">Email</div><div class="v">${esc(u.email || '—')}</div></div>
        <div><div class="k">Phone</div><div class="v">${esc(u.phone || '—')}</div></div>
      </div>
    </div>

    <div>
      <h3 style="margin-bottom:10px">${monthLabel(month)}</h3>
      <div class="stats">
        ${stat(s.hours_period, 'Scheduled hours')}
        ${stat(s.shifts_period, 'Shifts')}
        ${stat(s.worked_hours_period, 'Worked hours (attended)')}
        ${stat(s.absences_period, 'Absences', s.absences_period > 0)}
        ${stat(s.excuses_total, 'Excuses submitted (all time)')}
        ${stat(s.swaps_total, 'Approved swaps')}
        ${stat(s.covers_taken_total, "Colleagues' shifts covered")}
        ${stat(s.leaves_total, 'Approved leaves')}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>My excuses history</h3><a href="#requests" class="btn sm">All requests →</a></div>
      ${excuses.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Type</th><th>For</th><th>Reason</th><th>Submitted</th><th>Status</th><th>Supervisor note</th></tr></thead>
        <tbody>${excuses.map((r) => `<tr>
          <td class="type-${r.type}"><b>${TYPE_LABEL[r.type]}</b>${r.leave_type ? `<div class="muted small">${esc(r.leave_type)}</div>` : ''}</td>
          <td>${r.type === 'leave' ? `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}` : `${fmtDate(r.shift_date)} · ${esc(r.shift_type || '')}`}</td>
          <td style="max-width:320px">${esc(r.reason)} ${attachmentLink(r)}</td>
          <td class="muted">${fmtDateTime(r.created_at)}</td>
          <td>${badge(r.status)}</td>
          <td class="muted">${esc(r.supervisor_note || '')}${r.replacement_name ? `<div class="small">Covered by ${esc(r.replacement_name)}</div>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No excuses yet</div>'}
    </div>

    ${reports.length ? `<div class="card"><h3>Supervisor reports</h3>${reports.map((r) => `
      <div class="req" style="margin-bottom:10px"><div class="top"><b>${monthLabel(r.period)}</b>${stars(r.rating)}<span class="spacer"></span><span class="muted small">${esc(r.supervisor_name)}</span></div>
      <div>${esc(r.content)}</div></div>`).join('')}</div>` : ''}
  </div>`;
}

// ============ Shifts table ============
let schedWeek = null;
async function schedulePage(el, navigate) {
  schedWeek = schedWeek || weekStart(todayISO());
  const from = schedWeek;
  const to = addDays(from, 13);
  const { shifts } = await api.doctor.schedule(from, to);
  const t = todayISO();
  const hours = shifts.reduce((a, s) => a + s.hours, 0);

  el.innerHTML = `
  <div class="card">
    <div class="card-head no-print">
      <button class="btn sm" id="prev">‹ Prev</button>
      <button class="btn sm" id="now">This week</button>
      <button class="btn sm" id="next">Next ›</button>
      <h3 style="margin-left:6px">${fmtDate(from)} – ${fmtDate(to)} <span class="muted small">· ${shifts.length} shifts · ${hours}h</span></h3>
      <button class="btn sm" id="leave-btn">＋ Request leave</button>
      <a class="btn sm" href="${api.exportUrl(from, to)}">⬇ Excel</a>
      <button class="btn sm" onclick="window.print()">⎙ PDF</button>
    </div>
    ${shifts.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Shift</th><th>Hours</th><th>Required</th><th>Status</th><th class="no-print">Actions</th></tr></thead>
      <tbody>${shifts.map((s) => {
        const future = s.date >= t;
        let status = s.date < t ? badge(s.attendance) : badge('info', 'Scheduled');
        if (s.original_doctor_name && s.original_doctor_id !== session.user.id) status += ` <span class="muted small">covering ${esc(s.original_doctor_name)}</span>`;
        if (s.offered) status += ' ' + badge('pending', 'Offered for swap');
        if (s.swap_pending) status += ' ' + badge('pending', 'Swap requested');
        return `<tr class="${s.date === t ? 'today' : ''}">
          <td><b>${dayName(s.date)}</b> ${fmtDate(s.date)}</td>
          <td>${shiftLabel(s)}</td><td>${s.hours}</td><td>${esc(s.required_cert || '—')}</td><td>${status}</td>
          <td class="no-print">${future ? `<div class="row">
            <button class="btn sm" data-swap="${s.id}" ${s.swap_pending ? 'disabled' : ''}>⇄ Request swap</button>
            <button class="btn sm ghost" data-offer="${s.id}" data-val="${s.offered ? 0 : 1}">${s.offered ? 'Remove from board' : 'Offer on swap board'}</button>
          </div>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">No shifts in this period</div>'}
  </div>`;

  $('#prev', el).onclick = () => { schedWeek = addDays(schedWeek, -14); schedulePage(el, navigate); };
  $('#next', el).onclick = () => { schedWeek = addDays(schedWeek, 14); schedulePage(el, navigate); };
  $('#now', el).onclick = () => { schedWeek = weekStart(todayISO()); schedulePage(el, navigate); };
  $('#leave-btn', el).onclick = () => leaveModal(() => schedulePage(el, navigate));
  el.querySelectorAll('[data-swap]').forEach((b) => (b.onclick = () => swapModal(shifts.find((s) => s.id == b.dataset.swap), () => schedulePage(el, navigate))));
  el.querySelectorAll('[data-offer]').forEach((b) => (b.onclick = async () => {
    try { await api.doctor.offer(b.dataset.offer, b.dataset.val === '1'); toast(b.dataset.val === '1' ? 'Shift posted on the swap board' : 'Removed from swap board', 'ok'); schedulePage(el, navigate); }
    catch (e) { toast(e.message, 'error'); }
  }));
}

// ---------- request windows ----------
const fileField = `<label>Supporting documents (optional)
  <input type="file" name="attachment" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
  <span class="muted small" style="font-weight:400">PDF, image or Word · max 5 MB</span></label>`;

function swapModal(shift, done) {
  const m = openModal({
    title: 'Request shift swap',
    body: `<div class="shift-box"><div><div class="big">${dayName(shift.date, 'long')}, ${fmtDate(shift.date)}</div><div>${shiftLabel(shift)}</div></div></div>
      <form class="form" id="f">
        <label>Excuse / reason<textarea name="reason" required placeholder="Explain why you need to swap this shift…"></textarea></label>
        ${fileField}<p class="form-error" id="err"></p></form>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="send">Send to supervisor</button>',
  });
  $('#send', m.el).onclick = (e) => submitForm(e.target, m, { type: 'swap', shift_id: shift.id }, done);
}

function leaveModal(done) {
  const t = todayISO();
  const m = openModal({
    title: 'Request leave',
    body: `<form class="form" id="f">
      <label>Leave type<select name="leave_type" required>
        <option value="">Choose…</option>${['Sick', 'Vacation', 'Emergency', 'Training', 'Other'].map((x) => `<option>${x}</option>`).join('')}</select></label>
      <div class="form-2"><label>From<input type="date" name="start_date" min="${t}" value="${t}" required /></label>
      <label>To<input type="date" name="end_date" min="${t}" value="${t}" required /></label></div>
      <label>Excuse / reason<textarea name="reason" required placeholder="Write your excuse…"></textarea></label>
      ${fileField}<p class="form-error" id="err"></p></form>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="send">Send to supervisor</button>',
  });
  $('#send', m.el).onclick = (e) => submitForm(e.target, m, { type: 'leave' }, done);
}

async function submitForm(btn, m, extra, done) {
  const f = $('#f', m.el);
  if (!f.reportValidity()) return;
  const fd = new FormData(f);
  Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  if (fd.get('attachment')?.size === 0) fd.delete('attachment');
  await busy(btn, async () => {
    try {
      await api.doctor.submitExcuse(fd);
      m.close(); toast('Request sent to your supervisor', 'ok'); done?.();
    } catch (e) { $('#err', m.el).textContent = e.message; }
  });
}

// ============ Available shifts (swap board) ============
async function availablePage(el, navigate) {
  const { shifts } = await api.doctor.availableShifts();
  el.innerHTML = `
  <p class="muted" style="margin-top:0">Shifts your colleagues posted for swapping. Ask to take one — your supervisor approves it.
  To post your own shift, use <a href="#schedule">My shifts</a> → “Offer on swap board”.</p>
  ${shifts.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${shifts.map((s) => `
    <div class="card">
      <div class="muted small">${esc(s.doctor_name)}</div>
      <div style="font-size:18px;font-weight:700;margin:4px 0">${dayName(s.date, 'long')}, ${fmtDate(s.date)}</div>
      <div>${shiftLabel(s)} · ${s.hours}h</div>
      <div class="muted small" style="margin:6px 0 12px">Requires: ${esc(s.required_cert || '—')}</div>
      ${s.already_requested ? badge('pending', 'You requested this') : `<button class="btn primary sm" data-take="${s.id}">I can take this shift</button>`}
    </div>`).join('')}</div>` : '<div class="card empty">No shifts are offered for swapping right now</div>'}`;

  el.querySelectorAll('[data-take]').forEach((b) => (b.onclick = () => {
    const s = shifts.find((x) => x.id == b.dataset.take);
    const m = openModal({
      title: 'Request to cover shift',
      body: `<div class="shift-box"><div><div class="big">${fmtDate(s.date)}</div><div>${shiftLabel(s)} · from ${esc(s.doctor_name)}</div></div></div>
        <label>Note to supervisor (optional)<textarea id="note" placeholder="e.g. I'm free that day and happy to cover."></textarea></label><p class="form-error" id="err"></p>`,
      footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="go">Send request</button>',
    });
    $('#go', m.el).onclick = (e) => busy(e.target, async () => {
      try { await api.doctor.take(s.id, $('#note', m.el).value || 'I can cover this shift'); m.close(); toast('Request sent', 'ok'); availablePage(el, navigate); }
      catch (err) { $('#err', m.el).textContent = err.message; }
    });
  }));
}

// ============ Requests ============
async function requestsPage(el, navigate) {
  const { requests } = await api.doctor.requests();
  el.innerHTML = `
  <div class="row no-print" style="margin-bottom:14px">
    <button class="btn primary" id="leave">＋ Request leave</button>
    <a class="btn" href="#schedule">⇄ Request shift swap (pick a shift)</a>
    <a class="btn" href="#available">Browse shifts to cover</a>
  </div>
  <div class="req-list">${requests.length ? requests.map((r) => `
    <div class="req">
      <div class="top">
        <span class="title type-${r.type}">${TYPE_LABEL[r.type]}${r.leave_type ? ` · ${esc(r.leave_type)}` : ''}</span>
        ${badge(r.status)}<span class="spacer"></span>
        ${r.status === 'pending' ? `<button class="btn sm danger" data-cancel="${r.id}">Cancel</button>` : ''}
      </div>
      <div>${r.type === 'leave' ? `📅 ${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}`
        : `📅 ${fmtDate(r.shift_date)} · ${esc(r.shift_type)} ${esc(r.shift_start)}–${esc(r.shift_end)}${r.type === 'coverage' ? ` · from ${esc(r.shift_owner_name || '')}` : ''}`}</div>
      <div class="reason">${esc(r.reason)}</div>
      <div class="meta"><span>Submitted ${fmtDateTime(r.created_at)}</span>${attachmentLink(r)}
        ${r.decided_at ? `<span>Decided ${fmtDateTime(r.decided_at)}</span>` : ''}
        ${r.replacement_name && r.type === 'swap' ? `<span>Covered by <b>${esc(r.replacement_name)}</b></span>` : ''}
        ${r.supervisor_note ? `<span>Note: “${esc(r.supervisor_note)}”</span>` : ''}</div>
    </div>`).join('') : '<div class="card empty">No requests yet</div>'}</div>`;

  $('#leave', el).onclick = () => leaveModal(() => requestsPage(el, navigate));
  el.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmModal('Cancel request', 'Cancel this pending request?', 'Cancel request', true))) return;
    try { await api.doctor.cancel(b.dataset.cancel); toast('Request cancelled'); requestsPage(el, navigate); } catch (e) { toast(e.message, 'error'); }
  }));
}

export const doctorPages = [
  { id: 'profile', label: 'My profile', icon: '👤', render: profilePage },
  { id: 'schedule', label: 'My shifts', icon: '📅', render: schedulePage },
  { id: 'available', label: 'Shifts to swap', icon: '⇄', render: availablePage },
  { id: 'requests', label: 'Requests', icon: '📝', render: requestsPage },
  { id: 'notifications', label: 'Notifications', icon: '🔔', render: notificationsPage },
  { id: 'settings', label: 'Settings', icon: '⚙', render: settingsPage },
];
