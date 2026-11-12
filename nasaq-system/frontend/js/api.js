// All fetch() calls to the backend go through here.
const TOKEN_KEY = 'nasaq_token';

export const session = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
  user: null,
};

async function request(method, url, body) {
  const headers = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  const res = await fetch(url, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && session.token) {
    session.token = null;
    window.dispatchEvent(new Event('nasaq:logout'));
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? '?' + new URLSearchParams(p).toString() : '';
};

export const api = {
  // auth & shared
  login: (username, password) => request('POST', '/api/login', { username, password }),
  me: () => request('GET', '/api/auth/me'),
  notifications: () => request('GET', '/api/auth/notifications'),
  readNotification: (id) => request('POST', `/api/auth/notifications/${id}/read`),
  readAll: () => request('POST', '/api/auth/notifications/read-all'),
  saveSettings: (data) => request('PUT', '/api/auth/settings', data),
  changePassword: (data) => request('PUT', '/api/auth/password', data),
  attachmentUrl: (requestId) => `/api/auth/attachments/${requestId}?token=${encodeURIComponent(session.token)}`,
  exportUrl: (from, to) => `/api/auth/export/schedule${qs({ from, to, token: session.token })}`,

  // doctor
  doctor: {
    profile: (month) => request('GET', `/api/doctor/profile${qs({ month })}`),
    schedule: (from, to) => request('GET', `/api/doctor/schedule${qs({ from, to })}`),
    availableShifts: () => request('GET', '/api/doctor/available-shifts'),
    offer: (shiftId, offered) => request('POST', `/api/doctor/shifts/${shiftId}/offer`, { offered }),
    take: (shiftId, reason) => { const f = new FormData(); f.append('reason', reason); return request('POST', `/api/doctor/shifts/${shiftId}/take`, f); },
    submitExcuse: (formData) => request('POST', '/api/doctor/excuse', formData),
    requests: () => request('GET', '/api/doctor/requests'),
    cancel: (id) => request('DELETE', `/api/doctor/requests/${id}`),
  },

  // supervisor
  sup: {
    profile: () => request('GET', '/api/supervisor/profile'),
    team: (month) => request('GET', `/api/supervisor/team${qs({ month })}`),
    doctor: (id, month) => request('GET', `/api/supervisor/team/${id}${qs({ month })}`),
    shifts: (from, to) => request('GET', `/api/supervisor/shifts${qs({ from, to })}`),
    openShifts: () => request('GET', '/api/supervisor/open-shifts'),
    replacements: (shiftId) => request('GET', `/api/supervisor/replacements${qs({ shift_id: shiftId })}`),
    assign: (shiftId, doctorId) => request('POST', `/api/supervisor/shifts/${shiftId}/assign`, { doctor_id: doctorId }),
    attendance: (shiftId, attendance) => request('PUT', `/api/supervisor/shifts/${shiftId}/attendance`, { attendance }),
    requests: (status) => request('GET', `/api/supervisor/requests${qs({ status })}`),
    decide: (id, body) => request('POST', `/api/supervisor/requests/${id}/decide`, body),
    availability: (date) => request('GET', `/api/supervisor/availability${qs({ date })}`),
    summary: (month) => request('GET', `/api/supervisor/summary${qs({ month })}`),
    reports: (doctorId) => request('GET', `/api/supervisor/reports${qs({ doctor_id: doctorId })}`),
    createReport: (data) => request('POST', '/api/supervisor/reports', data),
  },
};
