const DEFAULT_TTL_MS = 55 * 60 * 1000;

type DriveSession = {
  token: string;
  expiresAt: number;
};

let session: DriveSession | null = null;

const now = () => Date.now();

export const driveSessionManager = {
  getToken() {
    if (!session) return null;
    if (session.expiresAt && now() >= session.expiresAt) {
      session = null;
      return null;
    }
    return session;
  },
  setToken(token: string, expiresAt?: number | null) {
    const safeExpiry = typeof expiresAt === 'number' && Number.isFinite(expiresAt)
      ? expiresAt
      : now() + DEFAULT_TTL_MS;
    session = { token, expiresAt: safeExpiry };
    return session;
  },
  clear() {
    session = null;
  }
};
