import { GATEWAY_URL } from '../config';

/** Error thrown for non-2xx responses (and other request failures). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    // Restore prototype chain (TS targeting older runtimes / extending Error).
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// Module-level auth token holder.
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

interface RequestOpts {
  auth?: boolean;
  signal?: AbortSignal;
}

/** Pull a human-readable message out of an error envelope ({error:string|string[]}). */
function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === 'string') return err;
    if (Array.isArray(err)) return err.join(', ');
  }
  return fallback;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  opts: RequestOpts & { hasBody: boolean },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.hasBody) headers['Content-Type'] = 'application/json';
  if (opts.auth && authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(GATEWAY_URL + path, {
    method,
    headers,
    body: opts.hasBody ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  });

  if (!res.ok) {
    const parsed = await parseBody(res);
    throw new ApiError(
      res.status,
      messageFromBody(parsed, `${res.status} ${res.statusText}`),
      parsed,
    );
  }

  return (await parseBody(res)) as T;
}

export function apiGet<T>(path: string, opts?: RequestOpts): Promise<T> {
  return request<T>('GET', path, undefined, {
    auth: opts?.auth,
    signal: opts?.signal,
    hasBody: false,
  });
}

export function apiSend<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { auth?: boolean },
): Promise<T> {
  return request<T>(method, path, body, {
    auth: opts?.auth,
    hasBody: body !== undefined,
  });
}

/** Tile template URL with LITERAL {z}/{x}/{y} placeholders for MapLibre. */
export function tileTemplateUrl(prefix: string, ext: string): string {
  return `${GATEWAY_URL}/tiles/${prefix}/{z}/{x}/{y}.${ext}`;
}
