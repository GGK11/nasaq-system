// Written (monthly) performance reports a supervisor gives a doctor.
const db = require('../config/database');

const Report = {
  create({ supervisor_id, doctor_id, period, rating, content }) {
    const info = db.prepare(`INSERT INTO reports (supervisor_id, doctor_id, period, rating, content) VALUES (?, ?, ?, ?, ?)`)
      .run(supervisor_id, doctor_id, period, rating || null, content);
    return db.prepare('SELECT * FROM reports WHERE id = ?').get(info.lastInsertRowid);
  },
  bySupervisor(supervisorId, doctorId) {
    const base = `SELECT r.*, d.full_name AS doctor_name FROM reports r JOIN users d ON d.id = r.doctor_id WHERE r.supervisor_id = ?`;
    return doctorId
      ? db.prepare(`${base} AND r.doctor_id = ? ORDER BY r.id DESC`).all(supervisorId, doctorId)
      : db.prepare(`${base} ORDER BY r.id DESC`).all(supervisorId);
  },
  byDoctor(doctorId) {
    return db.prepare(`SELECT r.*, s.full_name AS supervisor_name FROM reports r JOIN users s ON s.id = r.supervisor_id
      WHERE r.doctor_id = ? ORDER BY r.id DESC`).all(doctorId);
  },
};

module.exports = Report;
