const BASE = '/api';

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, string>;
  constructor(status: number, message: string, code?: string, details?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  let url = `${BASE}${path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  // A sleeping free-tier server can take a minute to wake; beyond ~90s
  // something is genuinely wrong, so say so instead of spinning forever.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      credentials: 'include',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctl.signal,
    });
  } catch {
    throw new ApiError(0, 'The server is taking too long to respond. Please try again in a moment.', 'NETWORK');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && onUnauthorized) {
    onUnauthorized();
  }

  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, payload?.error?.message ?? res.statusText, payload?.error?.code, payload?.error?.details?.fields);
  }

  // Some endpoints reply 201 with no body (fire-and-forget creates, like a
  // public form submission) rather than echoing back the created resource.
  // res.json() throws on an empty body, so treat "no content" the same way
  // regardless of status code instead of special-casing 204 alone.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // No Content-Type here — the browser sets multipart/form-data with the right boundary.

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: form,
  });

  if (res.status === 401 && onUnauthorized) {
    onUnauthorized();
  }

  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, payload?.error?.message ?? res.statusText, payload?.error?.code, payload?.error?.details?.fields);
  }

  // Some endpoints reply 201 with no body (fire-and-forget creates, like a
  // public form submission) rather than echoing back the created resource.
  // res.json() throws on an empty body, so treat "no content" the same way
  // regardless of status code instead of special-casing 204 alone.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// Fetches a file (e.g. a CSV export) with the auth header and hands it to the
// browser as a download. A plain <a href> can't send the bearer token.
async function download(path: string, fallbackName: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${BASE}${path}`, { headers, credentials: 'include' });
  if (res.status === 401 && onUnauthorized) onUnauthorized();
  if (!res.ok) {
    let payload: any = null;
    try { payload = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, payload?.error?.message ?? res.statusText, payload?.error?.code);
  }
  const match = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = match?.[1] ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  download,
  get: <T>(path: string, query?: RequestOpts['query']) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  postForm: <T>(path: string, form: FormData) => postForm<T>(path, form),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
