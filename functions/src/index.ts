import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { VertexAI } from '@google-cloud/vertexai';
import nodemailer from 'nodemailer';
import Stripe from 'stripe';

admin.initializeApp();

const resolveProjectId = () => {
  const direct = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (direct) return direct;
  try {
    const parsed = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
    return typeof parsed.projectId === 'string' ? parsed.projectId : '';
  } catch (error) {
    return '';
  }
};

const PROJECT_ID = resolveProjectId();
const VERTEX_LOCATION = (process.env.VERTEX_LOCATION || 'us-central1').trim();
const VERTEX_MODEL = (process.env.VERTEX_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash')
  .trim();
const vertexAI = PROJECT_ID ? new VertexAI({ project: PROJECT_ID, location: VERTEX_LOCATION }) : null;
const DAILY_TIP_TIMEZONE = 'America/Sao_Paulo';
const MASTER_UID = 'ZbrLdQuqn4MlOK16MjBOr6GZM3l1';
const MASTER_EMAIL = 'meumeiaplicativo@gmail.com';

const runtimeConfig = (() => {
  try {
    return typeof functions.config === 'function' ? functions.config() : {};
  } catch {
    return {};
  }
})();

const refundConfig = runtimeConfig.refund || {};
const stripeConfig = runtimeConfig.stripe || {};
const emailConfig = runtimeConfig.email || {};

const resolveConfigValue = (envKey: string, configKey: string, fallback = '') => {
  const direct = (process.env[envKey] || '').trim();
  if (direct) return direct;
  return typeof refundConfig[configKey] === 'string' ? refundConfig[configKey] : fallback;
};

const SMTP_HOST = resolveConfigValue('REFUND_SMTP_HOST', 'smtp_host', '');
const SMTP_PORT = Number(resolveConfigValue('REFUND_SMTP_PORT', 'smtp_port', '587'));
const SMTP_USER = resolveConfigValue('REFUND_SMTP_USER', 'smtp_user', '');
const SMTP_PASS = resolveConfigValue('REFUND_SMTP_PASS', 'smtp_pass', '');
const DEFAULT_FROM_EMAIL =
  (process.env.EMAIL_FROM || (emailConfig.from as string) || '').trim();
const REFUND_FROM_EMAIL = resolveConfigValue(
  'REFUND_SMTP_FROM',
  'smtp_from',
  DEFAULT_FROM_EMAIL || SMTP_USER
);
const REFUND_TO_EMAIL = resolveConfigValue('REFUND_SMTP_TO', 'smtp_to', 'meumeiaplicativo@gmail.com');
const SMTP_SECURE =
  resolveConfigValue('REFUND_SMTP_SECURE', 'smtp_secure', '').toLowerCase() === 'true' ||
  SMTP_PORT === 465;

const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || (stripeConfig.secret_key as string) || '').trim();

const getStripeClient = () => {
  if (!STRIPE_SECRET_KEY) return null;
  return new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
};

const getRefundTransport = () => {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
};

const sendRefundEmail = async (
  payload: { name: string; email: string },
  subject: string,
  text: string,
  userSubject?: string,
  userText?: string
) => {
  const transport = getRefundTransport();
  if (!transport || !REFUND_FROM_EMAIL) return false;

  const userSubjectResolved = userSubject || 'Recebemos sua solicitação de reembolso';
  const userTextResolved =
    userText ||
    'Recebemos sua solicitação de reembolso. Nossa equipe irá analisar e responder em breve.\n\nSe precisar complementar alguma informação, responda este e-mail.';

  try {
    await transport.sendMail({
      from: REFUND_FROM_EMAIL,
      to: REFUND_TO_EMAIL,
      replyTo: payload.email,
      subject,
      text
    });
    await transport.sendMail({
      from: REFUND_FROM_EMAIL,
      to: payload.email,
      subject: userSubjectResolved,
      text: userTextResolved
    });
    return true;
  } catch (error) {
    console.error('[refund] email_error', error);
    return false;
  }
};

const sendTrialEmail = async (payload: { email: string; code: string; loginUrl: string }) => {
  const transport = getRefundTransport();
  if (!transport || !REFUND_FROM_EMAIL) return false;
  const subject = 'Sua chave de teste do meumei (7 dias)';
  const text = `Olá!\n\nSua chave de teste do meumei (7 dias) é:\n${payload.code}\n\nAcesse o login por aqui:\n${payload.loginUrl}\n\nSe você não solicitou este teste, ignore este e-mail.\n\nEquipe meumei.`;
  try {
    await transport.sendMail({
      from: REFUND_FROM_EMAIL,
      to: payload.email,
      subject,
      text
    });
    return true;
  } catch (error) {
    console.error('[trial] email_error', error);
    return false;
  }
};

const sendLifetimeAccessEmail = async (payload: { email: string; loginUrl: string }) => {
  const transport = getRefundTransport();
  if (!transport || !REFUND_FROM_EMAIL) return false;
  const subject = 'Parabéns! Seu acesso vitalício ao meumei foi liberado';
  const text =
    `Olá!\n\n` +
    `Parabéns! Seu acesso vitalício ao meumei foi liberado.\n` +
    `Você já pode entrar normalmente com seu e-mail e senha.\n\n` +
    `Acesse o login por aqui:\n${payload.loginUrl}\n\n` +
    `Equipe meumei.`;
  try {
    await transport.sendMail({
      from: REFUND_FROM_EMAIL,
      to: payload.email,
      subject,
      text
    });
    return true;
  } catch (error) {
    console.error('[lifetime] email_error', error);
    return false;
  }
};

const applyCors = (req: functions.https.Request, res: functions.Response<any>) => {
  const origin = (req.headers.origin as string) || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
};

const BETA_KEY_COLLECTION = 'beta_keys';
const USER_FEEDBACK_COLLECTION = 'feedback_messages';
const TRIAL_DURATION_DAYS = 7;

const parseRequestBody = (req: functions.https.Request) => {
  if (req.body && typeof req.body === 'object') {
    return (req.body as any).data || req.body;
  }
  return {};
};

const parseBearerToken = (req: functions.https.Request) => {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const requireAuth = async (req: functions.https.Request, res: functions.Response<any>) => {
  const token = parseBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, message: 'Auth ausente.' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email || '' };
  } catch (error) {
    res.status(401).json({ ok: false, message: 'Auth inválida.' });
    return null;
  }
};

const requireAdmin = async (req: functions.https.Request, res: functions.Response<any>) => {
  const auth = await requireAuth(req, res);
  if (!auth) return null;
  const normalizedEmail = auth.email.trim().toLowerCase();
  const isMaster =
    auth.uid === MASTER_UID || (normalizedEmail && normalizedEmail === MASTER_EMAIL);
  if (!isMaster) {
    res.status(403).json({ ok: false, message: 'Permissão negada.' });
    return null;
  }
  return auth;
};

const normalizeBetaEmail = (value: string) => value.trim().toLowerCase();
const normalizeBetaCode = (value: string) => value.trim().toUpperCase();
const isValidEmail = (value: string) => /.+@.+\..+/.test(value.trim());
const BATCH_CHUNK_SIZE = 450;
const BETA_KEY_FALLBACK_SCAN_LIMIT = 1500;
const ADMIN_AUDIT_COLLECTION = 'admin_entitlement_audit';

type AdminGrantPlan = 'lifetime' | 'annual' | 'monthly' | 'days';
type AdminBulkAction = 'assign_plan' | 'revoke_access';

type EntitlementSummary = {
  exists: boolean;
  email: string;
  status: string;
  planType: string;
  source: string;
  lifetime: boolean;
  expiresAtMs: number | null;
  subscriptionCurrentPeriodEndMs: number | null;
  updatedAtMs: number | null;
  data: FirebaseFirestore.DocumentData | null;
};

type BetaKeyMatch = {
  id: string;
  code: string;
  requestedEmail: string | null;
  lifetimeGrantedEmail: string | null;
  source: string;
  uses: number;
  maxUses: number;
  isActive: boolean;
};

type BetaKeyCleanupResult = {
  matchedBetaKeys: number;
  deletedBetaKeys: number;
  betaKeyIds: string[];
  betaKeys: BetaKeyMatch[];
  betaKeySnapshots: Array<{ id: string; data: FirebaseFirestore.DocumentData }>;
};

const ADMIN_GRANT_PLANS = new Set<AdminGrantPlan>(['lifetime', 'annual', 'monthly', 'days']);
const ADMIN_BULK_ACTIONS = new Set<AdminBulkAction>(['assign_plan', 'revoke_access']);
const MEMBERSHIP_COLLECTION = 'memberships';
const MEMBER_SUBCOLLECTION = 'members';
const MEMBER_EMAIL_REGEX = /.+@.+\..+/;
const MEMBER_PHOTO_DATA_URL_REGEX = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i;
const MEMBER_PHOTO_MAX_LENGTH = 350_000;
const PROFILE_PHOTO_CAPTURE_COLLECTION = 'profile_photo_capture_sessions';
const PROFILE_PHOTO_CAPTURE_TTL_MS = 10 * 60 * 1000;
const PROFILE_PHOTO_CAPTURE_TOKEN_BYTES = 24;

type MemberRole = 'owner' | 'admin' | 'employee';
const MEMBER_ROLES = new Set<MemberRole>(['owner', 'admin', 'employee']);

const MEMBER_PERMISSION_KEYS = [
  'dashboard',
  'launches',
  'accounts',
  'incomes',
  'expenses',
  'yields',
  'invoices',
  'reports',
  'das',
  'agenda',
  'audit',
  'settings'
] as const;

type MemberPermissionKey = (typeof MEMBER_PERMISSION_KEYS)[number];
type MemberPermissions = Record<MemberPermissionKey, boolean>;

type ActorScope = {
  uid: string;
  email: string;
  name: string;
  licenseId: string;
  role: MemberRole;
  active: boolean;
  permissions: MemberPermissions;
};

const createMemberPermissions = (value: boolean): MemberPermissions => {
  const permissions = {} as MemberPermissions;
  MEMBER_PERMISSION_KEYS.forEach((key) => {
    permissions[key] = value;
  });
  return permissions;
};

const defaultMemberPermissionsForRole = (role: MemberRole): MemberPermissions => {
  if (role === 'owner' || role === 'admin') {
    return createMemberPermissions(true);
  }
  const permissions = createMemberPermissions(false);
  (['dashboard', 'launches', 'incomes', 'expenses', 'reports', 'agenda'] as MemberPermissionKey[]).forEach((key) => {
    permissions[key] = true;
  });
  return permissions;
};

const normalizeMemberRole = (value: any, fallback: MemberRole = 'employee'): MemberRole => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'owner' || normalized === 'admin' || normalized === 'employee') {
    return normalized;
  }
  return fallback;
};

const normalizeMemberPermissions = (value: any, role: MemberRole): MemberPermissions => {
  if (role === 'owner' || role === 'admin') {
    return createMemberPermissions(true);
  }

  const fallback = defaultMemberPermissionsForRole(role);
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const source = value as Partial<Record<MemberPermissionKey, unknown>>;
  const normalized = {} as MemberPermissions;
  MEMBER_PERMISSION_KEYS.forEach((key) => {
    normalized[key] = source[key] === true;
  });
  return normalized;
};

const canManageMembers = (role: MemberRole) => role === 'owner';

const resolveActorScope = async (auth: { uid: string; email: string }): Promise<ActorScope> => {
  const db = admin.firestore();
  const membershipSnap = await db.collection(MEMBERSHIP_COLLECTION).doc(auth.uid).get();
  const normalizedEmail = String(auth.email || '').trim().toLowerCase();
  if (!membershipSnap.exists) {
    return {
      uid: auth.uid,
      email: normalizedEmail,
      name: normalizedEmail || auth.uid,
      licenseId: auth.uid,
      role: 'owner',
      active: true,
      permissions: createMemberPermissions(true)
    };
  }

  const data = membershipSnap.data() || {};
  const role = normalizeMemberRole(data.role, 'employee');
  const email = String(data.email || normalizedEmail).trim().toLowerCase();
  const name = String(data.name || '').trim() || email || auth.uid;
  const licenseId = String(data.licenseId || '').trim() || auth.uid;
  const active = data.active !== false;
  const permissions = normalizeMemberPermissions(data.permissions, role);

  return {
    uid: auth.uid,
    email,
    name,
    licenseId,
    role,
    active,
    permissions
  };
};

const serializeMemberRecord = (uid: string, data: FirebaseFirestore.DocumentData): Record<string, unknown> => {
  const role = normalizeMemberRole(data.role, 'employee');
  const resolvedUid = String(data.uid || uid || '')
    .trim() || uid;
  return {
    uid: resolvedUid,
    licenseId: String(data.licenseId || '').trim(),
    name: String(data.name || '').trim() || 'Membro',
    email: String(data.email || '').trim().toLowerCase(),
    photoDataUrl: data.photoDataUrl ? String(data.photoDataUrl) : null,
    role,
    active: data.active !== false,
    permissions: normalizeMemberPermissions(data.permissions, role),
    createdAtMs: toMs(data.createdAt),
    updatedAtMs: toMs(data.updatedAt),
    disabledAtMs: toMs(data.disabledAt),
    lastLoginAtMs: toMs(data.lastLoginAt),
    createdByUid: data.createdByUid ? String(data.createdByUid) : null,
    createdByEmail: data.createdByEmail ? String(data.createdByEmail) : null
  };
};

const toMs = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return null;
};

const normalizeTextLoose = (value: any) => String(value || '').trim().toLowerCase();

const normalizeMemberPhotoDataUrl = (value: any): string | null => {
  if (value === undefined) return null;
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length > MEMBER_PHOTO_MAX_LENGTH) {
    throw new Error('photo_too_large');
  }
  if (!MEMBER_PHOTO_DATA_URL_REGEX.test(raw)) {
    throw new Error('photo_invalid_format');
  }
  return raw;
};

const normalizeCaptureSessionId = (value: any) => {
  const sessionId = String(value || '').trim();
  if (!sessionId || sessionId.includes('/')) return '';
  return sessionId;
};

const createProfileCaptureToken = () =>
  crypto.randomBytes(PROFILE_PHOTO_CAPTURE_TOKEN_BYTES).toString('hex');

const hashProfileCaptureToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

const safeCompareProfileCaptureHash = (expectedHash: string, providedToken: string) => {
  const normalizedHash = String(expectedHash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedHash)) return false;
  const providedHash = hashProfileCaptureToken(String(providedToken || '').trim());
  const expectedBuffer = Buffer.from(normalizedHash, 'hex');
  const providedBuffer = Buffer.from(providedHash, 'hex');
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

const isAuthUserNotFoundError = (error: any) =>
  String(error?.code || '')
    .toLowerCase()
    .includes('user-not-found');

const isAuthEmailAlreadyExistsError = (error: any) =>
  String(error?.code || '')
    .toLowerCase()
    .includes('email-already-exists');

const isAuthPasswordInvalidError = (error: any) => {
  const code = String(error?.code || '').toLowerCase();
  return code.includes('invalid-password') || code.includes('weak-password');
};

type RelatedMemberDocs = {
  docs: FirebaseFirestore.QueryDocumentSnapshot[];
  refs: FirebaseFirestore.DocumentReference[];
  allDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  primaryDoc: FirebaseFirestore.QueryDocumentSnapshot | null;
  resolvedMemberUid: string;
  relatedUids: string[];
  relatedEmails: string[];
};

const collectRelatedMemberDocs = async (
  membersRef: FirebaseFirestore.CollectionReference,
  requestedMemberUid: string
): Promise<RelatedMemberDocs> => {
  const normalizedRequestedUid = String(requestedMemberUid || '').trim();
  const allMembersSnap = await membersRef.limit(1000).get();
  const allDocs = allMembersSnap.docs;

  const selectedDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  const relatedUids = new Set<string>();
  const relatedEmails = new Set<string>();

  const addDoc = (docSnap: FirebaseFirestore.QueryDocumentSnapshot): boolean => {
    if (selectedDocs.has(docSnap.ref.path)) return false;
    selectedDocs.set(docSnap.ref.path, docSnap);
    const data = docSnap.data() || {};
    const docId = String(docSnap.id || '').trim();
    const dataUid = String(data.uid || '').trim();
    if (docId && !docId.includes('/')) relatedUids.add(docId);
    if (dataUid && !dataUid.includes('/')) relatedUids.add(dataUid);
    const normalizedEmail = normalizeTextLoose(data.emailNormalized || data.email);
    if (normalizedEmail) relatedEmails.add(normalizedEmail);
    return true;
  };

  allDocs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const docId = String(docSnap.id || '').trim();
    const dataUid = String(data.uid || '').trim();
    if (docId === normalizedRequestedUid || dataUid === normalizedRequestedUid) {
      addDoc(docSnap);
    }
  });

  if (selectedDocs.size === 0) {
    return {
      docs: [],
      refs: [],
      allDocs,
      primaryDoc: null,
      resolvedMemberUid: normalizedRequestedUid,
      relatedUids: [],
      relatedEmails: []
    };
  }

  let changed = true;
  while (changed) {
    changed = false;
    allDocs.forEach((docSnap) => {
      if (selectedDocs.has(docSnap.ref.path)) return;
      const data = docSnap.data() || {};
      const docId = String(docSnap.id || '').trim();
      const dataUid = String(data.uid || '').trim();
      const normalizedEmail = normalizeTextLoose(data.emailNormalized || data.email);
      const shouldInclude =
        (docId && relatedUids.has(docId)) ||
        (dataUid && relatedUids.has(dataUid)) ||
        (normalizedEmail && relatedEmails.has(normalizedEmail));
      if (shouldInclude && addDoc(docSnap)) {
        changed = true;
      }
    });
  }

  const selectedList = Array.from(selectedDocs.values());
  const primaryDoc =
    selectedList.find((docSnap) => String(docSnap.id || '').trim() === normalizedRequestedUid) ||
    selectedList.find((docSnap) => String((docSnap.data() || {}).uid || '').trim() === normalizedRequestedUid) ||
    selectedList[0] ||
    null;

  const primaryData = primaryDoc?.data() || {};
  const resolvedMemberUid =
    String(primaryData.uid || '').trim() ||
    String(primaryDoc?.id || '').trim() ||
    Array.from(relatedUids).find((uid) => uid && !uid.includes('/')) ||
    normalizedRequestedUid;

  return {
    docs: selectedList,
    refs: selectedList.map((docSnap) => docSnap.ref),
    allDocs,
    primaryDoc,
    resolvedMemberUid,
    relatedUids: Array.from(relatedUids),
    relatedEmails: Array.from(relatedEmails)
  };
};

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const deleteDocumentRefs = async (refs: FirebaseFirestore.DocumentReference[]) => {
  if (refs.length === 0) return;
  const db = admin.firestore();
  const chunks = chunkArray(refs, BATCH_CHUNK_SIZE);
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

const serializeBetaKeyMatch = (
  docSnap: FirebaseFirestore.DocumentSnapshot
): BetaKeyMatch => {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    code: String(data.code || ''),
    requestedEmail: data.requestedEmail ? normalizeBetaEmail(String(data.requestedEmail)) : null,
    lifetimeGrantedEmail: data.lifetimeGrantedEmail
      ? normalizeBetaEmail(String(data.lifetimeGrantedEmail))
      : null,
    source: String(data.source || ''),
    uses: Number(data.uses || 0),
    maxUses: Number(data.maxUses || 0),
    isActive: data.isActive !== false
  };
};

