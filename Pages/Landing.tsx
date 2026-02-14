import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import metricsPreview from "@/assets/Code_Generated_Image.png";
import { betaKeysService } from "@/services/betaKeysService";

export default function Landing() {
  const [isLoading, setIsLoading] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");
  const [trialStatus, setTrialStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [trialMessage, setTrialMessage] = useState("");
  const [trialLoginUrl, setTrialLoginUrl] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [planChoice, setPlanChoice] = useState<"annual" | "monthly">("annual");
  const [cookieChoice, setCookieChoice] = useState<"accepted" | "declined" | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("meumei_cookie_choice");
      if (stored === "accepted" || stored === "declined") return stored;
    } catch {}
    return null;
  });
  const [leadEmailState, setLeadEmailState] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("leadEmail") || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const plan = (params.get("plan") || "").toLowerCase();
    if (plan === "monthly" || plan === "annual") {
      setPlanChoice(plan as "annual" | "monthly");
    }
    const upgrade = params.get("upgrade") === "1";
    const emailParam = params.get("email") || "";
    if (emailParam) {
      setLeadEmailState(emailParam);
      try {
        localStorage.setItem("leadEmail", emailParam);
      } catch {}
    }
    if (upgrade) {
      setTimeout(() => {
        const planEl = document.getElementById("planos");
        if (planEl) {
          planEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    }
  }, []);

  // --- LÓGICA (MANTIDA) ---
  const checkoutEndpointOverride = (import.meta.env.VITE_STRIPE_CHECKOUT_ENDPOINT || "").trim();
  const functionsBaseUrl = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").trim();
  const functionsRegion =
    (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1").trim() || "us-central1";
  const firebaseProjectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim();

  const resolveCheckoutEndpoint = () => {
    if (checkoutEndpointOverride) return checkoutEndpointOverride;
    if (functionsBaseUrl) return `${functionsBaseUrl.replace(/\/+$/, "")}/createCheckoutSessionV2`;
    if (!firebaseProjectId) return "";
    return `https://${functionsRegion}-${firebaseProjectId}.cloudfunctions.net/createCheckoutSessionV2`;
  };

  const handleSubscribe = async (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    if (isLoading) return;
    setSubscribeError("");
    if (!termsAccepted) {
      setTermsError("Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.");
      return;
    }
    const leadEmail = (leadEmailState || localStorage.getItem("leadEmail") || "").trim();
    const checkoutEndpoint = resolveCheckoutEndpoint();
    if (!checkoutEndpoint) {
      try {
        const last = localStorage.getItem("meumei_last_checkout_url");
        if (last) {
          window.location.href = last;
          return;
        }
      } catch {}
      setSubscribeError("Erro de configuração.");
      return;
    }
    setIsLoading(true);
    try {
      const payload = {
        data: {
          email: leadEmail || undefined,
          plan: planChoice,
          success_url: `${window.location.origin}/?checkout=success`,
          cancel_url: `${window.location.origin}/?checkout=cancel`
        }
      };
      const res = await fetch(checkoutEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => ({}));
      const checkoutUrl =
        body?.result?.url || body?.data?.url || body?.url || body?.checkoutUrl;
      if (!checkoutUrl) throw new Error("missing_url");
      window.location.href = checkoutUrl;
    } catch (err) {
      setSubscribeError("Erro ao iniciar pagamento.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrialRequest = async () => {
    if (trialStatus === "loading") return;
    setTrialMessage("");
    setTrialLoginUrl("");
    if (!termsAccepted) {
      setTermsError("Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.");
      return;
    }
    if (termsError) setTermsError("");
    const leadEmail = (leadEmailState || localStorage.getItem("leadEmail") || "").trim();
    if (!leadEmail) {
      setTrialStatus("error");
      setTrialMessage("Informe seu e-mail para receber o teste grátis.");
      return;
    }
    setTrialStatus("loading");
    try {
      const result = await betaKeysService.requestTrialKey({
        email: leadEmail,
        origin: window.location.origin
      });
      if (!result.ok) {
        setTrialStatus("error");
        setTrialMessage(result.message || "Não foi possível liberar o teste grátis.");
        return;
      }
      setTrialStatus("success");
      setTrialMessage(result.data?.message || "Enviamos a chave de teste para o seu e-mail.");
      setTrialLoginUrl(result.data?.loginUrl || "");
    } catch {
      setTrialStatus("error");
      setTrialMessage("Não foi possível liberar o teste grátis.");
    }
  };

  const navigate = (path: string) => {
    if (typeof window === "undefined") return;
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const scrollToPlan = () => {
    if (typeof window === "undefined") return;
    const planEl = document.getElementById("planos");
    if (planEl) {
      planEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const scrollToLeadForm = (focusEmail = false) => {
    if (typeof window === "undefined") return;
    const formEl = document.getElementById("lead-form");
    if (formEl) {
      formEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (focusEmail) {
      const inputEl = document.getElementById("lead-email") as HTMLInputElement | null;
      if (inputEl) {
        setTimeout(() => {
          try {
            inputEl.focus({ preventScroll: true });
          } catch {
            inputEl.focus();
          }
        }, 250);
      }
    }
  };

  const handleCookieChoice = (choice: "accepted" | "declined") => {
    setCookieChoice(choice);
    try {
      localStorage.setItem("meumei_cookie_choice", choice);
    } catch {}
  };

  const year = useMemo(() => new Date().getFullYear(), []);
  const containerClass = "w-full max-w-[1200px] mx-auto px-6";
  const planCopy = useMemo(
    () => ({
      annual: {
        title: "Plano anual",
        price: "R$ 358,80",
        cadence: "/ ano",
        headline: "Pagamento único anual",
        subline: "Acesso por 12 meses • Sem mensalidade",
        badge: "Economia no ano"
      },
      monthly: {
        title: "Plano mensal",
        price: "R$ 39,90",
        cadence: "/ mês",
        headline: "Assinatura recorrente",
        subline: "Cobrança mensal • Cancele quando quiser",
        badge: "Mais flexibilidade"
      },
    }),
    []
  );
  const cookieBanner = cookieChoice === null ? (
    <div
      className="fixed bottom-4 left-1/2 z-[9999] w-[min(100%-0.5rem,1200px)] md:w-[min(100%-2rem,72rem)] -translate-x-1/2 pointer-events-auto"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="rounded-2xl border border-white/15 bg-black px-3 py-2 text-[11px] text-zinc-200 shadow-[0_24px_80px_rgba(0,0,0,0.75)] md:px-6 md:py-4 md:text-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="space-y-1">
            <div className="font-semibold text-white">Cookies e Privacidade</div>
            <div className="text-zinc-300 text-[10px] leading-tight md:hidden">
              Usamos cookies essenciais para funcionamento do site. Cookies não essenciais só serão usados se você permitir.{" "}
              <a
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-white"
              >
                Ler Política de Privacidade
              </a>
            </div>
            <div className="hidden md:block text-zinc-300">
              Usamos cookies essenciais para funcionamento do site. Cookies não essenciais só serão usados se você permitir.
            </div>
            <a
              href="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline text-xs text-zinc-300 underline underline-offset-4 hover:text-white"
            >
              Ler Política de Privacidade
            </a>
          </div>
          <div className="flex w-full flex-row flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <button
              type="button"
              onClick={() => handleCookieChoice("declined")}
              className="flex-1 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white hover:border-white/40 transition md:flex-none"
            >
              Recusar
            </button>
            <button
              type="button"
              onClick={() => handleCookieChoice("accepted")}
              className="flex-1 rounded-full bg-white text-black px-4 py-2 text-xs font-bold hover:bg-zinc-200 transition shadow-[0_0_18px_rgba(255,255,255,0.35)] md:flex-none"
              style={{ color: "#000000" }}
            >
              Aceitar
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;
  const mockupBarData = [
    { height: 28, colorClass: "bg-sky-400/90", glowClass: "shadow-[0_0_12px_rgba(56,189,248,0.35)]" },
    { height: 34, colorClass: "bg-sky-400/90", glowClass: "shadow-[0_0_12px_rgba(56,189,248,0.35)]" },
    { height: 46, colorClass: "bg-sky-400/90", glowClass: "shadow-[0_0_12px_rgba(56,189,248,0.35)]" },
    { height: 58, colorClass: "bg-sky-400/90", glowClass: "shadow-[0_0_12px_rgba(56,189,248,0.35)]" },
    { height: 68, colorClass: "bg-violet-400/90", glowClass: "shadow-[0_0_12px_rgba(167,139,250,0.35)]" },
    { height: 78, colorClass: "bg-violet-400/90", glowClass: "shadow-[0_0_12px_rgba(167,139,250,0.35)]" },
    { height: 90, colorClass: "bg-violet-400/90", glowClass: "shadow-[0_0_12px_rgba(167,139,250,0.35)]" },
    { height: 102, colorClass: "bg-violet-400/90", glowClass: "shadow-[0_0_12px_rgba(167,139,250,0.35)]" },
    { height: 118, colorClass: "bg-pink-400/90", glowClass: "shadow-[0_0_12px_rgba(244,114,182,0.35)]" },
    { height: 128, colorClass: "bg-pink-400/90", glowClass: "shadow-[0_0_12px_rgba(244,114,182,0.35)]" },
    { height: 138, colorClass: "bg-pink-400/90", glowClass: "shadow-[0_0_12px_rgba(244,114,182,0.35)]" },
    { height: 150, colorClass: "bg-pink-400/90", glowClass: "shadow-[0_0_12px_rgba(244,114,182,0.35)]" },
  ];

  return (
    <div className="min-h-screen text-white font-sans selection:bg-teal-500/30 overflow-x-hidden flex flex-col relative bg-gradient-to-br from-[#05060c] via-[#0b1430] to-[#1a0b2f]">
      {/* BACKGROUND (same as login) */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_16%_18%,rgba(34,211,238,0.4),transparent_45%),radial-gradient(circle_at_82%_20%,rgba(16,185,129,0.28),transparent_50%),radial-gradient(circle_at_50%_88%,rgba(236,72,153,0.3),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/80" />
        <div className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-cyan-400/20 blur-[160px]" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-[180px]" />
      </div>

      {/* HEADER */}
      <header className="sticky top-0 z-[60] border-b border-white/10 bg-black/70 supports-[backdrop-filter]:bg-black/40 backdrop-blur-xl h-20 flex items-center shadow-[0_10px_35px_rgba(0,0,0,0.45)]">
        <div className={`${containerClass} flex items-center justify-between`}>
          <button
            onClick={() => navigate("/")}
            className="hover:opacity-90 transition flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50 rounded-lg px-2 py-1"
            aria-label="Ir para o início"
          >
            <span className="text-2xl font-bold tracking-tighter text-white">meumei</span>
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-200">
            <a href="#recursos" className="hover:text-white transition-colors">Recursos</a>
            <a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a>
            <a href="#planos" className="hover:text-white transition-colors">Planos</a>
            <a href="#perguntas" className="hover:text-white transition-colors">Perguntas</a>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <main className="relative z-10 pt-10 lg:pt-16 pb-10 md:pb-20">
        <div className={`${containerClass} relative`}>
          <div className="absolute top-[-10%] right-0 left-0 mx-auto w-[96%] h-[380px] blur-[140px] bg-gradient-to-tr from-teal-500/20 via-purple-600/20 to-sky-500/10 opacity-70 pointer-events-none"></div>
          <div className="relative z-10 space-y-16">
            <div className="space-y-6 w-full">
              <p className="text-xs uppercase tracking-[0.4em] text-zinc-300 text-center">
                App financeiro feito para MEI • versão 1.0.0
              </p>
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] text-white max-w-3xl mx-auto text-center">
                <span className="block">O app financeiro feito para MEI</span>
                <span
                  className="block bg-gradient-to-r from-sky-400 via-rose-500 to-purple-500 bg-clip-text text-transparent"
                  style={{
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundImage: "linear-gradient(90deg, #38bdf8 0%, #fb7185 50%, #a855f7 100%)",
                  }}
                >
                  controle o mês sem planilha e sem susto.
                </span>
              </h1>
              <p className="text-xs sm:text-base md:text-lg text-zinc-100/90 max-w-2xl mx-auto leading-relaxed text-center">
                Registre entradas e despesas, acompanhe o limite do MEI e saiba seu lucro em minutos. Tudo pensado para o dia a dia de quem é MEI.
              </p>
              <div
                className="rounded-2xl border border-white/15 bg-white/5 p-5 w-full text-left shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.45em] text-zinc-300">
                    Selecione seu plano
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPlanChoice("annual")}
                      className={`rounded-xl px-5 py-2 text-sm font-extrabold uppercase tracking-[0.2em] transition ${
                        planChoice === "annual"
                          ? "bg-black text-white border border-white/50 shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
                          : "bg-white/10 text-white/70 border border-white/15 hover:border-white/35"
                      }`}
                    >
                      Anual
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanChoice("monthly")}
                      className={`rounded-xl px-5 py-2 text-sm font-extrabold uppercase tracking-[0.2em] transition ${
                        planChoice === "monthly"
                          ? "bg-black text-white border border-white/50 shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
                          : "bg-white/10 text-white/70 border border-white/15 hover:border-white/35"
                      }`}
                    >
                      Mensal
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-base font-semibold text-white/90">
                  {planCopy[planChoice].title}
                </div>
                <div className="mt-1 text-sm text-zinc-100">
                  {planCopy[planChoice].headline}
                </div>
                <div className="mt-2 text-xs text-zinc-300">
                  {planCopy[planChoice].subline}
                </div>
                <div className="mt-3 text-xs font-semibold text-emerald-200">
                  Teste grátis por 7 dias — reembolso integral garantido conforme o Código de Defesa do Consumidor
                </div>
                <div className="mt-2 text-[11px] text-zinc-300 hidden md:block">
                  Preços e detalhes completos na seção Planos.
                </div>
              </div>
              <form
                id="lead-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubscribe();
                }}
                className="flex flex-col gap-3 md:flex-row md:items-stretch w-full"
              >
                <input
                  id="lead-email"
                  type="email"
                  placeholder="Seu melhor e-mail"
                  value={leadEmailState}
                  onChange={(e) => {
                    setLeadEmailState(e.target.value);
                    localStorage.setItem("leadEmail", e.target.value);
                  }}
                  className="flex-1 bg-white/10 px-4 py-3 text-white placeholder:text-zinc-300 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60 rounded-xl border border-white/20"
                  aria-label="E-mail"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-white/10 text-white px-6 py-3 rounded-xl font-semibold transition-all border border-white/20 hover:bg-white/15 hover:border-white/35 whitespace-nowrap disabled:opacity-70 disabled:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60"
                >
                  {isLoading
                    ? "..."
                    : planChoice === "monthly"
                    ? "Assinar plano mensal"
                    : "Assinar plano anual"}
                </button>
              </form>
              <div className="w-full">
                <button
                  type="button"
                  onClick={handleTrialRequest}
                  disabled={trialStatus === "loading"}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-extrabold uppercase tracking-[0.2em] text-white shadow-[0_24px_60px_rgba(34,211,238,0.35)] transition hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100 bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500"
                >
                  {trialStatus === "loading" ? "Gerando teste grátis..." : "Teste grátis por 7 dias"}
                </button>
                {trialMessage && (
                  <div
                    className={`mt-2 text-xs ${
                      trialStatus === "success" ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {trialMessage}
                  </div>
                )}
                {trialLoginUrl && trialStatus === "success" && (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = trialLoginUrl;
                    }}
                    className="mt-2 inline-flex items-center gap-2 text-xs text-emerald-200 underline underline-offset-4 hover:text-emerald-100"
                  >
                    Entrar com a chave agora
                  </button>
                )}
              </div>
              <div className="w-full space-y-2">
                <label className="flex items-start gap-3 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked);
                      if (e.target.checked) setTermsError("");
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-white/30 bg-white/10 text-teal-400 focus:ring-teal-400/60"
                  />
                  <span>
                    Li e concordo com os{" "}
                    <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
                      Termos de Uso
                    </a>{" "}
                    e a{" "}
                    <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
                      Política de Privacidade
                    </a>{" "}
                    e a{" "}
                    <a href="/reembolso" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
                      Política de Reembolso
                    </a>
                    .
                  </span>
                </label>
                {termsError && <div className="text-xs text-rose-300">{termsError}</div>}
                {subscribeError && <div className="text-xs text-rose-300">{subscribeError}</div>}
                <div className="text-[11px] text-zinc-300">
                  Ao continuar, você confirma o plano selecionado.
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-zinc-300 mb-4 md:mb-6 w-full">
                {[
                  "Plano anual com pagamento único",
                  "Reembolso integral garantido em até 7 dias",
                ].map((text) => (
                  <span key={text} className="bg-white/5 border border-white/10 rounded-full px-3 py-1">
                    {text}
                  </span>
                ))}
              </div>
            </div>

            <div className="hidden md:flex justify-center mt-6 lg:mt-12">
              <div className="w-full">
                <div className="rounded-3xl border border-white/10 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.55)]" style={{ backgroundColor: "#000000" }}>
                  <div className="px-8 py-6 space-y-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.45em] text-zinc-300">Saldo disponível</p>
                        <p className="mt-2 text-4xl font-semibold text-white leading-tight">
                          R$ 12.450,<span className="text-2xl">00</span>
                        </p>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-[10px] uppercase tracking-[0.35em] text-emerald-300">
                        +24% este mês
                      </div>
                    </div>
                  <div className="mt-12 flex justify-center">
                    <div className="w-full">
                      <img
                        src={metricsPreview}
                        alt="Mini gráfico estético"
                        className="w-full max-w-none rounded-3xl border border-white/10 shadow-[0_12px_30px_rgba(0,0,0,0.45)]"
                        style={{ maxHeight: "150px", objectFit: "cover" }}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 mt-24 lg:mt-32">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_15px_30px_rgba(0,0,0,0.35)]">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-zinc-300">
                          <span>Entradas</span>
                          <ArrowUpRight className="h-4 w-4 text-emerald-300" />
                        </div>
                        <div className="mt-3 flex items-end justify-between">
                          <span className="text-2xl font-semibold text-white">R$ 8.120</span>
                          <span className="text-xs font-semibold text-emerald-300">+12%</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_15px_30px_rgba(0,0,0,0.35)]">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-zinc-300">
                          <span>Despesas</span>
                          <ArrowDownRight className="h-4 w-4 text-rose-400" />
                        </div>
                        <div className="mt-3 flex items-end justify-between">
                          <span className="text-2xl font-semibold text-white">R$ 3.410</span>
                          <span className="text-xs font-semibold text-rose-400">-8%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      {/* FEATURES */}
      <section id="recursos" className="relative z-10 border-t border-white/10 bg-black/35 backdrop-blur-sm py-12 md:py-20">
        <div className={containerClass}>
          <div className="mb-12 text-center md:text-left">
            <h2 className="text-3xl md:text-5xl font-bold">
              Tudo o que você precisa.{" "}
              <span
                className="block font-bold bg-gradient-to-r from-sky-400 via-rose-500 to-purple-500 bg-clip-text text-transparent"
                style={{
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundImage: "linear-gradient(90deg, #38bdf8 0%, #fb7185 50%, #a855f7 100%)",
                }}
              >
                Nada do que você odeia.
              </span>
            </h2>
            <div className="h-4" aria-hidden="true"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 rounded-3xl bg-[#0f1118]/80 border border-white/15 p-6 md:p-10 relative overflow-hidden hover:border-teal-500/35 transition-colors shadow-[0_25px_70px_rgba(15,23,42,0.65)]">
              <div className="absolute top-0 right-0 w-72 h-72 bg-teal-500/10 blur-[90px] rounded-full hidden md:block"></div>
              <div className="relative z-10">
                <div className="hidden md:flex w-12 h-12 rounded-2xl bg-white/5 border border-white/10 items-center justify-center text-2xl mb-6">🚀</div>
                <h3 className="text-xl md:text-2xl font-bold mb-3">Emissão de DAS em 1 clique</h3>
                <p className="text-zinc-300 text-sm md:text-base max-w-xl">
                  Não perca tempo no site do governo. Gere sua guia mensal e organize seus pagamentos com consistência.
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-[#0f1118]/80 border border-white/15 p-6 md:p-8 relative overflow-hidden hover:border-purple-500/35 transition-colors shadow-[0_20px_60px_rgba(15,23,42,0.55)]">
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-zinc-900 to-transparent hidden md:block"></div>
              <div className="relative z-10">
                <div className="hidden md:flex w-12 h-12 rounded-2xl bg-white/5 border border-white/10 items-center justify-center text-2xl mb-6">📱</div>
                <h3 className="text-xl md:text-xl font-bold mb-3">Controle na palma da mão</h3>
                <p className="text-zinc-300 text-sm md:text-base">
                  Design responsivo, rápido e confortável. Do jeitinho que o MEI precisa no corre do dia.
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-[#0f1118]/80 border border-white/15 p-6 md:p-8 hover:border-teal-500/35 transition-colors shadow-[0_20px_60px_rgba(15,23,42,0.55)]">
              <h3 className="text-xl md:text-lg font-bold mb-2 flex items-center gap-2">
                <span className="hidden md:inline-flex w-2 h-2 rounded-full bg-green-500"></span>
                Relatórios
              </h3>
              <p className="text-zinc-300 text-sm md:text-base">Saiba exatamente seu lucro e acompanhe evolução mês a mês.</p>
            </div>

            <div className="md:col-span-2 rounded-3xl bg-[#0f1118]/80 border border-white/15 p-6 md:p-8 hover:border-purple-500/35 transition-colors shadow-[0_20px_60px_rgba(15,23,42,0.55)]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl md:text-xl font-bold mb-2">Segurança de dados</h3>
                  <p className="text-zinc-300 text-sm md:text-base">Boas práticas e criptografia para proteger suas informações.</p>
                </div>
                <div className="hidden md:block text-4xl opacity-40">🔒</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS (sem o box do print 5) */}
      <section id="como-funciona" className="relative z-10 py-20">
        <div className={containerClass}>
          <h3 className="text-3xl font-bold mb-4">Como funciona, na prática</h3>
          <p className="text-zinc-300 max-w-2xl">
            Sem “setup infinito”. Você entra, registra, e começa a ver seu mês com clareza. O objetivo é tirar peso da sua cabeça.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6">
            <div className="space-y-3">
              <div className="rounded-2xl bg-[#111219]/80 border border-white/15 p-5">
                <div className="text-xs text-zinc-300">1) Crie sua conta</div>
                <div className="text-sm font-semibold text-white mt-1">Em poucos passos, sem complicar.</div>
              </div>
              <div className="rounded-2xl bg-[#111219]/80 border border-white/15 p-5">
                <div className="text-xs text-zinc-300">2) Registre entradas e despesas</div>
                <div className="text-sm font-semibold text-white mt-1">Tudo organizado, sem gambiarra.</div>
              </div>
              <div className="rounded-2xl bg-[#111219]/80 border border-white/15 p-5">
                <div className="text-xs text-zinc-300">3) Enxergue seu lucro e o limite do MEI</div>
                <div className="text-sm font-semibold text-white mt-1">Decisões melhores com menos ansiedade.</div>
              </div>
            </div>

          </div>
        </div>
      </section>
      <section id="planos" className="relative z-10 py-20 hidden md:block">
        <div className={`${containerClass} flex flex-col items-center gap-6`}>
          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.45em] text-zinc-300">Planos</div>
            <div className="text-3xl sm:text-4xl font-black text-white">Escolha o melhor para você</div>
            <div className="text-sm text-zinc-300 mt-2">
              Ambos com 7 dias de reembolso integral garantido.
            </div>
          </div>
          <div className="w-full max-w-5xl grid gap-4 md:grid-cols-2">
            <div className={`rounded-3xl border border-white/10 bg-[#0c0c12]/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] ${planChoice === "annual" ? "ring-2 ring-emerald-400/60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.4em] text-zinc-300">Plano anual</div>
                <span className="text-[11px] uppercase tracking-[0.3em] text-emerald-300">Pagamento único</span>
              </div>
              <div className="mt-3 text-4xl font-black text-white">R$ 358,80</div>
              <div className="text-sm text-zinc-300">Acesso por 12 meses • Sem mensalidade</div>
              <button
                type="button"
                onClick={() => {
                  setPlanChoice("annual");
                  scrollToLeadForm(true);
                }}
                className="mt-4 w-full rounded-2xl bg-white/10 border border-white/20 text-white py-2 text-sm font-semibold hover:bg-white/15 transition"
              >
                Selecionar anual
              </button>
            </div>
            <div className={`rounded-3xl border border-white/10 bg-[#0c0c12]/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] ${planChoice === "monthly" ? "ring-2 ring-purple-400/60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.4em] text-zinc-300">Plano mensal</div>
                <span className="text-[11px] uppercase tracking-[0.3em] text-purple-300">Assinatura</span>
              </div>
              <div className="mt-3 text-4xl font-black text-white">R$ 39,90</div>
              <div className="text-sm text-zinc-300">Cobrança mensal recorrente • Cancele quando quiser</div>
              <button
                type="button"
                onClick={() => {
                  setPlanChoice("monthly");
                  scrollToLeadForm(true);
                }}
                className="mt-4 w-full rounded-2xl bg-white/10 border border-white/20 text-white py-2 text-sm font-semibold hover:bg-white/15 transition"
              >
                Selecionar mensal
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="perguntas" className="relative z-10 border-t border-white/10 bg-black/35 backdrop-blur-sm py-20">
        <div className={containerClass}>
          <h3 className="text-4xl font-bold mb-2">Perguntas rápidas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-sm font-bold text-white">Como funciona o pagamento?</div>
              <div className="text-zinc-300 text-sm mt-2">
                Plano anual com pagamento único e plano mensal com cobrança recorrente de R$ 39,90.
              </div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-sm font-bold text-white">Posso cancelar?</div>
              <div className="text-zinc-300 text-sm mt-2">
                O plano mensal pode ser cancelado a qualquer momento. O plano anual não é reembolsável após 7 dias.
              </div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-sm font-bold text-white">Existe reembolso?</div>
              <div className="text-zinc-300 text-sm mt-2">
                Sim. Você tem 7 dias para solicitar reembolso integral, conforme o Código de Defesa do Consumidor.
              </div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-sm font-bold text-white">Meus dados ficam seguros?</div>
              <div className="text-zinc-300 text-sm mt-2">
                Usamos boas práticas de segurança e criptografia para proteger suas informações.
              </div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-sm font-bold text-white">Funciona no celular?</div>
              <div className="text-zinc-300 text-sm mt-2">
                Sim. A interface é pensada para uso rápido no dia a dia.
              </div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-sm font-bold text-white">Vou conseguir entender sem ser “bom de finanças”?</div>
              <div className="text-zinc-300 text-sm mt-2">
                Essa é a ideia. O meumei simplifica, sem virar aula.
              </div>
            </div>
          </div>

          {/* Final CTA */}
      <div className="mt-56 rounded-3xl bg-gradient-to-r from-teal-500/15 to-purple-600/15 border border-white/10 p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="text-2xl font-bold">Bora organizar seu MEI sem drama.</div>
              <div className="text-zinc-300 mt-2">Clareza no mês, decisão melhor, cabeça mais leve.</div>
              <div className="mt-3 text-xs text-zinc-300">
                Plano anual de R$ 358,80 • pagamento único
              </div>
            </div>
            <div className="w-full md:w-auto flex gap-3">
              <button
                onClick={scrollToPlan}
                disabled={isLoading}
                className="w-full md:w-auto font-semibold px-6 py-3 rounded-2xl bg-white/10 border border-white/20 text-white hover:bg-white/15 transition disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black/70"
              >
                {isLoading ? "..." : "Começar agora"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="w-full md:w-auto bg-white/5 border border-white/15 text-white font-semibold px-6 py-3 rounded-2xl hover:bg-white/8 transition"
              >
                Já tenho conta
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 pt-8 pb-6 md:py-12 border-t border-white/10 bg-black/70 backdrop-blur-xl">
        <div className={`${containerClass} flex flex-col md:flex-row md:justify-between md:items-center gap-6 md:gap-8`}>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tighter text-zinc-300">meumei</span>
            <span className="text-zinc-300 text-sm">© {year}</span>
          </div>

          <div className="flex flex-wrap items-center text-sm text-zinc-300 gap-6 md:gap-8">
            <button onClick={() => navigate("/termos")} className="hover:text-white transition-colors">Termos de Uso</button>
            <button onClick={() => navigate("/privacidade")} className="hover:text-white transition-colors">Política de Privacidade</button>
            <button onClick={() => navigate("/reembolso")} className="hover:text-white transition-colors">Política de Reembolso</button>
          </div>
        </div>
      </footer>
      {cookieBanner &&
        (typeof document !== "undefined" ? createPortal(cookieBanner, document.body) : cookieBanner)}
    </div>
  );
}
