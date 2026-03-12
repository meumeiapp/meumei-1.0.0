import { auth } from './firebase';

type ApiResponse<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  message?: string;
};

type CaptureSessionStatus = 'pending' | 'captured' | 'consumed' | 'expired';

export type ProfilePhotoCaptureSession = {
  sessionId: string;
  sessionToken?: string;
  status: CaptureSessionStatus;
  expiresAtMs: number | null;
  photoDataUrl: string | null;
};

const request = async <T>(
  path: string,
  payload: Record<string, unknown>,
  options?: { withAuth?: boolean }
): Promise<ApiResponse<T>> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const withAuth = options?.withAuth !== false;
  if (withAuth && auth.currentUser) {
    const token = await auth.currentUser.getIdToken(true);
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.error || 'request_failed',
      message: data?.message || 'Não foi possível concluir a solicitação.'
    };
  }

  return {
    ok: true,
    status: response.status,
    data
  };
};

const normalizeSessionPayload = (value: unknown): ProfilePhotoCaptureSession | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const sessionId = String(raw.sessionId || '').trim();
  const statusRaw = String(raw.status || 'pending').trim().toLowerCase();
  const status: CaptureSessionStatus =
    statusRaw === 'captured' || statusRaw === 'consumed' || statusRaw === 'expired'
      ? statusRaw
      : 'pending';
  if (!sessionId) return null;
  const expiresAtMs =
    typeof raw.expiresAtMs === 'number' && Number.isFinite(raw.expiresAtMs)
      ? raw.expiresAtMs
      : null;
  return {
    sessionId,
    sessionToken: raw.sessionToken ? String(raw.sessionToken) : undefined,
    status,
    expiresAtMs,
    photoDataUrl: raw.photoDataUrl ? String(raw.photoDataUrl) : null
  };
};

export const profilePhotoCaptureService = {
  async createSession(targetName?: string) {
    const response = await request<{ session?: unknown }>(
      '/api/createProfilePhotoCaptureSession',
      { targetName: String(targetName || '').trim() },
      { withAuth: true }
    );
    if (!response.ok) {
      return response as ApiResponse<{ session: ProfilePhotoCaptureSession | null }>;
    }
    return {
      ...response,
      data: {
        session: normalizeSessionPayload((response.data as any)?.session)
      }
    } as ApiResponse<{ session: ProfilePhotoCaptureSession | null }>;
  },

  async getSession(sessionId: string) {
    const response = await request<{ session?: unknown }>(
      '/api/getProfilePhotoCaptureSession',
      { sessionId },
      { withAuth: true }
    );
    if (!response.ok) {
      return response as ApiResponse<{ session: ProfilePhotoCaptureSession | null }>;
    }
    return {
      ...response,
      data: {
        session: normalizeSessionPayload((response.data as any)?.session)
      }
    } as ApiResponse<{ session: ProfilePhotoCaptureSession | null }>;
  },

  async consumeSession(sessionId: string) {
    return request('/api/consumeProfilePhotoCaptureSession', { sessionId }, { withAuth: true });
  },

  async submitCapturedPhoto(payload: { sessionId: string; sessionToken: string; photoDataUrl: string }) {
    return request('/api/submitProfilePhotoCapture', payload, { withAuth: false });
  }
};