const getEntitlementSummary = (
  email: string,
  data: FirebaseFirestore.DocumentData | null,
  exists: boolean
): EntitlementSummary => {
  const normalizedEmail = normalizeBetaEmail(email);
  const source = String(data?.source || '');
  const planType = String(data?.planType || '');
  return {
    exists,
    email: normalizedEmail,
    status: String(data?.status || ''),
    planType,
    source,
    lifetime: Boolean(data?.lifetime) || planType.toLowerCase() === 'lifetime',
    expiresAtMs: toMs(data?.expiresAt),
    subscriptionCurrentPeriodEndMs: toMs(
      data?.subscriptionCurrentPeriodEnd ?? data?.subscriptionCurrentPeriodEndMs ?? null
    ),
    updatedAtMs: toMs(data?.updatedAt),
    data: data ? { ...data } : null
  };
};

const getEntitlementSummaryByEmail = async (email: string): Promise<EntitlementSummary> => {
  const normalizedEmail = normalizeBetaEmail(email);
  const snap = await admin.firestore().collection('entitlements').doc(normalizedEmail).get();
  const data = snap.exists ? snap.data() || null : null;
  return getEntitlementSummary(normalizedEmail, data, snap.exists);
};

const findBetaKeysForCleanup = async (params: {
  email?: string | null;
  keyId?: string | null;
  code?: string | null;
}) => {
  const db = admin.firestore();
  const docsById = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  const email = normalizeBetaEmail(String(params.email || ''));
  const keyId = String(params.keyId || '').trim();
  const codeRaw = String(params.code || '').trim();
  const code = codeRaw ? normalizeBetaCode(codeRaw) : '';

  const addDoc = (docSnap: FirebaseFirestore.DocumentSnapshot | null | undefined) => {
    if (!docSnap || !docSnap.exists) return;
    docsById.set(docSnap.id, docSnap);
  };

  if (keyId) {
    const keySnap = await db.collection(BETA_KEY_COLLECTION).doc(keyId).get();
    addDoc(keySnap);
  }

  const queryPromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
  if (email && isValidEmail(email)) {
    queryPromises.push(
      db.collection(BETA_KEY_COLLECTION).where('requestedEmail', '==', email).limit(200).get()
    );
    queryPromises.push(
      db.collection(BETA_KEY_COLLECTION).where('lifetimeGrantedEmail', '==', email).limit(200).get()
    );
  }
  if (code) {
    queryPromises.push(db.collection(BETA_KEY_COLLECTION).where('code', '==', code).limit(50).get());
  }

  const querySnaps = await Promise.all(queryPromises);
  querySnaps.forEach((querySnap) => {
    querySnap.docs.forEach((docSnap) => addDoc(docSnap));
  });

  // Fallback scan: cobre legados com espaços/case diferentes e garante consistência.
  if (docsById.size === 0 && (email || keyId || code)) {
    const scanSnap = await db.collection(BETA_KEY_COLLECTION).limit(BETA_KEY_FALLBACK_SCAN_LIMIT).get();
    scanSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const requestedEmail = normalizeTextLoose(data.requestedEmail);
      const lifetimeGrantedEmail = normalizeTextLoose(data.lifetimeGrantedEmail);
      const docCode = normalizeBetaCode(String(data.code || ''));
      const matchedById = Boolean(keyId) && docSnap.id === keyId;
      const matchedByEmail = Boolean(email) && (requestedEmail === email || lifetimeGrantedEmail === email);
      const matchedByCode = Boolean(code) && docCode === code;
      if (matchedById || matchedByEmail || matchedByCode) {
        addDoc(docSnap);
      }
    });
  }

  const docs = Array.from(docsById.values());
  const refs = docs.map((docSnap) => docSnap.ref);
  const betaKeys = docs.map((docSnap) => serializeBetaKeyMatch(docSnap));
  const betaKeySnapshots = docs.map((docSnap) => ({
    id: docSnap.id,
    data: { ...(docSnap.data() || {}) }
  }));
  return { refs, betaKeys, betaKeySnapshots };
};

const cleanupBetaKeys = async (
  params: {
    email?: string | null;
    keyId?: string | null;
    code?: string | null;
  },
  options?: { dryRun?: boolean }
): Promise<BetaKeyCleanupResult> => {
  const dryRun = options?.dryRun === true;
  const found = await findBetaKeysForCleanup(params);
  if (!dryRun) {
    await deleteDocumentRefs(found.refs);
  }
  const matchedBetaKeys = found.refs.length;
  return {
    matchedBetaKeys,
    deletedBetaKeys: dryRun ? 0 : matchedBetaKeys,
    betaKeyIds: found.betaKeys.map((entry) => entry.id),
    betaKeys: found.betaKeys,
    betaKeySnapshots: found.betaKeySnapshots
  };
};

const resolveAdminPlanWindow = (
  plan: AdminGrantPlan,
  durationDaysRaw: number
): { durationDays: number | null; expiresAtMs: number | null; expiresAt: FirebaseFirestore.Timestamp | null } => {
  const nowMs = Date.now();
  let durationDays: number | null = null;
  if (plan === 'annual') {
    durationDays = 365;
  } else if (plan === 'monthly') {
    durationDays = 30;
  } else if (plan === 'days') {
    durationDays = Math.min(3650, Math.max(1, Math.floor(durationDaysRaw)));
  }
  const expiresAtMs = durationDays ? nowMs + durationDays * DAY_MS : null;
  const expiresAt = expiresAtMs ? admin.firestore.Timestamp.fromMillis(expiresAtMs) : null;
  return { durationDays, expiresAtMs, expiresAt };
};

const parseEmailList = (raw: unknown): string[] => {
  const values: string[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      values.push(String(item || ''));
    });
  } else if (typeof raw === 'string') {
    values.push(...raw.split(/[\n,; ]+/g));
  } else if (raw !== null && raw !== undefined) {
    values.push(String(raw));
  }
  const normalized = values
    .map((item) => normalizeBetaEmail(item))
    .filter((item) => Boolean(item) && isValidEmail(item));
  return Array.from(new Set(normalized));
};

const writeAdminEntitlementAudit = async (payload: {
  actionType: string;
  targetEmail?: string | null;
  actorUid: string;
  actorEmail?: string | null;
  requestedPlan?: string | null;
  requestedDurationDays?: number | null;
  keyId?: string | null;
  code?: string | null;
  beforeState?: EntitlementSummary | null;
  afterState?: EntitlementSummary | null;
  cleanup?: BetaKeyCleanupResult | null;
  rollbackAvailable?: boolean;
  rollbackOfActionId?: string | null;
  batchId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  const db = admin.firestore();
  const ref = db.collection(ADMIN_AUDIT_COLLECTION).doc();
  const cleanup = payload.cleanup || null;
  const storedSnapshots = cleanup ? cleanup.betaKeySnapshots.slice(0, 20) : [];
  await ref.set({
    actionType: payload.actionType,
    targetEmail: payload.targetEmail ? normalizeBetaEmail(payload.targetEmail) : null,
    actorUid: payload.actorUid,
    actorEmail: payload.actorEmail ? normalizeBetaEmail(payload.actorEmail) : null,
    requestedPlan: payload.requestedPlan || null,
    requestedDurationDays:
      typeof payload.requestedDurationDays === 'number' ? payload.requestedDurationDays : null,
    keyId: payload.keyId || null,
    code: payload.code ? normalizeBetaCode(payload.code) : null,
    beforeState: payload.beforeState || null,
    beforeData: payload.beforeState?.data || null,
    afterState: payload.afterState || null,
    afterData: payload.afterState?.data || null,
    cleanupSummary: cleanup
      ? {
          matchedBetaKeys: cleanup.matchedBetaKeys,
          deletedBetaKeys: cleanup.deletedBetaKeys,
          betaKeyIds: cleanup.betaKeyIds
        }
      : null,
    restorableDeletedBetaKeys: storedSnapshots,
    restorableDeletedBetaKeysTruncated: cleanup ? cleanup.betaKeySnapshots.length > 20 : false,
    rollbackAvailable: payload.rollbackAvailable !== false,
    rolledBackAt: null,
    rolledBackBy: null,
    rollbackOfActionId: payload.rollbackOfActionId || null,
    batchId: payload.batchId || null,
    metadata: payload.metadata || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
};

const compactEntitlementState = (state: any) => {
  if (!state || typeof state !== 'object') return null;
  const { data, ...rest } = state as Record<string, unknown>;
  return rest;
};

const serializeAuditDoc = (docSnap: FirebaseFirestore.DocumentSnapshot) => {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    actionType: String(data.actionType || ''),
    targetEmail: data.targetEmail || null,
    actorUid: data.actorUid || null,
    actorEmail: data.actorEmail || null,
    requestedPlan: data.requestedPlan || null,
    requestedDurationDays:
      typeof data.requestedDurationDays === 'number' ? data.requestedDurationDays : null,
    keyId: data.keyId || null,
    code: data.code || null,
    beforeState: compactEntitlementState(data.beforeState || null),
    afterState: compactEntitlementState(data.afterState || null),
    cleanupSummary: data.cleanupSummary || null,
    rollbackAvailable: data.rollbackAvailable !== false,
    rolledBackAtMs: toMs(data.rolledBackAt),
    rolledBackBy: data.rolledBackBy || null,
    rollbackOfActionId: data.rollbackOfActionId || null,
    batchId: data.batchId || null,
    createdAtMs: toMs(data.createdAt)
  };
};

const generateBetaCode = () => {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MEUMEI-${part()}-${part()}`;
};

const ensureUniqueBetaCode = async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateBetaCode();
    const existing = await admin
      .firestore()
      .collection(BETA_KEY_COLLECTION)
      .where('code', '==', code)
      .limit(1)
      .get();
    if (existing.empty) return code;
  }
  return generateBetaCode();
};

const serializeBetaKey = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
  const data = doc.data() || {};
  const toMs = (value: any) => {
    if (!value) return null;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return null;
  };
  return {
    id: doc.id,
    code: String(data.code || ''),
    durationDays: Number(data.durationDays || 0),
    maxUses: Number(data.maxUses || 0),
    uses: Number(data.uses || 0),
    isActive: data.isActive !== false,
    source: String(data.source || ''),
    requestedEmail: data.requestedEmail || null,
    createdAtMs: toMs(data.createdAt),
    expiresAtMs: toMs(data.expiresAt),
    lastUsedAtMs: toMs(data.lastUsedAt),
    lastRequestedAtMs: toMs(data.lastRequestedAt),
    revokedAtMs: toMs(data.revokedAt),
    lifetimeGrantedEmail: data.lifetimeGrantedEmail || null,
    lifetimeGrantedAtMs: toMs(data.lifetimeGrantedAt)
  };
};

const serializeEntitlement = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
  const data = doc.data() || {};
  const subscriptionRaw =
    data.subscriptionCurrentPeriodEnd ?? data.subscriptionCurrentPeriodEndMs ?? null;
  const subscriptionMs = toMs(subscriptionRaw);
  const planType = String(data.planType || '');
  return {
    id: doc.id,
    email: doc.id,
    status: String(data.status || ''),
    planType,
    source: String(data.source || ''),
    expiresAtMs: toMs(data.expiresAt),
    subscriptionCurrentPeriodEndMs: subscriptionMs,
    createdAtMs: toMs(data.createdAt),
    updatedAtMs: toMs(data.updatedAt),
    manualPlanDays:
      typeof data.manualPlanDays === 'number' && Number.isFinite(data.manualPlanDays)
        ? Math.max(0, Math.floor(data.manualPlanDays))
        : null,
    lifetime: planType.toLowerCase() === 'lifetime' || data.lifetime === true
  };
};

const serializeUserFeedback = (docSnap: FirebaseFirestore.QueryDocumentSnapshot) => {
  const data = docSnap.data() || {};
  const ownerRef = docSnap.ref.parent?.parent || null;
  const userId = ownerRef?.id || '';
  const statusRaw = String(data.status || 'new').trim().toLowerCase();
  const status = statusRaw || 'new';
  const typeRaw = String(data.type || '').trim().toLowerCase();
  const type = typeRaw === 'improvement' ? 'improvement' : 'bug';
  return {
    id: docSnap.id,
    userId,
    type,
    status,
    message: String(data.message || ''),
    platform: data.platform || null,
    appVersion: data.appVersion || null,
    reporterEmail: data.reporterEmail || null,
    companyName: data.companyName || null,
    createdAtMs: toMs(data.createdAt) ?? (typeof data.createdAtClientMs === 'number' ? data.createdAtClientMs : null),
    updatedAtMs: toMs(data.updatedAt)
  };
};

const SYSTEM_PROMPT = `
Você é o Ajudante do meumei.
Responda apenas sobre o uso do app meumei, de forma objetiva e prática.
Quando fizer sentido, responda em passos numerados.
Se a pergunta não for sobre o app, recuse com educação e sugira caminhos dentro do meumei.
Não invente telas/rotas. Se não souber, diga que não tem certeza e sugira o caminho mais provável pelo Acesso Rápido.

Mini mapa do app:
- Contas Bancárias: cadastrar contas e ver saldos
- Entradas: registrar recebimentos
- Despesas Fixas/Variáveis/Pessoais: registrar gastos por tipo
- Rendimentos: registrar retornos
- Faturas: controlar cartão
- Relatórios: visão geral por período
- Emissão DAS: acesso e orientação dentro do app
`;

const MAX_RESPONSE_CHARS = 1200;
const RATE_LIMIT = 10;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const getClientIp = (req: functions.https.Request) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.ip || 'unknown';
};

const simpleHash = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `ip_${Math.abs(hash)}`;
};

const clampAnswer = (value: string) => value.slice(0, MAX_RESPONSE_CHARS).trim();

type ReceiptDraft = {
  description: string;
  amount: number | null;
  date: string;
  dueDate: string;
  category: string;
  paymentMethod: 'Débito' | 'Crédito' | 'PIX' | 'Boleto' | 'Transferência' | 'Dinheiro' | '';
  taxStatus: 'PJ' | 'PF' | '';
  notes: string;
  merchant: string;
  confidence: number;
};

const RECEIPT_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

const extractImagePayload = (raw: string) => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { mimeType: '', data: '' };
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      mimeType: String(dataUrlMatch[1] || '').toLowerCase(),
      data: String(dataUrlMatch[2] || '').trim()
    };
  }
  return { mimeType: 'image/jpeg', data: trimmed };
};

const tryParseJsonObject = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const repairJsonLike = (value: string) => {
  let repaired = String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim();

  // Remove trailing commas before object/array endings.
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  // Quote object keys when model returns JS-like objects.
  repaired = repaired.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');

  // Convert single-quoted keys/values to JSON-compliant double quotes.
  repaired = repaired.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, (_match, key) => {
    const safeKey = String(key || '').replace(/"/g, '\\"');
    return `"${safeKey}":`;
  });
  repaired = repaired.replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, content) => {
    const safeContent = String(content || '').replace(/"/g, '\\"');
    return `: "${safeContent}"`;
  });

  // Normalize decimal comma in numeric literals (e.g. 105,00 -> 105.00).
  repaired = repaired.replace(/(-?\d+),(\d{2})(?=\s*[,}\]])/g, '$1.$2');

  // Quote known enum-like bare words.
  repaired = repaired.replace(
    /:\s*(Débito|Crédito|Credito|PIX|Boleto|Transferência|Transferencia|Dinheiro|PJ|PF)(\s*[,}])/gi,
    (_match, label, suffix) => `: "${label}"${suffix}`
  );

  return repaired;
};

const parseLooseJsonObject = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const candidates = [withoutFence];
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    candidates.push(withoutFence.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    const parsed = tryParseJsonObject(candidate);
    if (parsed) return parsed;
  }

  for (const candidate of candidates) {
    const repaired = repairJsonLike(candidate);
    const parsed = tryParseJsonObject(repaired);
    if (parsed) return parsed;
  }

  return null;
};

const parseCurrencyNumber = (value: any): number | null => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Number(value.toFixed(2));
  }
  let raw = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/r\$/gi, '')
    .replace(/[^0-9,.-]/g, '');
  if (!raw) return null;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Keep the latest separator as decimal and drop the other as thousand separator.
    if (lastComma > lastDot) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else {
      raw = raw.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else {
    raw = raw.replace(/,/g, '');
  }

  raw = raw.replace(/(?!^)-/g, '');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Number(parsed.toFixed(2));
};

const normalizeDateValue = (value: any): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const brMatch = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  const brShortYearMatch = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{2})$/);
  if (brShortYearMatch) {
    const shortYear = Number(brShortYearMatch[3]);
    const fullYear = shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear;
    return `${fullYear}-${brShortYearMatch[2]}-${brShortYearMatch[1]}`;
  }
  return '';
};

const normalizePaymentMethod = (
  value: any
): 'Débito' | 'Crédito' | 'PIX' | 'Boleto' | 'Transferência' | 'Dinheiro' | '' => {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!raw) return '';
  if (raw.includes('pix')) return 'PIX';
  if (raw.includes('credito') || raw.includes('cartao')) return 'Crédito';
  if (raw.includes('debito')) return 'Débito';
  if (raw.includes('boleto')) return 'Boleto';
  if (raw.includes('transfer')) return 'Transferência';
  if (raw.includes('dinheiro') || raw.includes('especie')) return 'Dinheiro';
  return '';
};

const normalizeTaxStatus = (value: any): 'PJ' | 'PF' | '' => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'PJ' || raw === 'PF') return raw;
  return '';
};

const normalizeReceiptDraft = (input: any): ReceiptDraft => {
  const amount = parseCurrencyNumber(input?.amount);
  const date = normalizeDateValue(input?.date);
  const dueDateRaw = normalizeDateValue(input?.dueDate);
  const dueDate = dueDateRaw || date;
  const confidenceRaw = Number(input?.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw))
    : 0.55;
  return {
    description: String(input?.description || input?.merchant || '')
      .trim()
      .slice(0, 120),
    amount,
    date,
    dueDate,
    category: String(input?.category || '').trim().slice(0, 64),
    paymentMethod: normalizePaymentMethod(input?.paymentMethod),
    taxStatus: normalizeTaxStatus(input?.taxStatus),
    notes: String(input?.notes || '').trim().slice(0, 240),
    merchant: String(input?.merchant || '').trim().slice(0, 120),
    confidence
  };
};

const extractResponseText = (response: any): string => {
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
};

const buildFallbackReceiptDraftFromText = (rawText: string): ReceiptDraft | null => {
  const text = String(rawText || '').trim();
  if (!text) return null;

  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const amountMatch =
    text.match(/total[^0-9]{0,24}(r\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2}))/i) ||
    text.match(/r\$?\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})/i) ||
    text.match(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/);
  const amount = parseCurrencyNumber(amountMatch?.[1] || amountMatch?.[0] || '');

  const dateMatch =
    text.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/) ||
    text.match(/\b\d{2}[-/]\d{2}[-/]\d{4}\b/) ||
    text.match(/\b\d{2}[-/]\d{2}[-/]\d{2}\b/);
  const date = normalizeDateValue(dateMatch?.[0] || '');

  const merchantLine = lines.find((line) => {
    const upper = line.toUpperCase();
    if (line.length < 4) return false;
    if (/^R\$\s*\d/.test(upper)) return false;
    if (/^(TOTAL|APROVADO|OPERA[CÇ][AÃ]O|VIA CLIENTE|CNPJ|AUTORIZA[CÇ][AÃ]O)/i.test(upper)) {
      return false;
    }
    return /[A-ZÀ-ÿ]{3,}/.test(line);
  });

  const description =
    String(merchantLine || '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 120) || '';
  const merchant = description;

  const paymentMethod = normalizePaymentMethod(text);

  if (!amount && !description && !date) return null;

  return {
    description,
    amount,
    date,
    dueDate: date,
    category: '',
    paymentMethod,
    taxStatus: '',
    notes: normalizedText.slice(0, 240),
    merchant,
    confidence: 0.45
  };
};

const resolveOrigin = (host?: string, originHeader?: string) => {
  if (originHeader) return originHeader;
  if (host) return `https://${host}`;
  return PROJECT_ID ? `https://${PROJECT_ID}.web.app` : '';
};

const DAILY_TIPS = [
  {
    id: 'pc_atalho_contas',
    title: 'Dica do dia',
    body: 'PC: atalho 1 abre Contas Bancarias (Acesso Rapido).'
  },
  {
    id: 'pc_atalho_entradas',
    title: 'Dica do dia',
    body: 'PC: atalho 2 abre Entradas para registrar recebimentos.'
  },
  {
    id: 'pc_atalho_despesas_fixas',
    title: 'Dica do dia',
    body: 'PC: atalho 3 abre Despesas Fixas.'
  },
  {
    id: 'pc_atalho_despesas_variaveis',
    title: 'Dica do dia',
    body: 'PC: atalho 4 abre Despesas Variaveis.'
  },
  {
    id: 'pc_atalho_despesas_pessoais',
    title: 'Dica do dia',
    body: 'PC: atalho 5 abre Despesas Pessoais.'
  },
  {
    id: 'pc_atalho_rendimentos',
    title: 'Dica do dia',
    body: 'PC: atalho 6 abre Rendimentos.'
  },
  {
    id: 'pc_atalho_faturas',
    title: 'Dica do dia',
    body: 'PC: atalho 7 abre Faturas dos cartoes.'
  },
  {
    id: 'pc_atalho_relatorios',
    title: 'Dica do dia',
    body: 'PC: atalho 8 abre Relatorios.'
  },
  {
    id: 'pc_atalho_das',
    title: 'Dica do dia',
    body: 'PC: atalho 9 abre Emissao DAS.'
  },
  {
    id: 'pc_busca_setas',
    title: 'Dica do dia',
    body: 'PC: na busca, use setas e Enter para abrir um item.'
  },
  {
    id: 'pc_atalho_esc',
    title: 'Dica do dia',
    body: 'PC: pressione ESC para fechar modais.'
  },
  {
    id: 'mobile_quick_access',
    title: 'Dica do dia',
    body: 'Mobile: use o Acesso Rapido no rodape e arraste para ver mais atalhos.'
  },
  {
    id: 'mobile_expand_cards',
    title: 'Dica do dia',
    body: 'Mobile: toque em "Toque para expandir" para abrir detalhes.'
  },
  {
    id: 'mobile_disable_tips',
    title: 'Dica do dia',
    body: 'Mobile: voce pode desativar as dicas em Configuracoes.'
  }
];

const getSaoPauloDateKey = (date = new Date()) =>
  date.toLocaleDateString('sv-SE', { timeZone: DAILY_TIP_TIMEZONE });

const pickTipIndex = (seed: string, max: number) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % Math.max(1, max);
};

const sendPushToUser = async (
  uid: string,
  payload: { title: string; body: string; url: string },
  originHint?: { host?: string; origin?: string }
) => {
  const tokensSnap = await admin
    .firestore()
    .collection('users')
    .doc(uid)
    .collection('pushTokens')
    .get();

  const getTimestampMs = (value: any) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    if (typeof value === 'number') return value;
    return 0;
  };

  type TokenEntry = {
    token: string;
    deviceId?: string;
    updatedAtMs: number;
    ref: FirebaseFirestore.DocumentReference;
  };

  const tokenEntries = tokensSnap.docs
    .map((doc) => ({
      token: doc.get('token'),
      deviceId: doc.get('deviceId'),
      updatedAtMs: getTimestampMs(doc.get('updatedAt')),
      ref: doc.ref
    }))
    .filter((entry) => typeof entry.token === 'string' && entry.token.length > 0) as TokenEntry[];

  const entriesWithDevice = tokenEntries.filter(
    (entry) => typeof entry.deviceId === 'string' && entry.deviceId.length > 0
  );

  let selectedEntries: TokenEntry[] = [];
  if (entriesWithDevice.length) {
    const byDevice = new Map<string, (typeof tokenEntries)[number]>();
    entriesWithDevice.forEach((entry) => {
      const existing = byDevice.get(entry.deviceId as string);
      if (!existing || entry.updatedAtMs >= existing.updatedAtMs) {
        byDevice.set(entry.deviceId as string, entry);
      }
    });
    selectedEntries = Array.from(byDevice.values());
  } else if (tokenEntries.length) {
    const mostRecent = tokenEntries.reduce((latest, entry) =>
      entry.updatedAtMs >= latest.updatedAtMs ? entry : latest
    );
    selectedEntries = [mostRecent];
  }

  const tokens = selectedEntries.map((entry) => entry.token);

  console.log('[push] tokens', {
    uid,
    total: tokenEntries.length,
    selected: tokens.length
  });

  if (!tokens.length) {
    return {
      ok: false,
      status: 404,
      message: 'Nenhum dispositivo registrado.',
      tokens: []
    };
  }

  const origin = resolveOrigin(originHint?.host, originHint?.origin);
  const iconUrl = origin ? `${origin}/pwa-192x192.png` : '';
  const dataPayload: Record<string, string> = {
    title: payload.title,
    body: payload.body,
    url: payload.url
  };
  if (iconUrl) {
    dataPayload.icon = iconUrl;
  }
  const webpush: admin.messaging.WebpushConfig = {
    headers: {
      Urgency: 'high',
      TTL: '60'
    },
    fcmOptions: {
      link: payload.url
    }
  };

  const messagingResult = await admin.messaging().sendEachForMulticast({
    tokens,
    webpush,
    data: dataPayload
  });

  const invalidTokens: string[] = [];
  const errorCodes: string[] = [];
  messagingResult.responses.forEach((resp, idx) => {
    if (resp.success) return;
    const code = resp.error?.code || '';
    if (code) {
      errorCodes.push(code);
    }
    if (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered'
    ) {
      invalidTokens.push(tokens[idx]);
    }
  });

  if (invalidTokens.length) {
    const batch = admin.firestore().batch();
    invalidTokens.forEach((tokenValue) => {
      const snapshot = tokensSnap.docs.find((doc) => doc.get('token') === tokenValue);
      if (snapshot) {
        batch.delete(snapshot.ref);
      }
    });
    await batch.commit();
  }

  return {
    ok: messagingResult.successCount > 0,
    status: messagingResult.successCount > 0 ? 200 : 500,
    successCount: messagingResult.successCount,
    failureCount: messagingResult.failureCount,
    removedTokens: invalidTokens.length,
    errorCodes: errorCodes.slice(0, 5)
  };
};

