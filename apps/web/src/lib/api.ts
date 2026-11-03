import type { User } from './types';

/** Error thrown for any non-2xx response, carrying the API's machine-readable code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface SessionResponse {
  user: User;
  accessToken: string;
}

/**
 * The access token lives only in memory (a module variable), never in localStorage,
 * so a script injected into the page cannot steal it from storage. On a page reload it
 * is gone, and the httpOnly refresh cookie is used to get a new one.
 */
let accessToken: string | null = null;
let onSessionLost: () => void = () => {};

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function onSessionExpired(callback: () => void) {
  onSessionLost = callback;
}

let refreshInFlight: Promise<User | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. "Single flight": if several
 * requests get a 401 at the same time, they all wait for ONE refresh call instead of
 * each starting their own (which would trip the server's token-reuse detection).
 */
export function refreshSession(): Promise<User | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      // 204 = no session cookie (anonymous visitor); 401 = session expired or revoked.
      if (response.status === 204 || !response.ok) {
        setAccessToken(null);
        return null;
      }
      const data = (await response.json()) as SessionResponse;
      setAccessToken(data.accessToken);
      return data.user;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No se pudo conectar con el servidor. Revisá tu conexión.',
    );
  }

  // Access token expired: refresh once and replay the original request.
  if (response.status === 401 && accessToken && !retried && !path.startsWith('/auth/')) {
    const user = await refreshSession();
    if (user) return request<T>(method, path, body, true);
    onSessionLost();
  }

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      translateError(error?.code, error?.message),
      error?.details,
    );
  }
  return data as T;
}

/**
 * The API speaks English (it is consumed by developers); the UI speaks Spanish.
 * Known error codes get a friendly Spanish message; anything else falls back to the API text.
 */
const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_TAKEN: 'Ya existe una cuenta con ese email.',
  UNAUTHORIZED: 'Email o contraseña incorrectos.',
  SLOT_TAKEN: 'Alguien acaba de reservar ese horario. Elegí otro, por favor.',
  SLOT_UNAVAILABLE: 'Ese horario ya no está disponible. Elegí otro, por favor.',
  TOO_LATE_TO_CHANGE: 'Ya pasó el plazo para cambiar este turno. Contactá al profesional.',
  NOT_CHANGEABLE: 'Este turno ya no se puede modificar.',
  SERVICE_IN_USE:
    'Este servicio tiene turnos asociados. Desactivalo para que no se pueda reservar más.',
  OVERLAPPING_HOURS: 'Hay rangos horarios superpuestos en el mismo día.',
  SLUG_TAKEN: 'Ese link público ya está en uso. Probá con otro.',
  NOT_STARTED: 'Solo podés marcar la asistencia cuando el turno ya empezó.',
  ALREADY_FINAL: 'Este turno ya fue cerrado.',
  TOO_MANY_REQUESTS: 'Demasiados intentos. Esperá unos minutos y volvé a probar.',
  VALIDATION_ERROR: 'Revisá los datos ingresados.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Probá de nuevo en unos minutos.',
};

function translateError(code: string | undefined, fallback: string | undefined): string {
  return (code && ERROR_MESSAGES[code]) || fallback || 'Ocurrió un error inesperado.';
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};

export type { SessionResponse };
