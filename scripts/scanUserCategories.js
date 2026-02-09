import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const serviceAccountPath = path.join(projectRoot, 'serviceAccountKey.json');

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node scripts/scanUserCategories.js <uid>');
  process.exit(1);
}

if (getApps().length === 0) {
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

const collectCategories = async (collectionName) => {
  const colRef = db.collection('users').doc(uid).collection(collectionName);
  const counts = new Map();
  let scanned = 0;
  let lastDoc = null;

  while (true) {
    let query = colRef.orderBy(FieldPath.documentId()).limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    snap.docs.forEach(docSnap => {
      scanned += 1;
      const data = docSnap.data();
      const raw = typeof data.category === 'string' ? data.category.trim() : '';
      if (!raw) return;
      const key = raw.toLowerCase();
      const prev = counts.get(key) || { label: raw, count: 0 };
      counts.set(key, { label: prev.label || raw, count: prev.count + 1 });
    });

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  const list = Array.from(counts.values()).sort((a, b) => b.count - a.count);
  return { scanned, list };
};

const run = async () => {
  const expenses = await collectCategories('expenses');
  const incomes = await collectCategories('incomes');

  console.log('[scan] uid', uid);
  console.log('[scan] expenses scanned', expenses.scanned);
  console.log('[scan] incomes scanned', incomes.scanned);

  console.log('\n[scan] expense categories (top -> bottom):');
  expenses.list.forEach(item => {
    console.log(`- ${item.label} (${item.count})`);
  });

  console.log('\n[scan] income categories (top -> bottom):');
  incomes.list.forEach(item => {
    console.log(`- ${item.label} (${item.count})`);
  });

  console.log('\n[scan] totals', {
    expenseCategories: expenses.list.length,
    incomeCategories: incomes.list.length
  });
};

run().catch(error => {
  console.error('[scan] failed', error?.message || error);
  process.exit(1);
});