export const askMeumeiHelper = functions.region('us-central1').https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const start = Date.now();
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const signals = req.body?.signals || {};
    if (!question) {
      res.status(400).json({ ok: false, message: 'Pergunta vazia.' });
      return;
    }

    let uid: string | null = null;
    let email: string | null = null;
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim() || '';
    const hasAuthHeader = Boolean(match?.[1]);
    const tokenLen = token.length;
    if (!hasAuthHeader) {
      console.log('[askMeumeiHelper] auth', { hasAuthHeader, tokenLen, uid, email, ok: false });
      res.status(401).json({ error: 'missing_auth' });
      return;
    }
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email || null;
    } catch (error) {
      console.log('[askMeumeiHelper] auth', { hasAuthHeader, tokenLen, uid, email, ok: false });
      res.status(401).json({ error: 'invalid_auth' });
      return;
    }
    console.log('[askMeumeiHelper] auth', { hasAuthHeader, tokenLen, uid, email, ok: true });
    const ip = getClientIp(req);
    const key = uid || simpleHash(ip);
    console.log('[helper-ai] request', { uid: uid || null, key });

    const rateRef = admin.firestore().collection('helperRateLimits').doc(key);
    const now = Date.now();
    const snap = await rateRef.get();
    const data = snap.exists ? (snap.data() as { count?: number; resetAt?: number }) : {};
    const resetAt = typeof data.resetAt === 'number' ? data.resetAt : 0;
    const count = typeof data.count === 'number' ? data.count : 0;
    const nextResetAt = resetAt > now ? resetAt : now + HOUR_MS;
    const nextCount = resetAt > now ? count + 1 : 1;

    if (nextCount > RATE_LIMIT) {
      console.log('[helper-ai] rate_limited', { key, count: nextCount });
      res.status(429).json({
        ok: false,
        message: 'Você atingiu o limite de perguntas por hora. Tente novamente mais tarde.'
      });
      return;
    }

    await rateRef.set({ count: nextCount, resetAt: nextResetAt }, { merge: true });

    if (!vertexAI || !PROJECT_ID) {
      console.error('[helper-ai] missing_vertex_project', { projectId: PROJECT_ID || null });
      res.status(500).json({ ok: false, message: 'Vertex AI não configurado.' });
      return;
    }

    const context = `Sinais do usuário: contas=${Boolean(
      signals.hasAccounts
    )}, entradas=${Boolean(signals.hasIncomes)}, despesas=${Boolean(
      signals.hasExpenses
    )}, categorias=${Boolean(signals.hasCategories)}.`;
    const prompt = `${SYSTEM_PROMPT}\n${context}\nPergunta: ${question}`;

    try {
      const model = vertexAI.getGenerativeModel({
        model: VERTEX_MODEL,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 400
        },
        systemInstruction: {
          role: 'system',
          parts: [{ text: SYSTEM_PROMPT }]
        }
      });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      const response = result?.response;
      const text =
        response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'Não consegui responder agora. Tente novamente em alguns instantes.';
      const answer = clampAnswer(text);
      console.log('[helper-ai] response', {
        key,
        ms: Date.now() - start,
        modelId: VERTEX_MODEL
      });
      res.status(200).json({
        answer,
        suggestions: [
          'Abrir Contas Bancárias',
          'Abrir Entradas',
          'Ver Relatórios'
        ]
      });
    } catch (error: any) {
      console.error('[helper-ai] error', {
        message: error?.message || error,
        modelId: VERTEX_MODEL
      });
      res.status(500).json({
        ok: false,
        message: 'Não foi possível responder agora. Tente novamente.'
      });
    }
  });

export const scanExpenseReceipt = functions.region('us-central1').https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed', message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    if (!vertexAI || !PROJECT_ID) {
      res.status(500).json({ ok: false, error: 'vertex_unavailable', message: 'IA não configurada no servidor.' });
      return;
    }

    const body = parseRequestBody(req);
    const imageInput = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '';
    const payload = extractImagePayload(imageInput);
    const mimeType = RECEIPT_ALLOWED_MIME.has(payload.mimeType) ? payload.mimeType : 'image/jpeg';
    const imageBase64 = payload.data;

    if (!imageBase64) {
      res.status(400).json({ ok: false, error: 'missing_image', message: 'Envie a foto do comprovante.' });
      return;
    }

    if (imageBase64.length > 12_000_000) {
      res.status(413).json({
        ok: false,
        error: 'image_too_large',
        message: 'Imagem muito grande. Tente novamente com uma foto mais leve.'
      });
      return;
    }

    const prompt =
      'Você extrai dados de comprovantes financeiros no Brasil para um app de controle financeiro.' +
      '\nRetorne APENAS JSON puro sem markdown, no formato:' +
      '\n{' +
      '\n  "description": "texto curto da compra/pagamento",' +
      '\n  "amount": 0.0,' +
      '\n  "date": "YYYY-MM-DD",' +
      '\n  "dueDate": "YYYY-MM-DD",' +
      '\n  "category": "categoria curta",' +
      '\n  "paymentMethod": "Débito|Crédito|PIX|Boleto|Transferência|Dinheiro|",' +
      '\n  "taxStatus": "PJ|PF|",' +
      '\n  "notes": "detalhes úteis",' +
      '\n  "merchant": "nome do estabelecimento",' +
      '\n  "confidence": 0.0' +
      '\n}' +
      '\nRegras:' +
      '\n- Se não souber algum campo, use string vazia.' +
      '\n- amount deve ser número com ponto decimal (sem símbolo de moeda).' +
      '\n- date e dueDate em YYYY-MM-DD quando possível.' +
      '\n- Não invente valores.';

    try {
      const model = vertexAI.getGenerativeModel({
        model: VERTEX_MODEL,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 700,
          // Keep output structured whenever possible; parser still has fallback.
          responseMimeType: 'application/json'
        }
      } as any);

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: imageBase64
                }
              }
            ]
          }
        ]
      });

      const response = result?.response;
      const text = extractResponseText(response);
      const parsed = parseLooseJsonObject(text);
      if (!parsed) {
        const fallback = buildFallbackReceiptDraftFromText(text);
        if (fallback) {
          res.status(200).json({
            ok: true,
            data: fallback
          });
          return;
        }

        console.warn('[scanExpenseReceipt] invalid_ai_output', {
          uid: auth.uid,
          preview: text.slice(0, 320)
        });
        res.status(422).json({
          ok: false,
          error: 'invalid_ai_output',
          message: 'Não conseguimos interpretar o comprovante. Tente outra foto.'
        });
        return;
      }

      const normalized = normalizeReceiptDraft(parsed);
      res.status(200).json({
        ok: true,
        data: normalized
      });
    } catch (error: any) {
      console.error('[scanExpenseReceipt] error', {
        uid: auth.uid,
        message: error?.message || String(error)
      });
      res.status(500).json({
        ok: false,
        error: 'scan_failed',
        message: 'Não foi possível ler o comprovante agora. Tente novamente.'
      });
    }
  });

export const sendPushNotification = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim() || '';
    if (!token) {
      res.status(401).json({ ok: false, message: 'Auth ausente.' });
      return;
    }

    let uid = '';
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
    } catch (error) {
      res.status(401).json({ ok: false, message: 'Auth inválida.' });
      return;
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : 'meumei';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '/';
    const host = typeof req.headers.host === 'string' ? req.headers.host : '';
    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const result = await sendPushToUser(uid, { title, body, url }, { host, origin: originHeader });
    if (!result.ok) {
      res.status(result.status || 500).json({
        ok: false,
        message:
          result.status === 404
            ? 'Nenhum dispositivo registrado.'
            : result.errorCodes?.length
            ? `Falha ao enviar: ${result.errorCodes[0]}`
            : 'Falha ao enviar notificação.'
      });
      return;
    }
    res.status(200).json(result);
  });

export const createBetaKey = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const durationDays = Number(body.durationDays);
    const maxUses = Number(body.maxUses);
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      res.status(400).json({ ok: false, message: 'Duração inválida.' });
      return;
    }
    if (!Number.isFinite(maxUses) || maxUses <= 0) {
      res.status(400).json({ ok: false, message: 'Limite de usos inválido.' });
      return;
    }

    try {
      const code = await ensureUniqueBetaCode();
      const nowMs = Date.now();
      const docRef = admin.firestore().collection(BETA_KEY_COLLECTION).doc();
      await docRef.set({
        code,
        durationDays,
        maxUses,
        uses: 0,
        isActive: true,
        source: 'manual',
        createdBy: auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.status(200).json({
        ok: true,
        key: {
          id: docRef.id,
          code,
          durationDays,
          maxUses,
          uses: 0,
          isActive: true,
          createdAtMs: nowMs,
          expiresAtMs: null,
          lastUsedAtMs: null
        }
      });
    } catch (error) {
      console.error('[beta] create_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao criar a chave.' });
    }
  });

export const listBetaKeys = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    try {
      const snap = await admin
        .firestore()
        .collection(BETA_KEY_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      const keys = snap.docs.map(serializeBetaKey);
      res.status(200).json({ ok: true, keys });
    } catch (error) {
      console.error('[beta] list_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao listar as chaves.' });
    }
  });

