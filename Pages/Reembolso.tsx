import React, { useMemo, useState } from 'react';
import Logo from '../components/Logo';

export default function Reembolso() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitPendingEmail, setSubmitPendingEmail] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  const navigate = (path: string) => {
    if (typeof window === 'undefined') return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const functionsBaseUrl = (import.meta.env.VITE_FUNCTIONS_BASE_URL || '').trim();
  const functionsRegion =
    (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1').trim() || 'us-central1';
  const firebaseProjectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const refundEndpointOverride = (import.meta.env.VITE_REFUND_ENDPOINT || '').trim();

  const resolveRefundEndpoint = () => {
    if (refundEndpointOverride) return refundEndpointOverride;
    if (functionsBaseUrl) return `${functionsBaseUrl.replace(/\/+$/, '')}/requestRefund`;
    if (!firebaseProjectId) return '';
    return `https://${functionsRegion}-${firebaseProjectId}.cloudfunctions.net/requestRefund`;
  };

  const canSubmit = useMemo(() => {
    return fullName.trim().length > 0 && email.trim().length > 0 && purchaseDate.trim().length > 0;
  }, [fullName, email, purchaseDate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError('');
    setSubmitSuccess(false);
    setSubmitPendingEmail(false);
    setSubmitMessage('');
    if (!canSubmit) {
      setSubmitError('Preencha nome, e-mail e data da compra.');
      return;
    }
    const endpoint = resolveRefundEndpoint();
    if (!endpoint) {
      setSubmitError('Erro de configuração. Tente novamente mais tarde.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        data: {
          name: fullName.trim(),
          email: email.trim(),
          purchaseDate,
          orderId: orderId.trim() || undefined,
          reason: reason.trim() || undefined,
          details: details.trim() || undefined
        }
      };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.message || 'Erro ao enviar solicitação.');
      }
      setSubmitSuccess(true);
      setSubmitPendingEmail(Boolean(body?.pendingEmail));
      setSubmitMessage(
        typeof body?.message === 'string' && body.message.trim().length > 0
          ? body.message
          : 'Solicitação enviada com sucesso. Responderemos em breve por e-mail.'
      );
      setFullName('');
      setEmail('');
      setPurchaseDate('');
      setOrderId('');
      setReason('');
      setDetails('');
    } catch (error: any) {
      setSubmitError(error?.message || 'Não foi possível enviar sua solicitação.');
    } finally {
      setSubmitting(false);
    }
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
          <h1 className="text-2xl font-bold">POLÍTICA DE REEMBOLSO</h1>
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">MEUMEI 1.0.0</p>
          <p className="text-sm text-zinc-500">Última atualização: 06/02/2026</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Direito de arrependimento (7 dias)</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Conforme o artigo 49 do Código de Defesa do Consumidor (Lei 8.078/90), o usuário pode
            solicitar o cancelamento e reembolso integral em até 7 (sete) dias corridos a partir da
            ativação da licença anual.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Após o prazo legal</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Após o período de 7 dias, o plano anual permanece válido até o fim do ciclo contratado e
            não há reembolso parcial ou proporcional.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            No plano mensal, o usuário pode cancelar a assinatura a qualquer momento. O cancelamento
            interrompe apenas as cobranças futuras e não gera devolução de valores já pagos fora do prazo legal.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Como solicitar o reembolso</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Para solicitar o reembolso dentro do prazo legal, preencha o formulário abaixo. A
            solicitação será enviada para nossa equipe e respondida por e-mail.
          </p>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Nome completo
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  data-no-uppercase="true"
                  className="mt-2 w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-[#111114] px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                  placeholder="Nome e sobrenome"
                  required
                />
              </label>
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                E-mail usado na compra
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  data-preserve-case="true"
                  className="mt-2 w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-[#111114] px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                  placeholder="seuemail@exemplo.com"
                  required
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Data da compra
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(event) => setPurchaseDate(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-[#111114] px-4 py-3 text-sm text-zinc-900 dark:text-white"
                  required
                />
              </label>
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                Número do pedido (opcional)
                <input
                  type="text"
                  value={orderId}
                  onChange={(event) => setOrderId(event.target.value)}
                  data-no-uppercase="true"
                  className="mt-2 w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-[#111114] px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                  placeholder="Ex: ch_ / pi_ / pedido do Stripe"
                />
              </label>
            </div>
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Motivo do cancelamento (opcional)
              <input
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                data-no-uppercase="true"
                className="mt-2 w-full rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-[#111114] px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                placeholder="Ex: teste não atendeu à necessidade"
              />
            </label>
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              Detalhes adicionais (opcional)
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                data-no-uppercase="true"
                className="mt-2 w-full min-h-[120px] rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-[#111114] px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                placeholder="Descreva qualquer informação que ajude no atendimento."
              />
            </label>

            {submitError && (
              <div className="text-sm text-rose-500">{submitError}</div>
            )}
            {submitSuccess && (
              <div className="text-sm text-emerald-500">
                {submitPendingEmail
                  ? 'Solicitação registrada com sucesso. Nossa equipe vai responder manualmente em breve.'
                  : submitMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="w-full md:w-fit rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 transition disabled:opacity-60"
            >
              {submitting ? 'Enviando...' : 'Enviar solicitação'}
            </button>
          </form>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Se preferir, você também pode entrar em contato por e-mail:
            <span className="font-semibold"> meumeiaplicativo@gmail.com</span>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Processamento do estorno</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            Após a confirmação do pedido, o estorno é processado pelo meio de pagamento original. O
            prazo para aparecer na fatura ou conta pode variar conforme a operadora do cartão ou
            instituição financeira.
          </p>
        </section>
      </main>
    </div>
  );
}
