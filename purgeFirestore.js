import process from 'node:process';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'meumei-d88be';
const BATCH_SIZE = 250;

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

const purgeUsersCollection = async (db) => {
  const usersRef = db.collection('users');
  const deleted = await deleteCollectionRecursive(db, usersRef);
  console.info('[purge] deleted docs count', { collection: 'users', deleted });
  return deleted;
};

const purgeRootCollections = async (db, rootCollections) => {
  const perCollection = {};
  for (const col of rootCollections) {
    const name = col.id;
    if (name === 'users') continue;
    console.info('[purge] deleting collection', { collection: name });
    const deleted = await deleteCollectionRecursive(db, col);
    perCollection[name] = deleted;
    console.info('[purge] deleted docs count', { collection: name, deleted });
  }
  return perCollection;
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

  const startedAt = Date.now();
  const perCollection = await purgeRootCollections(db, rootCollections);
  const usersDeleted = await purgeUsersCollection(db);
  const durationMs = Date.now() - startedAt;

  console.info('[purge] done', {
    durationMs,
    perCollection,
    usersDeleted
  });
  console.info('[PURGE DONE] deleted collections', Object.keys(perCollection));
};

main().catch((error) => {
  console.error('[purge] failed', { message: error?.message || error, stack: error?.stack });
  process.exit(1);
});