export const listEntitlements = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    try {
      const snap = await admin
        .firestore()
        .collection('entitlements')
        .orderBy('updatedAt', 'desc')
        .limit(80)
        .get();
      const entitlements = snap.docs.map(serializeEntitlement);
      res.status(200).json({ ok: true, entitlements });
    } catch (error) {
      console.error('[entitlements] list_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao listar acessos.' });
    }
  });

export const listMembers = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    try {
      const actor = await resolveActorScope(auth);
      if (!actor.active || !canManageMembers(actor.role)) {
        res.status(403).json({ ok: false, message: 'Permissão negada para listar membros.' });
        return;
      }

      const snap = await admin
        .firestore()
        .collection('users')
        .doc(actor.licenseId)
        .collection(MEMBER_SUBCOLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(300)
        .get();

      const membersByUid = new Map<string, Record<string, unknown>>();
      snap.docs.forEach((docSnap) => {
        const serialized = serializeMemberRecord(docSnap.id, docSnap.data());
        const resolvedUid = String(serialized.uid || '').trim() || docSnap.id;
        if (!membersByUid.has(resolvedUid)) {
          membersByUid.set(resolvedUid, serialized);
        }
      });
      const members = Array.from(membersByUid.values());
      res.status(200).json({ ok: true, members });
    } catch (error) {
      console.error('[members] list_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao listar membros.' });
    }
  });

export const createMemberAccount = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const name = String(body.name || '').trim();
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    const password = String(body.password || '');
    const requestedRole = normalizeMemberRole(body.role, 'employee');
    let requestedPhotoDataUrl: string | null = null;
    try {
      requestedPhotoDataUrl = normalizeMemberPhotoDataUrl(body.photoDataUrl);
    } catch (error: any) {
      const code = String(error?.message || '').toLowerCase();
      if (code === 'photo_too_large') {
        res.status(400).json({ ok: false, message: 'Foto muito grande. Envie uma imagem menor.' });
        return;
      }
      res.status(400).json({ ok: false, message: 'Foto inválida. Use PNG, JPG ou WEBP.' });
      return;
    }

    if (!name || name.length < 2) {
      res.status(400).json({ ok: false, message: 'Nome inválido.' });
      return;
    }
    if (!MEMBER_EMAIL_REGEX.test(email)) {
      res.status(400).json({ ok: false, message: 'E-mail inválido.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ ok: false, message: 'Senha deve ter ao menos 6 caracteres.' });
      return;
    }
    if (!MEMBER_ROLES.has(requestedRole) || requestedRole === 'owner') {
      res.status(400).json({ ok: false, message: 'Papel inválido para novo membro.' });
      return;
    }

    let createdUid = '';
    try {
      const actor = await resolveActorScope(auth);
      if (!actor.active || !canManageMembers(actor.role)) {
        res.status(403).json({ ok: false, message: 'Permissão negada para criar membros.' });
        return;
      }
      if (actor.role !== 'owner' && requestedRole === 'admin') {
        res.status(403).json({ ok: false, message: 'Somente o administrador principal cria outros administradores.' });
        return;
      }

      const db = admin.firestore();
      const membersRef = db
        .collection('users')
        .doc(actor.licenseId)
        .collection(MEMBER_SUBCOLLECTION);

      const duplicateByEmail = await membersRef.where('emailNormalized', '==', email).limit(1).get();
      if (!duplicateByEmail.empty) {
        res.status(409).json({ ok: false, message: 'Já existe um membro com este e-mail nesta licença.' });
        return;
      }

      const ownerAuthUser = await admin.auth().getUser(actor.licenseId).catch(() => null);
      const ownerEmail = String(ownerAuthUser?.email || '')
        .trim()
        .toLowerCase();
      if (ownerEmail && ownerEmail === email) {
        res.status(409).json({ ok: false, message: 'Este e-mail já pertence ao administrador principal.' });
        return;
      }

      const permissions = normalizeMemberPermissions(body.permissions, requestedRole);
      const createdUser = await admin.auth().createUser({
        email,
        password,
        displayName: name
      });
      createdUid = createdUser.uid;

      const now = admin.firestore.FieldValue.serverTimestamp();
      const payload: FirebaseFirestore.DocumentData = {
        uid: createdUid,
        licenseId: actor.licenseId,
        name,
        email,
        photoDataUrl: requestedPhotoDataUrl,
        emailNormalized: email,
        role: requestedRole,
        active: true,
        permissions,
        createdByUid: actor.uid,
        createdByEmail: actor.email || null,
        createdAt: now,
        updatedAt: now
      };

      await Promise.all([
        membersRef.doc(createdUid).set(payload, { merge: true }),
        db.collection(MEMBERSHIP_COLLECTION).doc(createdUid).set(payload, { merge: true }),
        admin.auth().setCustomUserClaims(createdUid, {
          licenseId: actor.licenseId,
          role: requestedRole
        })
      ]);

      const createdAtMs = Date.now();
      res.status(200).json({
        ok: true,
        member: {
          ...serializeMemberRecord(createdUid, {
            ...payload,
            createdAt: new Date(createdAtMs),
            updatedAt: new Date(createdAtMs)
          }),
          createdAtMs,
          updatedAtMs: createdAtMs
        }
      });
    } catch (error: any) {
      if (createdUid) {
        await admin
          .auth()
          .deleteUser(createdUid)
          .catch((rollbackError) => console.error('[members] rollback_delete_user_error', rollbackError));
      }
      const code = String(error?.code || '').toLowerCase();
      if (code.includes('email-already-exists')) {
        res.status(409).json({ ok: false, message: 'Este e-mail já está cadastrado no sistema.' });
        return;
      }
      console.error('[members] create_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao criar o membro.' });
    }
  });

export const updateMemberAccess = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const memberUid = String(body.memberUid || '').trim();
    if (!memberUid || memberUid.includes('/')) {
      res.status(400).json({ ok: false, message: 'Membro inválido.' });
      return;
    }
    const requestedEmail = body.email !== undefined ? normalizeTextLoose(body.email) : null;
    if (requestedEmail !== null && !MEMBER_EMAIL_REGEX.test(requestedEmail)) {
      res.status(400).json({ ok: false, message: 'E-mail inválido.' });
      return;
    }
    const requestedPassword = body.password !== undefined ? String(body.password || '') : '';
    const hasPasswordUpdate = body.password !== undefined && requestedPassword.length > 0;
    if (body.password !== undefined && requestedPassword.length > 0 && requestedPassword.length < 6) {
      res.status(400).json({ ok: false, message: 'Senha deve ter ao menos 6 caracteres.' });
      return;
    }
    let requestedPhotoDataUrl: string | null | undefined = undefined;
    if (body.photoDataUrl !== undefined) {
      try {
        requestedPhotoDataUrl = normalizeMemberPhotoDataUrl(body.photoDataUrl);
      } catch (error: any) {
        const code = String(error?.message || '').toLowerCase();
        if (code === 'photo_too_large') {
          res.status(400).json({ ok: false, message: 'Foto muito grande. Envie uma imagem menor.' });
          return;
        }
        res.status(400).json({ ok: false, message: 'Foto inválida. Use PNG, JPG ou WEBP.' });
        return;
      }
    }

    try {
      const actor = await resolveActorScope(auth);
      if (!actor.active || !canManageMembers(actor.role)) {
        res.status(403).json({ ok: false, message: 'Permissão negada para atualizar membros.' });
        return;
      }
      if (memberUid === actor.licenseId) {
        res.status(400).json({ ok: false, message: 'O administrador principal não pode ser alterado aqui.' });
        return;
      }

      const db = admin.firestore();
      const membersRef = db
        .collection('users')
        .doc(actor.licenseId)
        .collection(MEMBER_SUBCOLLECTION);
      const relatedMember = await collectRelatedMemberDocs(membersRef, memberUid);
      if (relatedMember.docs.length === 0 || !relatedMember.primaryDoc) {
        res.status(404).json({ ok: false, message: 'Membro não encontrado.' });
        return;
      }
      const memberSnap = relatedMember.primaryDoc;
      const resolvedMemberUid = String(relatedMember.resolvedMemberUid || memberUid).trim();
      if (!resolvedMemberUid || resolvedMemberUid.includes('/')) {
        res.status(400).json({ ok: false, message: 'UID do membro inválido.' });
        return;
      }
      if (resolvedMemberUid === actor.licenseId) {
        res.status(400).json({ ok: false, message: 'O administrador principal não pode ser alterado aqui.' });
        return;
      }
      if (resolvedMemberUid === actor.uid) {
        res.status(400).json({ ok: false, message: 'Você não pode alterar seu próprio acesso por esta tela.' });
        return;
      }

      const currentData = memberSnap.data() || {};
      const currentRole = normalizeMemberRole(currentData.role, 'employee');
      const nextRole = body.role !== undefined
        ? normalizeMemberRole(body.role, currentRole)
        : currentRole;
      if (!MEMBER_ROLES.has(nextRole) || nextRole === 'owner') {
        res.status(400).json({ ok: false, message: 'Papel inválido para membro.' });
        return;
      }
      if (actor.role !== 'owner' && (currentRole === 'admin' || nextRole === 'admin')) {
        res.status(403).json({ ok: false, message: 'Somente o administrador principal pode alterar administradores.' });
        return;
      }

      const nextActive = typeof body.active === 'boolean' ? body.active : currentData.active !== false;
      if (resolvedMemberUid === actor.uid && !nextActive) {
        res.status(400).json({ ok: false, message: 'Você não pode desativar seu próprio acesso.' });
        return;
      }

      const rawName = String(body.name !== undefined ? body.name : currentData.name || '').trim();
      const nextName = rawName || String(currentData.name || 'Membro').trim() || 'Membro';
      const currentPhotoDataUrl = (() => {
        try {
          return normalizeMemberPhotoDataUrl(currentData.photoDataUrl);
        } catch {
          return null;
        }
      })();
      const nextPhotoDataUrl = requestedPhotoDataUrl !== undefined
        ? requestedPhotoDataUrl
        : currentPhotoDataUrl;
      const currentEmail = normalizeTextLoose(currentData.emailNormalized || currentData.email);
      const nextEmail = requestedEmail !== null ? requestedEmail : currentEmail;
      if (!nextEmail || !MEMBER_EMAIL_REGEX.test(nextEmail)) {
        res.status(400).json({ ok: false, message: 'E-mail inválido.' });
        return;
      }
      if (nextEmail !== currentEmail) {
        const relatedPaths = new Set(relatedMember.docs.map((docSnap) => docSnap.ref.path));
        const duplicateByEmail = await membersRef
          .where('emailNormalized', '==', nextEmail)
          .limit(40)
          .get();
        const hasDuplicateByNormalized = duplicateByEmail.docs.some(
          (docSnap) => !relatedPaths.has(docSnap.ref.path)
        );
        const hasDuplicateByLegacyEmail = relatedMember.allDocs.some((docSnap) => {
          if (relatedPaths.has(docSnap.ref.path)) return false;
          const data = docSnap.data() || {};
          return normalizeTextLoose(data.emailNormalized || data.email) === nextEmail;
        });
        if (hasDuplicateByNormalized || hasDuplicateByLegacyEmail) {
          res.status(409).json({ ok: false, message: 'Já existe um membro com este e-mail nesta licença.' });
          return;
        }
        const ownerAuthUser = await admin.auth().getUser(actor.licenseId).catch(() => null);
        const ownerEmail = normalizeTextLoose(ownerAuthUser?.email || '');
        if (ownerEmail && ownerEmail === nextEmail) {
          res.status(409).json({ ok: false, message: 'Este e-mail já pertence ao administrador principal.' });
          return;
        }
      }

      const authUidCandidates = Array.from(
        new Set([
          resolvedMemberUid,
          memberUid,
          ...relatedMember.relatedUids
        ])
      )
        .map((uid) => String(uid || '').trim())
        .filter((uid) => uid && !uid.includes('/') && uid !== actor.uid && uid !== actor.licenseId);

      let authTargetUid = '';
      for (const authUid of authUidCandidates) {
        try {
          const authUpdatePayload: {
            disabled: boolean;
            displayName: string;
            email?: string;
            password?: string;
          } = {
            disabled: !nextActive,
            displayName: nextName,
            email: nextEmail
          };
          if (hasPasswordUpdate) {
            authUpdatePayload.password = requestedPassword;
          }
          await admin.auth().updateUser(authUid, authUpdatePayload);
          await admin.auth().setCustomUserClaims(authUid, {
            licenseId: actor.licenseId,
            role: nextRole
          });
          authTargetUid = authUid;
          break;
        } catch (error: any) {
          if (isAuthUserNotFoundError(error)) {
            continue;
          }
          if (isAuthEmailAlreadyExistsError(error)) {
            res.status(409).json({ ok: false, message: 'Este e-mail já está cadastrado no sistema.' });
            return;
          }
          if (isAuthPasswordInvalidError(error)) {
            res.status(400).json({ ok: false, message: 'Senha inválida. Use ao menos 6 caracteres.' });
            return;
          }
          throw error;
        }
      }
      if (!authTargetUid) {
        res.status(404).json({ ok: false, message: 'Conta de login deste membro não foi encontrada.' });
        return;
      }

      const permissionsInput = body.permissions !== undefined ? body.permissions : currentData.permissions;
      const nextPermissions = normalizeMemberPermissions(permissionsInput, nextRole);
      const now = admin.firestore.FieldValue.serverTimestamp();
      const updatePayload: FirebaseFirestore.DocumentData = {
        uid: authTargetUid,
        licenseId: actor.licenseId,
        name: nextName,
        email: nextEmail,
        photoDataUrl: nextPhotoDataUrl,
        emailNormalized: nextEmail,
        role: nextRole,
        active: nextActive,
        permissions: nextPermissions,
        updatedAt: now,
        updatedByUid: actor.uid,
        updatedByEmail: actor.email || null,
        disabledAt: nextActive ? admin.firestore.FieldValue.delete() : now
      };

      const refsToUpdate = new Map<string, FirebaseFirestore.DocumentReference>();
      relatedMember.refs.forEach((ref) => refsToUpdate.set(ref.path, ref));
      refsToUpdate.set(membersRef.doc(authTargetUid).path, membersRef.doc(authTargetUid));
      const membershipRef = db.collection(MEMBERSHIP_COLLECTION).doc(authTargetUid);
      await Promise.all([
        ...Array.from(refsToUpdate.values()).map((ref) => ref.set(updatePayload, { merge: true })),
        membershipRef.set(updatePayload, { merge: true })
      ]);

      const updatedSnap = await membersRef.doc(authTargetUid).get();
      const updatedData = updatedSnap.data() || {};
      res.status(200).json({
        ok: true,
        member: serializeMemberRecord(authTargetUid, updatedData)
      });
    } catch (error) {
      console.error('[members] update_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao atualizar o membro.' });
    }
  });

export const updateMyMemberProfile = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const rawName = body.name !== undefined ? String(body.name || '').trim() : '';
    if (body.name !== undefined && rawName.length < 2) {
      res.status(400).json({ ok: false, message: 'Nome inválido.' });
      return;
    }

    let requestedPhotoDataUrl: string | null | undefined = undefined;
    if (body.photoDataUrl !== undefined) {
      try {
        requestedPhotoDataUrl = normalizeMemberPhotoDataUrl(body.photoDataUrl);
      } catch (error: any) {
        const code = String(error?.message || '').toLowerCase();
        if (code === 'photo_too_large') {
          res.status(400).json({ ok: false, message: 'Foto muito grande. Envie uma imagem menor.' });
          return;
        }
        res.status(400).json({ ok: false, message: 'Foto inválida. Use PNG, JPG ou WEBP.' });
        return;
      }
    }

    try {
      const actor = await resolveActorScope(auth);
      if (!actor.active) {
        res.status(403).json({ ok: false, message: 'Seu acesso está inativo.' });
        return;
      }

      const db = admin.firestore();
      const memberRef = db
        .collection('users')
        .doc(actor.licenseId)
        .collection(MEMBER_SUBCOLLECTION)
        .doc(actor.uid);
      const membershipRef = db.collection(MEMBERSHIP_COLLECTION).doc(actor.uid);

      const [memberSnap, membershipSnap] = await Promise.all([memberRef.get(), membershipRef.get()]);
      const memberData = memberSnap.exists ? memberSnap.data() || {} : {};
      const membershipData = membershipSnap.exists ? membershipSnap.data() || {} : {};
      const mergedCurrent = {
        ...membershipData,
        ...memberData
      };

      const nextName =
        rawName ||
        String(mergedCurrent.name || actor.name || '').trim() ||
        String(actor.email || '').trim() ||
        'Usuário';
      const currentPhotoDataUrl = (() => {
        try {
          return normalizeMemberPhotoDataUrl(mergedCurrent.photoDataUrl);
        } catch {
          return null;
        }
      })();
      const nextPhotoDataUrl =
        requestedPhotoDataUrl !== undefined ? requestedPhotoDataUrl : currentPhotoDataUrl;
      const now = admin.firestore.FieldValue.serverTimestamp();

      const updatePayload: FirebaseFirestore.DocumentData = {
        uid: actor.uid,
        licenseId: actor.licenseId,
        name: nextName,
        email: actor.email || null,
        emailNormalized: normalizeTextLoose(actor.email || ''),
        role: actor.role,
        active: true,
        permissions: actor.permissions,
        photoDataUrl: nextPhotoDataUrl,
        updatedAt: now,
        updatedByUid: actor.uid,
        updatedByEmail: actor.email || null
      };

      await Promise.all([
        memberRef.set(updatePayload, { merge: true }),
        membershipRef.set(updatePayload, { merge: true }),
        admin
          .auth()
          .updateUser(actor.uid, {
            displayName: nextName
          })
          .catch((error: any) => {
            if (isAuthUserNotFoundError(error)) return;
            throw error;
          })
      ]);

      const [updatedMemberSnap, updatedMembershipSnap] = await Promise.all([
        memberRef.get(),
        membershipRef.get()
      ]);
      const updatedMerged = {
        ...(updatedMembershipSnap.exists ? updatedMembershipSnap.data() || {} : {}),
        ...(updatedMemberSnap.exists ? updatedMemberSnap.data() || {} : {})
      };

      res.status(200).json({
        ok: true,
        member: serializeMemberRecord(actor.uid, {
          uid: actor.uid,
          licenseId: actor.licenseId,
          email: actor.email || updatedMerged.email || null,
          role: normalizeMemberRole(updatedMerged.role, actor.role),
          active: updatedMerged.active !== false,
          permissions: normalizeMemberPermissions(
            updatedMerged.permissions,
            normalizeMemberRole(updatedMerged.role, actor.role)
          ),
          createdAt: updatedMerged.createdAt || null,
          updatedAt: updatedMerged.updatedAt || new Date(),
          createdByUid: updatedMerged.createdByUid || null,
          createdByEmail: updatedMerged.createdByEmail || null,
          lastLoginAt: updatedMerged.lastLoginAt || null,
          disabledAt: updatedMerged.disabledAt || null,
          name: nextName,
          photoDataUrl: nextPhotoDataUrl
        })
      });
    } catch (error) {
      console.error('[members] update_self_profile_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao atualizar seu perfil.' });
    }
  });

