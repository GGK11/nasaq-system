// Supervisor dashboard: profile/overview, team rota, requests + replacement ranking, availability, reports.
import { api } from './api.js';
import {
  $, esc, badge, certChips, stat, stars, shiftLabel, fmtDate, fmtDateTime, dayName, todayISO, addDays, weekStart,
  monthISO, monthLabel, initials, openModal, toast, busy, notificationsPage, settingsPage, attachmentLink, TYPE_LABEL,
} from './ui.js';

// ====================================================================
// Replacement picker — ranked list of ONLY available staff, best first.
// Supervisor may pick anyone in the list. Resolves to doctor id or null.
// ====================================================================
const PART_COLORS = { cert: '#0f766e', load: '#0ea5e9', overtime: '#d97706', fairness: '#8b5cf6', rest: '#64748b', profile: '#15803d' };
const PART_LABEL = { cert: 'Certification', load: 'Low workload', overtime: 'Overtime', fairness: 'Fairness', rest: 'Rest', profile: 'Dept/experience' };

export function pickReplacement(shiftId, { title = 'Choose replacement', confirmLabel = 'Assign', withNote = false, intro = '' } = {}) {
  return new Promise((resolve) => {
    let selected = null;
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const m = openModal({
      title, wide: true, body: '<div class="empty">Ranking available doctors…</div>',
      footer: `<span class="muted small" style="margin-right:auto" id="sel-label"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="ok" disabled>${esc(confirmLabel)}</button>`,
    });
    m.el.addEventListener('click', (e) => { if (e.target === m.el || e.target.closest('[data-close]')) finish(null); });

    api.sup.replacements(shiftId).then(({ shift, available, unavailable, weights }) => {
      const body = $('.modal-body', m.el);
      body.innerHTML = `${intro}
        <div class="shift-box"><div><div class="big">${dayName(shift.date, 'long')}, ${fmtDate(shift.date)}</div>
          <div>${shiftLabel(shift)} · ${shift.hours}h · requires <b>${esc(shift.required_cert || 'none')}</b>
          ${shift.doctor_name ? ` · currently <b>${esc(shift.doctor_name)}</b>` : shift.original_doctor_name ? ` · was ${esc(shift.original_doctor_name)}` : ''}</div></div></div>
        <div class="legend">${Object.keys(weights).map((k) => `<span><i style="background:${PART_COLORS[k]}"></i>${PART_LABEL[k]} (${weights[k]})</span>`).join('')}</div>
        ${available.length ? `<div class="cand-list">${available.map((c, i) => `
          <div class="cand ${i === 0 ? 'top selected' : ''}" data-id="${c.doctor.id}" data-name="${esc(c.doctor.full_name)}">
            <div class="rank">${i + 1}</div>
            <div>
              <div><b>${esc(c.doctor.full_name)}</b>${i === 0 ? '<span class="recommended">Most suitable</span>' : ''}
                <span class="muted small"> · ${esc(c.doctor.experience_years)}y · ${esc(c.doctor.certifications)}</span></div>
              <div class="bar">${Object.entries(c.breakdown).map(([k, v]) => `<span title="${PART_LABEL[k]}: ${v}" style="width:${v}%;background:${PART_COLORS[k]}"></span>`).join('')}</div>
              <div class="reasons">${c.reasons.map(esc).join(' · ')}${c.warnings.length ? ' · ' + c.warnings.map((w) => `<span class="w">⚠ ${esc(w)}</span>`).join(' · ') : ''}</div>
            </div>
            <div class="score">${c.score}<small>/ 100</small></div>
          </div>`).join('')}</div>` : '<div class="empty">No doctor in your team is available for this shift.</div>'}
        ${unavailable.length ? `<details><summary class="muted small" style="cursor:pointer">${unavailable.length} not available</summary>
          <div class="small muted" style="margin-top:6px">${unavailable.map((u) => `${esc(u.doctor.full_name)} — ${esc(u.reason)}`).join('<br>')}</div></details>` : ''}
        ${withNote ? '<label>Note to doctor (optional)<input id="note" placeholder="e.g. Approved, take care" /></label>' : ''}`;

      const ok = $('#ok', m.el);
      const setSel = (card) => {
        body.querySelectorAll('.cand').forEach((c) => c.classList.toggle('selected', c === card));
        selected = Number(card.dataset.id);
        $('#sel-label', m.el).textContent = `Selected: ${card.dataset.name}`;
        ok.disabled = false;
      };
      const first = body.querySelector('.cand');
      if (first) setSel(first);
      body.querySelectorAll('.cand').forEach((c) => (c.onclick = () => setSel(c)));
      ok.onclick = () => { const note = $('#note', m.el)?.value; m.close(); finish(withNote ? { id: selected, note } : selected); };
    }).catch((e) => { $('.modal-body', m.el).innerHTML = `<div class="empty">⚠ ${esc(e.message)}</div>`; });
  });
}

