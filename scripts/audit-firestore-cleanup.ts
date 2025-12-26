import fs from 'node:fs';
import path from 'node:path';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

type CollectionAudit = {
  name: string;
  count: number;
  category: 'preserve' | 'remove' | 'unknown';
};

type LicenseAudit = {
  licenseId: string;
  collections: CollectionAudit[];
  removePaths: string[];
  unknownCollections: string[];
};

const PRESERVE_COLLECTIONS = new Set([
  'accounts',
  'credit_cards',
  'expenses',
  'incomes',
  'invoices'
]);

const REMOVE_COLLECTIONS = new Set([
  'users',
  'members',
  'preferences'
]);

const DELETE_MODE = process.env.DELETE === 'true';
const REPORT_PATH = path.join(process.cwd(), 'AUDIT_FIRESTORE_CLEANUP.md');

const initFirebase = () => {
  if (getApps().length > 0) return;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(svc) });
    return;
  }
  const localKeyPath = path.join(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(localKeyPath)) {
    const svc = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
    initializeApp({ credential: cert(svc) });
    return;
  }
  initializeApp({ credential: applicationDefault() });
};

const classifyCollection = (name: string): 'preserve' | 'remove' | 'unknown' => {
  if (PRESERVE_COLLECTIONS.has(name)) return 'preserve';
  if (REMOVE_COLLECTIONS.has(name)) return 'remove';
  return 'unknown';
};

const writeReport = (licenses: LicenseAudit[], totals: Record<string, number>) => {
  const lines: string[] = [];
  lines.push(`# Firestore Cleanup Audit`);
  lines.push('');
  lines.push(`- Date: ${new Date().toISOString()}`);
  lines.push(`- Mode: ${DELETE_MODE ? 'DELETE' : 'DRY_RUN'}`);
  lines.push('');
  lines.push(`## Licenses Found`);
  licenses.forEach(({ licenseId }) => {
    lines.push(`- ${licenseId}`);
  });
  lines.push('');
  lines.push(`## Collections by License`);
  licenses.forEach(({ licenseId, collections }) => {
    lines.push(`### ${licenseId}`);
    collections.forEach((col) => {
      lines.push(`- ${col.name}: ${col.count} (${col.category})`);
    });
    lines.push('');
  });
  lines.push(`## Candidate Removal Paths`);
  licenses.forEach(({ licenseId, removePaths }) => {
    lines.push(`### ${licenseId}`);
    if (removePaths.length === 0) {
      lines.push('- (none)');
      return;
    }
    removePaths.forEach((path) => lines.push(`- ${path}`));
    lines.push('');
  });
  lines.push(`## Unknown Collections (manual review)`);
  licenses.forEach(({ licenseId, unknownCollections }) => {
    lines.push(`### ${licenseId}`);
    if (unknownCollections.length === 0) {
      lines.push('- (none)');
      return;
    }
    unknownCollections.forEach((name) => lines.push(`- ${name}`));
    lines.push('');
  });
  lines.push(`## Totals`);
  Object.entries(totals).forEach(([key, value]) => {
    lines.push(`- ${key}: ${value}`);
  });
  lines.push('');
  lines.push(
    `NÃO serão tocadas accounts/credit_cards/expenses/incomes/invoices.`
  );
  lines.push('');

  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
};

const run = async () => {
  initFirebase();
  const db = getFirestore();

  const licenseRefs = await db.collection('licenses').listDocuments();
  const audits: LicenseAudit[] = [];
  const totals: Record<string, number> = {
    licenses: licenseRefs.length,
    removeDocs: 0,
    unknownCollections: 0
  };

  for (const licenseRef of licenseRefs) {
    const licenseId = licenseRef.id;
    const subcollections = await licenseRef.listCollections();
    const collections: CollectionAudit[] = [];
    const removePaths: string[] = [];
    const unknownCollections: string[] = [];

    for (const subcol of subcollections) {
      const docs = await subcol.listDocuments();
      const category = classifyCollection(subcol.id);
      collections.push({ name: subcol.id, count: docs.length, category });
      if (category === 'remove') {
        removePaths.push(...docs.map((docRef) => docRef.path));
        totals.removeDocs += docs.length;
      } else if (category === 'unknown') {
        unknownCollections.push(subcol.id);
        totals.unknownCollections += 1;
      }
    }

    audits.push({
      licenseId,
      collections,
      removePaths,
      unknownCollections
    });
  }

  writeReport(audits, totals);

  console.log('[audit] dry_run=', !DELETE_MODE);
  console.log('[audit] licenses=', totals.licenses);
  console.log('[audit] remove_docs=', totals.removeDocs);
  console.log('[audit] unknown_collections=', totals.unknownCollections);
  console.log(`[audit] report=${REPORT_PATH}`);

  if (!DELETE_MODE) {
    console.log('[audit] DELETE=false => nenhuma remoção executada.');
    return;
  }

  console.log('[audit] DELETE=true => iniciando remoção segura...');
  for (const license of audits) {
    for (const docPath of license.removePaths) {
      console.log('[delete] removing', docPath);
      await db.recursiveDelete(db.doc(docPath));
    }
  }
  console.log('[audit] remoção concluída.');
};

run().catch((error) => {
  console.error('[audit] error', error);
  process.exit(1);
});
