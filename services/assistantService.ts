import { auth } from './firebase';
import type { HelperSignals } from '../helpers/meumeiHelperEngine';

type AssistantSignals = Pick<
  HelperSignals,
  'hasAccounts' | 'hasIncomes' | 'hasExpenses' | 'hasCategories'
>;

export type AssistantResult = {
  ok: boolean;
  status: number;
  answer?: string;
  suggestions?: string[];
  error?: string;
  message?: string;
};

export const askMeumeiAssistant = async (
  question: string,
  signals: AssistantSignals
): Promise<AssistantResult> => {
  const trimmed = question.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: 'empty_question', message: 'Digite uma pergunta.' };
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      ok: false,
      status: 401,
      error: 'missing_auth',
      message: 'Faça login para usar o Ajudante do meumei.'
    };
  }
  const token = await currentUser.getIdToken(true);
  const response = await fetch('/api/askMeumeiHelper', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      question: trimmed,
      signals
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data?.error || 'request_failed',
      message:
        data?.message ||
        (response.status === 429
          ? 'Você atingiu o limite de perguntas por hora. Tente novamente mais tarde.'
          : 'Não foi possível responder agora. Tente novamente.')
    };
  }
  return {
    ok: true,
    status: response.status,
    answer: typeof data?.answer === 'string' ? data.answer : '',
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : []
  };
};
