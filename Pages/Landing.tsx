import React, { useState } from "react";
import type { MouseEvent } from "react";

export default function Landing() {
  const [isLoading, setIsLoading] = useState(false);
  const [subscribeError, setSubscribeError] = useState("");
  const [leadEmailState, setLeadEmailState] = useState("");

  // --- LÓGICA (MANTIDA) ---
  const checkoutEndpointOverride = (import.meta.env.VITE_STRIPE_CHECKOUT_ENDPOINT || "").trim();
  const functionsBaseUrl = (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").trim();
  const functionsRegion = (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1").trim() || "us-central1";
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
        const last = localStorage.getItem('meumei_last_checkout_url');
        if (last) { window.location.href = last; return; }
      } catch {}
      setSubscribeError("Erro de configuração.");
      return;
    }
    setIsLoading(true);
    try {
      const payload = { data: { email: leadEmail || undefined, success_url: `${window.location.origin}/?checkout=success`, cancel_url: `${window.location.origin}/?checkout=cancel` } };
      const res = await fetch(checkoutEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      const checkoutUrl = body?.result?.url || body?.data?.url || body?.url || body?.checkoutUrl;
      if (!checkoutUrl) throw new Error('missing_url');
      window.location.href = checkoutUrl;
    } catch (err) {
      setSubscribeError('Erro ao iniciar pagamento.');
    } finally {
      setIsLoading(false);
    }
  };

  const navigate = (path: string) => {
    if (typeof window === 'undefined') return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-screen bg-[#020202] text-white font-sans selection:bg-purple-500/30 overflow-x-hidden flex flex-col relative">
      
      {/* --- BACKGROUND TÉCNICO --- */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none z-0"></div>
      
      {/* GLOW DE FUNDO */}
      <div className="fixed top-[10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-purple-600/15 blur-[140px] rounded-full pointer-events-none z-0"></div>

      {/* --- HEADER FIXO --- */}
      <header className="fixed top-0 left-0 w-full z-50 border-b border-white/5 bg-[#020202]/95 backdrop-blur-xl h-24 flex items-center shadow-2xl">
        <div className="max-w-7xl mx-auto px-6 w-full flex items-center justify-between">
          
          {/* LOGO */}
          <button onClick={() => navigate('/')} className="hover:opacity-80 transition flex items-center gap-1 group">
            <span className="text-2xl font-bold tracking-tighter text-white">meumei</span>
          </button>

          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/login')} className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Login
            </button>
            
            {/* BOTÃO: COR FORÇADA VIA STYLE INLINE (INFALÍVEL) */}
            <button 
              onClick={() => handleSubscribe()} 
              style={{ color: '#000000', backgroundColor: '#ffffff' }}
              className="px-8 py-3 rounded-full text-sm font-bold hover:bg-zinc-200 transition-all hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
            >
              Começar Agora
            </button>
          </div>
        </div>
      </header>

      {/* --- TRAVA DE ESPAÇO --- */}
      <div className="w-full h-24 block shrink-0"></div> 

      {/* --- HERO SECTION --- */}
      <main className="relative z-10 mt-12 lg:mt-24 pb-24 max-w-7xl mx-auto px-6 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-8 items-center">
          
          {/* LADO ESQUERDO: Copywriting */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left space-y-8 animate-fade-in-up pt-4">
            
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-zinc-300 text-xs font-medium hover:border-purple-500/50 transition-colors cursor-default shadow-xl">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              Nova Dashboard 2.0
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight tracking-tight drop-shadow-2xl">
              Finanças <br />
              <span className="text-purple-500">descomplicadas</span> <br />
              para MEIs.
            </h1>

            <p className="text-lg text-zinc-400 max-w-lg leading-relaxed">
              Diga adeus às planilhas quebradas. Uma plataforma completa para controlar seu faturamento, emitir notas e evitar multas.
            </p>

            {/* Input Email */}
            <div className="w-full max-w-md relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSubscribe(); }}
                className="relative flex gap-2 bg-zinc-900/90 p-2 rounded-xl border border-white/10 shadow-2xl"
              >
                <input 
                  type="email" 
                  placeholder="Seu e-mail profissional"
                  value={leadEmailState}
                  onChange={(e) => { setLeadEmailState(e.target.value); localStorage.setItem('leadEmail', e.target.value); }}
                  className="flex-1 bg-transparent px-4 py-2 text-white placeholder:text-zinc-600 outline-none"
                />
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="bg-purple-600 text-white hover:bg-purple-500 px-6 py-3 rounded-lg font-bold transition-all shadow-lg shadow-purple-900/40 hover:scale-[1.02] whitespace-nowrap"
                >
                  {isLoading ? '...' : 'Criar Conta'}
                </button>
              </form>
            </div>
            
            <div className="flex gap-6 pt-4 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
                    <span className="font-bold">🔒 BLINDAGEM SSL</span>
                    <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
                    <span className="font-bold">DADOS CRIPTOGRAFADOS</span>
                </div>
            </div>
          </div>

          {/* LADO DIREITO: Mockup */}
          <div className="relative w-full perspective-1000 group lg:pl-10 mt-8 lg:mt-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] bg-gradient-to-tr from-purple-600/40 to-blue-600/40 blur-[80px] rounded-full -z-10"></div>
            
            <div className="relative bg-[#0F0F11] border border-white/10 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-700 lg:group-hover:rotate-y-[-2deg] lg:group-hover:rotate-x-[2deg] lg:group-hover:scale-[1.02]">
                <div className="h-10 bg-[#18181B] border-b border-white/5 flex items-center px-4 justify-between">
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#27272A]"></div>
                        <div className="w-3 h-3 rounded-full bg-[#27272A]"></div>
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">app.meumei.com</div>
                </div>

                <div className="flex h-[320px]">
                    <div className="w-16 border-r border-white/5 flex flex-col items-center py-6 gap-6">
                        <div className="w-8 h-8 bg-purple-600/20 rounded-lg text-purple-400 flex items-center justify-center text-xs">●</div>
                        <div className="w-8 h-8 rounded-lg hover:bg-white/5 transition flex items-center justify-center text-zinc-600">■</div>
                        <div className="w-8 h-8 rounded-lg hover:bg-white/5 transition flex items-center justify-center text-zinc-600">▲</div>
                    </div>

                    <div className="flex-1 p-6 space-y-6">
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-zinc-500 text-xs font-medium uppercase mb-1">Saldo Disponível</p>
                                <h3 className="text-3xl font-bold text-white">R$ 12.450<span className="text-zinc-500 text-lg">,00</span></h3>
                            </div>
                            <div className="px-3 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-xs rounded-full">
                                +24% este mês
                            </div>
                        </div>

                        <div className="h-32 w-full relative">
                             <div className="absolute inset-0 flex flex-col justify-between opacity-10">
                                 <div className="border-t border-white"></div>
                                 <div className="border-t border-white"></div>
                                 <div className="border-t border-white"></div>
                             </div>
                             <div className="absolute inset-0 flex items-end justify-between px-2 gap-2">
                                 {[35, 50, 45, 70, 55, 80, 60, 90, 75].map((h, i) => (
                                     <div key={i} className="w-full bg-zinc-800 hover:bg-purple-500/80 transition-all duration-300 rounded-t-sm" style={{height: `${h}%`}}></div>
                                 ))}
                             </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="h-16 bg-white/5 rounded-xl border border-white/5"></div>
                            <div className="h-16 bg-white/5 rounded-xl border border-white/5"></div>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </main>

      {/* --- BENTO GRID --- */}
      <section className="border-t border-white/10 bg-[#0A0A0A] py-32 relative">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-30"></div>
        
        <div className="max-w-7xl mx-auto px-6">
            <div className="mb-20">
                <h2 className="text-3xl md:text-5xl font-bold mb-6">Tudo o que você precisa. <br/><span className="text-zinc-500">Nada do que você odeia.</span></h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="col-span-1 md:col-span-2 bg-[#121214] border border-white/5 rounded-3xl p-8 md:p-12 relative overflow-hidden group hover:border-white/10 transition-colors">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 blur-[80px] rounded-full group-hover:bg-purple-500/20 transition-all"></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center text-2xl mb-6 border border-white/5">🚀</div>
                        <h3 className="text-2xl font-bold mb-4">Emissão de DAS em 1 Clique</h3>
                        <p className="text-zinc-400 max-w-md">Não perca tempo no site do governo. Geramos e enviamos sua guia de imposto mensal diretamente para seu e-mail ou WhatsApp.</p>
                    </div>
                </div>

                <div className="col-span-1 bg-[#121214] border border-white/5 rounded-3xl p-8 relative overflow-hidden group hover:border-white/10 transition-colors">
                    <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-zinc-900 to-transparent"></div>
                    <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center text-2xl mb-6 border border-white/5">📱</div>
                    <h3 className="text-xl font-bold mb-4">Controle na palma da mão</h3>
                    <p className="text-zinc-400 text-sm">Design responsivo que funciona perfeitamente no seu celular.</p>
                </div>

                <div className="col-span-1 bg-[#121214] border border-white/5 rounded-3xl p-8 group hover:border-white/10 transition-colors">
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Relatórios
                    </h3>
                    <p className="text-zinc-500 text-sm">Saiba exatamente seu lucro líquido.</p>
                </div>

                <div className="col-span-1 md:col-span-2 bg-[#121214] border border-white/5 rounded-3xl p-8 flex items-center justify-between group hover:border-white/10 transition-colors">
                    <div>
                        <h3 className="text-xl font-bold mb-2">Segurança de Dados Bancária</h3>
                        <p className="text-zinc-400 text-sm">Seus dados são seus. Criptografia ponta a ponta.</p>
                    </div>
                    <div className="text-4xl opacity-20 group-hover:opacity-100 transition-opacity grayscale group-hover:grayscale-0">🔒</div>
                </div>
            </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="py-12 border-t border-white/5 bg-black relative overflow-hidden">
        
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tighter text-zinc-500">meumei</span>
                <span className="text-zinc-700 text-sm">© 2026</span>
            </div>
            
            <div className="flex items-center text-sm text-zinc-500">
                <button onClick={() => navigate('/termos')} className="hover:text-white transition-colors">Termos de Uso</button>
                {/* MARGEM FORÇADA VIA STYLE INLINE (40px) */}
                <button 
                  onClick={() => navigate('/privacidade')} 
                  style={{ marginLeft: '40px' }} 
                  className="hover:text-white transition-colors"
                >
                  Política de Privacidade
                </button>
            </div>
        </div>
      </footer>

    </div>
  );
}