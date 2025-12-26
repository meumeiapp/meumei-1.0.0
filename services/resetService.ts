import { collection, getDocs, limit, query, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

export type ResetResult = {
  totalDeleted: number;
  perCollection: Record<string, number>;
};

const BATCH_SIZE = 250;

const toSegments = (path: string) => path.split('/').filter(Boolean);

const getCollectionRef = (path: string) => collection(db, ...toSegments(path));

const deleteCollectionDocs = async (path: string): Promise<number> => {
  let deleted = 0;
  while (true) {
    const snap = await getDocs(query(getCollectionRef(path), limit(BATCH_SIZE)));
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snap.docs.length;
  }
  return deleted;
};

const listDocIds = async (path: string): Promise<string[]> => {
  const snap = await getDocs(getCollectionRef(path));
  return snap.docs.map(docSnap => docSnap.id);
};

export const resetTenantData = async (licenseId: string): Promise<ResetResult> => {
  if (!licenseId) {
    throw new Error('licenseId obrigatório para reset.');
  }

  const collections = [
    'accounts',
    'yields',
    'expenses',
    'incomes',
    'categories',
    'auditLogs',
    'credit_cards',
    'cards',
    'members',
    'invites',
    'invoices',
    'preferences',
    'users'
  ];

  const perCollection: Record<string, number> = {};
  let totalDeleted = 0;

  const accountsPath = `licenses/${licenseId}/accounts`;
  const accountIds = await listDocIds(accountsPath);
  for (const accountId of accountIds) {
    const yieldHistoryPath = `licenses/${licenseId}/accounts/${accountId}/yieldHistory`;
    const deleted = await deleteCollectionDocs(yieldHistoryPath);
    if (deleted > 0) {
      perCollection[`accounts/${accountId}/yieldHistory`] = deleted;
      totalDeleted += deleted;
      console.info('[reset] deleted', { collection: yieldHistoryPath, deleted });
    }
  }

  for (const collectionName of collections) {
    const path = `licenses/${licenseId}/${collectionName}`;
    const deleted = await deleteCollectionDocs(path);
    perCollection[collectionName] = deleted;
    totalDeleted += deleted;
    console.info('[reset] deleted', { collection: path, deleted });
  }

  return { totalDeleted, perCollection };
};
