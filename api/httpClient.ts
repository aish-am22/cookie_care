const BASE_URL: string = (window as any).API_BASE_URL ?? '';
const LOCAL_PROXY_PREFIX = '/backend-proxy';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const resolvedPath =
    BASE_URL || !path.startsWith('/api') ? path : `${LOCAL_PROXY_PREFIX}${path}`;

  const response = await fetch(`${BASE_URL}${resolvedPath}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export { HttpError };
