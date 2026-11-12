const User = require('../models/User');
const Shift = require('../models/Shift');
const Excuse = require('../models/Excuse');
const Report = require('../models/Report');
const Notification = require('../models/Notification');
const { today, addDays, monthRange } = require('../utils/dates');

const LEAVE_TYPES = ['Sick', 'Vacation', 'Emergency', 'Training', 'Other'];

exports.profile = (req, res) => {
  const me = User.findById(req.user.id);
  const month = req.query.month || today().slice(0, 7);
  const { from, to } = monthRange(month);
  const supervisor = me.supervisor_id ? User.findById(me.supervisor_id) : null;
  res.json({
    user: me,
    supervisor: supervisor && { id: supervisor.id, full_name: supervisor.full_name, title: supervisor.title },
    month,
    stats: User.stats(me.id, from, to),
    excuses: Excuse.byDoctor(me.id).filter((r) => r.type !== 'coverage').slice(0, 20),
    reports: Report.byDoctor(me.id),
  });
};

exports.schedule = (req, res) => {
  const from = req.query.from || today();
  const to = req.query.to || addDays(from, 6);
  const pending = new Set(Excuse.byDoctor(req.user.id).filter((r) => r.status === 'pending' && r.type === 'swap').map((r) => r.shift_id));
  const shifts = Shift.byDoctorRange(req.user.id, from, to).map((s) => ({ ...s, swap_pending: pending.has(s.id) }));
  res.json({ from, to, shifts });
};

/** Colleagues' shifts that were offered for swap. */
exports.availableShifts = (req, res) => {
  const me = User.findById(req.user.id);
  const mine = Excuse.byDoctor(me.id).filter((r) => r.type === 'coverage' && r.status === 'pending').map((r) => r.shift_id);
  const shifts = Shift.offeredForTeam(me.supervisor_id, me.id, today()).map((s) => ({ ...s, already_requested: mine.includes(s.id) }));
  res.json({ shifts });
};

/** Put my shift up (or take it down) on the "available for swap" board. */
exports.offerShift = (req, res) => {
  const shift = Shift.findById(Number(req.params.id));
  if (!shift || shift.doctor_id !== req.user.id) return res.status(404).json({ error: 'Shift not found' });
  if (shift.date < today()) return res.status(400).json({ error: 'Cannot offer a past shift' });
  Shift.setOffered(shift.id, !!req.body.offered);
  res.json({ shift: Shift.findById(shift.id) });
};

/** New request: swap (needs shift_id) or leave (needs dates). Attachment optional. */
exports.submitExcuse = (req, res) => {
  const me = User.findById(req.user.id);
  const { type, shift_id, start_date, end_date, leave_type, reason } = req.body || {};
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'Please write the reason / excuse' });

  const data = {
    doctor_id: me.id, supervisor_id: me.supervisor_id, type, reason: reason.trim(),
    attachment_path: req.file?.filename || null, attachment_name: req.file?.originalname || null,
  };

  if (type === 'swap') {
    const shift = Shift.findById(Number(shift_id));
    if (!shift || shift.doctor_id !== me.id) return res.status(400).json({ error: 'Choose one of your shifts' });
    if (shift.date < today()) return res.status(400).json({ error: 'Cannot swap a past shift' });
    if (Excuse.pendingForShift(shift.id).some((r) => r.doctor_id === me.id)) {
      return res.status(400).json({ error: 'You already have a pending request for this shift' });
    }
    data.shift_id = shift.id;
  } else if (type === 'leave') {
    if (!start_date || !end_date || end_date < start_date) return res.status(400).json({ error: 'Choose a valid date range' });
    if (!LEAVE_TYPES.includes(leave_type)) return res.status(400).json({ error: 'Choose a leave type' });
    Object.assign(data, { start_date, end_date, leave_type });
  } else {
    return res.status(400).json({ error: 'Unknown request type' });
  }

  const r = Excuse.create(data);
  const label = type === 'swap' ? `shift swap for ${r.shift_date} (${r.shift_type})` : `${leave_type} leave ${start_date} → ${end_date}`;
  Notification.create(me.supervisor_id, `${me.full_name} requested a ${label}`, `requests:${r.id}`);
  res.status(201).json({ request: r });
};

/** Ask to take a colleague's offered shift → "coverage" request for supervisor approval. */
exports.takeShift = (req, res) => {
  const me = User.findById(req.user.id);
  const shift = Shift.findById(Number(req.params.id));
  if (!shift || !shift.offered || shift.supervisor_id !== me.supervisor_id || shift.doctor_id === me.id) {
    return res.status(404).json({ error: 'This shift is no longer available' });
  }
  if (Excuse.pendingForShift(shift.id).some((r) => r.doctor_id === me.id)) {
    return res.status(400).json({ error: 'You already asked for this shift' });
  }
  const r = Excuse.create({
    doctor_id: me.id, supervisor_id: me.supervisor_id, type: 'coverage', shift_id: shift.id,
    replacement_id: me.id, reason: (req.body?.reason || 'I can cover this shift').trim(),
  });
  Notification.create(me.supervisor_id, `${me.full_name} wants to cover ${shift.doctor_name}'s ${shift.shift_type} shift on ${shift.date}`, `requests:${r.id}`);
  Notification.create(shift.doctor_id, `${me.full_name} offered to take your ${shift.shift_type} shift on ${shift.date} (waiting for supervisor)`);
  res.status(201).json({ request: r });
};

exports.myRequests = (req, res) => {
  res.json({ requests: Excuse.byDoctor(req.user.id) });
};

exports.cancelRequest = (req, res) => {
  const r = Excuse.findById(Number(req.params.id));
  if (!r || r.doctor_id !== req.user.id) return res.status(404).json({ error: 'Request not found' });
  if (r.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be cancelled' });
  Excuse.cancel(r.id);
  res.json({ ok: true });
};