// ============ Profile / overview ============
async function profilePage(el, navigate) {
  const [{ user: u, overview: o }, { shifts: open }, { requests: pending }] = await Promise.all([api.sup.profile(), api.sup.openShifts(), api.sup.requests('pending')]);
  el.innerHTML = `<div class="grid">
    <div class="card">
      <div class="profile-head"><div class="avatar lg">${esc(initials(u.full_name))}</div>
        <div><h2>${esc(u.full_name)}</h2><div class="muted">${esc(u.title)} · ${esc(u.department)}</div></div></div>
      <div class="info-grid mt">
        <div><div class="k">Qualifications</div><div class="v">${esc(u.qualifications)}</div></div>
        <div><div class="k">Certifications</div><div class="v">${certChips(u.certifications)}</div></div>
        <div><div class="k">Experience</div><div class="v">${esc(u.experience_years)} years</div></div>
        <div><div class="k">Contact</div><div class="v">${esc(u.email || '')}<br>${esc(u.phone || '')}</div></div>
      </div>
    </div>
    <div class="stats">
      ${stat(o.team_size, 'Doctors in my team')}
      ${stat(o.pending_requests, 'Pending requests', o.pending_requests > 0)}
      ${stat(o.open_shifts, 'Open shifts to fill', o.open_shifts > 0)}
      ${stat(o.on_shift_today, 'On shift today')}
      ${stat(o.on_leave_today, 'On leave today')}
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
      <div class="card"><div class="card-head"><h3>Waiting for your decision</h3><a class="btn sm" href="#requests">Open requests →</a></div>
        ${pending.length ? pending.slice(0, 5).map((r) => `<div class="avail-item"><div class="avatar">${esc(initials(r.doctor_name))}</div>
          <div style="flex:1"><b>${esc(r.doctor_name)}</b> <span class="type-${r.type}">${TYPE_LABEL[r.type]}</span>
          <div class="muted small">${r.type === 'leave' ? `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}` : `${fmtDate(r.shift_date)} · ${esc(r.shift_type)}`}</div></div></div>`).join('')
          : '<div class="empty">All caught up 🎉</div>'}</div>
      <div class="card"><h3>Open shifts (need a doctor)</h3>
        ${open.length ? open.map((s) => `<div class="avail-item"><div style="flex:1"><b>${fmtDate(s.date)}</b> · ${shiftLabel(s)}
          <div class="muted small">was ${esc(s.original_doctor_name || '—')}</div></div><button class="btn sm primary" data-fill="${s.id}">Find replacement</button></div>`).join('')
          : '<div class="empty">No open shifts</div>'}</div>
    </div></div>`;
  el.querySelectorAll('[data-fill]').forEach((b) => (b.onclick = () => fillShift(b.dataset.fill, () => profilePage(el, navigate))));
}

async function fillShift(shiftId, done) {
  const id = await pickReplacement(shiftId, { title: 'Fill open shift', confirmLabel: 'Assign shift' });
  if (!id) return;
  try { await api.sup.assign(shiftId, id); toast('Shift assigned — doctor notified', 'ok'); done?.(); } catch (e) { toast(e.message, 'error'); }
}

