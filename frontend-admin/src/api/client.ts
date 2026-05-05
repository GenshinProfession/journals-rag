const TOKEN_KEY = 'jr_access_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, {
    ...options,
    headers
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) {
    return null;
  }
  const ct = res.headers.get('content-type');
  if (!ct?.includes('application/json')) {
    return res.text();
  }
  return res.json();
}

export async function login(username: string, password: string) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  const token = data.access_token as string;
  setToken(token);
  return data;
}

export async function authMe(): Promise<{ id: string; username: string; nickname: string | null; role: string; org_id: string | null; allowed_menus: string[] }> {
  return apiFetch('/api/auth/me');
}
