import React, { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import metricsPreview from "@/assets/Code_Generated_Image.png";

export default function Landing() {
  const [isLoading, setIsLoading] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");
  const [leadEmailState, setLeadEmailState] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("leadEmail") || "";
    } catch {
      return "";
    }
  });

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

  const navigate = (path: string) => {
    if (typeof window === "undefined") return;
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const year = useMemo(() => new Date().getFullYear(), []);
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
    <div className="min-h-screen text-white font-sans selection:bg-teal-500/30 overflow-x-hidden flex flex-col relative bg-[#070712]">
      {/* BACKGROUND */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-[980px] overflow-hidden">
          <div
            className="absolute top-[-18%] left-[-10%] w-[720px] h-[720px] rounded-full blur-[150px] opacity-25"
            style={{ background: "radial-gradient(circle, #14b8a6 0%, transparent 70%)" }}
          />
          <div
            className="absolute top-[6%] right-[-14%] w-[820px] h-[820px] rounded-full blur-[170px] opacity-22"
            style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }}
          />
          <div
            className="absolute bottom-[-26%] left-[8%] w-[760px] h-[760px] rounded-full blur-[190px] opacity-18"
            style={{ background: "radial-gradient(circle, #2563eb 0%, transparent 70%)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/45 to-black/85" />
        </div>

        {/* subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
      </div>

      {/* HEADER */}
      <header className="fixed top-0 left-0 w-full z-50 border-b border-white/10 bg-black/35 backdrop-blur-md h-20 flex items-center">
        <div className="max-w-7xl mx-auto px-6 w-full flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="hover:opacity-90 transition flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50 rounded-lg px-2 py-1"
            aria-label="Ir para o início"
          >
            <span className="text-2xl font-bold tracking-tighter text-white">meumei</span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-white/35">controle MEI</span>
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm text-zinc-300">
            <a href="#recursos" className="hover:text-white transition-colors">Recursos</a>
            <a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a>
            <a href="#perguntas" className="hover:text-white transition-colors">Perguntas</a>
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/login")}
              className="text-sm font-medium text-zinc-300 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25 rounded-md px-2 py-1"
            >
              Login
            </button>

            <button
              onClick={() => handleSubscribe()}
              className="px-6 py-2.5 rounded-full text-sm font-bold bg-white text-black hover:text-black hover:bg-zinc-200 transition-all hover:scale-[1.03] shadow-[0_0_24px_rgba(255,255,255,0.16)] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50"
              style={{ color: "#000000" }}
            >
              Começar agora
            </button>
          </div>
        </div>
      </header>

      <div className="w-full h-20 block shrink-0"></div>

      {/* HERO */}
      <main className="relative z-10 pt-10 lg:pt-16 pb-20 max-w-7xl mx-auto px-6 w-full">
        <div className="relative">
          <div className="absolute top-[-10%] right-0 left-0 mx-auto w-[96%] h-[380px] blur-[140px] bg-gradient-to-tr from-teal-500/20 via-purple-600/20 to-sky-500/10 opacity-70 pointer-events-none"></div>
          <div className="relative z-10 space-y-16">
            <div className="space-y-6 max-w-4xl">
              <p className="text-xs uppercase tracking-[0.4em] text-zinc-500">
                Nova dashboard 1.0.0 • Pensado para MEIs de verdade
              </p>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] text-white max-w-3xl">
                <span className="block">Veja seu mês financeiro</span>
                <span
                  className="block bg-gradient-to-r from-sky-400 via-rose-500 to-purple-500 bg-clip-text text-transparent"
                  style={{
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundImage: "linear-gradient(90deg, #38bdf8 0%, #fb7185 50%, #a855f7 100%)",
                  }}
                >
                  sem planilha e sem susto.
                </span>
              </h1>
              <p className="text-lg text-zinc-200/90 max-w-2xl leading-relaxed">
                Registre entradas e despesas, acompanhe o limite do MEI e tenha clareza do mês em poucos minutos. Sem planilhas quebradas. Sem dor de cabeça.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubscribe();
                }}
                className="flex flex-col gap-3 md:flex-row md:items-stretch max-w-3xl"
              >
                <input
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
                  className="bg-gradient-to-r from-teal-400 to-purple-500 text-black px-6 py-3 rounded-xl font-extrabold transition-all shadow-[0_25px_70px_rgba(16,185,129,0.35)] border border-white/30 hover:scale-[1.02] whitespace-nowrap disabled:opacity-70 disabled:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60"
                >
                  {isLoading ? "..." : "Ver meu mês agora"}
                </button>
              </form>
              <div className="flex flex-wrap gap-3 text-xs text-zinc-400 mb-6">
                {[
                  "Teste o meumei por 7 dias",
                  "Rápido e confortável no celular",
                  "Concebido para quem não quer complicação",
                ].map((text) => (
                  <span key={text} className="bg-white/5 border border-white/10 rounded-full px-3 py-1">
                    {text}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-center mt-6 lg:mt-12">
              <div className="w-full max-w-[640px]">
                <div className="rounded-3xl border border-white/10 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.55)]" style={{ backgroundColor: "#000000" }}>
                  <div className="px-8 py-6 space-y-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.45em] text-zinc-500">Saldo disponível</p>
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
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-zinc-400">
                          <span>Entradas</span>
                          <ArrowUpRight className="h-4 w-4 text-emerald-300" />
                        </div>
                        <div className="mt-3 flex items-end justify-between">
                          <span className="text-2xl font-semibold text-white">R$ 8.120</span>
                          <span className="text-xs font-semibold text-emerald-300">+12%</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_15px_30px_rgba(0,0,0,0.35)]">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-zinc-400">
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
      <section id="recursos" className="relative z-10 border-t border-white/10 bg-black/35 backdrop-blur-sm py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12">
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
            <div className="md:col-span-2 rounded-3xl bg-[#0f1118]/80 border border-white/15 p-8 md:p-10 relative overflow-hidden hover:border-teal-500/35 transition-colors shadow-[0_25px_70px_rgba(15,23,42,0.65)]">
              <div className="absolute top-0 right-0 w-72 h-72 bg-teal-500/10 blur-[90px] rounded-full"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-6">🚀</div>
                <h3 className="text-2xl font-bold mb-3">Emissão de DAS em 1 clique</h3>
                <p className="text-zinc-400 max-w-xl">
                  Não perca tempo no site do governo. Gere sua guia mensal e organize seus pagamentos com consistência.
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-[#0f1118]/80 border border-white/15 p-8 relative overflow-hidden hover:border-purple-500/35 transition-colors shadow-[0_20px_60px_rgba(15,23,42,0.55)]">
              <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-zinc-900 to-transparent"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-6">📱</div>
                <h3 className="text-xl font-bold mb-3">Controle na palma da mão</h3>
                <p className="text-zinc-400 text-sm">
                  Design responsivo, rápido e confortável. Do jeitinho que o MEI precisa no corre do dia.
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-[#0f1118]/80 border border-white/15 p-8 hover:border-teal-500/35 transition-colors shadow-[0_20px_60px_rgba(15,23,42,0.55)]">
              <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Relatórios
              </h3>
              <p className="text-zinc-400 text-sm">Saiba exatamente seu lucro e acompanhe evolução mês a mês.</p>
            </div>

            <div className="md:col-span-2 rounded-3xl bg-[#0f1118]/80 border border-white/15 p-8 flex items-center justify-between hover:border-purple-500/35 transition-colors shadow-[0_20px_60px_rgba(15,23,42,0.55)]">
              <div>
                <h3 className="text-xl font-bold mb-2">Segurança de dados</h3>
                <p className="text-zinc-400 text-sm">Boas práticas e criptografia para proteger suas informações.</p>
              </div>
              <div className="text-4xl opacity-40">🔒</div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS (sem o box do print 5) */}
      <section id="como-funciona" className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-3xl font-bold mb-4">Como funciona, na prática</h3>
          <p className="text-zinc-300 max-w-2xl">
            Sem “setup infinito”. Você entra, registra, e começa a ver seu mês com clareza. O objetivo é tirar peso da sua cabeça.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6">
            <div className="space-y-3">
              <div className="rounded-2xl bg-[#111219]/80 border border-white/15 p-5">
                <div className="text-xs text-zinc-400">1) Crie sua conta</div>
                <div className="text-sm font-semibold text-white mt-1">Em poucos passos, sem complicar.</div>
              </div>
              <div className="rounded-2xl bg-[#111219]/80 border border-white/15 p-5">
                <div className="text-xs text-zinc-400">2) Registre entradas e despesas</div>
                <div className="text-sm font-semibold text-white mt-1">Tudo organizado, sem gambiarra.</div>
              </div>
              <div className="rounded-2xl bg-[#111219]/80 border border-white/15 p-5">
                <div className="text-xs text-zinc-400">3) Enxergue seu lucro e o limite do MEI</div>
                <div className="text-sm font-semibold text-white mt-1">Decisões melhores com menos ansiedade.</div>
              </div>
            </div>

          </div>
        </div>
      </section>
        <div className="mt-0 mb-20 w-full px-4 flex flex-col items-center gap-1">
          <span style={{ fontSize: "100px" }} className="font-black leading-none text-white text-[100px] lg:text-[100px]">R$ 29,90</span>
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-gradient-to-r from-white/10 via-black/40 to-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.45)] p-6 flex flex-col items-center gap-3 uppercase tracking-[0.25em] text-sm">
            <span className="text-white/80">Assinatura mensal</span>
            <span className="text-emerald-300 text-lg font-bold">Cancele quando quiser</span>
            <span className="text-white/70 text-sm">7 dias de garantia</span>
          </div>
        </div>

      {/* FAQ */}
      <section id="perguntas" className="relative z-10 border-t border-white/10 bg-black/35 backdrop-blur-sm py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-4xl font-bold mb-2">Perguntas rápidas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-sm font-bold text-white">Funciona no celular?</div>
              <div className="text-zinc-400 text-sm mt-2">Sim. A interface é pensada para uso rápido no dia a dia.</div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-sm font-bold text-white">Meus dados ficam seguros?</div>
              <div className="text-zinc-400 text-sm mt-2">Usamos boas práticas de segurança e criptografia para proteger suas informações.</div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-sm font-bold text-white">Vou conseguir entender sem ser “bom de finanças”?</div>
              <div className="text-zinc-400 text-sm mt-2">Essa é a ideia. O meumei simplifica, sem virar aula.</div>
            </div>

            <div className="rounded-2xl bg-[#0d0d13]/80 border border-white/15 p-6 shadow-[0_15px_50px_rgba(0,0,0,0.55)]">
              <div className="text-sm font-bold text-white">Posso começar agora?</div>
              <div className="text-zinc-400 text-sm mt-2">Sim. Clique em “Começar agora” e siga o fluxo de pagamento.</div>
            </div>
          </div>

          {/* Final CTA */}
      <div className="mt-56 rounded-3xl bg-gradient-to-r from-teal-500/15 to-purple-600/15 border border-white/10 p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="text-2xl font-bold">Bora organizar seu MEI sem drama.</div>
              <div className="text-zinc-300 mt-2">Clareza no mês, decisão melhor, cabeça mais leve.</div>
            </div>
            <div className="w-full md:w-auto flex gap-3">
              <button
                onClick={() => handleSubscribe()}
                disabled={isLoading}
                className="w-full md:w-auto font-extrabold px-6 py-3 rounded-2xl bg-white text-black hover:bg-zinc-200 transition disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black/70 shadow-[0_15px_50px_rgba(255,255,255,0.18)]"
                style={{ color: "#000000" }}
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
      <footer className="relative z-10 py-12 border-t border-white/10 bg-black/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tighter text-zinc-300">meumei</span>
            <span className="text-zinc-500 text-sm">© {year}</span>
          </div>

          <div className="flex items-center text-sm text-zinc-400 gap-6">
            <button onClick={() => navigate("/termos")} className="hover:text-white transition-colors">Termos de Uso</button>
            <button onClick={() => navigate("/privacidade")} className="hover:text-white transition-colors">Política de Privacidade</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
