import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import {
  DocumentReference,
  Firestore,
  QueryDocumentSnapshot,
  getFirestore
} from 'firebase-admin/firestore';
import { normalizeEmail } from '../utils/normalizeEmail.ts';

type OperationMode = 'dry-run' | 'apply';

interface MigrationOptions {
  sourceLicenseId: string;
  destinationLicenseId: string;
  tenantId: string;
  mode: OperationMode;
}

interface CollectionStat {
  path: string;
  docCount: number;
  totalBytes: number;
  sampleIds: string[];
}

const DEFAULT_SOURCE_LICENSE = 'T7aV-qP2r-9ZgH';
const DEFAULT_DEST_LICENSE = 'agencia.dk22@gmail.com';
const DEFAULT_TENANT_REASON = 'Migrado do login legada 1.0.1';
const ADMIN_PERMISSIONS = {
  canManageIncomes: true,
  canManageExpenses: true,
  canViewBalances: true,
  canViewMeiLimit: true,
  canViewInvoices: true,
  canViewReports: true
};

const parseArguments = (): MigrationOptions => {
  const rawArgs = process.argv.slice(2);
  const options: Partial<MigrationOptions> = {};

  for (const arg of rawArgs) {
    if (arg === '--apply') {
      options.mode = 'apply';
      continue;
    }
    if (arg.startsWith('--source=')) {
      options.sourceLicenseId = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--dest=')) {
      options.destinationLicenseId = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--tenant=')) {
      options.tenantId = arg.split('=')[1];
      continue;
    }
  }

  const mode: OperationMode = options.mode || 'dry-run';
  const sourceLicenseId = options.sourceLicenseId || DEFAULT_SOURCE_LICENSE;
  const destinationEmail = options.destinationLicenseId || DEFAULT_DEST_LICENSE;
  const normalizedDestination = normalizeEmail(destinationEmail);
  const tenantId = options.tenantId || normalizedDestination;

  return {
    sourceLicenseId,
    destinationLicenseId: normalizedDestination,
    tenantId,
    mode
  };
};

const initFirebase = () => {
  if (getApps().length > 0) return;
  initializeApp({ credential: applicationDefault() });
};

const collectStats = (
  stats: Map<string, CollectionStat>,
  path: string,
  docs: QueryDocumentSnapshot<any>[]
) => {
  if (!stats.has(path)) {
    stats.set(path, { path, docCount: 0, totalBytes: 0, sampleIds: [] });
  }
  const stat = stats.get(path);
  if (!stat) return;
  stat.docCount += docs.length;
  stat.totalBytes += docs.reduce((acc, doc) => {
    const data = doc.data() ?? {};
    return acc + Buffer.byteLength(JSON.stringify(data), 'utf8');
  }, 0);
  for (const doc of docs) {
    if (stat.sampleIds.length >= 3) break;
    stat.sampleIds.push(doc.id);
  }
};

const copyDocumentTree = async (
  db: Firestore,
  sourceRef: DocumentReference<any>,
  targetRef: DocumentReference<any>,
  mode: OperationMode,
  stats: Map<string, CollectionStat>,
  destinationLicenseId: string
) => {
  const collections = await sourceRef.listCollections();
  for (const collection of collections) {
    const snapshot = await collection.get();
    collectStats(stats, collection.path, snapshot.docs);
    const targetCollection = targetRef.collection(collection.id);
    for (const doc of snapshot.docs) {
      const payload = { ...doc.data(), licenseId: destinationLicenseId };
      if (mode === 'apply') {
        await targetCollection.doc(doc.id).set(payload, { merge: true });
      }
      await copyDocumentTree(
        db,
        doc.ref,
        targetCollection.doc(doc.id),
        mode,
        stats,
        destinationLicenseId
      );
    }
  }
};