export const createProfilePhotoCaptureSession = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    try {
      const actor = await resolveActorScope(auth);
      if (!actor.active) {
        res.status(403).json({ ok: false, message: 'Seu acesso está inativo.' });
        return;
      }
      const body = parseRequestBody(req);
      const targetName = String(body.targetName || '').trim().slice(0, 120) || null;
      const db = admin.firestore();
      const sessionRef = db.collection(PROFILE_PHOTO_CAPTURE_COLLECTION).doc();
      const sessionToken = createProfileCaptureToken();
      const tokenHash = hashProfileCaptureToken(sessionToken);
      const nowMs = Date.now();
      const expiresAtMs = nowMs + PROFILE_PHOTO_CAPTURE_TTL_MS;

      await sessionRef.set({
        sessionId: sessionRef.id,
        ownerUid: actor.uid,
        ownerEmail: actor.email || null,
        ownerLicenseId: actor.licenseId,
        status: 'pending',
        targetName,
        tokenHash,
        photoDataUrl: null,
        createdAtMs: nowMs,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAtMs,
        expiresAt: new Date(expiresAtMs),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(200).json({
        ok: true,
        session: {
          sessionId: sessionRef.id,
          sessionToken,
          status: 'pending',
          expiresAtMs,
          photoDataUrl: null
        }
      });
    } catch (error) {
      console.error('[profile-photo-capture] create_session_error', error);
      res.status(500).json({ ok: false, message: 'Não foi possível iniciar a captura de foto.' });
    }
  });

export const getProfilePhotoCaptureSession = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const sessionId = normalizeCaptureSessionId(body.sessionId);
    if (!sessionId) {
      res.status(400).json({ ok: false, message: 'Sessão inválida.' });
      return;
    }

    try {
      const actor = await resolveActorScope(auth);
      const db = admin.firestore();
      const sessionRef = db.collection(PROFILE_PHOTO_CAPTURE_COLLECTION).doc(sessionId);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) {
        res.status(404).json({ ok: false, message: 'Sessão não encontrada.' });
        return;
      }

      const data = sessionSnap.data() || {};
      const ownerUid = String(data.ownerUid || '').trim();
      if (!ownerUid || ownerUid !== actor.uid) {
        res.status(403).json({ ok: false, message: 'Você não pode acessar esta sessão.' });
        return;
      }

      const expiresAtMs =
        typeof data.expiresAtMs === 'number' && Number.isFinite(data.expiresAtMs)
          ? data.expiresAtMs
          : toMs(data.expiresAt);
      const nowMs = Date.now();
      const originalStatus = String(data.status || 'pending').trim().toLowerCase();
      let status = originalStatus || 'pending';

      if (expiresAtMs && nowMs > expiresAtMs && status !== 'consumed') {
        status = 'expired';
        if (originalStatus !== 'expired') {
          await sessionRef.set(
            {
              status: 'expired',
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        }
      }

      let photoDataUrl: string | null = null;
      if (status === 'captured') {
        try {
          photoDataUrl = normalizeMemberPhotoDataUrl(data.photoDataUrl);
        } catch {
          photoDataUrl = null;
        }
      }

      res.status(200).json({
        ok: true,
        session: {
          sessionId,
          status,
          expiresAtMs: expiresAtMs || null,
          photoDataUrl
        }
      });
    } catch (error) {
      console.error('[profile-photo-capture] get_session_error', error);
      res.status(500).json({ ok: false, message: 'Não foi possível consultar a sessão de captura.' });
    }
  });

export const consumeProfilePhotoCaptureSession = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const sessionId = normalizeCaptureSessionId(body.sessionId);
    if (!sessionId) {
      res.status(400).json({ ok: false, message: 'Sessão inválida.' });
      return;
    }

    try {
      const actor = await resolveActorScope(auth);
      const db = admin.firestore();
      const sessionRef = db.collection(PROFILE_PHOTO_CAPTURE_COLLECTION).doc(sessionId);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) {
        res.status(404).json({ ok: false, message: 'Sessão não encontrada.' });
        return;
      }
      const data = sessionSnap.data() || {};
      const ownerUid = String(data.ownerUid || '').trim();
      if (!ownerUid || ownerUid !== actor.uid) {
        res.status(403).json({ ok: false, message: 'Você não pode consumir esta sessão.' });
        return;
      }

      await sessionRef.set(
        {
          status: 'consumed',
          photoDataUrl: admin.firestore.FieldValue.delete(),
          tokenHash: admin.firestore.FieldValue.delete(),
          consumedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      res.status(200).json({ ok: true, consumed: true });
    } catch (error) {
      console.error('[profile-photo-capture] consume_session_error', error);
      res.status(500).json({ ok: false, message: 'Não foi possível finalizar a sessão de captura.' });
    }
  });

export const submitProfilePhotoCapture = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const body = parseRequestBody(req);
    const sessionId = normalizeCaptureSessionId(body.sessionId);
    const sessionToken = String(body.sessionToken || '').trim();
    if (!sessionId || sessionToken.length < 16) {
      res.status(400).json({ ok: false, message: 'Sessão de captura inválida.' });
      return;
    }

    let photoDataUrl: string | null = null;
    try {
      photoDataUrl = normalizeMemberPhotoDataUrl(body.photoDataUrl);
    } catch (error: any) {
      const code = String(error?.message || '').toLowerCase();
      if (code === 'photo_too_large') {
        res.status(400).json({ ok: false, message: 'Foto muito grande. Envie uma imagem menor.' });
        return;
      }
      res.status(400).json({ ok: false, message: 'Foto inválida. Use PNG, JPG ou WEBP.' });
      return;
    }
    if (!photoDataUrl) {
      res.status(400).json({ ok: false, message: 'Foto inválida.' });
      return;
    }

    try {
      const db = admin.firestore();
      const sessionRef = db.collection(PROFILE_PHOTO_CAPTURE_COLLECTION).doc(sessionId);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) {
        res.status(404).json({ ok: false, message: 'Sessão não encontrada.' });
        return;
      }
      const data = sessionSnap.data() || {};
      const status = String(data.status || 'pending').trim().toLowerCase();
      if (status === 'consumed') {
        res.status(409).json({ ok: false, message: 'Sessão de captura já finalizada.' });
        return;
      }
      const expiresAtMs =
        typeof data.expiresAtMs === 'number' && Number.isFinite(data.expiresAtMs)
          ? data.expiresAtMs
          : toMs(data.expiresAt);
      if (expiresAtMs && Date.now() > expiresAtMs) {
        await sessionRef.set(
          {
            status: 'expired',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
        res.status(410).json({ ok: false, message: 'QR Code expirado. Gere um novo no desktop.' });
        return;
      }
      const tokenHash = String(data.tokenHash || '').trim();
      if (!safeCompareProfileCaptureHash(tokenHash, sessionToken)) {
        res.status(401).json({ ok: false, message: 'Sessão de captura inválida ou expirada.' });
        return;
      }

      await sessionRef.set(
        {
          status: 'captured',
          photoDataUrl,
          capturedAt: admin.firestore.FieldValue.serverTimestamp(),
          capturedAtMs: Date.now(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      res.status(200).json({ ok: true, uploaded: true });
    } catch (error) {
      console.error('[profile-photo-capture] submit_capture_error', error);
      res.status(500).json({ ok: false, message: 'Não foi possível enviar a foto para o desktop.' });
    }
  });

export const deleteMemberAccount = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const memberUid = String(body.memberUid || '').trim();
    if (!memberUid || memberUid.includes('/')) {
      res.status(400).json({ ok: false, message: 'Membro inválido.' });
      return;
    }

    try {
      const actor = await resolveActorScope(auth);
      if (!actor.active || !canManageMembers(actor.role)) {
        res.status(403).json({ ok: false, message: 'Permissão negada para excluir membros.' });
        return;
      }
      if (memberUid === actor.licenseId) {
        res.status(400).json({ ok: false, message: 'O administrador principal não pode ser excluído.' });
        return;
      }
      if (memberUid === actor.uid) {
        res.status(400).json({ ok: false, message: 'Você não pode excluir seu próprio acesso.' });
        return;
      }

      const db = admin.firestore();
      const membersRef = db
        .collection('users')
        .doc(actor.licenseId)
        .collection(MEMBER_SUBCOLLECTION);
      const relatedMember = await collectRelatedMemberDocs(membersRef, memberUid);
      if (relatedMember.docs.length === 0) {
        res.status(404).json({ ok: false, message: 'Membro não encontrado.' });
        return;
      }

      const resolvedMemberUid = String(relatedMember.resolvedMemberUid || memberUid).trim();
      if (!resolvedMemberUid || resolvedMemberUid.includes('/')) {
        res.status(400).json({ ok: false, message: 'UID do membro inválido.' });
        return;
      }
      const relatedAuthUids = Array.from(
        new Set([memberUid, resolvedMemberUid, ...relatedMember.relatedUids])
      )
        .map((uid) => String(uid || '').trim())
        .filter((uid) => uid && !uid.includes('/'));
      if (relatedAuthUids.includes(actor.licenseId)) {
        res.status(400).json({ ok: false, message: 'O administrador principal não pode ser excluído.' });
        return;
      }
      if (relatedAuthUids.includes(actor.uid)) {
        res.status(400).json({ ok: false, message: 'Você não pode excluir seu próprio acesso.' });
        return;
      }
      const refsToDelete = new Map<string, FirebaseFirestore.DocumentReference>();
      relatedMember.refs.forEach((ref) => refsToDelete.set(ref.path, ref));
      refsToDelete.set(membersRef.doc(memberUid).path, membersRef.doc(memberUid));
      refsToDelete.set(membersRef.doc(resolvedMemberUid).path, membersRef.doc(resolvedMemberUid));

      const membershipRefs = new Map<string, FirebaseFirestore.DocumentReference>();
      relatedAuthUids.forEach((uid) => {
        membershipRefs.set(
          db.collection(MEMBERSHIP_COLLECTION).doc(uid).path,
          db.collection(MEMBERSHIP_COLLECTION).doc(uid)
        );
      });

      await deleteDocumentRefs([
        ...Array.from(refsToDelete.values()),
        ...Array.from(membershipRefs.values())
      ]);

      const authUidsToDelete = relatedAuthUids.filter(
        (uid) => uid && uid !== actor.uid && uid !== actor.licenseId
      );
      for (const authUid of authUidsToDelete) {
        await admin
          .auth()
          .deleteUser(authUid)
          .catch((error: any) => {
            if (isAuthUserNotFoundError(error)) return;
            throw error;
          });
      }

      res.status(200).json({
        ok: true,
        deletedUid: resolvedMemberUid,
        deletedDocIds: Array.from(refsToDelete.values()).map((ref) => ref.id),
        deletedAuthUids: authUidsToDelete
      });
    } catch (error) {
      console.error('[members] delete_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao excluir o membro.' });
    }
  });

export const listUserFeedback = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const rawLimit = Number(body.limit || 80);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 80;
    const queryText = String(body.query || '').trim().toLowerCase();
    const typeFilter = String(body.type || 'all').trim().toLowerCase();
    const statusFilter = String(body.status || 'all').trim().toLowerCase();
    const normalizedType =
      typeFilter === 'bug' || typeFilter === 'improvement' ? typeFilter : 'all';
    const normalizedStatus =
      statusFilter === 'new' || statusFilter === 'reviewed' || statusFilter === 'resolved'
        ? statusFilter
        : 'all';

    try {
      const baseLimit = Math.max(limit, 120);
      const db = admin.firestore();
      let snap: FirebaseFirestore.QuerySnapshot;

      try {
        snap = await db
          .collectionGroup(USER_FEEDBACK_COLLECTION)
          .orderBy('createdAt', 'desc')
          .limit(baseLimit)
          .get();
      } catch (error: any) {
        const rawCode = String(error?.code ?? '').toLowerCase();
        const isFailedPrecondition =
          error?.code === 9 ||
          rawCode.includes('failed-precondition') ||
          rawCode.includes('failed_precondition');

        if (!isFailedPrecondition) {
          throw error;
        }

        console.warn('[feedback] list_fallback_without_order', {
          code: error?.code ?? null,
          message: String(error?.message || '').slice(0, 220)
        });

        // Fallback for environments still lacking the collection-group index.
        // We fetch a larger window and sort in memory by creation timestamp.
        snap = await db
          .collectionGroup(USER_FEEDBACK_COLLECTION)
          .limit(Math.max(baseLimit, 300))
          .get();
      }

      const allItems = snap.docs
        .map(serializeUserFeedback)
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      const filtered = allItems
        .filter((item) => {
          if (normalizedType !== 'all' && item.type !== normalizedType) return false;
          if (normalizedStatus !== 'all' && item.status !== normalizedStatus) return false;
          if (!queryText) return true;
          const haystack = [
            item.message,
            item.reporterEmail,
            item.companyName,
            item.userId,
            item.id,
            item.platform,
            item.appVersion
          ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ');
          return haystack.includes(queryText);
        })
        .slice(0, limit);

      res.status(200).json({
        ok: true,
        items: filtered,
        total: filtered.length
      });
    } catch (error) {
      console.error('[feedback] list_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao carregar feedbacks.' });
    }
  });

export const updateUserFeedbackStatus = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const userId = String(body.userId || '').trim();
    const feedbackId = String(body.feedbackId || '').trim();
    const rawStatus = String(body.status || '')
      .trim()
      .toLowerCase();
    const nextStatus =
      rawStatus === 'reviewed' || rawStatus === 'resolved' || rawStatus === 'new'
        ? rawStatus
        : null;

    if (!userId || !feedbackId || userId.includes('/') || feedbackId.includes('/')) {
      res.status(400).json({ ok: false, message: 'Feedback inválido.' });
      return;
    }
    if (!nextStatus) {
      res.status(400).json({ ok: false, message: 'Status inválido.' });
      return;
    }

    try {
      const ref = admin
        .firestore()
        .collection('users')
        .doc(userId)
        .collection(USER_FEEDBACK_COLLECTION)
        .doc(feedbackId);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ ok: false, message: 'Mensagem não encontrada.' });
        return;
      }

      await ref.set(
        {
          status: nextStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[feedback] status_update_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao atualizar o status.' });
    }
  });

export const deleteUserFeedback = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const userId = String(body.userId || '').trim();
    const feedbackId = String(body.feedbackId || '').trim();

    if (!userId || !feedbackId || userId.includes('/') || feedbackId.includes('/')) {
      res.status(400).json({ ok: false, message: 'Feedback inválido.' });
      return;
    }

    try {
      const ref = admin
        .firestore()
        .collection('users')
        .doc(userId)
        .collection(USER_FEEDBACK_COLLECTION)
        .doc(feedbackId);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ ok: false, message: 'Mensagem não encontrada.' });
        return;
      }

      await ref.delete();
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[feedback] delete_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao excluir a mensagem.' });
    }
  });

export const revokeBetaKey = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const keyId = String(body.keyId || '').trim();
    if (!keyId) {
      res.status(400).json({ ok: false, message: 'Chave inválida.' });
      return;
    }

    try {
      await admin
        .firestore()
        .collection(BETA_KEY_COLLECTION)
        .doc(keyId)
        .set(
          {
            isActive: false,
            revokedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[beta] revoke_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao revogar a chave.' });
    }
  });

