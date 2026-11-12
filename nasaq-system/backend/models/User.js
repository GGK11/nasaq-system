const db = require('../config/database');

const PUBLIC_COLS = `id, username, role, full_name, department, title, qualifications, certifications,
  experience_years, supervisor_id, willing_overtime, max_weekly_hours, email, phone, theme`;

const User = {
  findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },
  findById(id) {
    return db.prepare(`SELECT ${PUBLIC_COLS} FROM users WHERE id = ?`).get(id);
  },
  getPasswordHash(id) {
    return db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id)?.password_hash;
  },
  getTeam(supervisorId) {
    return db.prepare(`SELECT ${PUBLIC_COLS} FROM users WHERE supervisor_id = ? AND role = 'doctor' ORDER BY full_name`).all(supervisorId);
  },
  isInTeam(doctorId, supervisorId) {
    return !!db.prepare(`SELECT 1 FROM users WHERE id = ? AND supervisor_id = ?`).get(doctorId, supervisorId);
  },
  updateSettings(id, { email, phone, theme, willing_overtime }) {
    db.prepare(`UPDATE users SET email = COALESCE(?, email), phone = COALESCE(?, phone),
      theme = COALESCE(?, theme), willing_overtime = COALESCE(?, willing_overtime) WHERE id = ?`)
      .run(email ?? null, phone ?? null, theme ?? null,
        willing_overtime === undefined ? null : (willing_overtime ? 1 : 0), id);
    return User.findById(id);
  },
  updatePassword(id, hash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  },

  /** Counters shown on dashboards. `from`/`to` limit the hours window (usually current month). */
  stats(id, from, to) {
    const one = (sql, ...p) => Object.values(db.prepare(sql).get(...p))[0] || 0;
    return {
      hours_period: one(`SELECT SUM(hours) FROM shifts WHERE doctor_id = ? AND date BETWEEN ? AND ?`, id, from, to),
      shifts_period: one(`SELECT COUNT(*) FROM shifts WHERE doctor_id = ? AND date BETWEEN ? AND ?`, id, from, to),
      worked_hours_period: one(`SELECT SUM(hours) FROM shifts WHERE doctor_id = ? AND date BETWEEN ? AND ? AND attendance IN ('present','late')`, id, from, to),
      absences_period: one(`SELECT COUNT(*) FROM shifts WHERE doctor_id = ? AND date BETWEEN ? AND ? AND attendance = 'absent'`, id, from, to),
      late_period: one(`SELECT COUNT(*) FROM shifts WHERE doctor_id = ? AND date BETWEEN ? AND ? AND attendance = 'late'`, id, from, to),
      excuses_total: one(`SELECT COUNT(*) FROM requests WHERE doctor_id = ? AND type IN ('swap','leave') AND status != 'cancelled'`, id),
      swaps_total: one(`SELECT COUNT(*) FROM requests WHERE doctor_id = ? AND type = 'swap' AND status = 'approved'`, id),
      leaves_total: one(`SELECT COUNT(*) FROM requests WHERE doctor_id = ? AND type = 'leave' AND status = 'approved'`, id),
      covers_taken_total: one(`SELECT COUNT(*) FROM shifts WHERE doctor_id = ? AND original_doctor_id IS NOT NULL AND original_doctor_id != ?`, id, id),
    };
  },
};

module.exports = User;
