/** Calls the Geet API (docs/15) with the Clerk session token. Errors carry the API's plain-words message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const base = () => {
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  )
    return '';
  return (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
};

export interface CallOptions {
  method?: 'GET' | 'PATCH' | 'PUT' | 'POST' | 'DELETE';
  body?: unknown;
  /** Resolves a session token, or null for a guest call. */
  token?: () => Promise<string | null>;
  signal?: AbortSignal;
}

export async function callApi<T>(
  path: string,
  { method = 'GET', body, token, signal }: CallOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const jwt = token ? await token() : null;
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network', "Can't reach Geet. Check your connection.");
  }
  const data = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok)
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'server_error',
      data?.error?.message ?? 'Something went wrong. Try again.',
    );
  return data as T;
}
