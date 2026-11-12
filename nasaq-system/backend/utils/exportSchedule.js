const ExcelJS = require('exceljs');

async function buildScheduleWorkbook({ title, from, to, shifts }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NASAQ';
  const ws = wb.addWorksheet('Schedule', { views: [{ state: 'frozen', ySplit: 3 }] });

  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `${from} → ${to}`;

  const header = ['Date', 'Day', 'Shift', 'Start', 'End', 'Hours', 'Doctor', 'Department', 'Status / Attendance'];
  ws.getRow(3).values = header;
  ws.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

  for (const s of shifts) {
    const day = new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    const status = s.status === 'open' ? 'OPEN — needs replacement' : s.attendance;
    ws.addRow([s.date, day, s.shift_type, s.start_time, s.end_time, s.hours, s.doctor_name || '—', s.department, status]);
  }
  ws.columns.forEach((c, i) => { c.width = [12, 6, 10, 7, 7, 7, 24, 16, 24][i]; });

  const total = shifts.reduce((a, s) => a + (s.doctor_id ? s.hours : 0), 0);
  ws.addRow([]);
  ws.addRow(['Total assigned hours', '', '', '', '', total]).font = { bold: true };
  return wb;
}

module.exports = { buildScheduleWorkbook };
