import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { guardUserPath } from '../utils/pathGuard';

export type ResetUserSummary = {
  deletedDocsCount: number;
  deletedCollectionsCount: number;
  perCollection: Record<string, number>;
  durationMs: number;
};

const BATCH_SIZE = 250;

const toSegments = (path: string) => path.split('/').filter(Boolean);

const getCollectionRef = (path: string) => collection(db, ...toSegments(path));

const listDocIds = async (path: string): Promise<string[]> => {
  const snap = await getDocs(getCollectionRef(path));
  return snap.docs.map(docSnap => docSnap.id);
};

const deleteCollectionDocsWithLog = async (
  path: string,
  options?: { logPrefix?: string; sampleLimit?: number }
): Promise<number> => {
  let deleted = 0;
  let logged = 0;
  const sampleLimit = options?.sampleLimit ?? 8;
  const logPrefix = options?.logPrefix ?? '[reset] delete:doc';
  while (true) {
    const snap = await getDocs(query(getCollectionRef(path), limit(BATCH_SIZE)));
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => {
      batch.delete(docSnap.ref);
      if (logged < sampleLimit) {
        console.info(logPrefix, { path, docId: docSnap.id });
        logged += 1;
      }
    });
    await batch.commit();
    deleted += snap.docs.length;
  }
  return deleted;
};

const logResetError = (step: string, path: string, error: unknown) => {
  console.error('[reset] error', {
    step,
    path,
    message: (error as any)?.message || error
  });
};

const deleteDocIfExists = async (path: string): Promise<boolean> => {
  const ref = doc(db, ...toSegments(path));
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  await deleteDoc(ref);
  console.info('[reset] delete:doc', { path });
  return true;
};

const resetUserTree = async (
  uid: string,
  options: { label: 'user' | 'tenant'; includeGoals?: boolean }
): Promise<ResetUserSummary> => {
  if (!uid) {
    throw new Error('uid obrigatório para reset.');
  }
  const startedAt = Date.now();
  let deletedDocsCount = 0;
  let deletedCollectionsCount = 0;
  const perCollection: Record<string, number> = {};

  const addCollectionResult = (path: string, count: number) => {
    perCollection[path] = count;
    if (count > 0) {
      deletedCollectionsCount += 1;
      deletedDocsCount += count;
    }
  };

  const deleteCollection = async (path: string) => {
    try {
      if (!guardUserPath(uid, path, 'reset_delete_collection')) return;
      const deleted = await deleteCollectionDocsWithLog(path);
      addCollectionResult(path, deleted);
      console.info('[reset] delete:collection', { path, count: deleted });
    } catch (error) {
      logResetError('delete_collection', path, error);
      throw error;
    }
  };

  const deleteDocPath = async (path: string) => {
    try {
      if (!guardUserPath(uid, path, 'reset_delete_doc')) return;
      const existed = await deleteDocIfExists(path);
      if (existed) {
        deletedDocsCount += 1;
      }
    } catch (error) {
      logResetError('delete_doc', path, error);
      throw error;
    }
  };

  const userCollections = [
    'accounts',
    'expenses',
    'incomes',
    'transfers',
    'invoices',
    'yields',
    'credit_cards',
    'cards',
    'categories',
    'auditLogs',
    'preferences',
    'settings',
    'reports',
    'goals',
    'budgets'
  ];

  const accountsPath = `users/${uid}/accounts`;
  let accountIds: string[] = [];
  try {
    if (!guardUserPath(uid, accountsPath, 'reset_list_accounts')) {
      return { deletedDocsCount, deletedCollectionsCount, perCollection, durationMs: Date.now() - startedAt };
    }
    accountIds = await listDocIds(accountsPath);
  } catch (error) {
    logResetError('list_docs', accountsPath, error);
    throw error;
  }
  for (const accountId of accountIds) {
    const yieldHistoryPath = `users/${uid}/accounts/${accountId}/yieldHistory`;
    if (!guardUserPath(uid, yieldHistoryPath, 'reset_delete_yield_history')) {
      continue;
    }
    const deleted = await deleteCollectionDocsWithLog(yieldHistoryPath);
    addCollectionResult(yieldHistoryPath, deleted);
    console.info('[reset] delete:collection', { path: yieldHistoryPath, count: deleted });
  }

  for (const collectionName of userCollections) {
    await deleteCollection(`users/${uid}/${collectionName}`);
  }

  await deleteDocPath(`users/${uid}`);
  if (options.includeGoals) {
    await deleteDocPath(`userGoals/${uid}`);
  }

  const durationMs = Date.now() - startedAt;
  console.info('[reset] summary', { scope: options.label, deletedDocsCount, deletedCollectionsCount, durationMs });
  return { deletedDocsCount, deletedCollectionsCount, perCollection, durationMs };
};

export const resetCurrentUserData = async (uid: string): Promise<ResetUserSummary> => {
  console.info('[reset] user', { uid, status: 'start' });
  const summary = await resetUserTree(uid, { label: 'user', includeGoals: true });
  console.info('[reset] user', { uid, status: 'ok' });
  return summary;
};

export const resetCurrentTenantData = async (
  uid: string,
  licenseId: string | null | undefined,
  allowTenantReset: boolean
): Promise<ResetUserSummary | null> => {
  if (!licenseId) return null;
  if (!allowTenantReset) {
    console.info('[reset] tenant', { uid, licenseId, status: 'blocked', reason: 'permission_denied' });
    return null;
  }
  if (licenseId === uid) {
    console.info('[reset] tenant', { uid, licenseId, status: 'allowed', action: 'skipped_same_uid' });
    return null;
  }
  console.info('[reset] tenant', { uid, licenseId, status: 'allowed', action: 'start' });
  const summary = await resetUserTree(licenseId, { label: 'tenant', includeGoals: false });
  console.info('[reset] tenant', { uid, licenseId, status: 'allowed', action: 'ok' });
  return summary;
};

export const resetCurrentSession = async (params: {
  uid: string;
  licenseId?: string | null;
  allowTenantReset: boolean;
}) => {
  const { uid, licenseId, allowTenantReset } = params;
  console.info('[reset] session', { uid, licenseId: licenseId || null });
  const userSummary = await resetCurrentUserData(uid);
  const tenantSummary = await resetCurrentTenantData(uid, licenseId, allowTenantReset);
  console.info('[reset] done', {
    uid,
    licenseId: licenseId || null,
    user: userSummary,
    tenant: tenantSummary
  });
  return { userSummary, tenantSummary };
};
