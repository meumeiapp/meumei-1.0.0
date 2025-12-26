import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { normalizeEmail } from '../utils/normalizeEmail';

export type CategoryType = 'incomes' | 'expenses';

const MAX_CATEGORIES = 50;

const buildCategoryRef = (licenseId: string, type: CategoryType) =>
  doc(db, 'licenses', licenseId, 'categories', type);

const normalizeCategoryName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ');

const normalizeCategoryKey = (name: string): string =>
  normalizeCategoryName(name).toLowerCase();

const sanitizeCategoryList = (items: unknown[]): { items: string[]; limited: boolean } => {
  const result: string[] = [];
  const seen = new Set<string>();
  let limited = false;

  for (const raw of items) {
    if (typeof raw !== 'string') continue;
    const normalized = normalizeCategoryName(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    if (result.length >= MAX_CATEGORIES) {
      limited = true;
      break;
    }
    seen.add(key);
    result.push(normalized);
  }

  return { items: result, limited };
};

const getActorInfo = () => {
  const current = auth.currentUser;
  let emailNormalized = '';
  if (current?.email) {
    try {
      emailNormalized = normalizeEmail(current.email);
    } catch {
      emailNormalized = current.email.trim().toLowerCase();
    }
  }
  return {
    uid: current?.uid || '',
    emailNormalized
  };
};

export const categoryService = {
  normalizeCategoryName,
  sanitizeCategoryList,

  async loadCategories(licenseId: string, type: CategoryType): Promise<string[]> {
    const { uid, emailNormalized } = getActorInfo();
    const ref = buildCategoryRef(licenseId, type);
    const path = ref.path;
    const docId = ref.id;
    console.info('[categories] load_start', { licenseId, type, uid, emailNormalized, path, docId });
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        console.info('[categories] load_ok', {
          licenseId,
          type,
          uid,
          emailNormalized,
          path,
          docId,
          status: 'no_doc',
          count: 0,
          itemsPreview: []
        });
        return [];
      }
      const rawItems = (snap.data()?.items as unknown[]) || [];
      const sanitized = sanitizeCategoryList(rawItems);
      console.info('[categories] load_ok', {
        licenseId,
        type,
        uid,
        emailNormalized,
        path,
        docId,
        status: 'exists',
        count: sanitized.items.length,
        itemsPreview: sanitized.items.slice(0, 5)
      });
      return sanitized.items;
    } catch (error: any) {
      console.error('[categories] load_err', {
        licenseId,
        type,
        uid,
        emailNormalized,
        path,
        docId,
        code: error?.code,
        message: error?.message || error,
        stack: error?.stack
      });
      throw error;
    }
  },

  async ensureDefaultCategories(licenseId: string, type: CategoryType, defaults: string[]) {
    const { uid, emailNormalized } = getActorInfo();
    const ref = buildCategoryRef(licenseId, type);
    const path = ref.path;
    const docId = ref.id;
    console.info('[categories] ensure_defaults_start', { licenseId, type, uid, emailNormalized, path, docId });
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        console.info('[categories] ensure_defaults_ok', {
          licenseId,
          type,
          uid,
          emailNormalized,
          path,
          docId,
          status: 'skip_existing'
        });
        return;
      }
      const sanitized = sanitizeCategoryList(defaults);
      await setDoc(
        ref,
        {
          type,
          items: sanitized.items,
          updatedAt: serverTimestamp(),
          updatedByUid: uid || null,
          updatedByEmailNormalized: emailNormalized || null
        },
        { merge: true }
      );
      console.info('[categories] ensure_defaults_ok', {
        licenseId,
        type,
        uid,
        emailNormalized,
        path,
        docId,
        count: sanitized.items.length
      });
    } catch (error: any) {
      console.error('[categories] ensure_defaults_err', {
        licenseId,
        type,
        uid,
        emailNormalized,
        path,
        docId,
        code: error?.code,
        message: error?.message || error,
        stack: error?.stack
      });
      throw error;
    }
  },

  async addCategory(licenseId: string, type: CategoryType, name: string) {
    const { uid, emailNormalized } = getActorInfo();
    const normalized = normalizeCategoryName(name);
    if (!licenseId || !type) {
      console.warn('[categories] add_blocked', {
        reason: 'license_or_type_missing',
        licenseId,
        type,
        uid,
        emailNormalized
      });
      return;
    }
    if (!normalized) {
      console.warn('[categories] add_blocked', {
        reason: 'empty_name',
        licenseId,
        type,
        uid,
        emailNormalized
      });
      return;
    }
    const ref = buildCategoryRef(licenseId, type);
    const path = ref.path;
    const docId = ref.id;
    console.info('[categories] add_start', { licenseId, type, uid, emailNormalized, path, docId, name: normalized });
    try {
      const snap = await getDoc(ref);
      const current = snap.exists() ? ((snap.data()?.items as unknown[]) || []) : [];
      const sanitized = sanitizeCategoryList(current);
      const key = normalizeCategoryKey(normalized);
      if (sanitized.items.some(item => normalizeCategoryKey(item) === key)) {
        console.info('[categories] add_ok', { licenseId, type, uid, emailNormalized, path, docId, skipped: 'duplicate' });
        return;
      }
      if (sanitized.items.length >= MAX_CATEGORIES) {
        console.warn('[categories] add_err', { licenseId, type, uid, emailNormalized, path, docId, reason: 'limit_reached' });
        throw new Error('Limite de categorias atingido.');
      }
      const next = [...sanitized.items, normalized];
      await setDoc(
        ref,
        {
          type,
          items: next,
          updatedAt: serverTimestamp(),
          updatedByUid: uid || null,
          updatedByEmailNormalized: emailNormalized || null
        },
        { merge: true }
      );
      console.info('[categories] add_ok', { licenseId, type, uid, emailNormalized, path, docId, count: next.length });
    } catch (error: any) {
      console.error('[categories] add_err', {
        licenseId,
        type,
        uid,
        emailNormalized,
        path,
        docId,
        code: error?.code,
        message: error?.message || error,
        stack: error?.stack
      });
      throw error;
    }
  },

  async removeCategory(licenseId: string, type: CategoryType, name: string) {
    const { uid, emailNormalized } = getActorInfo();
    const normalized = normalizeCategoryName(name);
    if (!licenseId || !type) {
      console.warn('[categories] remove_blocked', {
        reason: 'license_or_type_missing',
        licenseId,
        type,
        uid,
        emailNormalized
      });
      return;
    }
    if (!normalized) {
      console.warn('[categories] remove_blocked', {
        reason: 'empty_name',
        licenseId,
        type,
        uid,
        emailNormalized
      });
      return;
    }
    const ref = buildCategoryRef(licenseId, type);
    const path = ref.path;
    const docId = ref.id;
    console.info('[categories] remove_start', {
      licenseId,
      type,
      uid,
      emailNormalized,
      path,
      docId,
      nameNormalized: normalized
    });
    try {
      let beforeCount = 0;
      let afterCount = 0;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) {
          beforeCount = 0;
          afterCount = 0;
          return;
        }
        const current = (snap.data()?.items as unknown[]) || [];
        const sanitized = sanitizeCategoryList(current);
        const key = normalizeCategoryKey(normalized);
        beforeCount = sanitized.items.length;
        const next = sanitized.items.filter(item => normalizeCategoryKey(item) !== key);
        afterCount = next.length;
        tx.set(
          ref,
          {
            type,
            items: next,
            updatedAt: serverTimestamp(),
            updatedByUid: uid || null,
            updatedByEmailNormalized: emailNormalized || null
          },
          { merge: true }
        );
      });
      console.info('[categories] remove_ok', {
        licenseId,
        type,
        uid,
        emailNormalized,
        path,
        docId,
        beforeCount,
        afterCount,
        removed: normalized
      });
    } catch (error: any) {
      console.error('[categories] remove_err', {
        licenseId,
        type,
        uid,
        emailNormalized,
        path,
        docId,
        code: error?.code,
        message: error?.message || error,
        stack: error?.stack
      });
      throw error;
    }
  }
};
