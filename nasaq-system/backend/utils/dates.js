// Small date helpers (all dates are local "YYYY-MM-DD" strings).
const pad = (n) => String(n).padStart(2, '0');

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
function today() {
  return toISODate(new Date());
}
// Week starts Sunday (Saudi work week)
function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return toISODate(d);
}
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
}
// Absolute start/end Date objects of a shift (handles shifts that pass midnight)
function shiftInterval(s) {
  const start = new Date(`${s.date}T${s.start_time}:00`);
  let end = new Date(`${s.date}T${s.end_time}:00`);
  if (end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000);
  return { start, end };
}

module.exports = { toISODate, addDays, today, weekStart, monthRange, shiftInterval };
