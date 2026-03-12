
// Credentials
export const MASTER_LICENSE_KEY = 'T7aV-qP2r-9ZgH';

export const APP_NAME = 'meumei';

// Mock date logic for "December 2025"
export const COMPANY_DATA = {
    // The visual "Today"
    currentDateDisplay: '03/12/2025', 
    
    // HTML Input format (YYYY-MM-DD)
    currentDateISO: '2025-12-03',
    
    // Start of the current month (The limit for the user)
    monthStartISO: '2025-11-01',
    
    // End of the current month
    monthEndISO: '2025-12-31'
};

export const DEFAULT_COMPANY_INFO = {
  name: '',
  cnpj: '',
  startDate: '',
  address: '',
  zipCode: '',
  phone: '',
  email: '',
  website: '',
  logoDataUrl: null,
  isConfigured: false
};

// --- CONTAS PADRÃO (LISTA VAZIA PARA PRIMEIRO ACESSO) ---
export const DEFAULT_ACCOUNTS: any[] = [];

export const DEFAULT_ACCOUNT_TYPES = [
    'Conta Bancária',
    'Carteira Digital',
    'Conta Digital Internacional',
    'Rendimentos',
    'Investimento',
    'Dinheiro (Espécie)',
    'Conta Corrente PJ',
    'Conta Corrente PF',
    'Conta Poupança',
    'Conta Salário',
    'Caixa (Físico)',
    'Banco Digital',
    'Conta Empresarial',
    'Conta de Investimento',
    'Conta Reserva',
    'Conta de Operação',
    'Conta de Recebimento',
    'Conta de Pagamento',
    'Conta Internacional USD',
    'Conta Internacional EUR'
];

export const DEFAULT_EXPENSE_CATEGORIES: string[] = [];

export const DEFAULT_INCOME_CATEGORIES: string[] = [];

export const DEFAULT_EXPENSE_TYPES = [
    { id: 'fixed', label: 'Fixa', enabled: true, nature: 'PJ', color: '#f59e0b' },
    { id: 'variable', label: 'Variável', enabled: true, nature: 'PJ', color: '#ef4444' },
    { id: 'personal', label: 'Pessoal', enabled: true, nature: 'PF', color: '#22d3ee' }
];
