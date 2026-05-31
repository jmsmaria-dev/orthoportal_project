const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export function getStoredSession() {
  const raw = localStorage.getItem('orthoschedule-session');
  return raw ? JSON.parse(raw) : null;
}

export function storeSession(session) {
  localStorage.setItem('orthoschedule-session', JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem('orthoschedule-session');
}

export async function apiRequest(path, options = {}) {
  const session = getStoredSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }

  return data;
}

export function login(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export function registerUser(payload) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function fetchProviders(search = '') {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  return apiRequest(`/providers?${params.toString()}`);
}

export function fetchAvailability(providerId, date) {
  return apiRequest(`/providers/${providerId}/availability?date=${date}`);
}

export function fetchAppointments() {
  return apiRequest('/appointments');
}

export function createAppointment(providerId, startsAt, reason) {
  return apiRequest('/appointments', {
    method: 'POST',
    body: JSON.stringify({ providerId, startsAt, reason })
  });
}

export function cancelAppointment(id) {
  return apiRequest(`/appointments/${id}`, {
    method: 'DELETE'
  });
}
