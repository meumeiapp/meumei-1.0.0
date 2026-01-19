import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { VertexAI } from '@google-cloud/vertexai';

admin.initializeApp();

const deprecatedStub = (name: string) =>
  functions.region('us-central1').https.onRequest((req, res) => {
    console.warn('[deprecated_stub]', { function: name });
    res.status(410).json({ ok: false, code: 'deprecated_stub', function: name });
  });

export const createMpPixPayment = deprecatedStub('createMpPixPayment');
export const createMpPreference = deprecatedStub('createMpPreference');
export const getMpPaymentStatus = deprecatedStub('getMpPaymentStatus');
export const migrateLegacyLicensesToEntitlements = deprecatedStub(
  'migrateLegacyLicensesToEntitlements'
);
export const mpCheckStatus = deprecatedStub('mpCheckStatus');
export const mpWebhook = deprecatedStub('mpWebhook');
export const testEmailFn = deprecatedStub('testEmailFn');
export const ensureAuthUserForInvite = deprecatedStub('ensureAuthUserForInvite');
export const ensureMembershipForUser = deprecatedStub('ensureMembershipForUser');

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
