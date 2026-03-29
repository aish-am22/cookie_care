const API_BASE = '/backend-proxy';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  role: 'USER' | 'ADMIN';
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface MeResponse {
  id: string;
  email: string;
  fullName: string | null;
  role: 'USER' | 'ADMIN';
  isEmailVerified: boolean;
  createdAt: string;
}

async function authRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // required for httpOnly cookie
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({ error: res.statusText }));

  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed: ${res.status}`);
  }

  return data as T;
}

export const authApi = {
  register(payload: { email: string; password: string; fullName?: string }) {
    return authRequest<{ id: string; email: string; fullName: string | null; role: string }>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(payload) }
    );
  },

  login(payload: { email: string; password: string }) {
    return authRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  refresh() {
    return authRequest<{ accessToken: string }>('/api/auth/refresh', {
      method: 'POST',
    });
  },

  logout() {
    return authRequest<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  },

  me(accessToken: string) {
    return authRequest<MeResponse>('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
};