export const deleteBetaKey = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const keyId = String(body.keyId || '').trim();
    if (!keyId) {
      res.status(400).json({ ok: false, message: 'Chave inválida.' });
      return;
    }

    try {
      const db = admin.firestore();
      const keyRef = db.collection(BETA_KEY_COLLECTION).doc(keyId);
      const keySnap = await keyRef.get();
      if (!keySnap.exists) {
        res.status(404).json({ ok: false, message: 'Chave não encontrada.' });
        return;
      }

      const keyData = keySnap.data() || {};
      const keyCode = normalizeBetaCode(String(keyData.code || ''));
      const relatedEmails = new Set<string>();
      const requestedEmail = normalizeBetaEmail(String(keyData.requestedEmail || ''));
      const lifetimeGrantedEmail = normalizeBetaEmail(String(keyData.lifetimeGrantedEmail || ''));
      if (requestedEmail && isValidEmail(requestedEmail)) {
        relatedEmails.add(requestedEmail);
      }
      if (lifetimeGrantedEmail && isValidEmail(lifetimeGrantedEmail)) {
        relatedEmails.add(lifetimeGrantedEmail);
      }

      const entitlementSnapById = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      const [byKeySnap, byCodeSnap] = await Promise.all([
        db.collection('entitlements').where('betaKeyId', '==', keyId).get(),
        keyCode ? db.collection('entitlements').where('betaCode', '==', keyCode).get() : null
      ]);
      byKeySnap.docs.forEach((docSnap) => entitlementSnapById.set(docSnap.id, docSnap));
      byCodeSnap?.docs.forEach((docSnap) => entitlementSnapById.set(docSnap.id, docSnap));

      if (relatedEmails.size > 0) {
        const emailSnaps = await Promise.all(
          Array.from(relatedEmails).map((email) => db.collection('entitlements').doc(email).get())
        );
        emailSnaps.forEach((docSnap) => {
          if (docSnap.exists) {
            entitlementSnapById.set(docSnap.id, docSnap);
          }
        });
      }

      type BatchOp =
        | { kind: 'delete'; ref: FirebaseFirestore.DocumentReference }
        | {
            kind: 'set';
            ref: FirebaseFirestore.DocumentReference;
            data: Record<string, unknown>;
          };

      const operations: BatchOp[] = [{ kind: 'delete', ref: keyRef }];
      const betaSourceAllowlist = new Set(['beta', 'trial', 'beta_admin']);
      const betaPlanAllowlist = new Set(['beta', 'trial', 'lifetime']);
      let deletedEntitlements = 0;
      let detachedEntitlements = 0;

      entitlementSnapById.forEach((docSnap) => {
        if (!docSnap.exists) return;
        const data = docSnap.data() || {};
        const source = String(data.source || '').trim().toLowerCase();
        const planType = String(data.planType || '').trim().toLowerCase();
        const entitlementKeyId = String(data.betaKeyId || '').trim();
        const entitlementCode = normalizeBetaCode(String(data.betaCode || ''));
        const entitlementEmail = String(docSnap.id || '').trim().toLowerCase();

        const linkedByKey = entitlementKeyId === keyId;
        const linkedByCode = Boolean(keyCode) && entitlementCode === keyCode;
        const linkedByEmail = relatedEmails.has(entitlementEmail);
        const linkedToDeletedKey = linkedByKey || linkedByCode || linkedByEmail;
        if (!linkedToDeletedKey) return;

        const isStripeEntitlement =
          source.startsWith('stripe') || planType === 'annual' || planType === 'monthly';
        const isBetaEntitlement =
          betaSourceAllowlist.has(source) || betaPlanAllowlist.has(planType);

        if (!isStripeEntitlement && (isBetaEntitlement || linkedByKey || linkedByCode)) {
          operations.push({ kind: 'delete', ref: docSnap.ref });
          deletedEntitlements += 1;
          return;
        }

        if (linkedByKey || linkedByCode) {
          operations.push({
            kind: 'set',
            ref: docSnap.ref,
            data: {
              betaKeyId: admin.firestore.FieldValue.delete(),
              betaCode: admin.firestore.FieldValue.delete(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
          });
          detachedEntitlements += 1;
        }
      });

      for (let start = 0; start < operations.length; start += BATCH_CHUNK_SIZE) {
        const batch = db.batch();
        const chunk = operations.slice(start, start + BATCH_CHUNK_SIZE);
        chunk.forEach((op) => {
          if (op.kind === 'delete') {
            batch.delete(op.ref);
            return;
          }
          batch.set(op.ref, op.data, { merge: true });
        });
        await batch.commit();
      }

      res.status(200).json({
        ok: true,
        deletedEntitlements,
        detachedEntitlements
      });
    } catch (error) {
      console.error('[beta] delete_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao excluir a chave.' });
    }
  });

export const grantLifetimeAccess = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const emailRaw = String(body.email || '').trim();
    const keyId = String(body.keyId || '').trim();
    const codeRaw = String(body.code || '').trim();

    if (!emailRaw || !isValidEmail(emailRaw)) {
      res.status(400).json({ ok: false, message: 'Informe um e-mail válido.' });
      return;
    }

    const email = normalizeBetaEmail(emailRaw);
    let code = codeRaw ? normalizeBetaCode(codeRaw) : '';

    try {
      const beforeState = await getEntitlementSummaryByEmail(email);
      if (keyId) {
        const keyRef = admin.firestore().collection(BETA_KEY_COLLECTION).doc(keyId);
        const keySnap = await keyRef.get();
        if (!keySnap.exists) {
          res.status(404).json({ ok: false, message: 'Chave não encontrada.' });
          return;
        }
        const keyData = keySnap.data() || null;
        if (keyData?.code) {
          code = normalizeBetaCode(String(keyData.code));
        }
      }

      const entitlementRef = admin.firestore().collection('entitlements').doc(email);
      const entitlementSnap = await entitlementRef.get();
      const now = admin.firestore.FieldValue.serverTimestamp();
      const entitlementPayload: Record<string, any> = {
        status: 'active',
        planType: 'lifetime',
        source: 'admin_manual',
        lifetime: true,
        expiresAt: null,
        betaKeyId: admin.firestore.FieldValue.delete(),
        betaCode: admin.firestore.FieldValue.delete(),
        trialDays: admin.firestore.FieldValue.delete(),
        trialStartAt: admin.firestore.FieldValue.delete(),
        manualPlanDays: admin.firestore.FieldValue.delete(),
        lifetimeGrantedBy: auth.uid,
        lifetimeGrantedAt: now,
        lastManualGrantBy: auth.uid,
        lastManualGrantAt: now,
        updatedAt: now
      };
      if (!entitlementSnap.exists) {
        entitlementPayload.createdAt = now;
      }

      await entitlementRef.set(entitlementPayload, { merge: true });
      const cleanup = await cleanupBetaKeys({ email, keyId, code });
      const afterState = await getEntitlementSummaryByEmail(email);
      const auditId = await writeAdminEntitlementAudit({
        actionType: 'assign_plan',
        targetEmail: email,
        actorUid: auth.uid,
        actorEmail: auth.email,
        requestedPlan: 'lifetime',
        keyId: keyId || null,
        code: code || null,
        beforeState,
        afterState,
        cleanup
      });

      const originRaw = String(body.origin || req.headers.origin || '').trim();
      const origin = resolveSafeOrigin(originRaw);
      const loginUrl = `${origin}/login`;
      const emailSent = await sendLifetimeAccessEmail({ email, loginUrl });

      res.status(200).json({
        ok: true,
        email,
        keyId: keyId || null,
        code: code || null,
        matchedBetaKeys: cleanup.matchedBetaKeys,
        deletedBetaKeys: cleanup.deletedBetaKeys,
        betaKeyIds: cleanup.betaKeyIds,
        auditId,
        emailSent
      });
    } catch (error) {
      console.error('[beta] lifetime_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao liberar acesso vitalício.' });
    }
  });

export const assignEntitlementPlan = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const emailRaw = String(body.email || '').trim();
    const planRaw = String(body.plan || '').trim().toLowerCase();
    const keyId = String(body.keyId || '').trim();
    const codeRaw = String(body.code || '').trim();
    const durationDaysRaw = Number(body.durationDays);

    if (!emailRaw || !isValidEmail(emailRaw)) {
      res.status(400).json({ ok: false, message: 'Informe um e-mail válido.' });
      return;
    }
    if (!ADMIN_GRANT_PLANS.has(planRaw as AdminGrantPlan)) {
      res.status(400).json({ ok: false, message: 'Plano inválido.' });
      return;
    }

    const email = normalizeBetaEmail(emailRaw);
    const plan = planRaw as AdminGrantPlan;
    if (plan === 'days' && (!Number.isFinite(durationDaysRaw) || durationDaysRaw <= 0)) {
      res.status(400).json({ ok: false, message: 'Informe um número de dias válido.' });
      return;
    }
    const { durationDays, expiresAtMs, expiresAt } = resolveAdminPlanWindow(plan, durationDaysRaw);
    const code = codeRaw ? normalizeBetaCode(codeRaw) : '';

    try {
      const beforeState = await getEntitlementSummaryByEmail(email);
      const entitlementRef = admin.firestore().collection('entitlements').doc(email);
      const entitlementSnap = await entitlementRef.get();
      const now = admin.firestore.FieldValue.serverTimestamp();
      const planType = plan === 'days' ? 'custom_days' : plan;
      const isLifetime = plan === 'lifetime';
      const entitlementPayload: Record<string, any> = {
        status: 'active',
        planType,
        source: 'admin_manual',
        lifetime: isLifetime,
        expiresAt: isLifetime ? null : expiresAt,
        betaKeyId: admin.firestore.FieldValue.delete(),
        betaCode: admin.firestore.FieldValue.delete(),
        trialDays: admin.firestore.FieldValue.delete(),
        trialStartAt: admin.firestore.FieldValue.delete(),
        manualPlanDays: plan === 'days' ? durationDays : admin.firestore.FieldValue.delete(),
        lastManualGrantBy: auth.uid,
        lastManualGrantAt: now,
        updatedAt: now
      };
      if (!isLifetime) {
        entitlementPayload.lifetimeGrantedBy = admin.firestore.FieldValue.delete();
        entitlementPayload.lifetimeGrantedAt = admin.firestore.FieldValue.delete();
      }
      if (!entitlementSnap.exists) {
        entitlementPayload.createdAt = now;
      }

      await entitlementRef.set(entitlementPayload, { merge: true });
      const cleanup = await cleanupBetaKeys({ email, keyId, code });
      let emailSent: boolean | null = null;
      if (plan === 'lifetime') {
        const originRaw = String(body.origin || req.headers.origin || '').trim();
        const origin = resolveSafeOrigin(originRaw);
        const loginUrl = `${origin}/login`;
        emailSent = await sendLifetimeAccessEmail({ email, loginUrl });
      }
      const afterState = await getEntitlementSummaryByEmail(email);
      const auditId = await writeAdminEntitlementAudit({
        actionType: 'assign_plan',
        targetEmail: email,
        actorUid: auth.uid,
        actorEmail: auth.email,
        requestedPlan: planType,
        requestedDurationDays: durationDays,
        keyId: keyId || null,
        code: code || null,
        beforeState,
        afterState,
        cleanup
      });

      res.status(200).json({
        ok: true,
        email,
        planType,
        durationDays,
        expiresAtMs,
        matchedBetaKeys: cleanup.matchedBetaKeys,
        deletedBetaKeys: cleanup.deletedBetaKeys,
        betaKeyIds: cleanup.betaKeyIds,
        auditId,
        emailSent
      });
    } catch (error) {
      console.error('[entitlement] assign_plan_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao atualizar o plano.' });
    }
  });

export const previewEntitlementPlan = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const emailRaw = String(body.email || '').trim();
    const planRaw = String(body.plan || '').trim().toLowerCase();
    const keyId = String(body.keyId || '').trim();
    const codeRaw = String(body.code || '').trim();
    const durationDaysRaw = Number(body.durationDays);

    if (!emailRaw || !isValidEmail(emailRaw)) {
      res.status(400).json({ ok: false, message: 'Informe um e-mail válido.' });
      return;
    }
    if (!ADMIN_GRANT_PLANS.has(planRaw as AdminGrantPlan)) {
      res.status(400).json({ ok: false, message: 'Plano inválido.' });
      return;
    }

    const email = normalizeBetaEmail(emailRaw);
    const plan = planRaw as AdminGrantPlan;
    if (plan === 'days' && (!Number.isFinite(durationDaysRaw) || durationDaysRaw <= 0)) {
      res.status(400).json({ ok: false, message: 'Informe um número de dias válido.' });
      return;
    }

    const { durationDays, expiresAtMs } = resolveAdminPlanWindow(plan, durationDaysRaw);
    const planType = plan === 'days' ? 'custom_days' : plan;
    const code = codeRaw ? normalizeBetaCode(codeRaw) : '';

    try {
      const beforeState = await getEntitlementSummaryByEmail(email);
      const cleanupPreview = await cleanupBetaKeys({ email, keyId, code }, { dryRun: true });

      res.status(200).json({
        ok: true,
        preview: {
          email,
          planType,
          durationDays,
          expiresAtMs,
          beforeState: compactEntitlementState(beforeState),
          afterState: {
            email,
            status: 'active',
            planType,
            source: 'admin_manual',
            lifetime: plan === 'lifetime',
            expiresAtMs
          },
          cleanup: {
            matchedBetaKeys: cleanupPreview.matchedBetaKeys,
            betaKeyIds: cleanupPreview.betaKeyIds,
            betaKeys: cleanupPreview.betaKeys
          }
        }
      });
    } catch (error) {
      console.error('[entitlement] preview_plan_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao simular o plano.' });
    }
  });

export const bulkManageEntitlements = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const actionRaw = String(body.action || 'assign_plan').trim().toLowerCase();
    const action = actionRaw as AdminBulkAction;
    if (!ADMIN_BULK_ACTIONS.has(action)) {
      res.status(400).json({ ok: false, message: 'Ação em lote inválida.' });
      return;
    }
    const emails = parseEmailList(body.emails ?? body.emailsText ?? body.emailList);
    if (emails.length === 0) {
      res.status(400).json({ ok: false, message: 'Informe pelo menos um e-mail válido.' });
      return;
    }
    if (emails.length > 200) {
      res.status(400).json({ ok: false, message: 'Limite de 200 e-mails por operação.' });
      return;
    }

    const dryRun = body.dryRun === true;
    const planRaw = String(body.plan || 'lifetime').trim().toLowerCase();
    const plan = planRaw as AdminGrantPlan;
    const durationDaysRaw = Number(body.durationDays);
    if (action === 'assign_plan' && !ADMIN_GRANT_PLANS.has(plan)) {
      res.status(400).json({ ok: false, message: 'Plano inválido.' });
      return;
    }
    if (action === 'assign_plan' && plan === 'days' && (!Number.isFinite(durationDaysRaw) || durationDaysRaw <= 0)) {
      res.status(400).json({ ok: false, message: 'Informe um número de dias válido.' });
      return;
    }

    const sendLifetimeEmail = body.sendLifetimeEmail === true;
    const batchId = admin.firestore().collection(ADMIN_AUDIT_COLLECTION).doc().id;
    const results: Array<Record<string, unknown>> = [];
    let successCount = 0;
    let failCount = 0;
    let totalMatchedBetaKeys = 0;
    let totalDeletedBetaKeys = 0;

    for (const email of emails) {
      try {
        const beforeState = await getEntitlementSummaryByEmail(email);
        if (action === 'assign_plan') {
          const { durationDays, expiresAtMs, expiresAt } = resolveAdminPlanWindow(plan, durationDaysRaw);
          const planType = plan === 'days' ? 'custom_days' : plan;
          const isLifetime = plan === 'lifetime';
          const cleanup = await cleanupBetaKeys({ email }, { dryRun });
          totalMatchedBetaKeys += cleanup.matchedBetaKeys;
          totalDeletedBetaKeys += cleanup.deletedBetaKeys;

          const now = admin.firestore.FieldValue.serverTimestamp();
          if (!dryRun) {
            const entitlementRef = admin.firestore().collection('entitlements').doc(email);
            const snap = await entitlementRef.get();
            const payload: Record<string, any> = {
              status: 'active',
              planType,
              source: 'admin_manual',
              lifetime: isLifetime,
              expiresAt: isLifetime ? null : expiresAt,
              betaKeyId: admin.firestore.FieldValue.delete(),
              betaCode: admin.firestore.FieldValue.delete(),
              trialDays: admin.firestore.FieldValue.delete(),
              trialStartAt: admin.firestore.FieldValue.delete(),
              manualPlanDays: plan === 'days' ? durationDays : admin.firestore.FieldValue.delete(),
              lastManualGrantBy: auth.uid,
              lastManualGrantAt: now,
              updatedAt: now
            };
            if (!isLifetime) {
              payload.lifetimeGrantedBy = admin.firestore.FieldValue.delete();
              payload.lifetimeGrantedAt = admin.firestore.FieldValue.delete();
            }
            if (!snap.exists) {
              payload.createdAt = now;
            }
            await entitlementRef.set(payload, { merge: true });
          }

          const afterState = dryRun
            ? {
                ...beforeState,
                status: 'active',
                planType,
                source: 'admin_manual',
                lifetime: isLifetime,
                expiresAtMs: isLifetime ? null : expiresAtMs
              }
            : await getEntitlementSummaryByEmail(email);

          let emailSent: boolean | null = null;
          if (!dryRun && plan === 'lifetime' && sendLifetimeEmail) {
            const originRaw = String(body.origin || req.headers.origin || '').trim();
            const origin = resolveSafeOrigin(originRaw);
            const loginUrl = `${origin}/login`;
            emailSent = await sendLifetimeAccessEmail({ email, loginUrl });
          }

          let auditId: string | null = null;
          if (!dryRun) {
            auditId = await writeAdminEntitlementAudit({
              actionType: 'assign_plan',
              targetEmail: email,
              actorUid: auth.uid,
              actorEmail: auth.email,
              requestedPlan: planType,
              requestedDurationDays: durationDays,
              beforeState,
              afterState: afterState as EntitlementSummary,
              cleanup,
              batchId
            });
          }

          successCount += 1;
          results.push({
            ok: true,
            email,
            action,
            dryRun,
            planType,
            durationDays,
            expiresAtMs: isLifetime ? null : expiresAtMs,
            matchedBetaKeys: cleanup.matchedBetaKeys,
            deletedBetaKeys: cleanup.deletedBetaKeys,
            betaKeyIds: cleanup.betaKeyIds,
            auditId,
            emailSent
          });
          continue;
        }

        const cleanup = await cleanupBetaKeys({ email }, { dryRun });
        totalMatchedBetaKeys += cleanup.matchedBetaKeys;
        totalDeletedBetaKeys += cleanup.deletedBetaKeys;

        if (!dryRun) {
          const entitlementRef = admin.firestore().collection('entitlements').doc(email);
          const snap = await entitlementRef.get();
          const now = admin.firestore.FieldValue.serverTimestamp();
          const payload: Record<string, any> = {
            status: 'inactive',
            source: 'admin_manual',
            lifetime: false,
            expiresAt: admin.firestore.Timestamp.now(),
            betaKeyId: admin.firestore.FieldValue.delete(),
            betaCode: admin.firestore.FieldValue.delete(),
            trialDays: admin.firestore.FieldValue.delete(),
            trialStartAt: admin.firestore.FieldValue.delete(),
            manualPlanDays: admin.firestore.FieldValue.delete(),
            revokedBy: auth.uid,
            revokedAt: now,
            updatedAt: now
          };
          if (!snap.exists) {
            payload.createdAt = now;
          }
          await entitlementRef.set(payload, { merge: true });
        }

        const afterState = dryRun
          ? { ...beforeState, status: 'inactive', source: 'admin_manual', lifetime: false }
          : await getEntitlementSummaryByEmail(email);

        let auditId: string | null = null;
        if (!dryRun) {
          auditId = await writeAdminEntitlementAudit({
            actionType: 'revoke_access',
            targetEmail: email,
            actorUid: auth.uid,
            actorEmail: auth.email,
            beforeState,
            afterState: afterState as EntitlementSummary,
            cleanup,
            batchId
          });
        }

        successCount += 1;
        results.push({
          ok: true,
          email,
          action,
          dryRun,
          matchedBetaKeys: cleanup.matchedBetaKeys,
          deletedBetaKeys: cleanup.deletedBetaKeys,
          betaKeyIds: cleanup.betaKeyIds,
          auditId
        });
      } catch (error: any) {
        failCount += 1;
        results.push({
          ok: false,
          email,
          action,
          message: error?.message || 'Falha na operação.'
        });
      }
    }

    if (!dryRun) {
      await writeAdminEntitlementAudit({
        actionType: action === 'assign_plan' ? 'bulk_assign_plan' : 'bulk_revoke_access',
        actorUid: auth.uid,
        actorEmail: auth.email,
        requestedPlan: action === 'assign_plan' ? plan : null,
        requestedDurationDays:
          action === 'assign_plan' && plan === 'days'
            ? Math.floor(durationDaysRaw)
            : null,
        rollbackAvailable: false,
        batchId,
        metadata: {
          total: emails.length,
          successCount,
          failCount,
          totalMatchedBetaKeys,
          totalDeletedBetaKeys
        }
      });
    }

    res.status(200).json({
      ok: true,
      dryRun,
      action,
      batchId: dryRun ? null : batchId,
      total: emails.length,
      successCount,
      failCount,
      totalMatchedBetaKeys,
      totalDeletedBetaKeys,
      results
    });
  });

