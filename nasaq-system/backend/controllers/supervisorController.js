const db = require('../config/database');
const User = require('../models/User');
const Shift = require('../models/Shift');
const Excuse = require('../models/Excuse');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { rankReplacements } = require('../utils/suitabilityCalc');
const { today, addDays, monthRange } = require('../utils/dates');

// ---- helpers -------------------------------------------------------------
function ownShift(req, res) {
  const shift = Shift.findById(Number(req.params.id || req.query.shift_id || req.body.shift_id));
  if (!shift || shift.supervisor_id !== req.user.id) {
    res.status(404).json({ error: 'Shift not found in your team' });
    return null;
  }
  return shift;
}

// ---- profile & team ------------------------------------------------------
exports.profile = (req, res) => {
  const me = User.findById(req.user.id);
  const team = User.getTeam(me.id);
  const t = today();
  const one = (sql, ...p) => Object.values(db.prepare(sql).get(...p))[0] || 0;
  res.json({
    user: me,
    overview: {
      team_size: team.length,
      pending_requests: one(`SELECT COUNT(*) FROM requests WHERE supervisor_id = ? AND status = 'pending'`, me.id),
      open_shifts: one(`SELECT COUNT(*) FROM shifts WHERE supervisor_id = ? AND status = 'open' AND date >= ?`, me.id, t),
      on_shift_today: one(`SELECT COUNT(DISTINCT doctor_id) FROM shifts WHERE supervisor_id = ? AND date = ? AND doctor_id IS NOT NULL`, me.id, t),
      on_leave_today: Excuse.approvedLeavesOn(t, me.id).length,
    },
  });
};

exports.team = (req, res) => {
  const month = req.query.month || today().slice(0, 7);
  const { from, to } = monthRange(month);
  const pending = db.prepare(`SELECT doctor_id, COUNT(*) c FROM requests WHERE supervisor_id = ? AND status = 'pending' GROUP BY doctor_id`).all(req.user.id);
  const pendingMap = Object.fromEntries(pending.map((p) => [p.doctor_id, p.c]));
  const team = User.getTeam(req.user.id).map((d) => ({ ...d, stats: User.stats(d.id, from, to), pending_requests: pendingMap[d.id] || 0 }));
  res.json({ month, team });
};

exports.doctorDetail = (req, res) => {
  const id = Number(req.params.id);
  if (!User.isInTeam(id, req.user.id)) return res.status(404).json({ error: 'Doctor not in your team' });
  const month = req.query.month || today().slice(0, 7);
  const { from, to } = monthRange(month);
  res.json({
    user: User.findById(id),
    stats: User.stats(id, from, to),
    requests: Excuse.byDoctor(id),
    reports: Report.bySupervisor(req.user.id, id),
    upcoming: Shift.byDoctorRange(id, today(), addDays(today(), 13)),
  });
};

// ---- shifts --------------------------------------------------------------
exports.shifts = (req, res) => {
  const from = req.query.from || today();
  const to = req.query.to || addDays(from, 6);
  res.json({ from, to, team: User.getTeam(req.user.id), shifts: Shift.byTeamRange(req.user.id, from, to) });
};

exports.openShifts = (req, res) => {
  res.json({ shifts: Shift.openForTeam(req.user.id, today()) });
};

/** Ranked replacement list for a shift (only available staff, best first). */
exports.replacements = (req, res) => {
  const shift = ownShift(req, res);
  if (!shift) return;
  res.json({ shift, ...rankReplacements(shift) });
};

/** Directly (re)assign a shift — used for open shifts after a leave is approved. */
exports.assignShift = (req, res) => {
  const shift = ownShift(req, res);
  if (!shift) return;
  const doctorId = Number(req.body.doctor_id);
  if (!User.isInTeam(doctorId, req.user.id)) return res.status(400).json({ error: 'Doctor not in your team' });
  const { available } = rankReplacements(shift);
  if (!available.some((c) => c.doctor.id === doctorId)) return res.status(400).json({ error: 'This doctor is not available for that shift' });
  Shift.reassign(shift.id, doctorId);
  Notification.create(doctorId, `You were assigned the ${shift.shift_type} shift on ${shift.date} (${shift.start_time}–${shift.end_time})`, 'schedule');
  res.json({ shift: Shift.findById(shift.id) });
};

exports.setAttendance = (req, res) => {
  const shift = ownShift(req, res);
  if (!shift) return;
  const { attendance } = req.body;
  if (!['pending', 'present', 'absent', 'late'].includes(attendance)) return res.status(400).json({ error: 'Invalid attendance' });
  if (shift.date > today()) return res.status(400).json({ error: 'Cannot mark attendance for a future shift' });
  Shift.setAttendance(shift.id, attendance);
  res.json({ shift: Shift.findById(shift.id) });
};

// ---- requests ------------------------------------------------------------
exports.requests = (req, res) => {
  res.json({ requests: Excuse.bySupervisor(req.user.id, req.query.status || 'pending') });
};

/**
 * Accept / reject a request.
 *  swap     → approve requires replacement_id (picked from ranked list)
 *  coverage → requester takes the offered shift
 *  leave    → doctor's shifts in that range become OPEN; supervisor fills them from the Open Shifts list
 */
