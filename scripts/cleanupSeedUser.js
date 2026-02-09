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
  console.error('Usage: node scripts/cleanupSeedUser.js <uid>');
  process.exit(1);
}

if (getApps().length === 0) {
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

const deleteByQuery = async (colRef, field, value) => {
  let deleted = 0;
  while (true) {
    const snap = await colRef.where(field, '==', value).limit(250).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
};

const deleteByIdPrefixes = async (colRef, prefixes) => {
  let deleted = 0;
  let lastDoc = null;
  while (true) {
    let query = colRef.orderBy('__name__').limit(250);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    const batch = db.batch();
    let batchCount = 0;
    snap.docs.forEach(docSnap => {
      const matches = prefixes.some(prefix => docSnap.id.startsWith(prefix));
      if (!matches) return;
      batch.delete(docSnap.ref);
      batchCount += 1;
    });
    if (batchCount > 0) {
      await batch.commit();
      deleted += batchCount;
    }
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  return deleted;
};

const deleteByIds = async (colRef, ids) => {
  let deleted = 0;
  for (const id of ids) {
    const ref = colRef.doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    await ref.delete();
    deleted += 1;
  }
  return deleted;
};

const deleteSubcollection = async (docRef, subcollectionName) => {
  const subRef = docRef.collection(subcollectionName);
  let deleted = 0;
  while (true) {
    const snap = await subRef.limit(250).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
};

const run = async () => {
  const baseRef = db.collection('users').doc(uid);

  const summary = {};

  const expensesRef = baseRef.collection('expenses');
  const incomesRef = baseRef.collection('incomes');
  const agendaRef = baseRef.collection('agenda');
  const yieldsRef = baseRef.collection('yields');

  summary.expenses = await deleteByIdPrefixes(expensesRef, [
    'exp_',
    'exp_extra_'
  ]);
  summary.incomes = await deleteByIdPrefixes(incomesRef, [
    'inc_',
    'inc_extra_'
  ]);
  summary.agenda = await deleteByIdPrefixes(agendaRef, ['agenda_']);

  // Fallback: remove any legacy seed docs that might still carry the marker
  summary.expensesByMarker = await deleteByQuery(expensesRef, 'createdBy', 'Seed');
  summary.incomesByMarker = await deleteByQuery(incomesRef, 'createdBy', 'Seed');
  summary.agendaByMarker = await deleteByQuery(agendaRef, 'createdBy', 'Seed');

  const seedAccountIds = [
    'acc_caixa_pj',
    'acc_pessoal',
    'acc_digital_pj',
    'acc_reserva',
    'acc_invest',
    'acc_pf_digital'
  ];
  const seedCardIds = [
    'card_visa_pj',
    'card_master_pf',
    'card_elo_pj',
    'card_amex_pj',
    'card_nubank_pf',
    'card_inter_pf',
    'card_itau_pj',
    'card_bb_pj',
    'card_santander_pf',
    'card_c6_pj'
  ];

  const accountsRef = baseRef.collection('accounts');
  const cardsRef = baseRef.collection('credit_cards');

  // Yields: remove anything tied to seed accounts or flagged as seed
  summary.yieldsByMarker = await deleteByQuery(yieldsRef, 'source', 'seed');
  summary.yieldsByAccount = 0;
  while (true) {
    const yieldByAccountSnap = await yieldsRef.where('accountId', 'in', seedAccountIds).limit(250).get();
    if (yieldByAccountSnap.empty) break;
    const batch = db.batch();
    yieldByAccountSnap.docs.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();
    summary.yieldsByAccount += yieldByAccountSnap.size;
  }

  summary.accounts = await deleteByIds(accountsRef, seedAccountIds);
  summary.credit_cards = await deleteByIds(cardsRef, seedCardIds);

  let yieldHistoryDeleted = 0;
  for (const accountId of seedAccountIds) {
    const accountRef = accountsRef.doc(accountId);
    yieldHistoryDeleted += await deleteSubcollection(accountRef, 'yieldHistory');
  }
  summary.yieldHistory = yieldHistoryDeleted;

  console.log('[cleanup-seed] done', { uid, summary });
};

run().catch(error => {
  console.error('[cleanup-seed] failed', error?.message || error);
  process.exit(1);
});
