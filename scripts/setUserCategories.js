import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const serviceAccountPath = path.join(projectRoot, 'serviceAccountKey.json');

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node scripts/setUserCategories.js <uid>');
  process.exit(1);
}

if (getApps().length === 0) {
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

const normalizeList = (items) => {
  const seen = new Set();
  const result = [];
  items.forEach((item) => {
    if (typeof item !== 'string') return;
    const normalized = item.trim().toUpperCase();
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};

const incomes = normalizeList([
  'SOCIAL MEDIA'
]);

const expenses = normalizeList([
  'COMPRAS',
  'ROUPAS',
  'Assinatura',
  'MECANICA',
  'CONSTRUÇÃO',
  'Alimentação',
  'Moradia',
  'REVELAÇÃO',
  'Imposto',
  'Empréstimo',
  'COMBUSTIVEL',
  'SEGURO CARRO',
  'FARMACIA',
  'VIAGEM'
]);

const run = async () => {
  const now = new Date().toISOString();
  await db
    .collection('users')
    .doc(uid)
    .collection('categories')
    .doc('incomes')
    .set(
      {
        type: 'incomes',
        items: incomes,
        updatedAt: now,
        updatedByUid: uid
      },
      { merge: true }
    );

  await db
    .collection('users')
    .doc(uid)
    .collection('categories')
    .doc('expenses')
    .set(
      {
        type: 'expenses',
        items: expenses,
        updatedAt: now,
        updatedByUid: uid
      },
      { merge: true }
    );

  console.log('[categories] updated', {
    uid,
    incomes: incomes.length,
    expenses: expenses.length
  });
};

run().catch(error => {
  console.error('[categories] failed', error?.message || error);
  process.exit(1);
});
