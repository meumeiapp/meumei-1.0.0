// Bootstrap entitlement doc for beta 1.0.2 without touching legacy collections.
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const serviceAccountPath = path.join(projectRoot, 'serviceAccountKey.json');

const normalizeEmail = (email) => email.trim().toLowerCase();

const bootstrap = async () => {
  const inputEmail = process.argv[2];
  if (!inputEmail) {
    console.error('Usage: node scripts/createEntitlement.js user@example.com');
    process.exit(1);
  }

  const normalizedEmail = normalizeEmail(inputEmail);

  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount)
    });
  }

  const db = getFirestore();
  const docRef = db.collection('entitlements').doc(normalizedEmail);

  const snap = await docRef.get();
  const now = FieldValue.serverTimestamp();

  const payload = {
    email: normalizedEmail,
    tenantId: normalizedEmail,
    status: 'active',
    plan: 'beta',
    source: 'manual',
    appVersionCreated: '1.0.2-beta',
    updatedAt: now
  };

  if (!snap.exists || !snap.data()?.createdAt) {
    payload.createdAt = now;
  }

  await docRef.set(payload, { merge: true });

  console.log(`Entitlement upserted for ${normalizedEmail} in entitlements/${normalizedEmail}`);
};

bootstrap().catch((err) => {
  console.error('Failed to create entitlement:', err?.message || err);
  process.exit(1);
});
