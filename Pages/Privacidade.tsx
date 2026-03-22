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

      <main className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">POLÍTICA DE PRIVACIDADE</h1>
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">MEUMEI 1.0.1 BETA</p>
          <p className="text-sm text-zinc-500">Última atualização: 06/02/2026</p>
        </header>

        <section className="space-y-4 text-zinc-700 dark:text-zinc-300">
          <p>Sua privacidade é levada a sério. O meumei coleta apenas as informações necessárias para o funcionamento do serviço.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Dados coletados</h2>
          <p className="text-zinc-700 dark:text-zinc-300">Podemos coletar:</p>
          <ul className="list-disc pl-6 space-y-1 text-zinc-700 dark:text-zinc-300">
            <li>nome e e-mail</li>
            <li>dados de autenticação</li>
            <li>informações financeiras inseridas pelo usuário (receitas, despesas, categorias e relatórios)</li>
            <li>dados técnicos de uso (navegador, dispositivo, logs)</li>
            <li>informacoes relacionadas ao pagamento processadas por provedores externos</li>
          </ul>
          <p className="text-zinc-700 dark:text-zinc-300">
            Não coletamos dados sensíveis além do necessário para a operação da plataforma.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Finalidade do uso</h2>
          <p className="text-zinc-700 dark:text-zinc-300">Os dados são utilizados para:</p>
          <ul className="list-disc pl-6 space-y-1 text-zinc-700 dark:text-zinc-300">
            <li>criar e autenticar contas</li>
            <li>liberar acesso ao sistema</li>
            <li>armazenar informações financeiras</li>
            <li>melhorar funcionalidades</li>
            <li>prestar suporte</li>
            <li>cumprir obrigações legais</li>
          </ul>
          <p className="text-zinc-700 dark:text-zinc-300">Não vendemos nem comercializamos dados pessoais.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pagamentos</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Os pagamentos são processados por provedores externos, como Stripe.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            O meumei não armazena dados completos de cartão de crédito.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Armazenamento e segurança</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Os dados são armazenados em infraestrutura de nuvem segura, como Firebase/Google Cloud.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            Isso pode envolver processamento e armazenamento em servidores localizados fora do Brasil.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            São aplicadas medidas técnicas de proteção, autenticação e controle de acesso.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            Apesar disso, nenhum sistema é totalmente invulnerável, sendo importante que o usuário
            também proteja sua senha.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Compartilhamento</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Os dados podem ser compartilhados apenas quando necessário com:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-zinc-700 dark:text-zinc-300">
            <li>provedores de hospedagem e autenticação (ex: Firebase/Google Cloud)</li>
            <li>processadores de pagamento (ex: Stripe)</li>
            <li>exigências legais ou judiciais</li>
          </ul>
          <p className="text-zinc-700 dark:text-zinc-300">
            Nunca compartilhamos informações para fins de marketing de terceiros.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Direitos do usuário (LGPD)</h2>
          <p className="text-zinc-700 dark:text-zinc-300">O usuário pode:</p>
          <ul className="list-disc pl-6 space-y-1 text-zinc-700 dark:text-zinc-300">
            <li>acessar seus dados</li>
            <li>corrigir informações</li>
            <li>solicitar exclusão</li>
            <li>encerrar a conta</li>
            <li>tirar dúvidas sobre o tratamento de dados</li>
          </ul>
          <p className="text-zinc-700 dark:text-zinc-300">
            As solicitações podem ser feitas pelo e-mail de suporte.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Retenção</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Os dados permanecem armazenados enquanto a conta estiver ativa.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            Após o encerramento, podem ser excluídos ou anonimizados conforme exigências legais.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Contato</h2>
          <p className="text-zinc-700 dark:text-zinc-300">meumeiaplicativo@gmail.com</p>
        </section>
      </main>
    </div>
  );
}
