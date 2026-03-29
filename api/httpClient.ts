const BASE_URL: string = (window as any).API_BASE_URL ?? '';
const LOCAL_PROXY_PREFIX = '/backend-proxy';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

// Token storage (in-memory only for security)
let _accessToken: string | null = null;
let _refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// Callback to handle unauthenticated state (set by AuthContext)
let _onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  _onUnauthorized = handler;
}

async function doRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${LOCAL_PROXY_PREFIX}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const token = data?.accessToken ?? null;
    if (token) setAccessToken(token);
    return token;
  } catch {
    return null;
  }
}

function getRefreshToken(): Promise<string | null> {
  if (!_refreshPromise) {
    _refreshPromise = doRefresh().finally(() => {
      _refreshPromise = null;
    });
  }
  return _refreshPromise;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const resolvedPath =
    BASE_URL || !path.startsWith('/api') ? path : `${LOCAL_PROXY_PREFIX}${path}`;

  const buildHeaders = (token: string | null): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const doFetch = (token: string | null) =>
    fetch(`${BASE_URL}${resolvedPath}`, {
      method,
      credentials: 'include',
      headers: buildHeaders(token),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let response = await doFetch(_accessToken);

  // On 401, attempt a silent token refresh and retry once
  if (response.status === 401) {
    const newToken = await getRefreshToken();
    if (newToken) {
      response = await doFetch(newToken);
    } else {
      _onUnauthorized?.();
      throw new HttpError(401, 'Session expired. Please sign in again.');
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({ error: response.statusText }));

  if (!response.ok) {
    throw new HttpError(response.status, data?.error ?? `Request failed: ${response.status}`);
  }

  return data as T;
}

export const httpClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export { HttpError };
