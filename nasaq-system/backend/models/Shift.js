const db = require('../config/database');

const WITH_NAMES = `
  SELECT s.*, u.full_name AS doctor_name, o.full_name AS original_doctor_name
  FROM shifts s
  LEFT JOIN users u ON u.id = s.doctor_id
  LEFT JOIN users o ON o.id = s.original_doctor_id`;

const Shift = {
  findById(id) {
    return db.prepare(`${WITH_NAMES} WHERE s.id = ?`).get(id);
  },
  byDoctorRange(doctorId, from, to) {
    return db.prepare(`${WITH_NAMES} WHERE s.doctor_id = ? AND s.date BETWEEN ? AND ? ORDER BY s.date, s.start_time`).all(doctorId, from, to);
  },
  byTeamRange(supervisorId, from, to) {
    return db.prepare(`${WITH_NAMES} WHERE s.supervisor_id = ? AND s.date BETWEEN ? AND ? ORDER BY s.date, s.start_time`).all(supervisorId, from, to);
  },
  /** Shifts colleagues put up for swap (same team, future, not mine). */
  offeredForTeam(supervisorId, excludeDoctorId, fromDate) {
    return db.prepare(`${WITH_NAMES} WHERE s.supervisor_id = ? AND s.offered = 1 AND s.doctor_id != ? AND s.date >= ?
      ORDER BY s.date, s.start_time`).all(supervisorId, excludeDoctorId, fromDate);
  },
  openForTeam(supervisorId, fromDate) {
    return db.prepare(`${WITH_NAMES} WHERE s.supervisor_id = ? AND s.status = 'open' AND s.date >= ? ORDER BY s.date`).all(supervisorId, fromDate);
  },
  setOffered(id, offered) {
    db.prepare('UPDATE shifts SET offered = ? WHERE id = ?').run(offered ? 1 : 0, id);
  },
  /** Move a shift to a new doctor, keeping track of who originally owned it. */
  reassign(id, newDoctorId) {
    db.prepare(`UPDATE shifts SET original_doctor_id = COALESCE(original_doctor_id, doctor_id),
      doctor_id = ?, status = 'scheduled', offered = 0 WHERE id = ?`).run(newDoctorId, id);
  },
  /** Leave approved: free the doctor's shifts in the range so they can be refilled. */
  openDoctorShifts(doctorId, from, to) {
    const rows = db.prepare(`SELECT id FROM shifts WHERE doctor_id = ? AND date BETWEEN ? AND ?`).all(doctorId, from, to);
    db.prepare(`UPDATE shifts SET original_doctor_id = doctor_id, doctor_id = NULL, status = 'open', offered = 0
      WHERE doctor_id = ? AND date BETWEEN ? AND ?`).run(doctorId, from, to);
    return rows.map((r) => r.id);
  },
  setAttendance(id, attendance) {
    db.prepare('UPDATE shifts SET attendance = ? WHERE id = ?').run(attendance, id);
  },
  hoursInRange(doctorId, from, to) {
    return db.prepare('SELECT COALESCE(SUM(hours),0) h FROM shifts WHERE doctor_id = ? AND date BETWEEN ? AND ?').get(doctorId, from, to).h;
  },
  coversSince(doctorId, fromDate) {
    return db.prepare(`SELECT COUNT(*) c FROM shifts WHERE doctor_id = ? AND original_doctor_id IS NOT NULL
      AND original_doctor_id != ? AND date >= ?`).get(doctorId, doctorId, fromDate).c;
  },
};

module.exports = Shift;