exports.decide = (req, res) => {
  const r = Excuse.findById(Number(req.params.id));
  if (!r || r.supervisor_id !== req.user.id) return res.status(404).json({ error: 'Request not found' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'Request already decided' });

  const { decision, note } = req.body || {};
  if (decision === 'reject') {
    Excuse.decide(r.id, 'rejected', note);
    Notification.create(r.doctor_id, `Your ${r.type} request was rejected${note ? `: ${note}` : ''}`, `requests:${r.id}`);
    return res.json({ request: Excuse.findById(r.id) });
  }
  if (decision !== 'approve') return res.status(400).json({ error: 'decision must be approve or reject' });

  const run = db.transaction(() => {
    if (r.type === 'swap' || r.type === 'coverage') {
      const shift = Shift.findById(r.shift_id);
      if (!shift || shift.date < today()) throw new Error('Shift is in the past or no longer exists');
      const replacementId = r.type === 'coverage' ? r.doctor_id : Number(req.body.replacement_id);
      if (!replacementId) throw new Error('Choose a replacement doctor');
      const { available } = rankReplacements(shift);
      if (!available.some((c) => c.doctor.id === replacementId)) throw new Error('Selected doctor is not available for this shift');

      const previousOwner = shift.doctor_id;
      Shift.reassign(shift.id, replacementId);
      Excuse.decide(r.id, 'approved', note, replacementId);
      // other pending requests on the same shift are now obsolete
      for (const other of Excuse.pendingForShift(shift.id)) {
        Excuse.decide(other.id, 'rejected', 'Shift was assigned to someone else');
        Notification.create(other.doctor_id, `Request for ${shift.date} shift closed — shift was assigned to someone else`);
      }
      const rep = User.findById(replacementId);
      if (r.type === 'swap') {
        Notification.create(r.doctor_id, `Your swap for ${shift.date} was approved. ${rep.full_name} will cover it.`, `requests:${r.id}`);
        Notification.create(replacementId, `You were assigned ${shift.shift_type} shift on ${shift.date} (${shift.start_time}–${shift.end_time})`, 'schedule');
      } else {
        Notification.create(r.doctor_id, `Approved: you will cover the ${shift.shift_type} shift on ${shift.date}`, 'schedule');
        if (previousOwner) Notification.create(previousOwner, `${rep.full_name} will take your ${shift.date} shift (approved)`, 'schedule');
      }
    } else if (r.type === 'leave') {
      const opened = Shift.openDoctorShifts(r.doctor_id, r.start_date, r.end_date);
      Excuse.decide(r.id, 'approved', note);
      Notification.create(r.doctor_id, `Your ${r.leave_type} leave ${r.start_date} → ${r.end_date} was approved`, `requests:${r.id}`);
      return { opened_shifts: opened.length };
    }
    return {};
  });

  try {
    const extra = run();
    res.json({ request: Excuse.findById(r.id), ...extra });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// ---- availability & reports ---------------------------------------------
exports.availability = (req, res) => {
  const date = req.query.date || today();
  const team = User.getTeam(req.user.id);
  const leaves = Object.fromEntries(Excuse.approvedLeavesOn(date, req.user.id).map((l) => [l.doctor_id, l]));
  const shifts = Shift.byTeamRange(req.user.id, date, date);
  const rows = team.map((d) => {
    const s = shifts.filter((x) => x.doctor_id === d.id);
    let status = 'available';
    if (leaves[d.id]) status = 'leave';
    else if (s.length) status = 'on_shift';
    return {
      doctor: { id: d.id, full_name: d.full_name, certifications: d.certifications, willing_overtime: d.willing_overtime },
      status, leave: leaves[d.id] || null, shifts: s,
    };
  });
  res.json({ date, rows, open_shifts: shifts.filter((s) => s.status === 'open') });
};

exports.summary = (req, res) => {
  const month = req.query.month || today().slice(0, 7);
  const { from, to } = monthRange(month);
  const rows = User.getTeam(req.user.id).map((d) => ({ doctor: { id: d.id, full_name: d.full_name, willing_overtime: d.willing_overtime }, ...User.stats(d.id, from, to) }));
  res.json({ month, rows });
};

exports.createReport = (req, res) => {
  const { doctor_id, period, rating, content } = req.body || {};
  if (!User.isInTeam(Number(doctor_id), req.user.id)) return res.status(400).json({ error: 'Doctor not in your team' });
  if (!content || !content.trim()) return res.status(400).json({ error: 'Report text is required' });
  if (!/^\d{4}-\d{2}$/.test(period || '')) return res.status(400).json({ error: 'Period must be YYYY-MM' });
  const report = Report.create({ supervisor_id: req.user.id, doctor_id: Number(doctor_id), period, rating: Number(rating) || null, content: content.trim() });
  Notification.create(Number(doctor_id), `Your supervisor added a report for ${period}`, 'profile');
  res.status(201).json({ report });
};

exports.reports = (req, res) => {
  res.json({ reports: Report.bySupervisor(req.user.id, req.query.doctor_id ? Number(req.query.doctor_id) : null) });
};
