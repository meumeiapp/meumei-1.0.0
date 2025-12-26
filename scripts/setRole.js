// Upsert a role document for a user without touching legacy collections.
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const serviceAccountPath = path.join(projectRoot, 'serviceAccountKey.json');

const normalizeEmail = (email) => email.trim().toLowerCase();

const main = async () => {
  const emailArg = process.argv[2];
  const roleArg = process.argv[3];
  if (!emailArg || !roleArg) {
    console.error('Usage: node scripts/setRole.js user@example.com admin|collaborator');
    process.exit(1);
  }
  const normalizedEmail = normalizeEmail(emailArg);
  const role = roleArg.toLowerCase();
  if (!['admin', 'collaborator'].includes(role)) {
    console.error('Role must be "admin" or "collaborator"');
    process.exit(1);
  }

  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({ credential: cert(serviceAccount) });
  }

  const db = getFirestore();
  const ref = db.collection('roles').doc(normalizedEmail);
  await ref.set(
    {
      email: normalizedEmail,
      role,
      source: 'manual',
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log(`Role upserted: roles/${normalizedEmail} = ${role}`);
};

main().catch((err) => {
  console.error('Failed to set role:', err?.message || err);
  process.exit(1);
});
