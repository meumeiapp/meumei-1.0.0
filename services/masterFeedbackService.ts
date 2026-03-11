import { auth } from './firebase';

export type UserFeedbackRecord = {
  id: string;
  userId: string;
  type: 'bug' | 'improvement';
  status: string;
  message: string;
  platform?: 'mobile' | 'desktop' | null;
  appVersion?: string | null;
  reporterEmail?: string | null;
  companyName?: string | null;
  createdAtMs?: number | null;
  updatedAtMs?: number | null;
};

type ListUserFeedbackResponse = {
  ok: boolean;
  items?: UserFeedbackRecord[];
  total?: number;
  message?: string;
};

type MutationResponse = {
  ok: boolean;
  message?: string;
};

const buildAuthHeaders = async () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken(true);
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export const masterFeedbackService = {
  async listUserFeedback(payload?: {
    limit?: number;
    query?: string;
    type?: 'all' | 'bug' | 'improvement';
    status?: 'all' | 'new' | 'reviewed' | 'resolved';
  }): Promise<{ ok: boolean; items?: UserFeedbackRecord[]; total?: number; message?: string }> {
    const headers = await buildAuthHeaders();
    const response = await fetch('/api/listUserFeedback', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload || {})
    });
    const data: ListUserFeedbackResponse = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        message: data?.message || 'Não foi possível carregar os feedbacks.'
      };
    }
    return {
      ok: true,
      items: Array.isArray(data.items) ? data.items : [],
      total: typeof data.total === 'number' ? data.total : (Array.isArray(data.items) ? data.items.length : 0)
    };
  },

  async updateUserFeedbackStatus(payload: {
    userId: string;
    feedbackId: string;
    status: 'new' | 'reviewed' | 'resolved';
  }): Promise<{ ok: boolean; message?: string }> {
    const headers = await buildAuthHeaders();
    const response = await fetch('/api/updateUserFeedbackStatus', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const data: MutationResponse = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        message: data?.message || 'Não foi possível atualizar o status.'
      };
    }
    return { ok: true };
  },

  async deleteUserFeedback(payload: {
    userId: string;
    feedbackId: string;
  }): Promise<{ ok: boolean; message?: string }> {
    const headers = await buildAuthHeaders();
    const response = await fetch('/api/deleteUserFeedback', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const data: MutationResponse = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        message: data?.message || 'Não foi possível excluir a mensagem.'
      };
    }
    return { ok: true };
  }
};
