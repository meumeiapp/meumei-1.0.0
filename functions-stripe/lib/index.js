"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.masterMetrics = exports.requestRefundV2 = exports.grantEntitlementV2 = exports.verifyCheckoutSessionV2 = exports.createCheckoutSessionV2 = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
const nodemailer_1 = __importDefault(require("nodemailer"));
(0, v2_1.setGlobalOptions)({ region: "us-central1", invoker: "public" });
const STRIPE_SECRET_KEY_SECRET = (0, params_1.defineSecret)("STRIPE_SECRET_KEY");
const STRIPE_PRICE_ID_SECRET = (0, params_1.defineSecret)("STRIPE_PRICE_ID");
const STRIPE_PRICE_ID_ANNUAL_SECRET = (0, params_1.defineSecret)("STRIPE_PRICE_ID_ANNUAL");
const STRIPE_PRICE_ID_MONTHLY_SECRET = (0, params_1.defineSecret)("STRIPE_PRICE_ID_MONTHLY");
const DEFAULT_BASE_URL = "https://meumei-d88be.web.app";
const MASTER_UID = "ZbrLdQuqn4MlOK16MjBOr6GZM3l1";
const MASTER_EMAIL = "meumeiaplicativo@gmail.com";
const DAY_MS = 24 * 60 * 60 * 1000;
const allowedOrigins = new Set([
    "https://meumei-beta.web.app",
    "https://meumei-beta.firebaseapp.com",
    "https://meumei-d88be.web.app",
    "https://meumei-d88be.firebaseapp.com",
    "https://meumeiapp.com.br",
    "https://www.meumeiapp.com.br",
    "https://meumeibeta.web.app",
    "https://meumeibeta.firebaseapp.com",
    "http://localhost:5173",
    "http://localhost:3000"
]);
if (!admin.apps.length) {
    admin.initializeApp();
}
const runtimeConfig = (() => {
    try {
        return JSON.parse(process.env.CLOUD_RUNTIME_CONFIG || "{}");
    }
    catch {
        return {};
    }
})();
const refundConfig = (runtimeConfig.refund || {});
const emailConfig = (runtimeConfig.email || {});
const resolveRefundConfigValue = (envKey, configKey, fallback = "") => {
    const direct = (process.env[envKey] || "").trim();
    if (direct)
        return direct;
    const value = refundConfig[configKey];
    return typeof value === "string" ? value : fallback;
};
const SMTP_HOST = resolveRefundConfigValue("REFUND_SMTP_HOST", "smtp_host", "");
const SMTP_PORT = Number(resolveRefundConfigValue("REFUND_SMTP_PORT", "smtp_port", "587"));
const SMTP_USER = resolveRefundConfigValue("REFUND_SMTP_USER", "smtp_user", "");
const SMTP_PASS = resolveRefundConfigValue("REFUND_SMTP_PASS", "smtp_pass", "");
const DEFAULT_FROM_EMAIL = (process.env.EMAIL_FROM || emailConfig.from || "").trim();
const REFUND_FROM_EMAIL = resolveRefundConfigValue("REFUND_SMTP_FROM", "smtp_from", DEFAULT_FROM_EMAIL || SMTP_USER);
const REFUND_TO_EMAIL = resolveRefundConfigValue("REFUND_SMTP_TO", "smtp_to", "meumeiaplicativo@gmail.com");
const SMTP_SECURE = resolveRefundConfigValue("REFUND_SMTP_SECURE", "smtp_secure", "").toLowerCase() === "true" ||
    SMTP_PORT === 465;