// ============ Team & shifts (rota) ============
let rotaWeek = null;
async function teamPage(el, navigate) {
  rotaWeek = rotaWeek || weekStart(todayISO());
  const from = rotaWeek;
  const to = addDays(from, 6);
  const [{ shifts, team: members }, { team }] = await Promise.all([api.sup.shifts(from, to), api.sup.team(from.slice(0, 7))]);
  const days = [...Array(7)].map((_, i) => addDays(from, i));
  const t = todayISO();
  const byDocDay = {};
  for (const s of shifts) (byDocDay[`${s.doctor_id ?? 'open'}|${s.date}`] ||= []).push(s);
  const openCount = shifts.filter((s) => s.status === 'open').length;
  const chip = (s) => {
    const cls = [s.status === 'open' ? 'open' : s.shift_type, s.attendance === 'absent' ? 'absent' : '', s.offered ? 'offered' : ''].join(' ');
    const sub = s.status === 'open' ? `was ${esc((s.original_doctor_name || '').replace(/^Dr\.\s*/, ''))}` : `${s.start_time}–${s.end_time}`;
    return `<button class="shift-chip ${cls}" data-shift="${s.id}">${s.status === 'open' ? 'OPEN · ' : ''}${esc(s.shift_type)}<span class="sub">${sub}</span></button>`;
  };

  el.innerHTML = `
  <div class="team-layout">
    <div class="staff-list">
      ${team.map((d) => `<div class="staff">
        <div class="top"><div class="avatar">${esc(initials(d.full_name))}</div>
          <div style="flex:1;min-width:0"><div class="name"><a href="javascript:void 0" data-detail="${d.id}">${esc(d.full_name)}</a></div>
          <div class="muted small">${esc(d.title)} · ${d.stats.hours_period}h this month${d.willing_overtime ? ' · ⏱ OT' : ''}</div></div>
          ${d.pending_requests ? `<span class="badge b-pending">${d.pending_requests}</span>` : ''}</div>
        <div class="btns"><button class="btn sm" data-report="${d.id}">✎ Report</button><button class="btn sm" data-reqs="${d.id}">📝 Requests</button></div>
      </div>`).join('')}
    </div>
    <div class="card" style="min-width:0">
      <div class="card-head no-print">
        <button class="btn sm" id="prev">‹</button><button class="btn sm" id="now">Today</button><button class="btn sm" id="next">›</button>
        <h3>${fmtDate(from)} – ${fmtDate(to)} ${openCount ? badge('open', `${openCount} open`) : ''}</h3>
        <a class="btn sm" href="${api.exportUrl(from, to)}">⬇ Excel</a><button class="btn sm" onclick="window.print()">⎙ PDF</button>
      </div>
      <div class="table-wrap"><table class="rota">
        <thead><tr><th>Doctor</th>${days.map((d) => `<th class="${d === t ? 'today' : ''}">${dayName(d)}<div class="small muted">${d.slice(8)}/${d.slice(5, 7)}</div></th>`).join('')}</tr></thead>
        <tbody>
          ${members.map((d) => `<tr><td><b>${esc(d.full_name)}</b><div class="muted small">${esc(d.certifications)}</div></td>
            ${days.map((day) => `<td>${(byDocDay[`${d.id}|${day}`] || []).map(chip).join('')}</td>`).join('')}</tr>`).join('')}
          ${openCount ? `<tr class="open-row"><td><b>Open shifts</b><div class="small muted">need a doctor</div></td>${days.map((day) => `<td>${(byDocDay[`open|${day}`] || []).map(chip).join('')}</td>`).join('')}</tr>` : ''}
        </tbody></table></div>
      <div class="legend mt"><span><i style="background:var(--morning)"></i>Morning</span><span><i style="background:var(--evening)"></i>Evening</span>
        <span><i style="background:#334155"></i>Night</span><span><i style="background:var(--danger)"></i>Open</span><span>⇄ offered for swap</span><span>red outline = absent</span>
        <span class="spacer"></span><span>Click a shift to mark attendance or reassign</span></div>
    </div>
  </div>`;

  const rerender = () => teamPage(el, navigate);
  $('#prev', el).onclick = () => { rotaWeek = addDays(rotaWeek, -7); rerender(); };
  $('#next', el).onclick = () => { rotaWeek = addDays(rotaWeek, 7); rerender(); };
  $('#now', el).onclick = () => { rotaWeek = weekStart(todayISO()); rerender(); };
  el.querySelectorAll('[data-shift]').forEach((b) => (b.onclick = () => shiftModal(shifts.find((s) => s.id == b.dataset.shift), rerender)));
  el.querySelectorAll('[data-report]').forEach((b) => (b.onclick = () => reportModal(team.find((d) => d.id == b.dataset.report))));
  el.querySelectorAll('[data-reqs]').forEach((b) => (b.onclick = () => navigate('requests', { doctorId: Number(b.dataset.reqs), status: 'all' })));
  el.querySelectorAll('[data-detail]').forEach((a) => (a.onclick = () => doctorModal(Number(a.dataset.detail))));
}

