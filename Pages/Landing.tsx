import { useState } from "react";
import type { MouseEvent } from "react";

export default function Landing() {
  const [isLoading, setIsLoading] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");
  const checkoutEndpointOverride = (import.meta.env.VITE_STRIPE_CHECKOUT_ENDPOINT || "").trim();
  const functionsBaseUrl = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").trim();
  const functionsRegion = (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1").trim() || "us-central1";
  const firebaseProjectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim();

  const resolveCheckoutEndpoint = () => {
    if (checkoutEndpointOverride) return checkoutEndpointOverride;
    if (functionsBaseUrl) {
      return `${functionsBaseUrl.replace(/\/+$/, "")}/createCheckoutSessionV2`;
    }
    if (!firebaseProjectId) return "";
    return `https://${functionsRegion}-${firebaseProjectId}.cloudfunctions.net/createCheckoutSessionV2`;
  };

  const maskUrl = (value: string) => {
    if (value.length <= 20) return value;
    return `${value.slice(0, 12)}...${value.slice(-8)}`;
  };

  const handleLogin = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  const handleSubscribe = async (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (isLoading) return;
    console.log("[landing-pay] click subscribe");
    setSubscribeError("");
    if (typeof window === "undefined") {
      setSubscribeError("Nao foi possivel iniciar o pagamento. Tente novamente.");
      return;
    }
    let leadEmail = "";
    try {
      leadEmail = (localStorage.getItem("leadEmail") || "").trim();
    } catch {}
    const checkoutEndpoint = resolveCheckoutEndpoint();
    if (!checkoutEndpoint) {
      console.error("[landing-pay] createCheckoutSessionV2 error", {
        message: "missing_checkout_endpoint",
        status: "client"
      });
      setSubscribeError("Nao foi possivel iniciar o pagamento. Tente novamente.");
      return;
    }
    setIsLoading(true);
    try {
      console.log("[landing-pay] createCheckoutSessionV2 start");
      const successUrl = `${window.location.origin}/?checkout=success`;
      const cancelUrl = `${window.location.origin}/?checkout=cancel`;
      const payload = {
        data: {
          email: leadEmail || undefined,
          success_url: successUrl,
          cancel_url: cancelUrl
        }
      };
      const response = await fetch(checkoutEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      let body: any = null;
      try {
        body = await response.json();
      } catch {}
      if (!response.ok || body?.error) {
        const message =
          body?.error?.message ||
          body?.error?.status ||
          body?.error ||
          `HTTP_${response.status}`;
        console.error("[landing-pay] createCheckoutSessionV2 error", {
          message,
          status: response.status
        });
        setSubscribeError("Nao foi possivel iniciar o pagamento. Tente novamente.");
        return;
      }
      const checkoutUrl = body?.result?.url || body?.data?.url || body?.url;
      if (!checkoutUrl) {
        console.error("[landing-pay] createCheckoutSessionV2 error", {
          message: "checkout_url_missing",
          status: response.status
        });
        setSubscribeError("Nao foi possivel iniciar o pagamento. Tente novamente.");
        return;
      }
      try {
        localStorage.setItem("meumei_last_checkout_url", checkoutUrl);
      } catch {}
      console.log("[landing-pay] createCheckoutSessionV2 ok", {
        url: maskUrl(checkoutUrl)
      });
      console.log("[landing-pay] redirecting to stripe");
      window.location.href = checkoutUrl;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown_error";
      console.error("[landing-pay] createCheckoutSessionV2 error", {
        message,
        status: "client"
      });
      setSubscribeError("Nao foi possivel iniciar o pagamento. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="landing">
      <style>
        {`
          .landing {
            min-height: 100vh;
            background: radial-gradient(circle at 20% 10%, rgba(124, 92, 255, 0.22), transparent 45%), #0b0d1a;
            color: #ffffff;
            font-family: "Inter", system-ui, -apple-system, sans-serif;
          }
          .container {
            max-width: 980px;
            margin: 0 auto;
            padding: 64px 20px 80px;
            display: flex;
            flex-direction: column;
            gap: 48px;
          }
          .hero {
            text-align: center;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .eyebrow {
            text-transform: uppercase;
            letter-spacing: 0.3em;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.55);
          }
          .title {
            font-size: 40px;
            font-weight: 700;
            margin: 0;
          }
          .subtitle {
            font-size: 16px;
            line-height: 1.6;
            color: rgba(255, 255, 255, 0.78);
            margin: 0 auto;
            max-width: 680px;
          }
          .actions {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
          }
          .btn {
            border: none;
            border-radius: 12px;
            padding: 14px 24px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s ease, background 0.2s ease;
          }
          .btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }
          .btn-primary {
            background: #7c5cff;
            color: #ffffff;
          }
          .btn-primary:hover:not(:disabled) {
            transform: translateY(-1px);
            background: #6a4cf0;
          }
          .btn-secondary {
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.18);
          }
          .btn-secondary:hover:not(:disabled) {
            transform: translateY(-1px);
            background: rgba(255, 255, 255, 0.14);
          }
          .note {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.6);
          }
          .error {
            font-size: 12px;
            color: #fca5a5;
          }
          .section {
            display: flex;
            flex-direction: column;
            gap: 18px;
          }
          .section h2 {
            margin: 0;
            font-size: 24px;
          }
          .list {
            margin: 0;
            padding: 0;
            list-style: none;
            display: grid;
            gap: 10px;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          }
          .list li {
            display: flex;
            gap: 10px;
            align-items: flex-start;
            color: rgba(255, 255, 255, 0.8);
          }
          .dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: #7c5cff;
            margin-top: 7px;
          }
          .grid {
            display: grid;
            gap: 16px;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          }
          .card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .step {
            width: 28px;
            height: 28px;
            border-radius: 8px;
            background: rgba(124, 92, 255, 0.2);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            color: #d6ccff;
          }
          .faq {
            display: grid;
            gap: 12px;
          }
          .faq-item {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .faq-item p {
            margin: 0;
            color: rgba(255, 255, 255, 0.75);
            font-size: 14px;
            line-height: 1.5;
          }
          .footer {
            display: flex;
            justify-content: center;
            gap: 20px;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
          }
          @media (max-width: 720px) {
            .container {
              padding: 48px 16px 64px;
            }
            .hero {
              text-align: left;
              align-items: flex-start;
            }
            .subtitle {
              margin: 0;
            }
            .actions {
              justify-content: flex-start;
            }
            .title {
              font-size: 30px;
            }
          }
        `}
      </style>

      <div className="container">
        <section className="hero">
          <span className="eyebrow">meumei</span>
          <h1 className="title">Controle financeiro simples para MEI</h1>
          <p className="subtitle">
            Organize entradas, despesas e contas com visao mensal e relatorios
            claros, sem planilhas ou complicacao.
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubscribe}
              disabled={isLoading}
            >
              {isLoading ? "Abrindo checkout..." : "Assinar agora"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleLogin}
            >
              Entrar
            </button>
          </div>
          {subscribeError ? (
            <div className="error">{subscribeError}</div>
          ) : (
            <div className="note">Acesso liberado apos confirmacao.</div>
          )}
        </section>

        <section className="section">
          <h2>O que voce resolve com o meumei</h2>
          <ul className="list">
            <li>
              <span className="dot" /> Controle mensal de entradas e despesas.
            </li>
            <li>
              <span className="dot" /> Visao clara do caixa e das contas.
            </li>
            <li>
              <span className="dot" /> Organizacao para o limite anual do MEI.
            </li>
            <li>
              <span className="dot" /> Relatorios para tomar decisao rapida.
            </li>
          </ul>
        </section>

        <section className="section">
          <h2>Como funciona</h2>
          <div className="grid">
            <div className="card">
              <span className="step">1</span>
              <strong>Crie sua empresa</strong>
              <span>Cadastre o MEI e suas contas principais.</span>
            </div>
            <div className="card">
              <span className="step">2</span>
              <strong>Registre entradas e despesas</strong>
              <span>Lance vendas, gastos e contas recorrentes.</span>
            </div>
            <div className="card">
              <span className="step">3</span>
              <strong>Acompanhe por mes</strong>
              <span>Veja resultados e relatorios com rapidez.</span>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Para quem e</h2>
          <div className="grid">
            <div className="card">
              <strong>MEI</strong>
              <span>Controle simples do dia a dia.</span>
            </div>
            <div className="card">
              <strong>Autonomo</strong>
              <span>Organize receitas e despesas sem planilhas.</span>
            </div>
            <div className="card">
              <strong>Pequeno negocio</strong>
              <span>Visao clara do mes e do caixa.</span>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>FAQ</h2>
          <div className="faq">
            <div className="faq-item">
              <strong>Posso cancelar quando quiser?</strong>
              <p>Sim, o plano e mensal.</p>
            </div>
            <div className="faq-item">
              <strong>Funciona no celular?</strong>
              <p>Sim, a pagina e responsiva.</p>
            </div>
            <div className="faq-item">
              <strong>Meus dados ficam salvos?</strong>
              <p>Sim, ficam na sua conta do app.</p>
            </div>
            <div className="faq-item">
              <strong>Preciso entender de financas?</strong>
              <p>Nao, o fluxo e direto.</p>
            </div>
            <div className="faq-item">
              <strong>E para MEI?</strong>
              <p>Sim, foi pensado para MEI.</p>
            </div>
          </div>
        </section>

        <footer className="footer">
          <span>Termos</span>
          <span>Privacidade</span>
        </footer>
      </div>
    </div>
  );
}
