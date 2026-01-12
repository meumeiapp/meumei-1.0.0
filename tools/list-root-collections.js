import process from 'node:process';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'meumei-d88be';
const SAMPLE_LIMIT = 20;

const main = async () => {
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID
  });
  const db = getFirestore(app);

  console.info('[inspect] projectId', {
    projectId: app.options.projectId || PROJECT_ID || 'unknown'
  });

  const rootCollections = await db.listCollections();
  const rootNames = rootCollections.map(col => col.id);
  console.info('[inspect] rootCollections', { collections: rootNames });

  for (const col of rootCollections) {
    const snap = await col.limit(SAMPLE_LIMIT).get();
    const sampleIds = snap.docs.slice(0, 3).map(doc => doc.id);
    console.info('[inspect] collection', {
      name: col.id,
      sampleCount: snap.size,
      sampleLimit: SAMPLE_LIMIT,
      sampleIds,
      hasMore: snap.size === SAMPLE_LIMIT
    });
  }
};

main().catch((error) => {
  console.error('[inspect] failed', { message: error?.message || error, stack: error?.stack });
  process.exit(1);
});
