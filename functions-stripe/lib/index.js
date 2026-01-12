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
exports.grantEntitlementV2 = exports.verifyCheckoutSessionV2 = exports.createCheckoutSessionV2 = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
(0, v2_1.setGlobalOptions)({ region: "us-central1" });
const STRIPE_SECRET_KEY_SECRET = (0, params_1.defineSecret)("STRIPE_SECRET_KEY");
const STRIPE_PRICE_ID_SECRET = (0, params_1.defineSecret)("STRIPE_PRICE_ID");
const MODE = (process.env.MODE || "subscription").trim();
const DEFAULT_BASE_URL = "https://meumei-d88be.web.app";
const allowedOrigins = new Set([
    "https://meumei-beta.web.app",
    "https://meumei-beta.firebaseapp.com",
    "https://meumei-d88be.web.app",
    "https://meumei-d88be.firebaseapp.com",
    "https://meumeiapp.com.br",
    "https://www.meumeiapp.com.br",
    "http://localhost:5173",
    "http://localhost:3000"
]);
if (!admin.apps.length) {
    admin.initializeApp();
}
const applyCors = (originHeader, res) => {
    if (originHeader && allowedOrigins.has(originHeader)) {
        res.set("Access-Control-Allow-Origin", originHeader);
        res.set("Vary", "Origin");
    }
    res.set("Access-Control-Allow-Headers", "Content-Type");
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
const validateEnv = () => {
    const stripeSecretKey = (STRIPE_SECRET_KEY_SECRET.value() || "").trim();
    const stripePriceId = (STRIPE_PRICE_ID_SECRET.value() || "").trim();
    const modeOk = MODE === "subscription" || MODE === "payment";
    const missingEnv = !stripeSecretKey || !stripePriceId || !modeOk;
    return {
        missingEnv,
        stripeSecretKey,
        stripePriceId,
        modeOk
    };
};
const normalizeEmail = (value) => value.trim().toLowerCase();
const fetchCheckoutSession = async (stripe, sessionId) => {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const modeOk = session.mode === "subscription";
    const paymentOk = session.payment_status === "paid" || Boolean(session.subscription);
    const email = session.customer_details?.email || session.customer_email || "";
    const customerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id || "";
    const subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || "";
    return {
        session,
        modeOk,
        paymentOk,
        email,
        customerId,
        subscriptionId
    };
};
exports.createCheckoutSessionV2 = (0, https_1.onRequest)({ secrets: [STRIPE_SECRET_KEY_SECRET, STRIPE_PRICE_ID_SECRET] }, async (req, res) => {
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
    const { missingEnv, stripeSecretKey, stripePriceId, modeOk } = validateEnv();
    if (missingEnv) {
        console.error("[stripe] missing_env", {
            STRIPE_SECRET_KEY: Boolean(stripeSecretKey),
            STRIPE_PRICE_ID: Boolean(stripePriceId),
            MODE,
            modeOk
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
            mode: MODE,
            line_items: [{ price: stripePriceId, quantity: 1 }],
            customer_email: email || undefined,
            success_url: successUrl,
            cancel_url: cancelUrl
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
exports.verifyCheckoutSessionV2 = (0, https_1.onRequest)({ secrets: [STRIPE_SECRET_KEY_SECRET, STRIPE_PRICE_ID_SECRET] }, async (req, res) => {
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
    const { missingEnv, stripeSecretKey, stripePriceId, modeOk } = validateEnv();
    if (missingEnv) {
        console.error("[stripe] missing_env", {
            STRIPE_SECRET_KEY: Boolean(stripeSecretKey),
            STRIPE_PRICE_ID: Boolean(stripePriceId),
            MODE,
            modeOk
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
        const { modeOk: sessionModeOk, paymentOk, email, customerId, subscriptionId } = await fetchCheckoutSession(stripe, sessionId);
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
            subscriptionId
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
exports.grantEntitlementV2 = (0, https_1.onRequest)({ secrets: [STRIPE_SECRET_KEY_SECRET, STRIPE_PRICE_ID_SECRET] }, async (req, res) => {
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
    const { missingEnv, stripeSecretKey, stripePriceId, modeOk } = validateEnv();
    if (missingEnv) {
        console.error("[stripe] missing_env", {
            STRIPE_SECRET_KEY: Boolean(stripeSecretKey),
            STRIPE_PRICE_ID: Boolean(stripePriceId),
            MODE,
            modeOk
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
        const { modeOk: sessionModeOk, paymentOk, email, customerId, subscriptionId } = await fetchCheckoutSession(stripe, sessionId);
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
        const normalizedEmail = normalizeEmail(email);
        await admin.firestore().collection("entitlements").doc(normalizedEmail).set({
            status: "active",
            source: "stripe_test",
            stripeCustomerId: customerId || null,
            stripeSubscriptionId: subscriptionId || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
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