function shiftModal(s, done) {
  const t = todayISO();
  if (s.status === 'open') return fillShift(s.id, done);
  const canAttend = s.date <= t;
  const m = openModal({
    title: 'Shift details',
    body: `<div class="shift-box"><div><div class="big">${dayName(s.date, 'long')}, ${fmtDate(s.date)}</div><div>${shiftLabel(s)} · ${s.hours}h</div>
      <div class="muted">Doctor: <b>${esc(s.doctor_name)}</b>${s.original_doctor_name ? ` (covering ${esc(s.original_doctor_name)})` : ''} · requires ${esc(s.required_cert || '—')}</div></div></div>
      ${canAttend ? `<label>Attendance<select id="att">${['pending', 'present', 'late', 'absent'].map((a) => `<option ${a === s.attendance ? 'selected' : ''}>${a}</option>`).join('')}</select></label>` : ''}`,
    footer: `${s.date >= t ? '<button class="btn" id="reassign" style="margin-right:auto">⇄ Reassign / find replacement</button>' : ''}<button class="btn" data-close>Close</button>${canAttend ? '<button class="btn primary" id="save">Save attendance</button>' : ''}`,
  });
  $('#save', m.el) && ($('#save', m.el).onclick = async () => {
    try { await api.sup.attendance(s.id, $('#att', m.el).value); m.close(); toast('Attendance saved', 'ok'); done(); } catch (e) { toast(e.message, 'error'); }
  });
  $('#reassign', m.el) && ($('#reassign', m.el).onclick = async () => {
    m.close();
    const id = await pickReplacement(s.id, { title: 'Reassign shift', confirmLabel: 'Reassign' });
    if (!id) return;
    try { await api.sup.assign(s.id, id); toast('Shift reassigned', 'ok'); done(); } catch (e) { toast(e.message, 'error'); }
  });
}

async function doctorModal(id) {
  const m = openModal({ title: 'Doctor', wide: true, body: '<div class="empty">Loading…</div>' });
  try {
    const { user: u, stats: s, requests, reports, upcoming } = await api.sup.doctor(id);
    $('.modal-head h3', m.el).textContent = u.full_name;
    $('.modal-body', m.el).innerHTML = `
      <div class="info-grid">
        <div><div class="k">Title</div><div class="v">${esc(u.title)}</div></div>
        <div><div class="k">Qualifications</div><div class="v">${esc(u.qualifications)}</div></div>
        <div><div class="k">Certifications</div><div class="v">${certChips(u.certifications)}</div></div>
        <div><div class="k">Experience</div><div class="v">${u.experience_years} years</div></div>
        <div><div class="k">Overtime</div><div class="v">${u.willing_overtime ? badge('available', 'Willing') : badge('neutral', 'Not opted in')}</div></div>
        <div><div class="k">Contact</div><div class="v">${esc(u.email || '')} ${esc(u.phone || '')}</div></div>
      </div>
      <div class="stats">${stat(s.hours_period, 'Hours this month')}${stat(s.worked_hours_period, 'Worked (attended)')}${stat(s.absences_period, 'Absences', s.absences_period > 0)}
        ${stat(s.late_period, 'Late')}${stat(s.excuses_total, 'Excuses')}${stat(s.swaps_total, 'Swaps')}${stat(s.covers_taken_total, 'Covers taken')}${stat(s.leaves_total, 'Leaves')}</div>
      <div><b>Next 14 days</b><div class="small" style="margin-top:6px">${upcoming.map((x) => `${dayName(x.date)} ${fmtDate(x.date)} — ${shiftLabel(x)}`).join('<br>') || '<span class="muted">No shifts</span>'}</div></div>
      <div><b>Recent requests</b><div class="small" style="margin-top:6px">${requests.slice(0, 6).map((r) => `${badge(r.status)} ${TYPE_LABEL[r.type]} — ${esc(r.reason)}`).join('<br>') || '<span class="muted">None</span>'}</div></div>
      ${reports.length ? `<div><b>Reports</b>${reports.map((r) => `<div class="small" style="margin-top:6px">${monthLabel(r.period)} ${stars(r.rating)} — ${esc(r.content)}</div>`).join('')}</div>` : ''}`;
  } catch (e) { $('.modal-body', m.el).innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

function reportModal(doctor, done) {
  const team = doctor ? null : window.__team;
  const m = openModal({
    title: doctor ? `Report — ${esc(doctor.full_name)}` : 'Write report',
    body: `<form class="form" id="f">
      ${doctor ? '' : `<label>Doctor<select name="doctor_id" required>${(team || []).map((d) => `<option value="${d.id}">${esc(d.full_name)}</option>`).join('')}</select></label>`}
      ${doctor ? `<div class="stats">${stat(doctor.stats.hours_period, 'Hours this month')}${stat(doctor.stats.absences_period, 'Absences')}${stat(doctor.stats.late_period, 'Late')}${stat(doctor.stats.covers_taken_total, 'Covers taken')}</div>` : ''}
      <div class="form-2"><label>Period<input type="month" name="period" value="${monthISO()}" required /></label>
      <label>Rating<select name="rating"><option value="">—</option>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${'★'.repeat(n)}</option>`).join('')}</select></label></div>
      <label>Report<textarea name="content" required placeholder="Performance, punctuality, teamwork, notes…"></textarea></label>
      <p class="form-error" id="err"></p></form>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="save">Save report</button>',
  });
  $('#save', m.el).onclick = (e) => busy(e.target, async () => {
    const f = $('#f', m.el);
    if (!f.reportValidity()) return;
    try {
      await api.sup.createReport({ doctor_id: doctor ? doctor.id : f.doctor_id.value, period: f.period.value, rating: f.rating.value, content: f.content.value });
      m.close(); toast('Report saved — doctor notified', 'ok'); done?.();
    } catch (err) { $('#err', m.el).textContent = err.message; }
  });
}

