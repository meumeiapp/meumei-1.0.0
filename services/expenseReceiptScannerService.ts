import { auth } from './firebase';

export type ExpenseReceiptDraft = {
  description?: string;
  amount?: number | null;
  date?: string;
  dueDate?: string;
  category?: string;
  paymentMethod?: 'Débito' | 'Crédito' | 'PIX' | 'Boleto' | 'Transferência' | 'Dinheiro' | '';
  taxStatus?: 'PJ' | 'PF' | '';
  notes?: string;
  merchant?: string;
  confidence?: number;
};

export type ExpenseReceiptScanResult = {
  ok: boolean;
  status: number;
  data?: ExpenseReceiptDraft;
  message?: string;
  error?: string;
};

export const scanExpenseReceiptImage = async (
  imageDataUrl: string
): Promise<ExpenseReceiptScanResult> => {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      ok: false,
      status: 401,
      error: 'missing_auth',
      message: 'Faça login para usar a leitura de comprovante.'
    };
  }

  const trimmed = imageDataUrl.trim();
  if (!trimmed) {
    return {
      ok: false,
      status: 400,
      error: 'empty_image',
      message: 'Imagem inválida.'
    };
  }

  const token = await currentUser.getIdToken(true);
  const response = await fetch('/api/scanExpenseReceipt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      imageDataUrl: trimmed
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.error || 'scan_failed',
      message: payload?.message || 'Não foi possível ler o comprovante.'
    };
  }

  return {
    ok: true,
    status: response.status,
    data: (payload?.data || {}) as ExpenseReceiptDraft
  };
};

