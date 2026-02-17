import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
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
  const toMs = (value: any) => {
    if (!value) return null;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    return null;
  };
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
    lifetime: planType.toLowerCase() === 'lifetime' || data.lifetime === true
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
      await admin.firestore().collection(BETA_KEY_COLLECTION).doc(keyId).delete();
      res.status(200).json({ ok: true });
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
    let keyRef: FirebaseFirestore.DocumentReference | null = null;
    let keyData: FirebaseFirestore.DocumentData | null = null;

    try {
      if (keyId) {
        keyRef = admin.firestore().collection(BETA_KEY_COLLECTION).doc(keyId);
        const keySnap = await keyRef.get();
        if (!keySnap.exists) {
          res.status(404).json({ ok: false, message: 'Chave não encontrada.' });
          return;
        }
        keyData = keySnap.data() || null;
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
        source: 'beta_admin',
        lifetime: true,
        expiresAt: null,
        betaKeyId: keyId || null,
        betaCode: code || null,
        lifetimeGrantedBy: auth.uid,
        lifetimeGrantedAt: now,
        updatedAt: now
      };
      if (!entitlementSnap.exists) {
        entitlementPayload.createdAt = now;
      }

      await entitlementRef.set(entitlementPayload, { merge: true });

      if (keyRef) {
        await keyRef.set(
          {
            lifetimeGrantedEmail: email,
            lifetimeGrantedAt: now,
            lifetimeGrantedBy: auth.uid,
            updatedAt: now
          },
          { merge: true }
        );
      }

      const originRaw = String(body.origin || req.headers.origin || '').trim();
      const origin = resolveSafeOrigin(originRaw);
      const loginUrl = `${origin}/login`;
      const emailSent = await sendLifetimeAccessEmail({ email, loginUrl });

      res.status(200).json({
        ok: true,
        email,
        keyId: keyId || null,
        code: code || null,
        emailSent
      });
    } catch (error) {
      console.error('[beta] lifetime_error', error);
      res.status(500).json({ ok: false, message: 'Falha ao liberar acesso vitalício.' });
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
