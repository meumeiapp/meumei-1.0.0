import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import Stripe from "stripe";

setGlobalOptions({ region: "us-central1", invoker: "public" });

const STRIPE_SECRET_KEY_SECRET = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_PRICE_ID_SECRET = defineSecret("STRIPE_PRICE_ID");
const STRIPE_PRICE_ID_ANNUAL_SECRET = defineSecret("STRIPE_PRICE_ID_ANNUAL");
const STRIPE_PRICE_ID_MONTHLY_SECRET = defineSecret("STRIPE_PRICE_ID_MONTHLY");
const DEFAULT_BASE_URL = "https://meumei-d88be.web.app";

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

const applyCors = (
  originHeader: string | undefined,
  res: { set: (field: string, value: string) => void }
) => {
  if (originHeader && allowedOrigins.has(originHeader)) {
    res.set("Access-Control-Allow-Origin", originHeader);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
};

const parsePayload = (body: unknown) => {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof body === "object" && body !== null) {
    return body as Record<string, unknown>;
  }
  return {};
};

const extractOrigin = (value: string | undefined) => {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return "";
  }
};

const resolveBaseUrl = (
  originHeader: string | undefined,
  successUrl: string,
  cancelUrl: string
) => {
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

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const fetchCheckoutSession = async (
  stripe: Stripe,
  sessionId: string
) => {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const modeOk = session.mode === "subscription" || session.mode === "payment";
  const paymentOk =
    session.payment_status === "paid" || Boolean(session.subscription);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || "";
  const email =
    session.customer_details?.email || session.customer_email || "";
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || "";
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || "";

  return {
    session,
    modeOk,
    paymentOk,
    email,
    customerId,
    subscriptionId,
    paymentIntentId,
    sessionCreated: typeof session.created === "number" ? session.created : null,
    paymentStatus: session.payment_status || null,
    sessionStatus: session.status || null
  };
};

export const createCheckoutSessionV2 = onRequest(
  { secrets: [STRIPE_SECRET_KEY_SECRET, STRIPE_PRICE_ID_SECRET, STRIPE_PRICE_ID_ANNUAL_SECRET, STRIPE_PRICE_ID_MONTHLY_SECRET] },
  async (req, res) => {
    applyCors(req.headers.origin as string | undefined, res);
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

    const { stripeSecretKey, annualPriceId, monthlyPriceId } =
      resolveStripeConfig();
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
      const data = (payload.data as Record<string, unknown>) || payload;
      const email =
        typeof data.email === "string" ? data.email.trim() : undefined;
      const plan =
        typeof data.plan === "string" ? data.plan.trim().toLowerCase() : "annual";
      const planType = plan === "monthly" ? "monthly" : "annual";
      const priceId = planType === "monthly" ? monthlyPriceId : annualPriceId;
      const mode = planType === "monthly" ? "subscription" : "payment";

      if (!priceId) {
        res.status(500).json({
          error: {
            code: "missing_price",
            message: "Stripe price not configured"
          }
        });
        return;
      }
      const requestOrigin =
        typeof req.headers.origin === "string" ? req.headers.origin : "";
      const resolvedOrigin =
        requestOrigin && allowedOrigins.has(requestOrigin)
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

      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
      const session = await stripe.checkout.sessions.create({
        mode: mode as "subscription" | "payment",
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
    } catch (error: any) {
      console.error("[stripe] checkout_error", error);
      res.status(500).json({
        error: {
          code: "checkout_failed",
          message: error?.message || "Stripe checkout failed"
        }
      });
    }
  }
);

export const verifyCheckoutSessionV2 = onRequest(
  { secrets: [STRIPE_SECRET_KEY_SECRET] },
  async (req, res) => {
    applyCors(req.headers.origin as string | undefined, res);
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
      const data = (payload.data as Record<string, unknown>) || payload;
      const sessionId =
        typeof data.session_id === "string" ? data.session_id.trim() : "";
      if (!sessionId) {
        res.status(400).json({
          ok: false,
          reason: "invalid_session_id"
        });
        return;
      }

      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
      const {
        modeOk: sessionModeOk,
        paymentOk,
        email,
        customerId,
        subscriptionId,
        paymentIntentId,
        sessionCreated,
        paymentStatus,
        sessionStatus
      } =
        await fetchCheckoutSession(stripe, sessionId);

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
    } catch (error: any) {
      console.error("[stripe] checkout_error", error);
      res.status(500).json({
        ok: false,
        reason: "checkout_failed"
      });
    }
  }
);

export const grantEntitlementV2 = onRequest(
  { secrets: [STRIPE_SECRET_KEY_SECRET] },
  async (req, res) => {
    applyCors(req.headers.origin as string | undefined, res);
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
      const data = (payload.data as Record<string, unknown>) || payload;
      const sessionId =
        typeof data.session_id === "string" ? data.session_id.trim() : "";
      if (!sessionId) {
        res.status(400).json({
          ok: false,
          reason: "invalid_session_id"
        });
        return;
      }

      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
      const {
        modeOk: sessionModeOk,
        paymentOk,
        email,
        customerId,
        subscriptionId,
        paymentIntentId,
        sessionCreated,
        paymentStatus,
        sessionStatus
      } = await fetchCheckoutSession(stripe, sessionId);

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

      const normalizedEmail = normalizeEmail(email);
      await admin.firestore().collection("entitlements").doc(normalizedEmail).set(
        {
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
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      console.log("[stripe] entitlement_granted", { hasEmail: Boolean(email) });
      res.status(200).json({ ok: true });
    } catch (error: any) {
      console.error("[stripe] checkout_error", error);
      res.status(500).json({
        ok: false,
        reason: "checkout_failed"
      });
    }
  }
);
