import React from 'react';
import Logo from '../components/Logo';

export default function Privacidade() {
  const navigate = (path: string) => {
    if (typeof window === 'undefined') return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#09090b] text-zinc-900 dark:text-white">
      <header className="border-b border-zinc-100 dark:border-zinc-800 py-4">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
          <Logo />
          <button onClick={() => navigate('/')} className="text-sm">Voltar</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold">Política de Privacidade</h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-300">Produto SaaS, dados financeiros protegidos. A cobrança é recorrente mensal, e o usuário pode cancelar a qualquer momento.</p>
        <p className="mt-4 text-sm text-zinc-500">Este é um texto base de privacidade. Adapte conforme necessário.</p>
      </main>
    </div>
  );
}