export const listEntitlementAdminAudit = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }
    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const emailRaw = String(body.email || '').trim();
    const email = emailRaw ? normalizeBetaEmail(emailRaw) : '';
    const limitRaw = Number(body.limit || 40);
    const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 40));

    try {
      const db = admin.firestore();
      let docs: FirebaseFirestore.DocumentSnapshot[] = [];
      if (email && isValidEmail(email)) {
        const snap = await db.collection(ADMIN_AUDIT_COLLECTION).where('targetEmail', '==', email).limit(200).get();
        docs = snap.docs.sort((a, b) => (toMs(b.get('createdAt')) || 0) - (toMs(a.get('createdAt')) || 0)).slice(0, limit);
      } else {
        const snap = await db.collection(ADMIN_AUDIT_COLLECTION).orderBy('createdAt', 'desc').limit(limit).get();
        docs = snap.docs;
      }
      res.status(200).json({
        ok: true,
        items: docs.map((docSnap) => serializeAuditDoc(docSnap))
      });
    } catch (error) {
      console.error('[entitlement] audit_list_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao listar auditoria.' });
    }
  });

export const rollbackLastEntitlementAction = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }
    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const actionIdRaw = String(body.actionId || '').trim();
    const emailRaw = String(body.email || '').trim();
    const email = emailRaw ? normalizeBetaEmail(emailRaw) : '';
    if (!actionIdRaw && (!email || !isValidEmail(email))) {
      res.status(400).json({ ok: false, message: 'Informe o actionId ou um e-mail válido.' });
      return;
    }

    try {
      const db = admin.firestore();
      let auditSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      if (actionIdRaw) {
        const direct = await db.collection(ADMIN_AUDIT_COLLECTION).doc(actionIdRaw).get();
        if (direct.exists) {
          auditSnap = direct;
        }
      } else {
        const snap = await db.collection(ADMIN_AUDIT_COLLECTION).where('targetEmail', '==', email).limit(200).get();
        const candidates = snap.docs
          .filter((docSnap) => {
            const data = docSnap.data() || {};
            const rollbackAvailable = data.rollbackAvailable !== false;
            const rolledBackAt = data.rolledBackAt;
            const actionType = String(data.actionType || '');
            return rollbackAvailable && !rolledBackAt && actionType !== 'rollback';
          })
          .sort((a, b) => (toMs(b.get('createdAt')) || 0) - (toMs(a.get('createdAt')) || 0));
        auditSnap = candidates[0] || null;
      }

      if (!auditSnap || !auditSnap.exists) {
        res.status(404).json({ ok: false, message: 'Nenhuma ação reversível encontrada.' });
        return;
      }
      const auditData = auditSnap.data() || {};
      if (auditData.rolledBackAt) {
        res.status(409).json({ ok: false, message: 'Esta ação já foi revertida.' });
        return;
      }

      const targetEmail = normalizeBetaEmail(String(auditData.targetEmail || email || ''));
      if (!targetEmail || !isValidEmail(targetEmail)) {
        res.status(400).json({ ok: false, message: 'A ação não possui targetEmail válido.' });
        return;
      }

      const beforeRollbackState = await getEntitlementSummaryByEmail(targetEmail);
      const entitlementRef = db.collection('entitlements').doc(targetEmail);
      const beforeState = auditData.beforeState || null;
      const beforeData = auditData.beforeData || null;
      if (beforeState?.exists && beforeData) {
        await entitlementRef.set(beforeData, { merge: false });
      } else {
        await entitlementRef.delete().catch(() => undefined);
      }

      const keySnapshots = Array.isArray(auditData.restorableDeletedBetaKeys)
        ? (auditData.restorableDeletedBetaKeys as Array<{ id?: string; data?: FirebaseFirestore.DocumentData }>)
        : [];
      const restoreChunks = chunkArray(keySnapshots, BATCH_CHUNK_SIZE);
      for (const chunk of restoreChunks) {
        const batch = db.batch();
        chunk.forEach((entry) => {
          const id = String(entry?.id || '').trim();
          if (!id || !entry?.data || typeof entry.data !== 'object') return;
          batch.set(db.collection(BETA_KEY_COLLECTION).doc(id), entry.data, { merge: false });
        });
        await batch.commit();
      }

      await auditSnap.ref.set(
        {
          rolledBackAt: admin.firestore.FieldValue.serverTimestamp(),
          rolledBackBy: auth.uid,
          rollbackAvailable: false
        },
        { merge: true }
      );

      const afterRollbackState = await getEntitlementSummaryByEmail(targetEmail);
      const rollbackAuditId = await writeAdminEntitlementAudit({
        actionType: 'rollback',
        targetEmail,
        actorUid: auth.uid,
        actorEmail: auth.email,
        beforeState: beforeRollbackState,
        afterState: afterRollbackState,
        cleanup: {
          matchedBetaKeys: keySnapshots.length,
          deletedBetaKeys: 0,
          betaKeyIds: keySnapshots
            .map((entry) => String(entry?.id || '').trim())
            .filter((entry) => Boolean(entry)),
          betaKeys: [],
          betaKeySnapshots: []
        },
        rollbackAvailable: false,
        rollbackOfActionId: auditSnap.id
      });

      res.status(200).json({
        ok: true,
        targetEmail,
        rolledBackActionId: auditSnap.id,
        rollbackAuditId,
        restoredBetaKeys: keySnapshots.length,
        beforeState: compactEntitlementState(beforeRollbackState),
        afterState: compactEntitlementState(afterRollbackState)
      });
    } catch (error) {
      console.error('[entitlement] rollback_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao executar rollback.' });
    }
  });

export const searchAdminRecords = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }
    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body = parseRequestBody(req);
    const queryRaw = String(body.query || '').trim();
    if (!queryRaw) {
      res.status(400).json({ ok: false, message: 'Informe um termo de busca.' });
      return;
    }

    const queryLower = normalizeTextLoose(queryRaw);
    const queryUpper = normalizeBetaCode(queryRaw);
    const asEmail = isValidEmail(queryLower) ? queryLower : '';
    const db = admin.firestore();

    try {
      const usersByIdPromise = db.collection('users').doc(queryRaw).get();
      const usersByEmailPromise = asEmail
        ? db.collection('users').where('emailNormalized', '==', asEmail).limit(10).get()
        : db.collection('users').where('email', '==', queryRaw).limit(10).get();

      const entitlementsByEmailPromise = asEmail
        ? db.collection('entitlements').doc(asEmail).get()
        : Promise.resolve(null);

      const [betaByCode, betaById, betaByRequestedEmail, betaByLifetimeEmail] = await Promise.all([
        db.collection(BETA_KEY_COLLECTION).where('code', '==', queryUpper).limit(20).get(),
        db.collection(BETA_KEY_COLLECTION).doc(queryRaw).get(),
        asEmail
          ? db.collection(BETA_KEY_COLLECTION).where('requestedEmail', '==', asEmail).limit(20).get()
          : Promise.resolve(null),
        asEmail
          ? db.collection(BETA_KEY_COLLECTION).where('lifetimeGrantedEmail', '==', asEmail).limit(20).get()
          : Promise.resolve(null)
      ]);

      const [usersById, usersByEmail, entitlementByEmail] = await Promise.all([
        usersByIdPromise,
        usersByEmailPromise,
        entitlementsByEmailPromise
      ]);

      const entitlementFieldQueries = await Promise.all([
        db.collection('entitlements').where('stripeCustomerId', '==', queryRaw).limit(10).get(),
        db.collection('entitlements').where('stripeSubscriptionId', '==', queryRaw).limit(10).get(),
        db.collection('entitlements').where('stripePaymentIntentId', '==', queryRaw).limit(10).get(),
        db.collection('entitlements').where('stripeCheckoutSessionId', '==', queryRaw).limit(10).get()
      ]);

      const userMatchesById = new Map<string, Record<string, unknown>>();
      const addUser = (docSnap: FirebaseFirestore.DocumentSnapshot | null) => {
        if (!docSnap || !docSnap.exists) return;
        const data = docSnap.data() || {};
        userMatchesById.set(docSnap.id, {
          uid: docSnap.id,
          email: data.email || null,
          emailNormalized: data.emailNormalized || null,
          licenseId: data.licenseId || null,
          tenantId: data.tenantId || null,
          lastActiveAtMs: toMs(data.lastActiveAt)
        });
      };
      addUser(usersById);
      usersByEmail.docs.forEach((docSnap) => addUser(docSnap));

      const entitlementMatchesById = new Map<string, Record<string, unknown>>();
      const addEntitlement = (docSnap: FirebaseFirestore.DocumentSnapshot | null) => {
        if (!docSnap || !docSnap.exists) return;
        const data = docSnap.data() || {};
        const summary = getEntitlementSummary(String(docSnap.id || ''), data, true);
        entitlementMatchesById.set(docSnap.id, {
          email: docSnap.id,
          ...compactEntitlementState(summary),
          stripeCustomerId: data.stripeCustomerId || null,
          stripeSubscriptionId: data.stripeSubscriptionId || null,
          stripePaymentIntentId: data.stripePaymentIntentId || null,
          stripeCheckoutSessionId: data.stripeCheckoutSessionId || null
        });
      };
      addEntitlement(entitlementByEmail);
      entitlementFieldQueries.forEach((snap) => snap.docs.forEach((docSnap) => addEntitlement(docSnap)));

      const betaMatchesById = new Map<string, BetaKeyMatch>();
      const addBeta = (docSnap: FirebaseFirestore.DocumentSnapshot | null) => {
        if (!docSnap || !docSnap.exists) return;
        betaMatchesById.set(docSnap.id, serializeBetaKeyMatch(docSnap));
      };
      addBeta(betaById);
      betaByCode.docs.forEach((docSnap) => addBeta(docSnap));
      betaByRequestedEmail?.docs.forEach((docSnap) => addBeta(docSnap));
      betaByLifetimeEmail?.docs.forEach((docSnap) => addBeta(docSnap));

      const auditMatches: Array<Record<string, unknown>> = [];
      if (asEmail) {
        const auditSnap = await db
          .collection(ADMIN_AUDIT_COLLECTION)
          .where('targetEmail', '==', asEmail)
          .limit(20)
          .get();
        auditMatches.push(...auditSnap.docs.map((docSnap) => serializeAuditDoc(docSnap)));
      }

      // Fallback parcial por contains para uma visão única mais útil.
      if (
        userMatchesById.size === 0 &&
        entitlementMatchesById.size === 0 &&
        betaMatchesById.size === 0 &&
        auditMatches.length === 0
      ) {
        const [usersScan, entScan, betaScan] = await Promise.all([
          db.collection('users').limit(250).get(),
          db.collection('entitlements').limit(250).get(),
          db.collection(BETA_KEY_COLLECTION).limit(250).get()
        ]);
        usersScan.docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const haystack = [
            docSnap.id,
            String(data.email || ''),
            String(data.emailNormalized || ''),
            String(data.licenseId || ''),
            String(data.tenantId || '')
          ]
            .join(' ')
            .toLowerCase();
          if (haystack.includes(queryLower)) {
            addUser(docSnap);
          }
        });
        entScan.docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const haystack = [
            docSnap.id,
            String(data.status || ''),
            String(data.planType || ''),
            String(data.source || ''),
            String(data.stripeCustomerId || ''),
            String(data.stripeSubscriptionId || ''),
            String(data.stripePaymentIntentId || ''),
            String(data.stripeCheckoutSessionId || '')
          ]
            .join(' ')
            .toLowerCase();
          if (haystack.includes(queryLower)) {
            addEntitlement(docSnap);
          }
        });
        betaScan.docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const haystack = [
            docSnap.id,
            String(data.code || ''),
            String(data.requestedEmail || ''),
            String(data.lifetimeGrantedEmail || '')
          ]
            .join(' ')
            .toLowerCase();
          if (haystack.includes(queryLower)) {
            addBeta(docSnap);
          }
        });
      }

      res.status(200).json({
        ok: true,
        query: queryRaw,
        result: {
          users: Array.from(userMatchesById.values()),
          entitlements: Array.from(entitlementMatchesById.values()),
          betaKeys: Array.from(betaMatchesById.values()),
          audit: auditMatches
        }
      });
    } catch (error) {
      console.error('[entitlement] search_admin_records_error', error);
      res.status(500).json({ ok: false, message: 'Falha na busca administrativa.' });
    }
  });

const resolveSafeOrigin = (raw: string) => {
  const fallback = 'https://meumeiapp.com.br';
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    const allowedHosts = new Set([
      'meumeiapp.com.br',
      'www.meumeiapp.com.br',
      'meumei-d88be.web.app',
      'meumei-d88be.firebaseapp.com',
      'meumeiapp.web.app',
      'meumeiapp.firebaseapp.com',
      'localhost:3000'
    ]);
    if (allowedHosts.has(url.host)) return url.origin;
  } catch {
    return fallback;
  }
  return fallback;
};

export const requestTrialKey = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const body = parseRequestBody(req);
    const emailRaw = String(body.email || '').trim();
    if (!emailRaw || !isValidEmail(emailRaw)) {
      res.status(400).json({ ok: false, message: 'Informe um e-mail válido.' });
      return;
    }

    const email = normalizeBetaEmail(emailRaw);
    const originRaw = String(body.origin || req.headers.origin || '').trim();
    const origin = resolveSafeOrigin(originRaw);
    const nowMs = Date.now();
    const entitlementRef = admin.firestore().collection('entitlements').doc(email);

    try {
      const entitlementSnap = await entitlementRef.get();
      if (entitlementSnap.exists) {
        const data = entitlementSnap.data() || {};
        const status = String(data.status || '');
        const expired = (() => {
          const raw = data.expiresAt;
          if (!raw) return false;
          if (typeof raw.toMillis === 'function') return raw.toMillis() <= nowMs;
          if (typeof raw.seconds === 'number') return raw.seconds * 1000 <= nowMs;
          return false;
        })();
        if (status === 'active' && !expired) {
          res.status(200).json({
            ok: true,
            status: 'already_active',
            message: 'Seu acesso já está ativo.'
          });
          return;
        }
        const source = String(data.source || '');
        const planType = String(data.planType || '');
        if (source === 'trial' || planType === 'trial') {
          res.status(403).json({
            ok: false,
            status: 'trial_used',
            message: 'Seu teste grátis já foi utilizado. Assine para continuar.'
          });
          return;
        }
      }

      const existingSnap = await admin
        .firestore()
        .collection(BETA_KEY_COLLECTION)
        .where('requestedEmail', '==', email)
        .limit(5)
        .get();

      const toMs = (value: any) => {
        if (!value) return 0;
        if (typeof value.toMillis === 'function') return value.toMillis();
        if (typeof value.seconds === 'number') return value.seconds * 1000;
        return 0;
      };

      const candidates = existingSnap.docs
        .map((doc) => ({ doc, data: doc.data() || {} }))
        .sort((a, b) => toMs(b.data.createdAt) - toMs(a.data.createdAt));

      let code = '';
      let keyDocId: string | null = null;
      candidates.some(({ doc, data }) => {
        const maxUses = Number(data.maxUses || 0);
        const uses = Number(data.uses || 0);
        const isActive = data.isActive !== false;
        const expiresAt = data.expiresAt;
        const expired =
          expiresAt &&
          typeof expiresAt.toMillis === 'function' &&
          expiresAt.toMillis() < nowMs;
        if (isActive && (!maxUses || uses < maxUses) && !expired) {
          keyDocId = doc.id;
          code = String(data.code || '');
          return true;
        }
        return false;
      });

      if (!code) {
        code = await ensureUniqueBetaCode();
        const expiresAt = admin.firestore.Timestamp.fromMillis(nowMs + TRIAL_DURATION_DAYS * DAY_MS);
        const createdRef = await admin.firestore().collection(BETA_KEY_COLLECTION).add({
          code,
          durationDays: TRIAL_DURATION_DAYS,
          maxUses: 1,
          uses: 0,
          isActive: true,
          source: 'trial',
          requestedEmail: email,
          createdBy: 'system',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt
        });
        keyDocId = createdRef.id;
      } else if (keyDocId) {
        await admin.firestore().collection(BETA_KEY_COLLECTION).doc(keyDocId).set(
          {
            lastRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }

      const loginUrl = `${origin}/login?beta=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}`;
      const emailSent = await sendTrialEmail({ email, code, loginUrl });

      if (!emailSent) {
        res.status(200).json({
          ok: true,
          status: 'email_failed',
          code,
          loginUrl,
          message: 'Não foi possível enviar o e-mail agora. Use a chave abaixo para entrar.'
        });
        return;
      }

      res.status(200).json({
        ok: true,
        status: 'sent',
        code,
        loginUrl,
        message: 'Enviamos a chave de teste para o seu e-mail.'
      });
    } catch (error) {
      console.error('[trial] request_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao gerar a chave de teste.' });
    }
  });

