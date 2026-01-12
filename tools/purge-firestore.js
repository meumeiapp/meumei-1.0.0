import process from 'node:process';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BATCH_SIZE = 250;
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'meumei-d88be';

const deleteCollectionRecursive = async (db, colRef) => {
  let deleted = 0;
  while (true) {
    const snap = await colRef.limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const docSnap of snap.docs) {
      const subcols = await docSnap.ref.listCollections();
      for (const subcol of subcols) {
        deleted += await deleteCollectionRecursive(db, subcol);
      }
      batch.delete(docSnap.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
};

const main = async () => {
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID
  });
  const db = getFirestore(app);

  console.info('[purge] projectId', {
    projectId: app.options.projectId || PROJECT_ID || 'unknown'
  });

  const rootCollections = await db.listCollections();
  const rootNames = rootCollections.map(col => col.id);
  console.info('[purge] rootCollections detected', { collections: rootNames });

  const willDelete = rootNames.filter(name => {
    if (name === 'users') return false;
    return true;
  });

  console.info('[purge] willDelete list', { collections: willDelete });

  if (!willDelete.length) {
    console.info('[purge] nothing to delete');
    return;
  }

  const startedAt = Date.now();
  const perCollection = {};

  for (const collectionName of willDelete) {
    const colRef = db.collection(collectionName);
    console.info('[purge] deleting collection', { collection: collectionName });
    const deleted = await deleteCollectionRecursive(db, colRef);
    perCollection[collectionName] = deleted;
    console.info('[purge] deleted docs count', { collection: collectionName, deleted });
  }

  const durationMs = Date.now() - startedAt;
  console.info('[purge] done', { durationMs, perCollection });
  console.info('[PURGE DONE] deleted collections', Object.keys(perCollection));
};

main().catch((error) => {
  console.error('[purge] failed', { message: error?.message || error, stack: error?.stack });
  process.exit(1);
});
