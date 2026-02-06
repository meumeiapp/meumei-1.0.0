import React from 'react';
import Logo from '../components/Logo';

export default function Termos() {
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
          <h1 className="text-2xl font-bold">TERMOS DE USO</h1>
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">MEUMEI 1.0.0</p>
          <p className="text-sm text-zinc-500">Última atualização: 06/02/2026</p>
        </header>

        <section className="space-y-4 text-zinc-700 dark:text-zinc-300">
          <p>Bem-vindo ao meumei.</p>
          <p>
            O meumei é uma plataforma digital de organização financeira criada para
            microempreendedores individuais (MEIs), com foco em simplicidade, controle e clareza
            sobre receitas, despesas e resultados do negócio.
          </p>
          <p>Ao criar uma conta ou utilizar o aplicativo, você concorda com os termos abaixo.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Aceitação</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Ao acessar ou utilizar o meumei, o usuário declara que leu, compreendeu e concorda
            integralmente com este Termo de Uso e com a Política de Privacidade.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">Caso não concorde, não utilize a plataforma.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Sobre o serviço</h2>
          <p className="text-zinc-700 dark:text-zinc-300">O meumei oferece ferramentas digitais para:</p>
          <ul className="list-disc pl-6 space-y-1 text-zinc-700 dark:text-zinc-300">
            <li>organização de receitas e despesas</li>
            <li>categorização de lançamentos</li>
            <li>relatórios financeiros</li>
            <li>armazenamento em nuvem</li>
            <li>acesso via navegador (PWA)</li>
            <li>controle de acesso por autenticação de usuário</li>
          </ul>
          <p className="text-zinc-700 dark:text-zinc-300">
            O meumei é uma ferramenta de apoio à gestão financeira e não substitui contador,
            consultor financeiro ou orientação fiscal profissional.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Cadastro e conta</h2>
          <p className="text-zinc-700 dark:text-zinc-300">Para utilizar o sistema, o usuário deve:</p>
          <ul className="list-disc pl-6 space-y-1 text-zinc-700 dark:text-zinc-300">
            <li>criar uma conta com e-mail e senha ou login social</li>
            <li>fornecer informações verdadeiras</li>
            <li>manter seus dados atualizados</li>
            <li>proteger suas credenciais de acesso</li>
          </ul>
          <p className="text-zinc-700 dark:text-zinc-300">
            O usuário é responsável por todas as atividades realizadas em sua conta.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Modalidade de contratação</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            O meumei é comercializado exclusivamente na modalidade anual.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            A contratação concede ao usuário o direito de uso da plataforma pelo período de 12
            (doze) meses.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">Não há plano mensal ou assinatura recorrente.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pagamento</h2>
          <p className="text-zinc-700 dark:text-zinc-300">O valor do plano anual é de R$ 358,80 por ano.</p>
          <p className="text-zinc-700 dark:text-zinc-300">
            O pagamento é realizado em transação única no momento da contratação.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            O eventual parcelamento em 2x, 3x, 6x, 10x ou 12x é oferecido exclusivamente pela
            operadora do cartão de crédito, constituindo apenas forma de pagamento, não
            caracterizando mensalidade, assinatura ou cobrança periódica pelo meumei.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            Após a confirmação do pagamento, a licença anual é ativada.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Período de teste e direito de arrependimento</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Nos termos do artigo 49 do Código de Defesa do Consumidor (Lei 8.078/90), o usuário
            poderá solicitar cancelamento em até 7 (sete) dias corridos a partir da ativação da
            licença, com reembolso integral do valor pago.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            Dentro desse prazo, o cancelamento é feito sem multas ou taxas.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            Após o período de 7 dias, considera-se efetivada a contratação anual, não havendo
            devolução parcial ou proporcional de valores.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            O parcelamento eventualmente escolhido é de responsabilidade exclusiva do cliente
            junto à operadora do cartão.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Cancelamento após o prazo legal</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Após os 7 dias iniciais, o usuário poderá solicitar o encerramento da conta a qualquer
            momento.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            O cancelamento não gera reembolso, total ou parcial, do valor do plano anual
            contratado.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Uso permitido</h2>
          <p className="text-zinc-700 dark:text-zinc-300">Você concorda em:</p>
          <ul className="list-disc pl-6 space-y-1 text-zinc-700 dark:text-zinc-300">
            <li>usar o app apenas para fins legais</li>
            <li>não tentar invadir, copiar ou explorar o código</li>
            <li>não compartilhar acesso indevidamente</li>
            <li>não utilizar o sistema para fraudes ou atividades ilegais</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Propriedade intelectual</h2>
          <p className="text-zinc-700 dark:text-zinc-300">Todos os direitos sobre o meumei, incluindo:</p>
          <ul className="list-disc pl-6 space-y-1 text-zinc-700 dark:text-zinc-300">
            <li>marca</li>
            <li>nome</li>
            <li>código</li>
            <li>design</li>
            <li>interface</li>
            <li>funcionalidades</li>
            <li>conteúdos</li>
          </ul>
          <p className="text-zinc-700 dark:text-zinc-300">pertencem à Agência DK.</p>
          <p className="text-zinc-700 dark:text-zinc-300">
            É proibida a cópia, modificação, redistribuição ou engenharia reversa sem autorização.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Disponibilidade do serviço</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            O meumei busca manter o serviço disponível de forma contínua, porém não garante
            funcionamento ininterrupto.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            Podem ocorrer pausas por manutenção, atualizações ou fatores técnicos externos.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Limitação de responsabilidade</h2>
          <p className="text-zinc-700 dark:text-zinc-300">O meumei não se responsabiliza por:</p>
          <ul className="list-disc pl-6 space-y-1 text-zinc-700 dark:text-zinc-300">
            <li>decisões financeiras tomadas pelo usuário</li>
            <li>erros de preenchimento de dados</li>
            <li>perdas de lucro ou prejuízos indiretos</li>
            <li>uso inadequado do sistema</li>
          </ul>
          <p className="text-zinc-700 dark:text-zinc-300">
            A responsabilidade pela gestão financeira é exclusivamente do usuário.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Alterações nos termos</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Estes termos podem ser atualizados a qualquer momento.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            A versão vigente estará sempre disponível no site ou aplicativo.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            O uso contínuo do serviço após alterações implica concordância com as novas condições.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Contato</h2>
          <p className="text-zinc-700 dark:text-zinc-300">Dúvidas ou solicitações:</p>
          <p className="text-zinc-700 dark:text-zinc-300">meumeiaplicativo@gmail.com</p>
        </section>
      </main>
    </div>
  );
}