export const redeemBetaKey = functions
  .region('us-central1')
  .https.onRequest(async (req, res) => {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, message: 'Método não permitido.' });
      return;
    }

    const body = parseRequestBody(req);
    const emailRaw = String(body.email || '').trim();
    const codeRaw = String(body.code || '').trim();
    if (!emailRaw || !codeRaw) {
      res.status(400).json({ ok: false, message: 'Informe e-mail e chave.' });
      return;
    }

    const email = normalizeBetaEmail(emailRaw);
    const code = normalizeBetaCode(codeRaw);
    const nowMs = Date.now();

    try {
      const result = await admin.firestore().runTransaction(async (tx) => {
        const query = admin
          .firestore()
          .collection(BETA_KEY_COLLECTION)
          .where('code', '==', code)
          .limit(1);
        const querySnap = await tx.get(query);
        if (querySnap.empty) {
          throw new Error('invalid_code');
        }
        const keyDoc = querySnap.docs[0];
        const data = keyDoc.data() || {};
        if (data.isActive === false) {
          throw new Error('inactive');
        }
        const maxUses = Number(data.maxUses || 0);
        const uses = Number(data.uses || 0);
        if (!maxUses || uses >= maxUses) {
          throw new Error('max_uses');
        }
        const requestedEmail = String(data.requestedEmail || '').trim().toLowerCase();
        if (requestedEmail && requestedEmail !== email) {
          throw new Error('email_mismatch');
        }
        const expiresAt = data.expiresAt;
        if (expiresAt && typeof expiresAt.toMillis === 'function' && expiresAt.toMillis() < nowMs) {
          throw new Error('expired');
        }
        const durationDays = Number(data.durationDays || 14);
        const durationMs = Math.max(durationDays, 1) * DAY_MS;
        const entitlementExpiresAt = admin.firestore.Timestamp.fromMillis(nowMs + durationMs);
        const source = String(data.source || 'beta');
        const planType = source === 'trial' ? 'trial' : 'beta';
        const entitlementRef = admin.firestore().collection('entitlements').doc(email);
        tx.set(
          entitlementRef,
          {
            status: 'active',
            planType,
            source,
            betaKeyId: keyDoc.id,
            betaCode: code,
            trialDays: source === 'trial' ? durationDays : null,
            trialStartAt: source === 'trial' ? admin.firestore.FieldValue.serverTimestamp() : null,
            expiresAt: entitlementExpiresAt,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
        tx.update(keyDoc.ref, {
          uses: admin.firestore.FieldValue.increment(1),
          lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { expiresAtMs: nowMs + durationMs };
      });

      res.status(200).json({ ok: true, expiresAtMs: result.expiresAtMs });
    } catch (error: any) {
      const reason = error?.message || 'unknown';
      console.error('[beta] redeem_error', { reason });
      if (reason === 'invalid_code') {
        res.status(404).json({ ok: false, message: 'Chave não encontrada.' });
        return;
      }
      if (reason === 'inactive') {
        res.status(403).json({ ok: false, message: 'Chave desativada.' });
        return;
      }
      if (reason === 'max_uses') {
        res.status(403).json({ ok: false, message: 'Chave já utilizada.' });
        return;
      }
      if (reason === 'expired') {
        res.status(403).json({ ok: false, message: 'Chave expirada.' });
        return;
      }
      if (reason === 'email_mismatch') {
        res.status(403).json({ ok: false, message: 'Esta chave está vinculada a outro e-mail.' });
        return;
      }
      res.status(500).json({ ok: false, message: 'Falha ao validar a chave.' });
    }
  });

export const pushNotificationRequest = functions
  .region('us-central1')
  .firestore.document('users/{uid}/pushRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const uid = context.params.uid;
    const data = snap.data() || {};
    const title = typeof data.title === 'string' ? data.title.trim() : 'meumei';
    const body = typeof data.body === 'string' ? data.body.trim() : '';
    const url = typeof data.url === 'string' ? data.url.trim() : '/';

    const result = await sendPushToUser(uid, { title, body, url });

    await snap.ref.set(
      {
        status: result.ok ? 'sent' : 'failed',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        successCount: result.successCount || 0,
        failureCount: result.failureCount || 0,
        errorCodes: result.errorCodes || []
      },
      { merge: true }
    );
  });

export const sendDailyTipNotifications = functions.pubsub
  .schedule('0 16 * * *')
  .timeZone(DAILY_TIP_TIMEZONE)
  .onRun(async () => {
    const todayKey = getSaoPauloDateKey();
    const tokensSnap = await admin.firestore().collectionGroup('pushTokens').get();

    if (tokensSnap.empty) {
      console.log('[daily-tips] no push tokens');
      return null;
    }

    const uids = new Set<string>();
    tokensSnap.docs.forEach((doc) => {
      const userRef = doc.ref.parent.parent;
      if (userRef?.id) {
        uids.add(userRef.id);
      }
    });

    for (const uid of uids) {
      const settingsRef = admin
        .firestore()
        .collection('users')
        .doc(uid)
        .collection('settings')
        .doc('notifications');
      const settingsSnap = await settingsRef.get();
      const enabled = settingsSnap.exists ? settingsSnap.get('enabled') !== false : true;
      if (!enabled) continue;
      const lastDate = typeof settingsSnap.get('lastDailyTipDate') === 'string' ? settingsSnap.get('lastDailyTipDate') : '';
      if (lastDate === todayKey) continue;

      const tipIndex = pickTipIndex(`${todayKey}:${uid}`, DAILY_TIPS.length);
      const tip = DAILY_TIPS[tipIndex];
      const result = await sendPushToUser(uid, {
        title: tip.title,
        body: tip.body,
        url: '/onboarding'
      });

      await settingsRef.set(
        {
          enabled: true,
          lastDailyTipDate: todayKey,
          lastDailyTipId: tip.id,
          lastDailyTipStatus: result.ok ? 'sent' : 'failed',
          lastDailyTipUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    return null;
  });

export const sendAgendaNotifications = functions.pubsub
  .schedule('every 5 minutes')
  .timeZone(DAILY_TIP_TIMEZONE)
  .onRun(async () => {
    const nowMs = Date.now();
    const windowMs = 60 * 60 * 1000; // 1h de tolerância para evitar envio tardio demais

    const pendingSnap = await admin
      .firestore()
      .collectionGroup('agenda')
      .where('notifyStatus', '==', 'pending')
      .where('notifyAtMs', '<=', nowMs)
      .where('notifyAtMs', '>=', nowMs - windowMs)
      .limit(200)
      .get();

    if (pendingSnap.empty) {
      console.log('[agenda-push] nothing_due');
      return null;
    }

    const grouped = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    pendingSnap.docs.forEach((doc) => {
      const uid = doc.ref.parent.parent?.id;
      if (!uid) return;
      const list = grouped.get(uid) || [];
      list.push(doc);
      grouped.set(uid, list);
    });

    for (const [uid, docs] of grouped.entries()) {
      const settingsRef = admin
        .firestore()
        .collection('users')
        .doc(uid)
        .collection('settings')
        .doc('notifications');
      const settingsSnap = await settingsRef.get();
      const enabled = settingsSnap.exists ? settingsSnap.get('enabled') !== false : true;

      const sorted = [...docs].sort(
        (a, b) => (a.get('notifyAtMs') || 0) - (b.get('notifyAtMs') || 0)
      );
      const primary = sorted[0];
      const primaryTitle = typeof primary.get('title') === 'string' ? primary.get('title') : 'Agendamento';
      const primaryTime = typeof primary.get('time') === 'string' ? primary.get('time') : '';
      const body =
        sorted.length === 1
          ? `${primaryTime ? `${primaryTime} · ` : ''}${primaryTitle}`
          : `${sorted.length} agendamentos agora. Próximo: ${primaryTime ? `${primaryTime} · ` : ''}${primaryTitle}`;

      let result = { ok: false };
      if (enabled) {
        result = await sendPushToUser(uid, {
          title: 'Lembrete da agenda',
          body,
          url: '/app'
        });
      }

      const nextStatus = enabled ? (result.ok ? 'sent' : 'failed') : 'skipped';
      const batch = admin.firestore().batch();
      docs.forEach((doc) => {
        batch.set(
          doc.ref,
          {
            notifyStatus: nextStatus,
            notifiedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    return null;
  });

export const requestRefund = functions.https.onRequest(async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = (req.body && (req.body.data || req.body)) || {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const purchaseDate = String(body.purchaseDate || '').trim();
  const orderId = String(body.orderId || '').trim();
  const reason = String(body.reason || '').trim();
  const details = String(body.details || '').trim();

  if (!name || !email || !purchaseDate) {
    res.status(400).json({ error: 'missing_fields', message: 'Informe nome, e-mail e data da compra.' });
    return;
  }

  const payload = {
    name,
    email,
    purchaseDate,
    orderId: orderId || null,
    reason: reason || null,
    details: details || null,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const normalizedEmail = email.trim().toLowerCase();
  const refundRef = admin.firestore().collection('refundRequests').doc();

  try {
    await refundRef.set({
      ...payload,
      requestId: refundRef.id,
      normalizedEmail
    });
  } catch (error) {
    console.error('[refund] firestore_error', error);
  }

  const subject = `Solicitação de reembolso - ${name}`;
  const text = [
    `Nome: ${name}`,
    `E-mail: ${email}`,
    `Data da compra: ${purchaseDate}`,
    orderId ? `Pedido: ${orderId}` : '',
    reason ? `Motivo: ${reason}` : '',
    details ? `Detalhes: ${details}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  const stripe = getStripeClient();
  if (!stripe) {
    const delivered = await sendRefundEmail({ name, email }, subject, text);
    res.status(200).json({
      ok: true,
      pendingEmail: !delivered,
      message:
        'Solicitação registrada. Nossa equipe entrará em contato em breve.'
    });
    return;
  }

  let entitlementData: FirebaseFirestore.DocumentData | null = null;
  try {
    const entitlementSnap = await admin.firestore().collection('entitlements').doc(normalizedEmail).get();
    entitlementData = entitlementSnap.exists ? entitlementSnap.data() || null : null;
  } catch (error) {
    console.error('[refund] entitlement_lookup_error', error);
  }

  if (!entitlementData) {
    await refundRef.set(
      { status: 'not_found', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    res.status(404).json({
      ok: false,
      message: 'Não encontramos a compra com este e-mail. Verifique e tente novamente.'
    });
    return;
  }

  if (entitlementData.status && entitlementData.status !== 'active') {
    await refundRef.set(
      {
        status: 'already_processed',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    res.status(200).json({
      ok: true,
      status: 'already_processed',
      message: 'Esta compra já foi processada anteriormente.'
    });
    return;
  }

  const stripeSubscriptionId =
    typeof entitlementData.stripeSubscriptionId === 'string'
      ? entitlementData.stripeSubscriptionId
      : '';
  const planType =
    (typeof entitlementData.planType === 'string' && entitlementData.planType) ||
    (stripeSubscriptionId ? 'monthly' : 'annual');

  await refundRef.set(
    {
      planType,
      stripeSubscriptionId: stripeSubscriptionId || null,
      stripeCustomerId: entitlementData.stripeCustomerId || null
    },
    { merge: true }
  );

  if (planType === 'monthly' && stripeSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
        expand: ['latest_invoice.payment_intent']
      });
      const latestInvoice: any = subscription.latest_invoice;
      const paymentIntent =
        latestInvoice && latestInvoice.payment_intent
          ? latestInvoice.payment_intent
          : null;
      const invoiceCreated =
        latestInvoice && typeof latestInvoice.created === 'number'
          ? latestInvoice.created * 1000
          : 0;
      const intentCreated =
        paymentIntent && typeof paymentIntent.created === 'number'
          ? paymentIntent.created * 1000
          : 0;
      const purchaseMs = invoiceCreated || intentCreated || 0;
      const paymentIntentId =
        paymentIntent && typeof paymentIntent.id === 'string'
          ? paymentIntent.id
          : '';

      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      await stripe.subscriptions.cancel(stripeSubscriptionId);

      if (purchaseMs && now - purchaseMs <= sevenDaysMs && paymentIntentId) {
        const refund = await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer'
          },
          { idempotencyKey: `refund_${paymentIntentId}_${refundRef.id}` }
        );

        await refundRef.set(
          {
            status: 'refunded',
            stripeRefundId: refund.id,
            refundedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );

        await admin.firestore().collection('entitlements').doc(normalizedEmail).set(
          {
            status: 'refunded',
            planType: 'monthly',
            refundStatus: 'refunded',
            refundId: refund.id,
            refundRequestId: refundRef.id,
            refundedAt: admin.firestore.FieldValue.serverTimestamp(),
            subscriptionStatus: 'canceled'
          },
          { merge: true }
        );

        await sendRefundEmail(
          { name, email },
          `Reembolso aprovado - ${name}`,
          'Reembolso aprovado e solicitado ao meio de pagamento.',
          'Reembolso aprovado',
          'Seu reembolso foi aprovado e já foi solicitado ao meio de pagamento. O prazo para aparecer na fatura pode variar conforme a operadora do cartão.'
        );

        res.status(200).json({
          ok: true,
          status: 'refunded',
          message: 'Reembolso aprovado automaticamente. Você receberá confirmação por e-mail.'
        });
        return;
      }

      await refundRef.set(
        {
          status: 'canceled_no_refund',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await admin.firestore().collection('entitlements').doc(normalizedEmail).set(
        {
          status: 'canceled',
          planType: 'monthly',
          refundStatus: 'rejected_outside_window',
          refundRequestId: refundRef.id,
          refundRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
          subscriptionStatus: 'canceled'
        },
        { merge: true }
      );

      await sendRefundEmail(
        { name, email },
        `Assinatura cancelada - ${name}`,
        'Assinatura mensal cancelada sem reembolso (prazo de 7 dias expirado).',
        'Assinatura cancelada',
        'Sua assinatura mensal foi cancelada. Como o prazo de 7 dias corridos já expirou, não há reembolso do período já pago.'
      );

      res.status(200).json({
        ok: true,
        status: 'canceled',
        message: 'Assinatura cancelada. Prazo de reembolso expirado.'
      });
      return;
    } catch (error) {
      console.error('[refund] monthly_refund_error', error);
      await refundRef.set(
        { status: 'refund_failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      res.status(500).json({
        ok: false,
        message: 'Não foi possível processar o cancelamento. Tente novamente.'
      });
      return;
    }
  }

  let paymentIntentId =
    typeof entitlementData.stripePaymentIntentId === 'string'
      ? entitlementData.stripePaymentIntentId
      : '';
  const createdRaw = entitlementData.stripeCheckoutSessionCreated;
  let purchaseMs = 0;
  if (typeof createdRaw === 'number') {
    purchaseMs = createdRaw * 1000;
  } else if (createdRaw && typeof createdRaw.toMillis === 'function') {
    purchaseMs = createdRaw.toMillis();
  }

  const stripeCustomerId =
    typeof entitlementData.stripeCustomerId === 'string'
      ? entitlementData.stripeCustomerId
      : '';

  if (!paymentIntentId && stripeCustomerId) {
    try {
      const intents = await stripe.paymentIntents.list({
        customer: stripeCustomerId,
        limit: 5
      });
      const candidate =
        intents.data.find((intent) => intent.status === 'succeeded') ||
        intents.data[0];
      if (candidate) {
        paymentIntentId = candidate.id;
        if (!purchaseMs && typeof candidate.created === 'number') {
          purchaseMs = candidate.created * 1000;
        }
        await admin.firestore().collection('entitlements').doc(normalizedEmail).set(
          {
            stripePaymentIntentId: paymentIntentId,
            stripePaymentIntentCreated: candidate.created,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    } catch (error) {
      console.error('[refund] payment_intent_lookup_failed', error);
    }
  }

  if (!paymentIntentId) {
    await refundRef.set(
      { status: 'missing_payment', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    res.status(404).json({
      ok: false,
      message: 'Não foi possível localizar o pagamento. Verifique o e-mail usado na compra.'
    });
    return;
  }

  if (!purchaseMs) {
    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent && typeof intent.created === 'number') {
        purchaseMs = intent.created * 1000;
        await admin.firestore().collection('entitlements').doc(normalizedEmail).set(
          {
            stripePaymentIntentCreated: intent.created,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    } catch (error) {
      console.error('[refund] payment_intent_retrieve_failed', error);
    }
  }

  if (!purchaseMs) {
    await refundRef.set(
      { status: 'missing_purchase_date', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    res.status(400).json({
      ok: false,
      message: 'Não foi possível confirmar a data da compra. Entre em contato com o suporte.'
    });
    return;
  }

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (now - purchaseMs > sevenDaysMs) {
    await refundRef.set(
      { status: 'rejected_outside_window', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    await admin.firestore().collection('entitlements').doc(normalizedEmail).set(
      {
        refundStatus: 'rejected_outside_window',
        refundRequestId: refundRef.id,
        refundRequestedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    await sendRefundEmail(
      { name, email },
      `Reembolso não aprovado - ${name}`,
      'Pedido recebido fora do prazo de 7 dias. Reembolso não aplicável.',
      'Reembolso não aprovado',
      'Seu pedido foi recebido, porém o prazo de 7 dias corridos já expirou. Conforme nossa política, não há reembolso após esse período.'
    );
    res.status(200).json({
      ok: true,
      status: 'rejected',
      message: 'Prazo de 7 dias expirado. Não há reembolso disponível.'
    });
    return;
  }

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer'
      },
      { idempotencyKey: `refund_${paymentIntentId}_${refundRef.id}` }
    );

    await refundRef.set(
      {
        status: 'refunded',
        stripeRefundId: refund.id,
        refundedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await admin.firestore().collection('entitlements').doc(normalizedEmail).set(
      {
        status: 'refunded',
        refundStatus: 'refunded',
        refundId: refund.id,
        refundRequestId: refundRef.id,
        refundedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await sendRefundEmail(
      { name, email },
      `Reembolso aprovado - ${name}`,
      'Reembolso aprovado e solicitado ao meio de pagamento.',
      'Reembolso aprovado',
      'Seu reembolso foi aprovado e já foi solicitado ao meio de pagamento. O prazo para aparecer na fatura pode variar conforme a operadora do cartão.'
    );

    res.status(200).json({
      ok: true,
      status: 'refunded',
      message: 'Reembolso aprovado automaticamente. Você receberá confirmação por e-mail.'
    });
    return;
  } catch (error: any) {
    console.error('[refund] stripe_refund_error', error);
    await refundRef.set(
      { status: 'refund_failed', updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    res.status(500).json({
      ok: false,
      message: 'Não foi possível processar o reembolso. Tente novamente mais tarde.'
    });
    return;
  }
});
