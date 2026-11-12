/**
 * Demo data. Runs automatically on first start (empty DB), or manually:  npm run seed   (wipes & reseeds)
 * All demo passwords: nasaq123
 */
const bcrypt = require('bcryptjs');
const db = require('./database');
const { today, addDays, weekStart } = require('../utils/dates');

// deterministic random so the demo looks the same every time
let _s = 42;
const rand = () => ((_s = (_s * 16807) % 2147483647) / 2147483647);
const shuffle = (a) => a.map((v) => [rand(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

const SLOTS = [
  { shift_type: 'Morning', start_time: '07:00', end_time: '15:00', hours: 8 },
  { shift_type: 'Evening', start_time: '15:00', end_time: '23:00', hours: 8 },
  { shift_type: 'Night', start_time: '23:00', end_time: '07:00', hours: 8 },
];

const TEAMS = [
  {
    supervisor: { username: 'supervisor', full_name: 'Dr. Khalid Al-Harbi', department: 'Emergency', title: 'Head of Emergency Department',
      qualifications: 'MBBS, Saudi Board of Emergency Medicine, MSc Healthcare Management', certifications: 'BLS,ACLS,ATLS,PALS', experience_years: 18,
      email: 'k.alharbi@hospital.sa', phone: '0550000001' },
    requirements: { Morning: 'BLS', Evening: 'BLS', Night: 'ACLS' },
    doctors: [
      ['dr.sara', 'Dr. Sara Al-Otaibi', 'Senior Registrar', 'MBBS, Saudi Board EM', 'BLS,ACLS,ATLS', 9, 1],
      ['dr.omar', 'Dr. Omar Al-Shehri', 'Registrar', 'MBBS, Arab Board EM (Part 2)', 'BLS,ACLS', 5, 0],
      ['dr.noura', 'Dr. Noura Al-Dosari', 'Resident R3', 'MBBS', 'BLS,ACLS,PALS', 3, 1],
      ['dr.faisal', 'Dr. Faisal Al-Mutairi', 'Specialist', 'MBBS, MRCEM', 'BLS,ACLS,ATLS', 7, 0],
      ['dr.reem', 'Dr. Reem Al-Zahrani', 'Resident R2', 'MBBS', 'BLS', 2, 1],
      ['dr.yousef', 'Dr. Yousef Al-Ghamdi', 'Consultant', 'MBBS, FRCPC Emergency Medicine', 'BLS,ACLS,ATLS,PALS', 14, 0],
    ],
  },
  {
    supervisor: { username: 'supervisor2', full_name: 'Dr. Huda Al-Qahtani', department: 'ICU', title: 'ICU Medical Director',
      qualifications: 'MBBS, Saudi Board Critical Care', certifications: 'BLS,ACLS,FCCS', experience_years: 15,
      email: 'h.alqahtani@hospital.sa', phone: '0550000002' },
    requirements: { Morning: 'ACLS', Evening: 'ACLS', Night: 'ACLS' },
    doctors: [
      ['dr.ahmed', 'Dr. Ahmed Al-Subaie', 'Specialist', 'MBBS, Saudi Board Critical Care', 'BLS,ACLS,FCCS', 8, 1],
      ['dr.layla', 'Dr. Layla Al-Anazi', 'Registrar', 'MBBS', 'BLS,ACLS', 4, 0],
      ['dr.majed', 'Dr. Majed Al-Rashidi', 'Resident R4', 'MBBS', 'BLS,ACLS', 4, 1],
      ['dr.hanan', 'Dr. Hanan Al-Juhani', 'Senior Registrar', 'MBBS, EDIC', 'BLS,ACLS,FCCS', 10, 0],
    ],
  },
];

function seed({ reset = false } = {}) {
  if (reset) db.exec('DELETE FROM notifications; DELETE FROM reports; DELETE FROM requests; DELETE FROM shifts; DELETE FROM users; DELETE FROM sqlite_sequence;');
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return false;

  const hash = bcrypt.hashSync('nasaq123', 10);
  const insUser = db.prepare(`INSERT INTO users (username, password_hash, role, full_name, department, title, qualifications, certifications,
    experience_years, supervisor_id, willing_overtime, email, phone) VALUES
    (@username, @hash, @role, @full_name, @department, @title, @qualifications, @certifications, @experience_years, @supervisor_id, @willing_overtime, @email, @phone)`);
  const insShift = db.prepare(`INSERT INTO shifts (doctor_id, supervisor_id, date, start_time, end_time, shift_type, hours, department, required_cert, attendance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insReq = db.prepare(`INSERT INTO requests (doctor_id, supervisor_id, type, shift_id, start_date, end_date, leave_type, reason, status,
    replacement_id, supervisor_note, created_at, decided_at) VALUES
    (@doctor_id, @supervisor_id, @type, @shift_id, @start_date, @end_date, @leave_type, @reason, @status, @replacement_id, @supervisor_note, @created_at, @decided_at)`);
  const note = db.prepare('INSERT INTO notifications (user_id, message, link) VALUES (?, ?, ?)');

  const t = today();
  const FROM = addDays(weekStart(t), -28);
  const TO = addDays(weekStart(t), 27);

  db.transaction(() => {
    for (const team of TEAMS) {
      const sup = team.supervisor;
      const supId = insUser.run({ ...sup, hash, role: 'supervisor', supervisor_id: null, willing_overtime: 0 }).lastInsertRowid;
      const docs = team.doctors.map(([username, full_name, title, qualifications, certifications, experience_years, willing_overtime], i) => ({
        id: insUser.run({ username, hash, role: 'doctor', full_name, department: sup.department, title, qualifications, certifications,
          experience_years, supervisor_id: supId, willing_overtime, email: `${username.replace('dr.', '')}@hospital.sa`, phone: `05500001${i}${supId}` }).lastInsertRowid,
        certs: certifications.split(','),
      }));

      // --- generate rota: one doctor per slot, fair & rest-aware -----------------
      const weekHours = {};
      const lastNight = {};
      const shiftIds = [];
      for (let d = FROM; d <= TO; d = addDays(d, 1)) {
        const wk = weekStart(d);
        const usedToday = new Set();
        for (const slot of SLOTS) {
          const req = team.requirements[slot.shift_type];
          const cands = shuffle(docs).filter((doc) =>
            !usedToday.has(doc.id) &&
            !(slot.shift_type === 'Morning' && lastNight[doc.id] === addDays(d, -1)) &&
            (weekHours[`${doc.id}|${wk}`] || 0) < 40 &&
            doc.certs.includes(req));
          cands.sort((a, b) => (weekHours[`${a.id}|${wk}`] || 0) - (weekHours[`${b.id}|${wk}`] || 0));
          const pick = cands[0];
          if (!pick) continue;
          usedToday.add(pick.id);
          if (slot.shift_type === 'Night') lastNight[pick.id] = d;
          weekHours[`${pick.id}|${wk}`] = (weekHours[`${pick.id}|${wk}`] || 0) + slot.hours;
          let att = 'pending';
          if (d < t) { const r = rand(); att = r < 0.06 ? 'absent' : r < 0.14 ? 'late' : 'present'; }
          const id = insShift.run(pick.id, supId, d, slot.start_time, slot.end_time, slot.shift_type, slot.hours, sup.department, req, att).lastInsertRowid;
          shiftIds.push({ id, doctor_id: pick.id, date: d, type: slot.shift_type });
        }
      }

      // --- history: some past swaps (covers) & leaves ---------------------------
      const past = shiftIds.filter((s) => s.date < t);
      for (let k = 0; k < 6; k++) {
        const s = past[Math.floor(rand() * past.length)];
        const sameDay = new Set(shiftIds.filter((x) => x.date === s.date).map((x) => x.doctor_id));
        const rep = docs.find((doc) => !sameDay.has(doc.id) && doc.id !== s.doctor_id);
        if (!rep) continue;
        insReq.run({ doctor_id: s.doctor_id, supervisor_id: supId, type: 'swap', shift_id: s.id, start_date: null, end_date: null, leave_type: null,
          reason: ['Family commitment', 'Exam preparation', 'Personal appointment', 'Car broke down', 'Child is sick'][k % 5],
          status: 'approved', replacement_id: rep.id, supervisor_note: 'Approved', created_at: `${addDays(s.date, -3)} 09:00:00`, decided_at: `${addDays(s.date, -2)} 10:00:00` });
        db.prepare('UPDATE shifts SET original_doctor_id = doctor_id, doctor_id = ? WHERE id = ?').run(rep.id, s.id);
        s.doctor_id = rep.id;
      }
      const d0 = docs[1];
      insReq.run({ doctor_id: d0.id, supervisor_id: supId, type: 'leave', shift_id: null, start_date: addDays(t, -18), end_date: addDays(t, -17),
        leave_type: 'Sick', reason: 'High fever — medical report attached at clinic', status: 'approved', replacement_id: null, supervisor_note: 'Get well soon',
        created_at: `${addDays(t, -19)} 06:30:00`, decided_at: `${addDays(t, -19)} 07:10:00` });
      insReq.run({ doctor_id: docs[2].id, supervisor_id: supId, type: 'swap', shift_id: past[3].id, start_date: null, end_date: null, leave_type: null,
        reason: 'Wanted to attend a wedding', status: 'rejected', replacement_id: null, supervisor_note: 'Not enough notice — no replacement available',
        created_at: `${addDays(t, -12)} 20:00:00`, decided_at: `${addDays(t, -12)} 21:00:00` });

      // --- current state: pending requests, an offered shift, an approved upcoming leave -----
      const future = (docId) => shiftIds.filter((s) => s.doctor_id === docId && s.date > addDays(t, 1));
      const f0 = future(docs[0].id)[0];
      if (f0) {
        insReq.run({ doctor_id: docs[0].id, supervisor_id: supId, type: 'swap', shift_id: f0.id, start_date: null, end_date: null, leave_type: null,
          reason: 'I have a scientific conference presentation that day.', status: 'pending', replacement_id: null, supervisor_note: null,
          created_at: `${addDays(t, -1)} 14:20:00`, decided_at: null });
        note.run(supId, `${team.doctors[0][1]} requested a shift swap for ${f0.date} (${f0.type})`, 'requests');
      }
      const f2 = future(docs[2].id)[1];
      if (f2) {
        insReq.run({ doctor_id: docs[2].id, supervisor_id: supId, type: 'swap', shift_id: f2.id, start_date: null, end_date: null, leave_type: null,
          reason: 'Family emergency — need to travel to Jeddah.', status: 'pending', replacement_id: null, supervisor_note: null,
          created_at: `${t} 08:05:00`, decided_at: null });
        note.run(supId, `${team.doctors[2][1]} requested a shift swap for ${f2.date} (${f2.type})`, 'requests');
      }
      insReq.run({ doctor_id: docs[3].id, supervisor_id: supId, type: 'leave', shift_id: null, start_date: addDays(t, 6), end_date: addDays(t, 8),
        leave_type: 'Vacation', reason: 'Annual leave — family trip booked in advance.', status: 'pending', replacement_id: null, supervisor_note: null,
        created_at: `${addDays(t, -2)} 11:00:00`, decided_at: null });
      note.run(supId, `${team.doctors[3][1]} requested Vacation leave`, 'requests');

      // an offered shift on the swap board
      const f1 = future(docs[1].id)[0];
      if (f1) db.prepare('UPDATE shifts SET offered = 1 WHERE id = ?').run(f1.id);

      // approved upcoming leave → those shifts are open and need filling
      const lv = docs[docs.length - 2];
      insReq.run({ doctor_id: lv.id, supervisor_id: supId, type: 'leave', shift_id: null, start_date: addDays(t, 10), end_date: addDays(t, 11),
        leave_type: 'Training', reason: 'Approved ACLS instructor course', status: 'approved', replacement_id: null, supervisor_note: 'Approved — good luck',
        created_at: `${addDays(t, -5)} 10:00:00`, decided_at: `${addDays(t, -4)} 09:00:00` });
      db.prepare(`UPDATE shifts SET original_doctor_id = doctor_id, doctor_id = NULL, status = 'open' WHERE doctor_id = ? AND date BETWEEN ? AND ?`)
        .run(lv.id, addDays(t, 10), addDays(t, 11));

      db.prepare(`INSERT INTO reports (supervisor_id, doctor_id, period, rating, content) VALUES (?, ?, ?, ?, ?)`)
        .run(supId, docs[0].id, addDays(t, -30).slice(0, 7), 5, 'Excellent clinical judgement and teamwork. Covered extra shifts during the busy period.');
      for (const doc of docs) note.run(doc.id, 'Welcome to NASAQ — your schedule is now online.', 'schedule');
    }
  })();
  return true;
}

if (require.main === module) {
  require('dotenv').config();
  seed({ reset: true });
  console.log('Database seeded. Login with supervisor / nasaq123 or dr.sara / nasaq123');
}

module.exports = seed;
