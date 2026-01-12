const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

type SheetsFetchOptions = {
  method?: string;
  body?: unknown;
};

const sheetsFetch = async <T>(accessToken: string, url: string, options: SheetsFetchOptions = {}): Promise<T> => {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error?.message || response.statusText || 'Erro na API do Google Sheets.';
    const error = new Error(message) as Error & { status?: number; details?: unknown };
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return response.json() as Promise<T>;
};

export const createSpreadsheet = async (
  accessToken: string,
  title: string,
  sheetTitles: string[]
) => {
  const response = await sheetsFetch<any>(accessToken, SHEETS_API_BASE, {
    method: 'POST',
    body: {
      properties: { title },
      sheets: sheetTitles.map(sheetTitle => ({ properties: { title: sheetTitle } }))
    }
  });

  const sheets = (response.sheets || []).map((sheet: any) => ({
    title: sheet.properties?.title as string,
    sheetId: sheet.properties?.sheetId as number
  }));

  return {
    spreadsheetId: response.spreadsheetId as string,
    sheets
  };
};

export const batchUpdate = async (
  accessToken: string,
  spreadsheetId: string,
  requests: any[]
) => {
  return sheetsFetch<any>(accessToken, `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: { requests }
  });
};

export const batchUpdateValues = async (
  accessToken: string,
  spreadsheetId: string,
  data: Array<{ range: string; values: unknown[][] }>
) => {
  return sheetsFetch<any>(accessToken, `${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: {
      valueInputOption: 'RAW',
      data
    }
  });
};

export const getSheetValues = async (
  accessToken: string,
  spreadsheetId: string,
  range: string
) => {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  return sheetsFetch<{ values?: unknown[][] }>(accessToken, url);
};

export const clearSheetValues = async (
  accessToken: string,
  spreadsheetId: string,
  range: string
) => {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`;
  return sheetsFetch(accessToken, url, { method: 'POST', body: {} });
};

export const getSpreadsheetMeta = async (
  accessToken: string,
  spreadsheetId: string
) => {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}?fields=sheets.properties`;
  return sheetsFetch<any>(accessToken, url);
};
