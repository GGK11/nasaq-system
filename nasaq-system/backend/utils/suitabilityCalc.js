/**
 * Replacement ranking — who is the most suitable doctor to take a given shift?
 *
 * Step 1  HARD FILTERS (doctor is removed from the list):
 *   - on approved leave that day
 *   - already has a shift overlapping this one
 *   - less than MIN_REST_HOURS rest before/after this shift
 *
 * Step 2  SCORE 0–100 (higher = more suitable):
 *   Certification match ......... 25  (has the shift's required certificate)
 *   Workload this week .......... 25  (fewer hours = higher; long hours are less likely to be assigned)
 *   Willing to work overtime .... 15
 *   Fairness .................... 15  (fewer covers taken in last 30 days = higher; spreads extra work)
 *   Rest before/after ........... 10  (full points at ≥ 24h gap)
 *   Department & experience ..... 10
 *
 * Weights live in WEIGHTS so the hospital can tune them.
 */
const db = require('../config/database');
const { addDays, weekStart, shiftInterval } = require('./dates');

const MIN_REST_HOURS = 8;
const WEIGHTS = { cert: 25, load: 25, overtime: 15, fairness: 15, rest: 10, profile: 10 };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const HOUR = 3600 * 1000;

function hasCert(user, cert) {
  if (!cert) return true;
  return (user.certifications || '').split(',').map((c) => c.trim().toUpperCase()).includes(cert.toUpperCase());
}

/** Pure scoring function — easy to unit-test. */
function scoreCandidate(ctx) {
  const { user, shift, weekHours, covers30, maxCovers30, restHours } = ctx;
  const reasons = [];
  const warnings = [];

  const certOk = hasCert(user, shift.required_cert);
  const cert = certOk ? WEIGHTS.cert : 0;
  if (shift.required_cert) (certOk ? reasons : warnings).push(certOk ? `Has ${shift.required_cert}` : `Missing ${shift.required_cert}`);

  const maxH = user.max_weekly_hours || 48;
  const load = WEIGHTS.load * clamp01(1 - weekHours / maxH);
  reasons.push(`${weekHours}h this week`);
  if (weekHours + shift.hours > maxH) warnings.push(`Would exceed ${maxH}h weekly limit`);

  const overtime = user.willing_overtime ? WEIGHTS.overtime : 0;
  if (user.willing_overtime) reasons.push('Willing to work overtime');

  const fairness = WEIGHTS.fairness * (maxCovers30 > 0 ? clamp01(1 - covers30 / maxCovers30) : 1);
  reasons.push(`${covers30} cover(s) in last 30 days`);

  const rest = WEIGHTS.rest * clamp01(restHours / 24);
  reasons.push(restHours >= 999 ? 'No nearby shifts' : `${Math.round(restHours)}h rest gap`);

  const sameDept = user.department === shift.department;
  const profile = WEIGHTS.profile * ((sameDept ? 0.6 : 0) + 0.4 * clamp01((user.experience_years || 0) / 10));
  if (!sameDept) warnings.push(`From ${user.department}`);

  const breakdown = {
    cert: Math.round(cert), load: Math.round(load), overtime: Math.round(overtime),
    fairness: Math.round(fairness), rest: Math.round(rest), profile: Math.round(profile),
  };
  const score = Math.round(cert + load + overtime + fairness + rest + profile);
  return { score, breakdown, reasons, warnings };
}

/**
 * Rank every doctor in the supervisor's team for `shift`.
 * Returns { available: [...sorted best-first], unavailable: [{doctor, reason}] }
 */
function rankReplacements(shift, { excludeIds = [] } = {}) {
  const team = db.prepare(`SELECT * FROM users WHERE supervisor_id = ? AND role = 'doctor'`).all(shift.supervisor_id);
  const { start, end } = shiftInterval(shift);
  const wkFrom = weekStart(shift.date);
  const wkTo = addDays(wkFrom, 6);
  const since30 = addDays(shift.date, -30);

  const nearbyStmt = db.prepare(`SELECT * FROM shifts WHERE doctor_id = ? AND id != ? AND date BETWEEN ? AND ?`);
  const hoursStmt = db.prepare(`SELECT COALESCE(SUM(hours),0) h FROM shifts WHERE doctor_id = ? AND date BETWEEN ? AND ?`);
  const coversStmt = db.prepare(`SELECT COUNT(*) c FROM shifts WHERE doctor_id = ? AND original_doctor_id IS NOT NULL
    AND original_doctor_id != doctor_id AND date BETWEEN ? AND ?`);
  const leaveStmt = db.prepare(`SELECT leave_type FROM requests WHERE doctor_id = ? AND type = 'leave' AND status = 'approved'
    AND ? BETWEEN start_date AND end_date`);

  const exclude = new Set([shift.doctor_id, shift.original_doctor_id, ...excludeIds].filter(Boolean));
  const unavailable = [];
  const pool = [];

  for (const u of team) {
    if (exclude.has(u.id)) continue;
    const pub = { id: u.id, full_name: u.full_name, department: u.department, certifications: u.certifications,
      experience_years: u.experience_years, willing_overtime: u.willing_overtime };

    const leave = leaveStmt.get(u.id, shift.date);
    if (leave) { unavailable.push({ doctor: pub, reason: `On ${leave.leave_type || ''} leave`.replace('  ', ' ') }); continue; }

    let minGap = Infinity;
    let conflict = null;
    for (const o of nearbyStmt.all(u.id, shift.id, addDays(shift.date, -1), addDays(shift.date, 1))) {
      const oi = shiftInterval(o);
      if (oi.start < end && oi.end > start) { conflict = `Already on ${o.shift_type} shift ${o.date}`; break; }
      const gap = oi.end <= start ? (start - oi.end) / HOUR : (oi.start - end) / HOUR;
      minGap = Math.min(minGap, gap);
    }
    if (conflict) { unavailable.push({ doctor: pub, reason: conflict }); continue; }
    if (minGap < MIN_REST_HOURS) { unavailable.push({ doctor: pub, reason: `Only ${Math.round(minGap)}h rest (min ${MIN_REST_HOURS}h)` }); continue; }

    pool.push({
      user: u, pub,
      weekHours: hoursStmt.get(u.id, wkFrom, wkTo).h,
      covers30: coversStmt.get(u.id, since30, shift.date).c,
      restHours: minGap === Infinity ? 999 : minGap,
    });
  }

  const maxCovers30 = Math.max(0, ...pool.map((p) => p.covers30));
  const available = pool
    .map((p) => ({ doctor: p.pub, week_hours: p.weekHours, covers_30d: p.covers30,
      ...scoreCandidate({ ...p, shift, maxCovers30 }) }))
    .sort((a, b) => b.score - a.score);

  return { available, unavailable, weights: WEIGHTS };
}

module.exports = { rankReplacements, scoreCandidate, WEIGHTS, MIN_REST_HOURS };
