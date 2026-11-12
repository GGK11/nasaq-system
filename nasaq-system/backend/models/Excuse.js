// "Excuse" = any staff request: shift swap, leave, or coverage (taking a colleague's offered shift).
const db = require('../config/database');

const WITH_DETAILS = `
  SELECT r.*, d.full_name AS doctor_name, d.department AS doctor_department,
         rp.full_name AS replacement_name,
         s.date AS shift_date, s.start_time AS shift_start, s.end_time AS shift_end,
         s.shift_type, s.doctor_id AS shift_owner_id, own.full_name AS shift_owner_name
  FROM requests r
  JOIN users d ON d.id = r.doctor_id
  LEFT JOIN users rp ON rp.id = r.replacement_id
  LEFT JOIN shifts s ON s.id = r.shift_id
  LEFT JOIN users own ON own.id = s.doctor_id`;

const Excuse = {
  create(data) {
    const info = db.prepare(`INSERT INTO requests
      (doctor_id, supervisor_id, type, shift_id, start_date, end_date, leave_type, reason, attachment_path, attachment_name, replacement_id)
      VALUES (@doctor_id, @supervisor_id, @type, @shift_id, @start_date, @end_date, @leave_type, @reason, @attachment_path, @attachment_name, @replacement_id)`)
      .run({
        shift_id: null, start_date: null, end_date: null, leave_type: null,
        attachment_path: null, attachment_name: null, replacement_id: null, ...data,
      });
    return Excuse.findById(info.lastInsertRowid);
  },
  findById(id) {
    return db.prepare(`${WITH_DETAILS} WHERE r.id = ?`).get(id);
  },
  byDoctor(doctorId) {
    return db.prepare(`${WITH_DETAILS} WHERE r.doctor_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(doctorId);
  },
  bySupervisor(supervisorId, status) {
    if (status && status !== 'all') {
      return db.prepare(`${WITH_DETAILS} WHERE r.supervisor_id = ? AND r.status = ? ORDER BY r.created_at DESC, r.id DESC`).all(supervisorId, status);
    }
    return db.prepare(`${WITH_DETAILS} WHERE r.supervisor_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(supervisorId);
  },
  pendingForShift(shiftId) {
    return db.prepare(`SELECT * FROM requests WHERE shift_id = ? AND status = 'pending'`).all(shiftId);
  },
  decide(id, status, note, replacementId) {
    db.prepare(`UPDATE requests SET status = ?, supervisor_note = ?, replacement_id = COALESCE(?, replacement_id),
      decided_at = datetime('now') WHERE id = ?`).run(status, note || null, replacementId || null, id);
    return Excuse.findById(id);
  },
  cancel(id) {
    db.prepare(`UPDATE requests SET status = 'cancelled', decided_at = datetime('now') WHERE id = ?`).run(id);
  },
  /** Approved leaves overlapping a date (used for availability). */
  approvedLeavesOn(date, supervisorId) {
    return db.prepare(`SELECT doctor_id, leave_type, start_date, end_date FROM requests
      WHERE supervisor_id = ? AND type = 'leave' AND status = 'approved' AND ? BETWEEN start_date AND end_date`).all(supervisorId, date);
  },
};

module.exports = Excuse;
