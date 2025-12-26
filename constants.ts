
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
  name: 'Minha Empresa',
  cnpj: '',
  startDate: COMPANY_DATA.monthStartISO,
  address: '',
  zipCode: '',
  phone: '',
  email: '',
  website: '',
  isConfigured: true // Default true as setup is now in Settings
};

// --- CONTAS PADRÃO (LISTA VAZIA PARA PRIMEIRO ACESSO) ---
export const DEFAULT_ACCOUNTS: any[] = [];

export const DEFAULT_ACCOUNT_TYPES = [
    'Conta Bancária',
    'Carteira Digital',
    'Conta Digital Internacional',
    'Rendimentos',
    'Investimento',
    'Dinheiro (Espécie)'
];

export const DEFAULT_EXPENSE_CATEGORIES = [
    'Alimentação', 'Assinatura', 'Cenário', 'Equipamentos', 'Logística', 'Materiais', 'Plantas', 'Revelação', 'Tráfego Pago'
];

export const DEFAULT_INCOME_CATEGORIES = [
    'Serviço', 'Venda de Produto', 'Salário', 'Rendimento', 'Reembolso', 'Outros'
];
