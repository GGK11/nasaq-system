// Endpoints shared by both roles: notifications, settings, password, attachments, schedule export.
const bcrypt = require('bcryptjs');
const path = require('path');
const User = require('../models/User');
const Shift = require('../models/Shift');
const Excuse = require('../models/Excuse');
const Notification = require('../models/Notification');
const { buildScheduleWorkbook } = require('../utils/exportSchedule');
const { today, addDays } = require('../utils/dates');

exports.notifications = (req, res) => {
  res.json({ items: Notification.forUser(req.user.id), unread: Notification.unreadCount(req.user.id) });
};
exports.markRead = (req, res) => {
  Notification.markRead(Number(req.params.id), req.user.id);
  res.json({ ok: true });
};
exports.markAllRead = (req, res) => {
  Notification.markAllRead(req.user.id);
  res.json({ ok: true });
};

exports.updateSettings = (req, res) => {
  const { email, phone, theme, willing_overtime } = req.body || {};
  if (theme && !['light', 'dark'].includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
  res.json({ user: User.updateSettings(req.user.id, { email, phone, theme, willing_overtime }) });
};

exports.changePassword = (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  if (!bcrypt.compareSync(current_password || '', User.getPasswordHash(req.user.id))) {
    return res.status(400).json({ error: 'Current password is wrong' });
  }
  User.updatePassword(req.user.id, bcrypt.hashSync(new_password, 10));
  res.json({ ok: true });
};

/** Download a request attachment — only the owner doctor or their supervisor. */
exports.attachment = (req, res) => {
  const r = Excuse.findById(Number(req.params.requestId));
  if (!r || !r.attachment_path) return res.status(404).json({ error: 'File not found' });
  const allowed = r.doctor_id === req.user.id || r.supervisor_id === req.user.id;
  if (!allowed) return res.status(403).json({ error: 'Not allowed' });
  res.download(path.join(__dirname, '..', 'uploads', r.attachment_path), r.attachment_name || r.attachment_path);
};

/** Export schedule as Excel. Doctor → own shifts. Supervisor → whole team. */
exports.exportSchedule = async (req, res) => {
  const from = req.query.from || today();
  const to = req.query.to || addDays(from, 27);
  const me = User.findById(req.user.id);
  const shifts = me.role === 'supervisor' ? Shift.byTeamRange(me.id, from, to) : Shift.byDoctorRange(me.id, from, to);
  const wb = await buildScheduleWorkbook({ title: `NASAQ schedule — ${me.full_name}`, from, to, shifts });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="nasaq-schedule-${from}_to_${to}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
};
