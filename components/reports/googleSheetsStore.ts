import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { guardUserPath } from '../../utils/pathGuard';

const COLLECTION_PATH = 'integrations';
const DOC_ID = 'googleSheets';
const LOCAL_STORAGE_KEY = 'meumei_primary_sheet';

export type SheetsIntegration = {
  spreadsheetId: string;
  ownerEmail?: string | null;
  updatedAt?: unknown;
};

let cached: SheetsIntegration | null = null;

const getRef = (uid: string) => doc(db, 'users', uid, COLLECTION_PATH, DOC_ID);

const readLocal = (): SheetsIntegration | null => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SheetsIntegration;
    return parsed?.spreadsheetId ? parsed : null;
  } catch {
    return null;
  }
};

const writeLocal = (integration: SheetsIntegration) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(integration));
  } catch {
    // ignore localStorage failures
  }
};

export const googleSheetsStore = {
  async load(uid: string | null | undefined) {
    if (cached) {
      return { integration: cached, source: 'cache' as const };
    }
    if (!uid) {
      return { integration: null, source: 'none' as const };
    }
    const ref = getRef(uid);
    const path = `users/${uid}/${COLLECTION_PATH}/${DOC_ID}`;
    if (!guardUserPath(uid, path, 'sheets_integration_get')) {
      return { integration: null, source: 'none' as const };
    }
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as SheetsIntegration;
        if (data?.spreadsheetId) {
          cached = data;
          writeLocal(data);
          return { integration: data, source: 'firestore' as const };
        }
      }
    } catch {
      // fallthrough to local
    }
    const local = readLocal();
    if (local?.spreadsheetId) {
      cached = local;
      return { integration: local, source: 'localStorage' as const };
    }
    return { integration: null, source: 'none' as const };
  },

  async save(uid: string | null | undefined, spreadsheetId: string) {
    const ownerEmail = auth.currentUser?.email || null;
    const integration: SheetsIntegration = {
      spreadsheetId,
      ownerEmail,
      updatedAt: serverTimestamp()
    };
    cached = integration;
    writeLocal(integration);
    if (!uid) return { integration, source: 'localStorage' as const };
    const ref = getRef(uid);
    const path = `users/${uid}/${COLLECTION_PATH}/${DOC_ID}`;
    if (!guardUserPath(uid, path, 'sheets_integration_set')) {
      return { integration, source: 'localStorage' as const };
    }
    await setDoc(ref, integration, { merge: true });
    return { integration, source: 'firestore' as const };
  },

  clearCache() {
    cached = null;
  }
};