const getRefundTransport = () => {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS)
        return null;
    return nodemailer_1.default.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });
};
const sendRefundEmail = async (payload, subject, text, userSubject, userText) => {
    const transport = getRefundTransport();
    if (!transport || !REFUND_FROM_EMAIL)
        return false;
    const userSubjectResolved = userSubject || "Recebemos sua solicitação de reembolso";
    const userTextResolved = userText ||
        "Recebemos sua solicitação de reembolso. Nossa equipe irá analisar e responder em breve.\n\nSe precisar complementar alguma informação, responda este e-mail.";
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
    }
    catch (error) {
        console.error("[refund] email_error", error);
        return false;
    }
};
const sendWelcomeEmail = async (payload) => {
    const transport = getRefundTransport();
    if (!transport || !REFUND_FROM_EMAIL)
        return false;
    const subject = "Bem-vindo ao meumei";
    const greeting = payload.name ? `Olá, ${payload.name}!` : "Olá!";
    const planLabel = payload.planType === "monthly"
        ? "plano mensal"
        : payload.planType === "annual"
            ? "plano anual"
            : "";
    const loginUrl = payload.origin
        ? `${payload.origin.replace(/\/+$/, "")}/login`
        : "";
    const bodyLines = [
        greeting,
        "",
        "Obrigado pela compra do meumei. Sua assinatura já está ativa.",
        planLabel ? `Plano: ${planLabel}.` : "",
        payload.orderId ? `Número do pedido: ${payload.orderId}` : "",
        loginUrl ? `Acesse sua conta: ${loginUrl}` : "",
        "",
        "Equipe meumei."
    ].filter(Boolean);
    try {
        await transport.sendMail({
            from: REFUND_FROM_EMAIL,
            to: payload.email,
            subject,
            text: bodyLines.join("\n")
        });
        return true;
    }
    catch (error) {
        console.error("[welcome] email_error", error);
        return false;
    }
};
const applyCors = (originHeader, res) => {
    if (originHeader && allowedOrigins.has(originHeader)) {
        res.set("Access-Control-Allow-Origin", originHeader);
        res.set("Vary", "Origin");
    }
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
};
const parsePayload = (body) => {
    if (typeof body === "string") {
        try {
            return JSON.parse(body);
        }
        catch {
            return {};
        }
    }
    if (typeof body === "object" && body !== null) {
        return body;
    }
    return {};
};
const extractOrigin = (value) => {
    if (!value)
        return "";
    try {
        const url = new URL(value);
        return url.origin;
    }
    catch {
        return "";
    }
};
const resolveBaseUrl = (originHeader, successUrl, cancelUrl) => {
    if (originHeader && allowedOrigins.has(originHeader)) {
        return originHeader;
    }
    const successOrigin = extractOrigin(successUrl);
    if (successOrigin && allowedOrigins.has(successOrigin)) {
        return successOrigin;
    }
    const cancelOrigin = extractOrigin(cancelUrl);
    if (cancelOrigin && allowedOrigins.has(cancelOrigin)) {
        return cancelOrigin;
    }
    return DEFAULT_BASE_URL;
};
const resolveStripeConfig = () => {
    const stripeSecretKey = (STRIPE_SECRET_KEY_SECRET.value() || "").trim();
    const annualPriceId = (STRIPE_PRICE_ID_ANNUAL_SECRET.value() || STRIPE_PRICE_ID_SECRET.value() || "").trim();
    const monthlyPriceId = (STRIPE_PRICE_ID_MONTHLY_SECRET.value() || "").trim();
    return {
        stripeSecretKey,
        annualPriceId,
        monthlyPriceId
    };
};
const normalizeEmail = (value) => value.trim().toLowerCase();
const TEST_PRICE_ID = "price_1T01FdJ4MPaVuL1iiz4bF872";
const parseBearerToken = (req) => {
    const header = typeof req.headers?.authorization === "string" ? req.headers.authorization : "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || "";
};
const requireMaster = async (req, res) => {
    const token = parseBearerToken(req);
    if (!token) {
        res.status(401).json({ ok: false, message: "Auth ausente." });
        return null;
    }
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        const email = normalizeEmail(decoded.email || "");
        const isMaster = decoded.uid === MASTER_UID || (email && email === MASTER_EMAIL);
        if (!isMaster) {
            res.status(403).json({ ok: false, message: "Permissão negada." });
            return null;
        }
        return { uid: decoded.uid, email };
    }
    catch (error) {
        res.status(401).json({ ok: false, message: "Auth inválida." });
        return null;
    }
};
const fetchCheckoutSession = async (stripe, sessionId) => {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const modeOk = session.mode === "subscription" || session.mode === "payment";
    const paymentOk = session.payment_status === "paid" || Boolean(session.subscription);
    const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || "";
    const email = session.customer_details?.email || session.customer_email || "";
    const customerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id || "";
    const subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || "";
    const customerName = (session.customer_details && session.customer_details.name) ||
        "";
    return {
        session,
        modeOk,
        paymentOk,
        email,
        customerId,
        subscriptionId,
        paymentIntentId,
        customerName,
        sessionCreated: typeof session.created === "number" ? session.created : null,
        paymentStatus: session.payment_status || null,
        sessionStatus: session.status || null
    };
};
exports.createCheckoutSessionV2 = (0, https_1.onRequest)({ secrets: [STRIPE_SECRET_KEY_SECRET, STRIPE_PRICE_ID_SECRET, STRIPE_PRICE_ID_ANNUAL_SECRET, STRIPE_PRICE_ID_MONTHLY_SECRET] }, async (req, res) => {
    applyCors(req.headers.origin, res);
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({
            error: {
                code: "method_not_allowed",
                message: "Method not allowed"
            }
        });
        return;
    }
    const { stripeSecretKey, annualPriceId, monthlyPriceId } = resolveStripeConfig();
    if (!stripeSecretKey) {
        console.error("[stripe] missing_env", {
            STRIPE_SECRET_KEY: Boolean(stripeSecretKey),
            STRIPE_PRICE_ID_ANNUAL: Boolean(annualPriceId),
            STRIPE_PRICE_ID_MONTHLY: Boolean(monthlyPriceId)
        });
        res.status(500).json({
            error: {
                code: "missing_env",
                message: "Stripe configuration incomplete"
            }
        });
        return;
    }
    console.log("[stripe] createCheckoutSessionV2 start");
    try {
        const payload = parsePayload(req.body);
        const data = payload.data || payload;
        const email = typeof data.email === "string" ? data.email.trim() : undefined;
        const plan = typeof data.plan === "string" ? data.plan.trim().toLowerCase() : "annual";
        const planType = plan === "monthly" ? "monthly" : plan === "test" ? "test" : "annual";
        const priceId = planType === "monthly"
            ? monthlyPriceId
            : planType === "test"
                ? TEST_PRICE_ID
                : annualPriceId;
        const mode = planType === "annual" ? "payment" : "subscription";
        if (!priceId) {
            res.status(500).json({
                error: {
                    code: "missing_price",
                    message: "Stripe price not configured"
                }
            });
            return;
        }
        const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : "";
        const resolvedOrigin = requestOrigin && allowedOrigins.has(requestOrigin)
            ? requestOrigin
            : DEFAULT_BASE_URL;
        // Use the login route with placeholders so the frontend receives the
        // checkout session identifier (and can verify and retrieve the email).
        // This ensures the front-end can detect post-checkout and avoid redirecting
        // unauthenticated users to /login when an email/session is present.
        const successUrl = `${resolvedOrigin}/login?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${resolvedOrigin}/login?checkout=cancel`;
        console.log("[stripe] resolved_origin", resolvedOrigin);
        console.log("[stripe] success_url", successUrl);
        console.log("[stripe] cancel_url", cancelUrl);
        const stripe = new stripe_1.default(stripeSecretKey, { apiVersion: "2024-06-20" });
        const session = await stripe.checkout.sessions.create({
            mode: mode,
            line_items: [{ price: priceId, quantity: 1 }],
            customer_email: email || undefined,
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                plan: planType
            }
        });
        if (!session.url) {
            throw new Error("checkout_url_missing");
        }
        console.log("[stripe] session created");
        res.status(200).json({ url: session.url });
    }
    catch (error) {
        console.error("[stripe] checkout_error", error);
        res.status(500).json({
            error: {
                code: "checkout_failed",
                message: error?.message || "Stripe checkout failed"
            }
        });
    }
});
exports.verifyCheckoutSessionV2 = (0, https_1.onRequest)({ secrets: [STRIPE_SECRET_KEY_SECRET] }, async (req, res) => {
    applyCors(req.headers.origin, res);
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({
            error: {
                code: "method_not_allowed",
                message: "Method not allowed"
            }
        });
        return;
    }
    const { stripeSecretKey } = resolveStripeConfig();
    if (!stripeSecretKey) {
        console.error("[stripe] missing_env", {
            STRIPE_SECRET_KEY: Boolean(stripeSecretKey)
        });
        res.status(500).json({
            error: {
                code: "missing_env",
                message: "Stripe configuration incomplete"
            }
        });
        return;
    }
    console.log("[stripe] verifyCheckoutSessionV2 start");
    try {
        const payload = parsePayload(req.body);
        const data = payload.data || payload;
        const sessionId = typeof data.session_id === "string" ? data.session_id.trim() : "";
        if (!sessionId) {
            res.status(400).json({
                ok: false,
                reason: "invalid_session_id"
            });
            return;
        }
        const stripe = new stripe_1.default(stripeSecretKey, { apiVersion: "2024-06-20" });
        const { modeOk: sessionModeOk, paymentOk, email, customerId, subscriptionId, paymentIntentId, sessionCreated, paymentStatus, sessionStatus } = await fetchCheckoutSession(stripe, sessionId);
        if (!sessionModeOk) {
            res.status(200).json({ ok: false, reason: "invalid_mode" });
            return;
        }
        if (!paymentOk) {
            res.status(200).json({ ok: false, reason: "not_paid" });
            return;
        }
        if (!email) {
            res.status(200).json({ ok: false, reason: "email_missing" });
            return;
        }
        console.log("[stripe] session verified");
        res.status(200).json({
            ok: true,
            email,
            customerId,
            subscriptionId,
            paymentIntentId,
            sessionCreated,
            paymentStatus,
            sessionStatus
        });
    }
    catch (error) {
        console.error("[stripe] checkout_error", error);
        res.status(500).json({
            ok: false,
            reason: "checkout_failed"
        });
    }
});
exports.grantEntitlementV2 = (0, https_1.onRequest)({ secrets: [STRIPE_SECRET_KEY_SECRET] }, async (req, res) => {
    applyCors(req.headers.origin, res);
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({
            error: {
                code: "method_not_allowed",
                message: "Method not allowed"
            }
        });
        return;
    }
    const { stripeSecretKey } = resolveStripeConfig();
    if (!stripeSecretKey) {
        console.error("[stripe] missing_env", {
            STRIPE_SECRET_KEY: Boolean(stripeSecretKey)
        });
        res.status(500).json({
            error: {
                code: "missing_env",
                message: "Stripe configuration incomplete"
            }
        });
        return;
    }
    console.log("[stripe] grantEntitlementV2 start");
    try {
        const payload = parsePayload(req.body);
        const data = payload.data || payload;
        const sessionId = typeof data.session_id === "string" ? data.session_id.trim() : "";
        if (!sessionId) {
            res.status(400).json({
                ok: false,
                reason: "invalid_session_id"
            });
            return;
        }
        const stripe = new stripe_1.default(stripeSecretKey, { apiVersion: "2024-06-20" });
        const { modeOk: sessionModeOk, paymentOk, email, customerId, subscriptionId, paymentIntentId, customerName, sessionCreated, paymentStatus, sessionStatus } = await fetchCheckoutSession(stripe, sessionId);
        if (!sessionModeOk) {
            res.status(200).json({ ok: false, reason: "invalid_mode" });
            return;
        }
        if (!paymentOk) {
            res.status(200).json({ ok: false, reason: "not_paid" });
            return;
        }
        if (!email) {
            res.status(200).json({ ok: false, reason: "email_missing" });
            return;
        }
        const planType = subscriptionId ? "monthly" : "annual";
        let subscriptionPeriodEndMs = null;
        if (subscriptionId) {
            try {
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                if (typeof subscription.current_period_end === "number") {
                    subscriptionPeriodEndMs = subscription.current_period_end * 1000;
                }
            }
            catch (error) {
                console.error("[stripe] subscription_fetch_error", error);
            }
        }
        const annualExpiresAtMs = !subscriptionId
            ? ((sessionCreated ? sessionCreated * 1000 : Date.now()) + 365 * DAY_MS)
            : null;
        const normalizedEmail = normalizeEmail(email);
        const entitlementRef = admin.firestore().collection("entitlements").doc(normalizedEmail);
        let lastWelcomeSessionId = "";
        try {
            const entitlementSnap = await entitlementRef.get();
            if (entitlementSnap.exists) {
                const data = entitlementSnap.data() || {};
                if (typeof data.welcomeEmailSessionId === "string") {
                    lastWelcomeSessionId = data.welcomeEmailSessionId;
                }
            }
        }
        catch (error) {
            console.error("[stripe] entitlement_lookup_error", error);
        }
        await entitlementRef.set({
            status: "active",
            planType,
            source: stripeSecretKey.startsWith("sk_live") ? "stripe_live" : "stripe_test",
            stripeCustomerId: customerId || null,
            stripeSubscriptionId: subscriptionId || null,
            stripeCheckoutSessionId: sessionId,
            stripeCheckoutSessionCreated: sessionCreated,
            stripePaymentIntentId: paymentIntentId || null,
            stripePaymentStatus: paymentStatus,
            stripeCheckoutSessionStatus: sessionStatus,
            subscriptionStatus: subscriptionId ? "active" : null,
            subscriptionCurrentPeriodEnd: subscriptionPeriodEndMs
                ? admin.firestore.Timestamp.fromMillis(subscriptionPeriodEndMs)
                : null,
            expiresAt: annualExpiresAtMs
                ? admin.firestore.Timestamp.fromMillis(annualExpiresAtMs)
                : null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        if (lastWelcomeSessionId !== sessionId) {
            const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : "";
            const resolvedOrigin = requestOrigin && allowedOrigins.has(requestOrigin)
                ? requestOrigin
                : DEFAULT_BASE_URL;
            const welcomeSent = await sendWelcomeEmail({
                email,
                name: customerName || undefined,
                planType,
                origin: resolvedOrigin,
                orderId: paymentIntentId || sessionId
            });
            if (welcomeSent) {
                await entitlementRef.set({
                    welcomeEmailSessionId: sessionId,
                    welcomeEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
        }
        console.log("[stripe] entitlement_granted", { hasEmail: Boolean(email) });
        res.status(200).json({ ok: true });
    }
    catch (error) {
        console.error("[stripe] checkout_error", error);
        res.status(500).json({
            ok: false,
            reason: "checkout_failed"
        });
    }
});
exports.requestRefundV2 = (0, https_1.onRequest)({ secrets: [STRIPE_SECRET_KEY_SECRET] }, async (req, res) => {
    applyCors(req.headers.origin, res);
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({
            error: {
                code: "method_not_allowed",
                message: "Method not allowed"
            }
        });
        return;
    }
    const { stripeSecretKey } = resolveStripeConfig();
    if (!stripeSecretKey) {
        res.status(500).json({
            error: {
                code: "missing_env",
                message: "Stripe configuration incomplete"
            }
        });
        return;
    }
    const payload = parsePayload(req.body);
    const data = payload.data || payload;
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const purchaseDate = typeof data.purchaseDate === "string" ? data.purchaseDate.trim() : "";
    const orderId = typeof data.orderId === "string" ? data.orderId.trim() : "";
    const reason = typeof data.reason === "string" ? data.reason.trim() : "";
    const details = typeof data.details === "string" ? data.details.trim() : "";
    const refundTimelineNotice = "Normalmente o estorno aparece em 5–10 dias úteis, dependendo do banco. Em alguns casos ele aparece como reversão da cobrança (a compra original some) e não como crédito separado. Se passar de 10 dias úteis, fale com o banco.";
    const adminText = [
        `Nome: ${name}`,
        `E-mail: ${email}`,
        `Data da compra: ${purchaseDate}`,
        orderId ? `Pedido: ${orderId}` : "",
        reason ? `Motivo: ${reason}` : "",
        details ? `Detalhes: ${details}` : ""
    ]
        .filter(Boolean)
        .join("\n");
    if (!name || !email || !purchaseDate) {
        res.status(400).json({
            ok: false,
            message: "Informe nome, e-mail e data da compra."
        });
        return;
    }
    const normalizedEmail = normalizeEmail(email);
    const refundRef = admin.firestore().collection("refundRequests").doc();
    const payloadBase = {
        requestId: refundRef.id,
        name,
        email,
        normalizedEmail,
        purchaseDate,
        orderId: orderId || null,
        reason: reason || null,
        details: details || null,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    try {
        await refundRef.set(payloadBase);
    }
    catch (error) {
        console.error("[refund] firestore_error", error);
    }
    let entitlementData = null;
    try {
        const entitlementSnap = await admin
            .firestore()
            .collection("entitlements")
            .doc(normalizedEmail)
            .get();
        entitlementData = entitlementSnap.exists ? entitlementSnap.data() || null : null;
    }
    catch (error) {
        console.error("[refund] entitlement_lookup_error", error);
    }
    if (!entitlementData) {
        await refundRef.set({ status: "not_found", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        res.status(404).json({
            ok: false,
            message: "Não encontramos a compra com este e-mail. Verifique e tente novamente."
        });
        return;
    }
    if (entitlementData.status && entitlementData.status !== "active") {
        await refundRef.set({ status: "already_processed", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        res.status(200).json({
            ok: true,
            status: "already_processed",
            message: "Esta compra já foi processada anteriormente."
        });
        return;
    }
    const stripeSubscriptionId = typeof entitlementData.stripeSubscriptionId === "string"
        ? entitlementData.stripeSubscriptionId
        : "";
    const planType = (typeof entitlementData.planType === "string" && entitlementData.planType) ||
        (stripeSubscriptionId ? "monthly" : "annual");
    await refundRef.set({
        planType,
        stripeSubscriptionId: stripeSubscriptionId || null,
        stripeCustomerId: entitlementData.stripeCustomerId || null
    }, { merge: true });
    const stripe = new stripe_1.default(stripeSecretKey, { apiVersion: "2024-06-20" });
    const finalizeEntitlement = async (updates) => {
        await admin.firestore().collection("entitlements").doc(normalizedEmail).set({
            ...updates,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    };
    const finalizeRefund = async (updates) => {
        await refundRef.set({
            ...updates,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    };
    const sevenDaysMs = 7 * DAY_MS;
    const attemptRefundWithIntent = async () => {
        let paymentIntentId = typeof entitlementData.stripePaymentIntentId === "string"
            ? entitlementData.stripePaymentIntentId
            : "";
        const createdRaw = entitlementData.stripeCheckoutSessionCreated;
        let purchaseMs = 0;
        if (typeof createdRaw === "number") {
            purchaseMs = createdRaw * 1000;
        }
        else if (createdRaw && typeof createdRaw.toMillis === "function") {
            purchaseMs = createdRaw.toMillis();
        }
        const stripeCustomerId = typeof entitlementData.stripeCustomerId === "string"
            ? entitlementData.stripeCustomerId
            : "";
        if (!paymentIntentId && stripeCustomerId) {
            try {
                const intents = await stripe.paymentIntents.list({
                    customer: stripeCustomerId,
                    limit: 5
                });
                const candidate = intents.data.find((intent) => intent.status === "succeeded") ||
                    intents.data[0];
                if (candidate) {
                    paymentIntentId = candidate.id;
                    if (!purchaseMs && typeof candidate.created === "number") {
                        purchaseMs = candidate.created * 1000;
                    }
                    await finalizeEntitlement({
                        stripePaymentIntentId: paymentIntentId,
                        stripePaymentIntentCreated: candidate.created
                    });
                }
            }
            catch (error) {
                console.error("[refund] payment_intent_lookup_failed", error);
            }
        }
        if (!paymentIntentId) {
            await finalizeRefund({ status: "missing_payment" });
            res.status(404).json({
                ok: false,
                message: "Não foi possível localizar o pagamento. Verifique o e-mail usado na compra."
            });
            return;
        }
        if (!purchaseMs) {
            try {
                const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
                if (intent && typeof intent.created === "number") {
                    purchaseMs = intent.created * 1000;
                    await finalizeEntitlement({
                        stripePaymentIntentCreated: intent.created
                    });
                }
            }
            catch (error) {
                console.error("[refund] payment_intent_retrieve_failed", error);
            }
        }
        if (!purchaseMs) {
            await finalizeRefund({ status: "missing_purchase_date" });
            res.status(400).json({
                ok: false,
                message: "Não foi possível confirmar a data da compra. Entre em contato com o suporte."
            });
            return;
        }
        const now = Date.now();
        if (now - purchaseMs > sevenDaysMs) {
            await finalizeRefund({ status: "rejected_outside_window" });
            await finalizeEntitlement({
                refundStatus: "rejected_outside_window",
                refundRequestId: refundRef.id,
                refundRequestedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await sendRefundEmail({ name, email }, `Reembolso não aprovado - ${name}`, adminText, "Reembolso não aprovado", "Seu pedido foi recebido, porém o prazo de 7 dias corridos já expirou. Conforme nossa política, não há reembolso após esse período.");
            res.status(200).json({
                ok: true,
                status: "rejected",
                message: "Prazo de 7 dias expirado. Não há reembolso disponível."
            });
            return;
        }
        try {
            const refund = await stripe.refunds.create({
                payment_intent: paymentIntentId,
                reason: "requested_by_customer"
            }, { idempotencyKey: `refund_${paymentIntentId}_${refundRef.id}` });
            await finalizeRefund({
                status: "refunded",
                stripeRefundId: refund.id,
                refundedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await finalizeEntitlement({
                status: "refunded",
                refundStatus: "refunded",
                refundId: refund.id,
                refundRequestId: refundRef.id,
                refundedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await sendRefundEmail({ name, email }, `Reembolso aprovado - ${name}`, adminText, "Reembolso aprovado", `Seu reembolso foi aprovado e já foi solicitado ao meio de pagamento.\n${refundTimelineNotice}`);
            res.status(200).json({
                ok: true,
                status: "refunded",
                message: "Reembolso aprovado automaticamente."
            });
            return;
        }
        catch (error) {
            console.error("[refund] stripe_refund_error", error);
            await finalizeRefund({ status: "refund_failed" });
            res.status(500).json({
                ok: false,
                message: "Não foi possível processar o reembolso. Tente novamente mais tarde."
            });
            return;
        }
    };
    if (planType === "monthly" && stripeSubscriptionId) {
        try {
            const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
                expand: ["latest_invoice.payment_intent"]
            });
            const latestInvoice = subscription.latest_invoice;
            const paymentIntent = latestInvoice && latestInvoice.payment_intent
                ? latestInvoice.payment_intent
                : null;
            const invoiceCreated = latestInvoice && typeof latestInvoice.created === "number"
                ? latestInvoice.created * 1000
                : 0;
            const intentCreated = paymentIntent && typeof paymentIntent.created === "number"
                ? paymentIntent.created * 1000
                : 0;
            const purchaseMs = invoiceCreated || intentCreated || 0;
            const paymentIntentId = paymentIntent && typeof paymentIntent.id === "string"
                ? paymentIntent.id
                : "";
            const now = Date.now();
            await stripe.subscriptions.cancel(stripeSubscriptionId);
            if (purchaseMs && now - purchaseMs <= sevenDaysMs && paymentIntentId) {
                const refund = await stripe.refunds.create({
                    payment_intent: paymentIntentId,
                    reason: "requested_by_customer"
                }, { idempotencyKey: `refund_${paymentIntentId}_${refundRef.id}` });
                await finalizeRefund({
                    status: "refunded",
                    stripeRefundId: refund.id,
                    refundedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                await finalizeEntitlement({
                    status: "refunded",
                    planType: "monthly",
                    refundStatus: "refunded",
                    refundId: refund.id,
                    refundRequestId: refundRef.id,
                    refundedAt: admin.firestore.FieldValue.serverTimestamp(),
                    subscriptionStatus: "canceled"
                });
                await sendRefundEmail({ name, email }, `Reembolso aprovado - ${name}`, adminText, "Reembolso aprovado", `Seu reembolso foi aprovado e já foi solicitado ao meio de pagamento.\n${refundTimelineNotice}`);
                res.status(200).json({
                    ok: true,
                    status: "refunded",
                    message: "Reembolso aprovado automaticamente."
                });
                return;
            }
            await finalizeRefund({
                status: "canceled_no_refund"
            });
            await finalizeEntitlement({
                status: "canceled",
                planType: "monthly",
                refundStatus: "rejected_outside_window",
                refundRequestId: refundRef.id,
                refundRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
                subscriptionStatus: "canceled"
            });
            await sendRefundEmail({ name, email }, `Assinatura cancelada - ${name}`, adminText, "Assinatura cancelada", "Sua assinatura mensal foi cancelada. Como o prazo de 7 dias corridos já expirou, não há reembolso do período já pago.");
            res.status(200).json({
                ok: true,
                status: "canceled",
                message: "Assinatura cancelada. Prazo de reembolso expirado."
            });
            return;
        }
        catch (error) {
            console.error("[refund] monthly_refund_error", error);
            // fallback to payment intent based refund flow
            await attemptRefundWithIntent();
            return;
        }
    }
    await attemptRefundWithIntent();
});
exports.masterMetrics = (0, https_1.onRequest)({
    secrets: [STRIPE_SECRET_KEY_SECRET, STRIPE_PRICE_ID_ANNUAL_SECRET, STRIPE_PRICE_ID_MONTHLY_SECRET]
}, async (req, res) => {
    applyCors(req.headers.origin, res);
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, message: "Método não permitido." });
        return;
    }
    const master = await requireMaster(req, res);
    if (!master)
        return;
    try {
        const db = admin.firestore();
        const now = Date.now();
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthStartTs = admin.firestore.Timestamp.fromDate(monthStart);
        const [usersSnap, entitlementsSnap, betaSnap, activeUsersSnap] = await Promise.all([
            db.collection("users").get(),
            db.collection("entitlements").get(),
            db.collection("beta_keys").get(),
            db.collection("users").where("lastActiveAt", ">=", monthStartTs).get()
        ]);
        const totalCompanies = usersSnap.size;
        const activeUsersThisMonth = activeUsersSnap.size;
        const entitlements = entitlementsSnap.docs.map((doc) => doc.data() || {});
        const isExpired = (data) => {
            const raw = data?.expiresAt;
            if (!raw)
                return false;
            if (typeof raw.toMillis === "function")
                return raw.toMillis() <= now;
            if (typeof raw.seconds === "number")
                return raw.seconds * 1000 <= now;
            return false;
        };
        const entitlementsActive = entitlements.filter((ent) => ent?.status === "active" && !isExpired(ent)).length;
        const entitlementsExpired = entitlements.filter((ent) => isExpired(ent)).length;
        const stripeEntitlements = entitlements.filter((ent) => String(ent?.source || "").startsWith("stripe"));
        const totalSales = stripeEntitlements.length;
        const annualCount = stripeEntitlements.filter((ent) => ent?.planType === "annual").length;
        const monthlyCount = stripeEntitlements.filter((ent) => ent?.planType === "monthly").length;
        let revenueEstimateCents = null;
        const { stripeSecretKey, annualPriceId, monthlyPriceId } = resolveStripeConfig();
        if (stripeSecretKey && (annualPriceId || monthlyPriceId)) {
            const stripe = new stripe_1.default(stripeSecretKey, { apiVersion: "2024-06-20" });
            const [annualPrice, monthlyPrice] = await Promise.all([
                annualPriceId ? stripe.prices.retrieve(annualPriceId) : Promise.resolve(null),
                monthlyPriceId ? stripe.prices.retrieve(monthlyPriceId) : Promise.resolve(null)
            ]);
            const annualAmount = annualPrice?.unit_amount || 0;
            const monthlyAmount = monthlyPrice?.unit_amount || 0;
            revenueEstimateCents = annualCount * annualAmount + monthlyCount * monthlyAmount;
        }
        const betaKeysCreated = betaSnap.size;
        const betaKeysUsed = betaSnap.docs.reduce((sum, doc) => {
            const uses = Number(doc.get("uses") || 0);
            return sum + (Number.isFinite(uses) ? uses : 0);
        }, 0);
        res.status(200).json({
            ok: true,
            metrics: {
                totalSales,
                revenueEstimateCents,
                companies: totalCompanies,
                activeUsersThisMonth,
                entitlementsActive,
                entitlementsExpired,
                betaKeysCreated,
                betaKeysUsed,
                stripeAnnualCount: annualCount,
                stripeMonthlyCount: monthlyCount,
                lastUpdatedAtMs: now
            }
        });
    }
    catch (error) {
        console.error("[master] metrics_error", error);
        res.status(500).json({ ok: false, message: "Falha ao carregar métricas." });
    }
});
