import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { VertexAI } from '@google-cloud/vertexai';

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