// ============ Requests ============
async function requestsPage(el, navigate, params) {
  const state = { status: params?.status || 'pending', doctorId: params?.doctorId || '' };
  const [{ requests }, { team }] = await Promise.all([api.sup.requests(state.status), api.sup.team()]);
  const list = state.doctorId ? requests.filter((r) => r.doctor_id === state.doctorId) : requests;

  el.innerHTML = `
  <div class="row" style="margin-bottom:14px">
    <div class="tabs">${['pending', 'approved', 'rejected', 'all'].map((s) => `<button class="tab ${s === state.status ? 'active' : ''}" data-status="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>
    <select id="docf" style="width:auto"><option value="">All doctors</option>${team.map((d) => `<option value="${d.id}" ${d.id === state.doctorId ? 'selected' : ''}>${esc(d.full_name)}</option>`).join('')}</select>
  </div>
  <div class="req-list">${list.length ? list.map((r) => `
    <div class="req">
      <div class="top"><div class="avatar">${esc(initials(r.doctor_name))}</div>
        <div><div class="title">${esc(r.doctor_name)}</div><div class="type-${r.type} small"><b>${TYPE_LABEL[r.type]}</b>${r.leave_type ? ` · ${esc(r.leave_type)}` : ''}</div></div>
        <span class="spacer"></span>${badge(r.status)}</div>
      <div>${r.type === 'leave' ? `📅 <b>${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}</b>`
        : `📅 <b>${dayName(r.shift_date)} ${fmtDate(r.shift_date)}</b> · ${esc(r.shift_type)} ${esc(r.shift_start)}–${esc(r.shift_end)}${r.type === 'coverage' ? ` · currently <b>${esc(r.shift_owner_name || '')}</b>` : ''}`}</div>
      <div class="reason">${esc(r.reason)}</div>
      <div class="meta"><span>Submitted ${fmtDateTime(r.created_at)}</span>${attachmentLink(r)}
        ${r.replacement_name && r.status === 'approved' ? `<span>Replacement: <b>${esc(r.replacement_name)}</b></span>` : ''}
        ${r.supervisor_note ? `<span>Note: “${esc(r.supervisor_note)}”</span>` : ''}</div>
      ${r.status === 'pending' ? `<div class="row"><button class="btn ok" data-approve="${r.id}">✓ ${r.type === 'swap' ? 'Accept & choose replacement' : 'Approve'}</button>
        <button class="btn danger" data-reject="${r.id}">✕ Reject</button></div>` : ''}
    </div>`).join('') : '<div class="card empty">No requests here</div>'}</div>`;

  const rerender = (p = {}) => requestsPage(el, navigate, { ...state, ...p });
  el.querySelectorAll('[data-status]').forEach((b) => (b.onclick = () => rerender({ status: b.dataset.status })));
  $('#docf', el).onchange = (e) => rerender({ doctorId: Number(e.target.value) || '' });
  el.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = () => approve(list.find((r) => r.id == b.dataset.approve), rerender)));
  el.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = () => reject(list.find((r) => r.id == b.dataset.reject), rerender)));
}

async function approve(r, done) {
  const send = async (body) => {
    try {
      const res = await api.sup.decide(r.id, { decision: 'approve', ...body });
      toast(res.opened_shifts ? `Leave approved — ${res.opened_shifts} shift(s) are now open to fill` : 'Approved — doctors notified', 'ok');
      window.dispatchEvent(new Event('nasaq:refresh-bell'));
      done();
    } catch (e) { toast(e.message, 'error'); }
  };
  if (r.type === 'swap') {
    const pick = await pickReplacement(r.shift_id, {
      title: `Accept swap — choose who covers`, confirmLabel: 'Approve & assign', withNote: true,
      intro: `<div class="muted small">Request from <b>${esc(r.doctor_name)}</b>. Only available staff are listed, the most suitable first — you can pick anyone.</div>`,
    });
    if (pick) await send({ replacement_id: pick.id, note: pick.note });
    return;
  }
  const msg = r.type === 'leave'
    ? `Approve <b>${esc(r.leave_type)}</b> leave for <b>${esc(r.doctor_name)}</b> (${fmtDate(r.start_date)} → ${fmtDate(r.end_date)})?<br><span class="muted small">Their shifts in this period become <b>open</b> and appear on your dashboard to fill.</span>`
    : `Let <b>${esc(r.doctor_name)}</b> take <b>${esc(r.shift_owner_name)}</b>'s ${esc(r.shift_type)} shift on ${fmtDate(r.shift_date)}?`;
  const m = openModal({
    title: 'Approve request', body: `<p style="margin:0">${msg}</p><label>Note (optional)<input id="note" /></label>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" id="ok">Approve</button>',
  });
  $('#ok', m.el).onclick = async () => { const note = $('#note', m.el).value; m.close(); await send({ note }); };
}

function reject(r, done) {
  const m = openModal({
    title: `Reject ${TYPE_LABEL[r.type].toLowerCase()} — ${esc(r.doctor_name)}`,
    body: '<label>Reason for rejection (sent to doctor)<textarea id="note" placeholder="e.g. Not enough staff on that day"></textarea></label>',
    footer: '<button class="btn" data-close>Cancel</button><button class="btn danger" id="ok">Reject</button>',
  });
  $('#ok', m.el).onclick = async () => {
    try { await api.sup.decide(r.id, { decision: 'reject', note: $('#note', m.el).value }); m.close(); toast('Request rejected'); done(); }
    catch (e) { toast(e.message, 'error'); }
  };
}

// ============ Availability overview ============
async function availabilityPage(el, navigate, params) {
  const date = params?.date || todayISO();
  const { rows, open_shifts: open } = await api.sup.availability(date);
  const col = (title, status, items, extra) => `<div class="card"><h3>${title} <span class="muted">(${items.length})</span></h3>
    ${items.map((r) => `<div class="avail-item"><div class="avatar">${esc(initials(r.doctor.full_name))}</div><div style="flex:1"><b>${esc(r.doctor.full_name)}</b><div class="muted small">${extra(r)}</div></div>${badge(status)}</div>`).join('') || '<div class="empty">—</div>'}</div>`;
  el.innerHTML = `
    <div class="row" style="margin-bottom:14px"><label style="display:flex;flex-direction:row;align-items:center;gap:8px">Date <input type="date" id="d" value="${date}" style="width:auto" /></label>
      <span class="muted">${dayName(date, 'long')}</span>${open.length ? badge('open', `${open.length} open shift(s)`) : ''}</div>
    <div class="avail-cols">
      ${col('On shift', 'on_shift', rows.filter((r) => r.status === 'on_shift'), (r) => r.shifts.map((s) => `${s.shift_type} ${s.start_time}–${s.end_time}`).join(', '))}
      ${col('Off duty (leave)', 'leave', rows.filter((r) => r.status === 'leave'), (r) => `${esc(r.leave.leave_type)} · until ${fmtDate(r.leave.end_date)}`)}
      ${col('Available', 'available', rows.filter((r) => r.status === 'available'), (r) => `${esc(r.doctor.certifications)}${r.doctor.willing_overtime ? ' · ⏱ willing overtime' : ''}`)}
    </div>
    ${open.length ? `<div class="card mt"><h3>Open shifts on this day</h3>${open.map((s) => `<div class="avail-item"><div style="flex:1">${shiftLabel(s)}</div><button class="btn sm primary" data-fill="${s.id}">Find replacement</button></div>`).join('')}</div>` : ''}`;
  $('#d', el).onchange = (e) => availabilityPage(el, navigate, { date: e.target.value });
  el.querySelectorAll('[data-fill]').forEach((b) => (b.onclick = () => fillShift(b.dataset.fill, () => availabilityPage(el, navigate, { date }))));
}

// ============ Reports (work-hours summary + written reports) ============
async function reportsPage(el, navigate, params) {
  const month = params?.month || monthISO();
  const [{ rows }, { reports }, { team }] = await Promise.all([api.sup.summary(month), api.sup.reports(), api.sup.team(month)]);
  window.__team = team;
  const tot = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const [y, mo] = month.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();

  el.innerHTML = `<div class="grid">
    <div class="card">
      <div class="card-head"><h3>Work hours summary — ${monthLabel(month)}</h3>
        <input type="month" id="m" value="${month}" style="width:auto" class="no-print" />
        <a class="btn sm no-print" href="${api.exportUrl(`${month}-01`, `${month}-${last}`)}">⬇ Schedule Excel</a>
        <button class="btn sm no-print" onclick="window.print()">⎙ PDF</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Doctor</th><th>Shifts</th><th>Scheduled h</th><th>Worked h</th><th>Absent</th><th>Late</th><th>Covers taken</th><th>Swaps</th><th>Excuses</th><th>Overtime</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td><b>${esc(r.doctor.full_name)}</b></td><td>${r.shifts_period}</td><td>${r.hours_period}</td><td>${r.worked_hours_period}</td>
          <td>${r.absences_period ? badge('absent', r.absences_period) : 0}</td><td>${r.late_period}</td><td>${r.covers_taken_total}</td><td>${r.swaps_total}</td><td>${r.excuses_total}</td>
          <td>${r.doctor.willing_overtime ? badge('available', 'Yes') : '—'}</td></tr>`).join('')}
          <tr><td><b>Total</b></td><td><b>${tot('shifts_period')}</b></td><td><b>${tot('hours_period')}</b></td><td><b>${tot('worked_hours_period')}</b></td><td><b>${tot('absences_period')}</b></td><td><b>${tot('late_period')}</b></td><td></td><td></td><td></td><td></td></tr>
        </tbody></table></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Written reports</h3><button class="btn sm primary no-print" id="new">＋ Write monthly report</button></div>
      ${reports.length ? reports.map((r) => `<div class="req" style="margin-bottom:10px"><div class="top"><b>${esc(r.doctor_name)}</b><span class="muted">${monthLabel(r.period)}</span>${stars(r.rating)}
        <span class="spacer"></span><span class="muted small">${fmtDateTime(r.created_at)}</span></div><div>${esc(r.content)}</div></div>`).join('') : '<div class="empty">No reports yet</div>'}
    </div></div>`;
  $('#m', el).onchange = (e) => reportsPage(el, navigate, { month: e.target.value });
  $('#new', el).onclick = () => reportModal(null, () => reportsPage(el, navigate, { month }));
}

export const supervisorPages = [
  { id: 'profile', label: 'Overview', icon: '🏠', render: profilePage },
  { id: 'team', label: 'Team & shifts', icon: '📅', render: teamPage },
  { id: 'requests', label: 'Requests', icon: '📝', render: requestsPage },
  { id: 'availability', label: 'Availability', icon: '👥', render: availabilityPage },
  { id: 'reports', label: 'Reports', icon: '📊', render: reportsPage },
  { id: 'notifications', label: 'Notifications', icon: '🔔', render: notificationsPage },
  { id: 'settings', label: 'Settings', icon: '⚙', render: settingsPage },
];