const runMigration = async () => {
  const options = parseArguments();
  initFirebase();
  const db = getFirestore();
  const sourceDoc = db.collection('licenses').doc(options.sourceLicenseId);
  const destinationDoc = db.collection('licenses').doc(options.destinationLicenseId);

  console.log('🚀 Executando migration de licença');
  console.log(` - modo.......: ${options.mode}`);
  console.log(` - origem.....: licenses/${options.sourceLicenseId}`);
  console.log(` - destino....: licenses/${options.destinationLicenseId}`);
  console.log(` - tenantId...: ${options.tenantId}`);

  const sourceSnap = await sourceDoc.get();
  if (!sourceSnap.exists) {
    console.error(`Fonte não encontrada: licenses/${options.sourceLicenseId}`);
    process.exit(1);
  }

  const destinationSnap = await destinationDoc.get();
  const sourceData = sourceSnap.data() || {};
  const licensePayload = {
    ...sourceData,
    licenseId: options.destinationLicenseId,
    tenantId: options.tenantId
  };

  if (options.mode === 'apply') {
    await destinationDoc.set(licensePayload, { merge: true });
  } else {
    console.log(' (dry-run) Campos do documento a serem mesclados:', Object.keys(licensePayload));
  }

  const stats = new Map<string, CollectionStat>();
  await copyDocumentTree(db, sourceDoc, destinationDoc, options.mode, stats, options.destinationLicenseId);

  if (options.mode === 'apply') {
    const archivedPayload = {
      archivedAt: new Date().toISOString(),
      archivedReason: `${DEFAULT_TENANT_REASON} → ${options.destinationLicenseId}`
    };
    await sourceDoc.set(archivedPayload, { merge: true });
  } else {
    console.log(' (dry-run) O documento de origem será marcado como arquivado com os campos acima.');
  }

  if (options.mode === 'apply') {
    const tenantsRef = db.collection('tenants').doc(options.tenantId);
    await tenantsRef.set(
      {
        tenantId: options.tenantId,
        licenseId: options.destinationLicenseId,
        status: 'active',
        source: 'legacy-license-migration',
        dataRoot: `licenses/${options.destinationLicenseId}`,
        updatedAt: new Date().toISOString(),
        createdAt: destinationSnap.exists ? destinationSnap.get('createdAt') ?? new Date().toISOString() : new Date().toISOString()
      },
      { merge: true }
    );
    await tenantsRef.collection('members').doc(options.destinationLicenseId).set(
      {
        memberId: options.destinationLicenseId,
        email: options.destinationLicenseId,
        role: 'admin',
        status: 'active',
        linkedAt: new Date().toISOString(),
        permissions: ADMIN_PERMISSIONS,
        updatedAt: new Date().toISOString(),
        createdAt: destinationSnap.exists
          ? destinationSnap.get('createdAt') ?? new Date().toISOString()
          : new Date().toISOString()
      },
      { merge: true }
    );
  }

  const preferencesSourceRef = db.collection('userPreferences').doc(options.destinationLicenseId);
  const preferencesSnapshot = await preferencesSourceRef.get();
  if (preferencesSnapshot.exists) {
    const preferencesPayload = {
      ...preferencesSnapshot.data(),
      licenseId: options.destinationLicenseId,
      migratedFrom: 'userPreferences-root',
      migratedAt: new Date().toISOString()
    };
    if (options.mode === 'apply') {
      await destinationDoc.collection('preferences').doc('ui').set(preferencesPayload, {
        merge: true
      });
    } else {
      console.log(
        ` (dry-run) O documento userPreferences/${options.destinationLicenseId} será copiado para licenses/${options.destinationLicenseId}/preferences/ui`
      );
    }
  }

  if (options.mode === 'apply') {
    const entitlementRef = db.collection('entitlements').doc(options.destinationLicenseId);
    await entitlementRef.set(
      {
        email: options.destinationLicenseId,
        tenantId: options.tenantId,
        licenseId: options.destinationLicenseId,
        migratedFromLicenseId: options.sourceLicenseId,
        source: 'migration-script',
        status: 'active',
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
  } else {
    console.log(
      ` (dry-run) entitlements/${options.destinationLicenseId} será atualizado com tenantId=${options.tenantId}`
    );
  }

  console.log('\n📊 Subcoleções analisadas:');
  const sortedStats = Array.from(stats.values()).sort((a, b) => a.path.localeCompare(b.path));
  for (const stat of sortedStats) {
    console.log(` • ${stat.path}`);
    console.log(`    - documentos: ${stat.docCount}`);
    console.log(`    - tamanho aproximado: ${Math.round(stat.totalBytes / 1024)} KB`);
    console.log(`    - exemplos de IDs: ${stat.sampleIds.join(', ') || '---'}`);
  }

  console.log('\n✅ Resumo da migração:');
  console.log(
    ` - Licença de destino ${options.mode === 'apply' ? 'atualizada' : 'calculada'} em licenses/${options.destinationLicenseId}`
  );
  console.log(
    ` - Fonte ${options.mode === 'apply' ? 'arquivada' : 'marcada como arquivável'} em licenses/${options.sourceLicenseId}`
  );
  console.log(
    ` - Entitlement ${options.destinationLicenseId} ${options.mode === 'apply' ? 'atualizado' : 'será atualizado'}`
  );
  if (preferencesSnapshot.exists) {
    console.log(` - Preferências movidas para licenses/${options.destinationLicenseId}/preferences/ui`);
  } else {
    console.log(' - Nenhum documento de preferências legadas encontrado (userPreferences).');
  }

  console.log('\n📋 Checklist manual para confirmar no console do Firestore:');
  console.log(
    `  1. Verifique licenses/${options.destinationLicenseId} possui companyInfo, flags e licenseId com o e-mail DK (mantém os objetos originais).`
  );
  console.log(
    `  2. Confirme que cada subcoleção (accounts, incomes, expenses, invoices, credit_cards) foi recriada sob licenses/${options.destinationLicenseId}.`
  );
  console.log(
    `  3. Confirme licenses/${options.destinationLicenseId}/preferences/ui contém o theme e timestamps do userPreferences original.`
  );
  console.log(
    `  4. Confira entitlements/${options.destinationLicenseId} foi atualizado com tenantId=${options.tenantId} e migratedFromLicenseId=${options.sourceLicenseId}.`
  );
  console.log('  5. Confirme que nenhum dado financeiro foi perdido.');

  console.log('\nA migração terminou.');
  process.exit(0);
};

runMigration().catch(error => {
  console.error('❌ Erro durante a migração:', error);
  process.exit(1);
});
