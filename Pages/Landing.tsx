import React, { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent } from "react";
import demoVideoFile from "@/assets/demo.mp4";
import demoMobilePreview from "@/assets/mobile.png";
import demoDesktopPreview from "@/assets/Desktop.png";
import { betaKeysService } from "@/services/betaKeysService";

export default function Landing() {
  type PlanChoice = "annual" | "monthly" | "trial";
  const [isLoading, setIsLoading] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");
  const [trialStatus, setTrialStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [trialMessage, setTrialMessage] = useState("");
  const [trialLoginUrl, setTrialLoginUrl] = useState("");
  const [demoFailed, setDemoFailed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [planChoice, setPlanChoice] = useState<PlanChoice>("annual");
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
  const planCardRef = useRef<HTMLDivElement | null>(null);
  const [planCardVisible, setPlanCardVisible] = useState(false);
  const socialProof = useMemo(
    () => ({
      meis: 2300,
      volume: 18500000,
      rating: 4.9
    }),
    []
  );
  const compactFormatter = useMemo(
    () =>
      new Intl.NumberFormat("pt-BR", {
        notation: "compact",
        maximumFractionDigits: 1
      }),
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const plan = (params.get("plan") || "").toLowerCase();
    if (plan === "monthly" || plan === "annual" || plan === "trial" || plan === "free") {
      setPlanChoice((plan === "free" ? "trial" : plan) as PlanChoice);
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

  useEffect(() => {
    if (planCardVisible) return;
    const element = planCardRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setPlanCardVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPlanCardVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [planCardVisible]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.add("landing-no-page-scroll");
    document.body.classList.add("landing-no-page-scroll");
    return () => {
      document.documentElement.classList.remove("landing-no-page-scroll");
      document.body.classList.remove("landing-no-page-scroll");
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 767px)");
    const handleViewport = () => setIsMobileViewport(media.matches);
    handleViewport();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleViewport);
      return () => media.removeEventListener("change", handleViewport);
    }
    media.onchange = handleViewport;
    return () => {
      media.onchange = null;
    };
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

  const validateLeadFields = () => {
    const leadEmail = (leadEmailState || localStorage.getItem("leadEmail") || "").trim();
    let hasError = false;
    if (!leadEmail) {
      setEmailError("Informe seu e-mail para continuar.");
      hasError = true;
    } else {
      setEmailError("");
    }
    if (!termsAccepted) {
      setTermsError("Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.");
      hasError = true;
    } else if (termsError) {
      setTermsError("");
    }
    return { isValid: !hasError, leadEmail };
  };

  const handleSubscribe = async (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    if (isLoading) return;
    setSubscribeError("");
    const { isValid, leadEmail } = validateLeadFields();
    if (!isValid) return;
    if (planChoice === "trial") {
      await handleTrialRequest(leadEmail);
      return;
    }
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
          email: leadEmail,
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

  const handleTrialRequest = async (leadEmail: string) => {
    if (trialStatus === "loading") return;
    setTrialMessage("");
    setTrialLoginUrl("");
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
      trial: {
        title: "Teste grátis 7 dias",
        price: "R$ 0,00",
        cadence: "/ 7 dias",
        headline: "Acesso com chave beta",
        subline: "Sem cobrança durante o período grátis",
        badge: "Acesso imediato"
      },
    }),
    []
  );
  const cookieBanner = cookieChoice === null ? (
    <div
      className="fixed bottom-3 left-3 right-3 z-[9999] pointer-events-none md:left-auto md:right-6 md:w-[420px]"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto rounded-2xl border border-white/15 bg-black/95 px-3 py-2 text-[11px] text-zinc-200 shadow-[0_24px_80px_rgba(0,0,0,0.75)] md:px-4 md:py-3 md:text-sm">
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
    <div className={`h-screen text-white font-sans selection:bg-teal-500/30 overflow-x-hidden overflow-y-auto landing-scroll-surface flex flex-col relative bg-gradient-to-br from-[#05060c] via-[#0b1430] to-[#1a0b2f] ${cookieChoice === null ? 'pb-24 md:pb-8' : ''}`}>
      {/* BACKGROUND (same as login) */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_16%_18%,rgba(34,211,238,0.4),transparent_45%),radial-gradient(circle_at_82%_20%,rgba(16,185,129,0.28),transparent_50%),radial-gradient(circle_at_50%_88%,rgba(236,72,153,0.3),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/80" />
        <div className="absolute -top-28 -left-24 h-80 w-80 rounded-full bg-cyan-400/20 blur-[160px]" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-[180px]" />
      </div>
      {/* HEADER */}
      <header className="sticky top-0 z-[60] border-b border-white/10 bg-black/70 supports-[backdrop-filter]:bg-black/40 backdrop-blur-xl h-20 min-h-20 max-h-20 flex items-center shadow-[0_10px_35px_rgba(0,0,0,0.45)]">
        <div className={`${containerClass} flex items-center justify-between`}>
          <button
            onClick={() => navigate("/")}
            className="hover:opacity-90 transition flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50 rounded-lg px-2 py-1"
            aria-label="Ir para o início"
          >
            <span className="text-2xl font-bold tracking-tighter text-white">meumei</span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="md:hidden inline-flex items-center rounded-full bg-gradient-to-r from-sky-500 to-fuchsia-500 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_14px_34px_rgba(59,130,246,0.35)] transition hover:from-sky-400 hover:to-fuchsia-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60"
          >
            Entrar
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-200">
            <a href="#recursos" className="hover:text-white transition-colors">Recursos</a>
            <a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a>
            <a href="#planos" className="hover:text-white transition-colors">Planos</a>
            <a href="#perguntas" className="hover:text-white transition-colors">Perguntas</a>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="inline-flex items-center rounded-full bg-gradient-to-r from-sky-500 to-fuchsia-500 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-[0_14px_34px_rgba(59,130,246,0.35)] transition hover:from-sky-400 hover:to-fuchsia-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60"
            >
              Entrar
            </button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <main className="relative z-10 pt-8 md:pt-10 lg:pt-16 pb-10 md:pb-20">
        <div className={`${containerClass} relative`}>
          <div className="absolute top-[-10%] right-0 left-0 mx-auto w-[96%] h-[380px] blur-[140px] bg-gradient-to-tr from-teal-500/20 via-purple-600/20 to-sky-500/10 opacity-70 pointer-events-none"></div>
          <div className="relative z-10 space-y-10 md:space-y-16">
            <div className="flex flex-col gap-4 md:gap-6 w-full">
              <p className="text-[11px] md:text-xs uppercase tracking-[0.28em] md:tracking-[0.4em] text-zinc-300 text-center">
                App financeiro feito para MEI
                <span className="hidden md:inline"> • versão 1.0.0</span>
              </p>
              <h1 className="order-1 md:order-1 text-[clamp(1.28rem,6.9vw,1.78rem)] tracking-[-0.018em] sm:text-5xl md:text-[3.65rem] lg:text-[4.15rem] font-bold leading-[1.06] md:leading-[1.1] text-white max-w-4xl md:max-w-none mx-auto text-center font-space-grotesk">
                <span className="block">Organize seu MEI sem planilhas</span>
                <span
                  className="block bg-gradient-to-r from-sky-400 via-rose-500 to-purple-500 bg-clip-text text-transparent"
                  style={{
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundImage: "linear-gradient(90deg, #38bdf8 0%, #fb7185 50%, #a855f7 100%)",
                  }}
                >
                  e sem risco de estourar o limite.
                </span>
              </h1>
              <p className="order-2 md:order-2 text-xs sm:text-base md:text-lg text-zinc-100/90 max-w-2xl mx-auto leading-relaxed text-center mt-3">
                Veja exatamente quanto está ganhando e quanto pode faturar, sem planilhas.
              </p>
              <div className="order-3 md:order-3 w-full mt-6 mb-8 md:mt-0 md:mb-0">
                <button
                  type="button"
                  onClick={() => {
                    setPlanChoice("trial");
                    scrollToLeadForm(true);
                  }}
                  disabled={trialStatus === "loading"}
                  className="w-full inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-extrabold uppercase tracking-[0.2em] text-white shadow-[0_24px_60px_rgba(34,211,238,0.35)] transition-transform duration-200 hover:scale-[1.03] disabled:opacity-60 disabled:hover:scale-100 bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500"
                >
                  {trialStatus === "loading" ? "Gerando teste grátis..." : "Teste grátis por 7 dias"}
                </button>
                <div className="mt-2 text-[11px] text-zinc-300 text-center">
                  Sem compromisso.
                </div>
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
            </div>

          </div>
        </div>
      </main>
      {/* SOCIAL PROOF */}
      <section id="prova-social" className="relative z-10 py-12 md:py-16">
        <div className={containerClass}>
          <div className="text-center space-y-3">
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              MEIs que já organizam o mês com o MeuMEI
            </h2>
            <p className="text-sm md:text-base text-zinc-300 max-w-2xl mx-auto">
              Resultados reais de quem trocou planilhas por clareza financeira.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-2 md:grid-cols-3 md:gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 md:p-5 text-center shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <div className="text-lg sm:text-2xl md:text-3xl font-black text-white leading-none">
                +{compactFormatter.format(socialProof.meis)}
              </div>
              <div className="text-[10px] sm:text-[11px] md:text-xs uppercase tracking-[0.12em] sm:tracking-[0.2em] md:tracking-[0.3em] text-zinc-300 mt-1">
                MEIs ativos
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 md:p-5 text-center shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <div className="text-lg sm:text-2xl md:text-3xl font-black text-white leading-none">
                R$ {compactFormatter.format(socialProof.volume)}
              </div>
              <div className="text-[10px] sm:text-[11px] md:text-xs uppercase tracking-[0.12em] sm:tracking-[0.2em] md:tracking-[0.3em] text-zinc-300 mt-1">
                Organizados
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 md:p-5 text-center shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
              <div className="text-lg sm:text-2xl md:text-3xl font-black text-white leading-none">
                {socialProof.rating.toFixed(1).replace(".", ",")}/5
              </div>
              <div className="text-[10px] sm:text-[11px] md:text-xs uppercase tracking-[0.12em] sm:tracking-[0.2em] md:tracking-[0.3em] text-zinc-300 mt-1">
                Nota média
              </div>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                quote:
                  "Eu controlava tudo em planilha e sempre me perdia no limite do MEI. Em 2 meses usando o MeuMEI, nunca mais estorei o faturamento.",
                name: "Carla Mendes",
                role: "MEI de confeitaria"
              },
              {
                quote:
                  "Hoje eu sei exatamente o que entra e o que sobra. O MeuMEI me deu clareza para separar meu pró-labore.",
                name: "Rafael Lima",
                role: "MEI de manutenção"
              },
              {
                quote:
                  "Antes eu sentia medo de perder o controle. Agora acompanho o lucro e o limite com tranquilidade.",
                name: "Juliana Torres",
                role: "MEI de beleza"
              }
            ].map((item) => (
              <div
                key={item.name}
                className="rounded-2xl border border-white/10 bg-[#0f1118]/80 p-5 md:p-6 shadow-[0_20px_60px_rgba(15,23,42,0.55)]"
              >
                <p className="text-[12px] md:text-sm text-zinc-200 leading-[1.45] md:leading-relaxed">“{item.quote}”</p>
                <div className="mt-3 md:mt-4 text-[10px] md:text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] text-emerald-200/80">
                  {item.name}
                </div>
                <div className="text-[10px] md:text-xs text-zinc-400">{item.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* FEATURES */}
      <section id="recursos" className="relative z-10 border-t border-white/10 bg-black/35 backdrop-blur-sm py-8 md:py-20">
        <div className={containerClass}>
          <div className="mb-7 md:mb-12 text-center md:text-left">
            <h2 className="text-3xl md:text-5xl font-bold font-space-grotesk">
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
            <div className="h-1 md:h-4" aria-hidden="true"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <div className="md:col-span-2 rounded-3xl bg-[#0f1118]/80 border border-white/15 p-4 md:p-10 relative overflow-hidden hover:border-teal-500/35 transition-colors shadow-[0_25px_70px_rgba(15,23,42,0.65)]">
              <div className="absolute top-0 right-0 w-72 h-72 bg-teal-500/10 blur-[90px] rounded-full hidden md:block"></div>
              <div className="relative z-10">
                <div className="hidden md:flex w-12 h-12 rounded-2xl bg-white/5 border border-white/10 items-center justify-center text-2xl mb-6">🚀</div>
                <h3 className="text-xl md:text-2xl font-bold mb-2 md:mb-3">Emissão de DAS facilitada.</h3>
                <p className="text-zinc-300 text-sm md:text-base max-w-xl">
                  Não perca tempo no site do governo. Gere sua guia mensal e organize seus pagamentos com consistência.
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-[#0f1118]/80 border border-white/15 p-4 md:p-8 relative overflow-hidden hover:border-purple-500/35 transition-colors shadow-[0_20px_60px_rgba(15,23,42,0.55)]">
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-zinc-900 to-transparent hidden md:block"></div>
              <div className="relative z-10">
                <div className="hidden md:flex w-12 h-12 rounded-2xl bg-white/5 border border-white/10 items-center justify-center text-2xl mb-6">📱</div>
                <h3 className="text-xl md:text-xl font-bold mb-2 md:mb-3">Controle na palma da mão</h3>
                <p className="text-zinc-300 text-sm md:text-base">
                  Design responsivo, rápido e confortável. Do jeitinho que o MEI precisa no corre do dia.
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-[#0f1118]/80 border border-white/15 p-4 md:p-8 hover:border-teal-500/35 transition-colors shadow-[0_20px_60px_rgba(15,23,42,0.55)]">
              <h3 className="text-xl md:text-lg font-bold mb-2 flex items-center gap-2">
                <span className="hidden md:inline-flex w-2 h-2 rounded-full bg-green-500"></span>
                Relatórios
              </h3>
              <p className="text-zinc-300 text-sm md:text-base">Saiba exatamente seu lucro e acompanhe evolução mês a mês.</p>
            </div>

            <div className="md:col-span-2 rounded-3xl bg-[#0f1118]/80 border border-white/15 p-4 md:p-8 hover:border-purple-500/35 transition-colors shadow-[0_20px_60px_rgba(15,23,42,0.55)]">
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

      {!isMobileViewport && (
        <section id="demo" className="relative z-10 py-16 md:py-20">
          <div className={`${containerClass} space-y-8`}>
            <div className="space-y-4 max-w-3xl mx-auto text-center">
              <h3 className="text-3xl md:text-4xl font-bold text-white">Veja como funciona na prática</h3>
              <p className="text-zinc-300 text-sm md:text-base max-w-xl mx-auto">
                Em segundos você registra entradas, acompanha despesas e enxerga seu lucro com clareza.
              </p>
              <ul className="text-sm text-zinc-300 space-y-2 inline-block text-left">
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  Registro rápido de entradas e despesas
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-sky-400"></span>
                  Limite do MEI sempre visível
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-fuchsia-400"></span>
                  Relatórios simples para decisões rápidas
                </li>
              </ul>
            </div>
            <div className="w-full rounded-3xl border border-white/10 bg-black/40 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
              <div className="relative overflow-hidden rounded-2xl bg-black h-[360px] sm:h-[440px] md:h-[540px] lg:h-[620px]">
                {!demoFailed ? (
                  <video
                    className="h-full w-full object-contain"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    poster={demoMobilePreview}
                    onError={() => {
                      console.warn("[landing-demo] video load failed, using fallback image");
                      setDemoFailed(true);
                    }}
                  >
                    <source src={demoVideoFile} type="video/mp4" />
                  </video>
                ) : (
                  <img
                    src={demoMobilePreview}
                    alt="Prévia do MeuMEI"
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
            </div>

            <article className="w-full rounded-3xl border border-white/10 bg-black/40 p-6 md:p-10 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
              <div className="mb-4 md:mb-6">
                <div className="text-xs uppercase tracking-[0.3em] text-zinc-300">Versão mobile + desktop</div>
              </div>

              <div className="relative">
                <div className="mb-4 flex flex-col items-center gap-3 md:mb-0 md:block">
                  <div className="z-30 w-full max-w-[520px] rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] backdrop-blur-[10px] px-5 py-3 md:px-6 md:py-3 shadow-[0_20px_60px_rgba(0,0,0,0.4)] text-left md:absolute md:top-[28px] md:left-[28px] md:right-[26%] lg:right-[24%] xl:right-[22%] md:w-auto md:max-w-none">
                    <div className="text-[12px] uppercase tracking-[0.14em] text-white/60">Desktop</div>
                    <div className="md:grid md:grid-cols-[minmax(0,1fr)_240px] md:items-center md:gap-4">
                      <div>
                        <h4 className="mt-0.5 text-[20px] sm:text-[22px] md:text-[24px] font-semibold leading-[1.12] text-white">
                          No desktop, visão <span className="text-sky-300">ampla</span>.
                        </h4>
                        <p className="mt-1 text-[14px] leading-[1.35] text-white/65">
                          Trabalhe com clareza na tela grande: tudo organizado em uma única leitura.
                        </p>
                      </div>
                      <div className="mt-1 md:mt-0 md:text-right md:border-l md:border-white/15 md:pl-6">
                        <p className="text-[12px] leading-[1.35] text-white/75">
                          <span className="block">Teste grátis por 7 dias.</span>
                          <span className="block">Seu MEI sob controle desde o início.</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setPlanChoice("trial");
                            scrollToLeadForm(true);
                          }}
                          className="mt-0.5 inline-flex w-full md:w-auto items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 via-indigo-500 to-fuchsia-500 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white shadow-[0_14px_30px_rgba(59,130,246,0.32)] hover:brightness-105 transition"
                        >
                          Teste grátis 7 dias
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="z-30 w-full max-w-[520px] rounded-2xl border border-[rgba(168,85,247,0.25)] bg-[rgba(15,23,42,0.45)] backdrop-blur-[10px] px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.4)] text-right md:absolute md:right-[26%] lg:right-[24%] xl:right-[22%] md:bottom-7 md:w-[320px] md:max-w-[320px]">
                    <div className="text-[12px] uppercase tracking-[0.14em] text-white/60">Mobile</div>
                    <h5 className="mt-1 whitespace-nowrap text-[20px] sm:text-[22px] md:text-[24px] font-semibold leading-[1.15] text-white">
                      No celular, decisão <span className="text-fuchsia-300">rápida</span>.
                    </h5>
                    <p className="mt-2 text-[14px] leading-[1.45] text-white/70">
                      Resolva em segundos na palma da mão.
                    </p>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/50 h-[300px] sm:h-[360px] md:h-[450px]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_32%_42%,rgba(56,189,248,0.18),transparent_52%),radial-gradient(circle_at_76%_68%,rgba(244,114,182,0.14),transparent_56%)]" />
                <img
                  src={demoDesktopPreview}
                  alt="Prévia da versão desktop do MeuMEI"
                  loading="lazy"
                  className="absolute z-10 left-[-16px] sm:left-[-12px] md:left-[-8px] bottom-0 sm:bottom-1 md:bottom-2 w-[56%] sm:w-[52%] md:w-[48%] max-h-[84%] object-contain"
                />
                <img
                  src={demoMobilePreview}
                  alt="Prévia da versão mobile do MeuMEI"
                  loading="lazy"
                  className="absolute z-20 right-0 bottom-0 h-[84%] sm:h-[92%] md:h-[100%] lg:h-[100%] w-auto max-w-[52%] object-contain object-right"
                />
                </div>
              </div>
            </article>
          </div>
        </section>
      )}

      {/* HOW IT WORKS (sem o box do print 5) */}
      <section id="como-funciona" className="relative z-10 py-20">
        <div className={containerClass}>
          <h3 className="text-3xl font-bold mb-4">Como funciona, na prática</h3>
          <p className="text-zinc-300 max-w-2xl">
            Em poucos minutos você sai do escuro e passa a decidir com clareza no seu MEI.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6">
            <div className="space-y-3">
              <div className="rounded-2xl bg-[#111219]/80 border border-white/15 p-5">
                <div className="text-xs text-zinc-300">1) Crie sua conta</div>
                <div className="text-sm font-semibold text-white mt-1">Acesso rápido, sem setup complicado.</div>
              </div>
              <div className="rounded-2xl bg-[#111219]/80 border border-white/15 p-5">
                <div className="text-xs text-zinc-300">2) Registre entradas e saídas</div>
                <div className="text-sm font-semibold text-white mt-1">Tudo organizado sem planilhas quebradas.</div>
              </div>
              <div className="rounded-2xl bg-[#111219]/80 border border-white/15 p-5">
                <div className="text-xs text-zinc-300">3) Veja lucro e limite do MEI em tempo real</div>
                <div className="text-sm font-semibold text-white mt-1">Decisões melhores, sem risco de estourar o teto.</div>
              </div>
            </div>

          </div>
        </div>
      </section>
      <section id="planos" className="relative z-10 py-20">
        <div className={containerClass}>
          <div className="text-center mb-8">
            <div className="text-xs uppercase tracking-[0.45em] text-zinc-300">Planos</div>
            <div className="text-3xl sm:text-4xl font-black text-white">Escolha o melhor para você</div>
            <div className="text-sm text-zinc-300 mt-2">
              Plano anual, plano mensal ou acesso grátis por 7 dias com chave beta.
            </div>
          </div>
          <div className="w-full max-w-5xl mx-auto">
            <div className="md:hidden grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPlanChoice("annual")}
                className={`inline-flex items-center justify-center rounded-xl border px-2 py-2 text-[11px] font-bold uppercase tracking-[0.1em] transition ${
                  planChoice === "annual"
                    ? "border-emerald-300/70 bg-emerald-400/15 text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)]"
                    : "border-white/20 bg-white/5 text-zinc-200"
                }`}
              >
                Anual
              </button>
              <button
                type="button"
                onClick={() => setPlanChoice("monthly")}
                className={`inline-flex items-center justify-center rounded-xl border px-2 py-2 text-[11px] font-bold uppercase tracking-[0.1em] transition ${
                  planChoice === "monthly"
                    ? "border-purple-300/70 bg-purple-400/15 text-white shadow-[0_10px_24px_rgba(168,85,247,0.22)]"
                    : "border-white/20 bg-white/5 text-zinc-200"
                }`}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setPlanChoice("trial")}
                className={`inline-flex items-center justify-center rounded-xl border px-2 py-2 text-[11px] font-bold uppercase tracking-[0.1em] transition ${
                  planChoice === "trial"
                    ? "border-cyan-300/70 bg-cyan-400/15 text-white shadow-[0_10px_24px_rgba(34,211,238,0.22)]"
                    : "border-white/20 bg-white/5 text-zinc-200"
                }`}
              >
                Grátis 7 dias
              </button>
            </div>

            <div className="hidden md:grid gap-3 md:gap-4 md:grid-cols-2 xl:grid-cols-3 items-stretch">
              <div className={`rounded-3xl border border-white/10 bg-[#0c0c12]/80 p-4 md:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] flex h-full flex-col ${planChoice === "annual" ? "ring-2 ring-emerald-400/60" : ""}`}>
                <div className="md:hidden grid grid-cols-[1fr_auto_1fr] items-start gap-2 min-h-[34px]">
                  <div className="text-[10px] uppercase tracking-[0.25em] leading-[1.2] text-zinc-300">
                    <span className="block">Plano</span>
                    <span className="block">anual</span>
                  </div>
                  <div className="text-center text-[1.9rem] sm:text-[2rem] font-black text-white leading-none whitespace-nowrap">R$ 358,80</div>
                  <span className="text-[10px] uppercase tracking-[0.2em] leading-[1.2] text-right text-emerald-300">
                    <span className="block">Pagamento</span>
                    <span className="block">único</span>
                  </span>
                </div>
                <div className="hidden md:grid grid-cols-[1fr_auto] items-start gap-2 md:gap-3 min-h-[32px] md:min-h-[40px]">
                  <div className="text-[10px] md:text-xs uppercase tracking-[0.25em] md:tracking-[0.35em] leading-[1.2] md:leading-[1.25] text-zinc-300">
                    <span className="block">Plano</span>
                    <span className="block">anual</span>
                  </div>
                  <span className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] md:tracking-[0.3em] leading-[1.2] md:leading-[1.25] text-right text-emerald-300">
                    <span className="block">Pagamento</span>
                    <span className="block">único</span>
                  </span>
                </div>
                <div className="hidden md:block mt-2 text-3xl md:text-4xl font-black text-white leading-none">R$ 358,80</div>
                <div className="mt-1 text-xs md:text-sm leading-[1.25] md:leading-tight text-zinc-300 text-center md:text-left md:min-h-[44px]">Acesso por 12 meses • Sem mensalidade</div>
                <button
                  type="button"
                  onClick={() => {
                    setPlanChoice("annual");
                    scrollToLeadForm(true);
                  }}
                  className="mt-1 md:mt-auto inline-flex w-full items-center justify-center text-center rounded-xl md:rounded-2xl bg-white/10 border border-white/20 text-white py-1.5 md:py-2 text-[11px] md:text-sm font-semibold uppercase tracking-[0.1em] md:tracking-[0.12em] hover:bg-white/15 transition"
                >
                  Anual
                </button>
              </div>

              <div className={`rounded-3xl border border-white/10 bg-[#0c0c12]/80 p-4 md:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] flex h-full flex-col ${planChoice === "monthly" ? "ring-2 ring-purple-400/60" : ""}`}>
                <div className="md:hidden grid grid-cols-[1fr_auto_1fr] items-start gap-2 min-h-[34px]">
                  <div className="text-[10px] uppercase tracking-[0.25em] leading-[1.2] text-zinc-300">
                    <span className="block">Plano</span>
                    <span className="block">mensal</span>
                  </div>
                  <div className="text-center text-[1.9rem] sm:text-[2rem] font-black text-white leading-none whitespace-nowrap">R$ 39,90</div>
                  <span className="text-[10px] uppercase tracking-[0.2em] leading-[1.2] text-right text-purple-300">
                    <span className="block">Assinatura</span>
                    <span className="block">mensal</span>
                  </span>
                </div>
                <div className="hidden md:grid grid-cols-[1fr_auto] items-start gap-2 md:gap-3 min-h-[32px] md:min-h-[40px]">
                  <div className="text-[10px] md:text-xs uppercase tracking-[0.25em] md:tracking-[0.35em] leading-[1.2] md:leading-[1.25] text-zinc-300">
                    <span className="block">Plano</span>
                    <span className="block">mensal</span>
                  </div>
                  <span className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] md:tracking-[0.3em] leading-[1.2] md:leading-[1.25] text-right text-purple-300">
                    <span className="block">Assinatura</span>
                    <span className="block">mensal</span>
                  </span>
                </div>
                <div className="hidden md:block mt-2 text-3xl md:text-4xl font-black text-white leading-none">R$ 39,90</div>
                <div className="mt-1 text-xs md:text-sm leading-[1.25] md:leading-tight text-zinc-300 text-center md:text-left md:min-h-[44px]">Cobrança mensal recorrente • Cancele quando quiser</div>
                <button
                  type="button"
                  onClick={() => {
                    setPlanChoice("monthly");
                    scrollToLeadForm(true);
                  }}
                  className="mt-1 md:mt-auto inline-flex w-full items-center justify-center text-center rounded-xl md:rounded-2xl bg-white/10 border border-white/20 text-white py-1.5 md:py-2 text-[11px] md:text-sm font-semibold uppercase tracking-[0.1em] md:tracking-[0.12em] hover:bg-white/15 transition"
                >
                  Mensal
                </button>
              </div>

              <div className={`rounded-3xl border border-white/10 bg-[#0c0c12]/80 p-4 md:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] flex h-full flex-col ${planChoice === "trial" ? "ring-2 ring-cyan-400/60" : ""}`}>
                <div className="md:hidden grid grid-cols-[1fr_auto_1fr] items-start gap-2 min-h-[34px]">
                  <div className="text-[10px] uppercase tracking-[0.25em] leading-[1.2] text-zinc-300">
                    <span className="block">Plano</span>
                    <span className="block">grátis</span>
                  </div>
                  <div className="text-center text-[1.9rem] sm:text-[2rem] font-black text-white leading-none whitespace-nowrap">R$ 0,00</div>
                  <span className="text-[10px] uppercase tracking-[0.2em] leading-[1.2] text-right text-zinc-300">
                    <span className="block">Grátis</span>
                    <span className="block">7 dias</span>
                  </span>
                </div>
                <div className="hidden md:grid grid-cols-[1fr_auto] items-start gap-2 md:gap-3 min-h-[32px] md:min-h-[40px]">
                  <div className="text-[10px] md:text-xs uppercase tracking-[0.25em] md:tracking-[0.35em] leading-[1.2] md:leading-[1.25] text-zinc-300">
                    <span className="block">Plano</span>
                    <span className="block">grátis</span>
                  </div>
                  <span className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] md:tracking-[0.3em] leading-[1.2] md:leading-[1.25] text-right text-zinc-300">
                    <span className="block">Grátis</span>
                    <span className="block">7 dias</span>
                  </span>
                </div>
                <div className="hidden md:block mt-2 text-3xl md:text-4xl font-black text-white leading-none">R$ 0,00</div>
                <div className="mt-1 text-xs md:text-sm leading-[1.25] md:leading-tight text-zinc-300 text-center md:text-left md:min-h-[44px]">Acesso completo por 7 dias.</div>
                <button
                  type="button"
                  onClick={() => {
                    setPlanChoice("trial");
                    scrollToLeadForm(true);
                  }}
                  className="mt-1 md:mt-auto inline-flex w-full items-center justify-center text-center rounded-xl md:rounded-2xl bg-white/10 border border-white/20 text-white py-1.5 md:py-2 text-[11px] md:text-sm font-semibold uppercase tracking-[0.1em] md:tracking-[0.12em] hover:bg-white/15 transition"
                >
                  Grátis 7 Dias
                </button>
              </div>
            </div>

            <div
              ref={planCardRef}
              className={`mt-6 rounded-2xl border border-white/10 bg-white/3 p-4 md:p-5 w-full text-left backdrop-blur-sm shadow-[0_12px_32px_rgba(0,0,0,0.35)] transition-all duration-700 ease-out ${planCardVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-[0.45em] text-zinc-300">
                  Selecione seu plano
                </div>
              </div>
              <div className="mt-3 text-base font-semibold text-white/90">
                {planCopy[planChoice].title}
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <span className="text-2xl md:text-3xl font-extrabold text-white">{planCopy[planChoice].price}</span>
                <span className="text-sm text-zinc-300">{planCopy[planChoice].cadence}</span>
                <div className="ml-auto text-right">
                  {planChoice === "annual" ? (
                    <>
                      <span className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2.5 py-1 text-[10px] md:text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-200">
                        Mais vantajoso
                      </span>
                      <div className="mt-1 text-[11px] md:text-xs font-semibold text-emerald-200">
                        Economize R$ 120,00 por ano
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/70">
                      {planCopy[planChoice].badge}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 text-sm text-zinc-100">
                {planCopy[planChoice].headline}
              </div>
              <div className="mt-2 text-xs text-zinc-300">
                {planCopy[planChoice].subline}
              </div>
              <div className="mt-2 text-xs text-zinc-300 leading-relaxed">
                {planChoice === "annual"
                  ? "Plano anual com pagamento único e acesso completo por 12 meses, ideal para quem quer economia e previsibilidade."
                  : planChoice === "monthly"
                  ? "Plano mensal com cobrança recorrente, ideal para quem quer flexibilidade e liberdade para cancelar quando quiser."
                  : "Acesso grátis por 7 dias para testar a plataforma antes de contratar um plano."}
              </div>
              {planChoice !== "trial" && (
                <div className="mt-3 text-xs font-semibold text-emerald-200">
                  Teste grátis por 7 dias — reembolso integral garantido
                </div>
              )}
            </div>

            <form
              id="lead-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubscribe();
              }}
              className="mt-4 flex flex-col gap-3 md:flex-row md:items-start w-full"
            >
              <div className="flex-1">
                <input
                  id="lead-email"
                  type="email"
                  placeholder="Seu melhor e-mail"
                  value={leadEmailState}
                  onChange={(e) => {
                    const nextEmail = e.target.value;
                    setLeadEmailState(nextEmail);
                    localStorage.setItem("leadEmail", nextEmail);
                    if (emailError && nextEmail.trim()) setEmailError("");
                  }}
                  className={`w-full bg-white/10 px-4 py-3 text-white placeholder:text-zinc-300 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60 rounded-xl border ${
                    emailError
                      ? "border-rose-400/80 focus-visible:ring-rose-400/70"
                      : "border-white/20 focus-visible:ring-teal-400/60"
                  }`}
                  aria-label="E-mail"
                />
                {emailError && <div className="mt-1 text-xs text-rose-300">{emailError}</div>}
              </div>
              <button
                type="submit"
                disabled={isLoading || trialStatus === "loading"}
                className="md:self-start bg-transparent text-white/75 px-4 py-3 min-h-[48px] rounded-xl text-xs md:text-sm font-semibold transition-all border border-white/20 hover:text-white hover:border-white/40 whitespace-nowrap disabled:opacity-60 disabled:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60"
              >
                {isLoading || trialStatus === "loading"
                  ? "..."
                  : planChoice === "monthly"
                  ? "Assinar plano mensal"
                  : planChoice === "trial"
                  ? "Receber chave grátis"
                  : "Assinar plano anual"}
              </button>
            </form>

            <div className="w-full space-y-2 mt-3">
              <label className={`flex items-start gap-3 text-xs ${termsError ? "text-rose-200" : "text-zinc-300"}`}>
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked);
                    if (e.target.checked) setTermsError("");
                  }}
                  className={`mt-0.5 h-4 w-4 rounded bg-white/10 text-teal-400 ${
                    termsError ? "border-rose-400/80 focus:ring-rose-400/70" : "border-white/30 focus:ring-teal-400/60"
                  }`}
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
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="perguntas" className="relative z-10 border-t border-white/10 bg-black/35 backdrop-blur-sm py-12 md:py-20">
        <div className={`${containerClass} relative`}>
          <h3 className="text-3xl md:text-4xl font-bold mb-2">Perguntas rápidas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-4 md:p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-[13px] md:text-sm font-bold text-white">Posso testar antes de assinar?</div>
              <div className="text-zinc-300 text-[12px] md:text-sm mt-1.5 md:mt-2 leading-[1.35] md:leading-normal">
                Sim. Você pode iniciar com 7 dias de teste grátis para validar se o fluxo funciona para o seu dia a dia.
              </div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-4 md:p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-[13px] md:text-sm font-bold text-white">Como funciona o pagamento?</div>
              <div className="text-zinc-300 text-[12px] md:text-sm mt-1.5 md:mt-2 leading-[1.35] md:leading-normal">
                Plano anual com pagamento único de R$ 358,80 e plano mensal com cobrança recorrente de R$ 39,90.
              </div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-4 md:p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-[13px] md:text-sm font-bold text-white">Posso cancelar?</div>
              <div className="text-zinc-300 text-[12px] md:text-sm mt-1.5 md:mt-2 leading-[1.35] md:leading-normal">
                O plano mensal pode ser cancelado a qualquer momento. O plano anual pode ser cancelado dentro dos 7 dias de garantia.
              </div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-4 md:p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-[13px] md:text-sm font-bold text-white">Existe reembolso?</div>
              <div className="text-zinc-300 text-[12px] md:text-sm mt-1.5 md:mt-2 leading-[1.35] md:leading-normal">
                Sim. Você tem 7 dias para solicitar reembolso integral caso não esteja satisfeito.
              </div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-4 md:p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-[13px] md:text-sm font-bold text-white">Meus dados ficam seguros?</div>
              <div className="text-zinc-300 text-[12px] md:text-sm mt-1.5 md:mt-2 leading-[1.35] md:leading-normal">
                Sim. Aplicamos boas práticas de segurança e criptografia para proteger suas informações financeiras.
              </div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-4 md:p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-[13px] md:text-sm font-bold text-white">Funciona no celular?</div>
              <div className="text-zinc-300 text-[12px] md:text-sm mt-1.5 md:mt-2 leading-[1.35] md:leading-normal">
                Sim. O app foi pensado para uso rápido no celular, com leitura clara e ações simples.
              </div>
            </div>
          </div>

          {/* Final CTA */}
          <div className="hidden md:flex relative z-20 mt-56 rounded-3xl bg-gradient-to-r from-teal-500/15 to-purple-600/15 border border-white/10 p-8 md:p-10 flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="text-2xl font-bold">Continue no escuro ou organize seu MEI hoje.</div>
              <div className="text-zinc-300 mt-2">Clareza no mês, decisões melhores e menos risco no limite do MEI.</div>
              <div className="mt-3 text-xs text-zinc-300">
                Plano anual de R$ 358,80 • pagamento único | Plano mensal de R$ 39,90 • cancele quando quiser
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
      <footer className="relative z-[6] mt-auto pt-8 pb-6 md:py-12 border-t border-white/10 bg-black/70 backdrop-blur-xl">
        <div className={`${containerClass} relative z-10 flex flex-col md:flex-row md:justify-between md:items-center gap-6 md:gap-8`}>
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
