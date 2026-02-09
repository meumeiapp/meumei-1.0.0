import {
  collection,
  getDocs,
  limit,
  query,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { dataService } from './dataService';
import { categoryService } from './categoryService';
import { onboardingService } from './onboardingService';
import { guardUserPath } from '../utils/pathGuard';
import type { Account, CompanyInfo, CreditCard, Expense, Income, AgendaItem } from '../types';

type SeedOptions = {
  uid: string;
  licenseEpoch: number;
  year?: number;
};

const toSegments = (path: string) => path.split('/').filter(Boolean);

const getCollectionRef = (path: string) => collection(db, ...toSegments(path));

const deleteCollectionDocs = async (path: string): Promise<number> => {
  let deleted = 0;
  while (true) {
    const snap = await getDocs(query(getCollectionRef(path), limit(250)));
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();
    deleted += snap.docs.length;
  }
  return deleted;
};

const listDocIds = async (path: string): Promise<string[]> => {
  const snap = await getDocs(getCollectionRef(path));
  return snap.docs.map(docSnap => docSnap.id);
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const buildDate = (year: number, monthIndex: number, day: number) =>
  `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;

const hashSeed = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const createRng = (seed: number) => {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const purgeUserData = async (uid: string) => {
  const basePath = `users/${uid}`;
  if (!guardUserPath(uid, basePath, 'dev_seed_purge')) return;

  const accountsPath = `${basePath}/accounts`;
  let accountIds: string[] = [];
  if (guardUserPath(uid, accountsPath, 'dev_seed_accounts_list')) {
    accountIds = await listDocIds(accountsPath);
  }
  for (const accountId of accountIds) {
    const yieldHistoryPath = `${basePath}/accounts/${accountId}/yieldHistory`;
    if (guardUserPath(uid, yieldHistoryPath, 'dev_seed_yield_history')) {
      await deleteCollectionDocs(yieldHistoryPath);
    }
  }

  const collectionsToClear = [
    'accounts',
    'expenses',
    'incomes',
    'credit_cards',
    'invoices',
    'yields',
    'cards',
    'categories',
    'auditLogs',
    'preferences',
    'settings',
    'reports',
    'goals',
    'budgets'
  ];

  for (const collectionName of collectionsToClear) {
    const path = `${basePath}/${collectionName}`;
    if (!guardUserPath(uid, path, 'dev_seed_clear_collection')) continue;
    await deleteCollectionDocs(path);
  }
};

const buildSeedData = (year: number, currentMonth: number, forcePaid: boolean, seedBase: number) => {
  const statusForIncome = (month: number) => {
    if (forcePaid) return 'received';
    return month <= currentMonth ? 'received' : 'pending';
  };
  const statusForExpense = (month: number) => {
    if (forcePaid) return 'paid';
    return month <= currentMonth ? 'paid' : 'pending';
  };
  const rand = createRng(seedBase);
  const randInt = (min: number, max: number) =>
    Math.floor(rand() * (max - min + 1)) + min;
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const pickTaxStatus = () => (rand() < 0.5 ? 'PJ' : 'PF');

  const companyInfo: CompanyInfo = {
    name: 'Meumei Testes LTDA',
    cnpj: '12.345.678/0001-90',
    startDate: buildDate(year, currentMonth, 1),
    address: 'Av. Principal, 123 - Centro, São Paulo/SP',
    zipCode: '01000-000',
    phone: '(11) 99999-9999',
    email: 'meumei.testes@example.com',
    website: 'https://meumei.testes'
  };

  const baseAccounts: Account[] = [
    {
      id: 'acc_caixa_pj',
      name: 'Caixa PJ',
      type: 'Conta Corrente',
      initialBalance: 12000,
      currentBalance: 9450,
      color: '#0ea5e9',
      nature: 'PJ',
      notes: 'Conta principal da empresa'
    },
    {
      id: 'acc_pessoal',
      name: 'Conta Pessoal',
      type: 'Conta Corrente',
      initialBalance: 3500,
      currentBalance: 2650,
      color: '#f97316',
      nature: 'PF',
      notes: 'Uso pessoal'
    }
  ];

  const extraAccounts: Account[] = [
    {
      id: 'acc_digital_pj',
      name: 'Conta Digital PJ',
      type: 'Conta Digital',
      initialBalance: 8000,
      currentBalance: 6200,
      color: '#22c55e',
      nature: 'PJ',
      notes: 'Recebimentos online'
    },
    {
      id: 'acc_reserva',
      name: 'Reserva Emergencial',
      type: 'Poupança',
      initialBalance: 9000,
      currentBalance: 9450,
      color: '#38bdf8',
      nature: 'PJ',
      notes: 'Reserva e impostos'
    },
    {
      id: 'acc_invest',
      name: 'Investimentos',
      type: 'Investimento',
      initialBalance: 15000,
      currentBalance: 16350,
      color: '#a855f7',
      nature: 'PJ',
      notes: 'Aplicações de caixa'
    },
    {
      id: 'acc_pf_digital',
      name: 'Carteira PF',
      type: 'Conta Digital',
      initialBalance: 1800,
      currentBalance: 1350,
      color: '#f59e0b',
      nature: 'PF',
      notes: 'Gastos pessoais'
    }
  ];

  const accounts: Account[] = [...baseAccounts, ...extraAccounts];

  const baseCards: CreditCard[] = [
    {
      id: 'card_visa_pj',
      name: 'Visa Empresarial',
      brand: 'Visa',
      closingDay: 20,
      dueDay: 28,
      limit: 6000,
      cardColor: '#6366f1'
    },
    {
      id: 'card_master_pf',
      name: 'Master PF',
      brand: 'Mastercard',
      closingDay: 10,
      dueDay: 17,
      limit: 3500,
      cardColor: '#f43f5e'
    }
  ];

  const extraCards: CreditCard[] = [
    {
      id: 'card_elo_pj',
      name: 'Elo Empresarial',
      brand: 'Elo',
      closingDay: 5,
      dueDay: 12,
      limit: 9000,
      cardColor: '#06b6d4'
    },
    {
      id: 'card_amex_pj',
      name: 'Amex Business',
      brand: 'Amex',
      closingDay: 2,
      dueDay: 9,
      limit: 12000,
      cardColor: '#0f172a'
    },
    {
      id: 'card_nubank_pf',
      name: 'Nubank PF',
      brand: 'Mastercard',
      closingDay: 15,
      dueDay: 22,
      limit: 4500,
      cardColor: '#8b5cf6'
    },
    {
      id: 'card_inter_pf',
      name: 'Inter PF',
      brand: 'Visa',
      closingDay: 18,
      dueDay: 25,
      limit: 3800,
      cardColor: '#f97316'
    },
    {
      id: 'card_itau_pj',
      name: 'Itaú PJ',
      brand: 'Visa',
      closingDay: 11,
      dueDay: 18,
      limit: 10000,
      cardColor: '#f59e0b'
    },
    {
      id: 'card_bb_pj',
      name: 'Banco do Brasil',
      brand: 'Elo',
      closingDay: 27,
      dueDay: 4,
      limit: 7200,
      cardColor: '#1d4ed8'
    },
    {
      id: 'card_santander_pf',
      name: 'Santander PF',
      brand: 'Mastercard',
      closingDay: 8,
      dueDay: 15,
      limit: 5200,
      cardColor: '#ef4444'
    },
    {
      id: 'card_c6_pj',
      name: 'C6 Business',
      brand: 'Mastercard',
      closingDay: 22,
      dueDay: 29,
      limit: 6500,
      cardColor: '#14b8a6'
    }
  ];

  const creditCards: CreditCard[] = [...baseCards, ...extraCards];

  const months = Array.from({ length: 12 }, (_, index) => index);

  const incomes: Income[] = months.flatMap(month => {
    const status = statusForIncome(month);
    const suffix = `${year}-${pad2(month + 1)}`;
    return [
      {
        id: `inc_servicos_${suffix}`,
        description: 'Serviços de consultoria',
        amount: 4200 + month * 80,
        category: 'Serviços',
        date: buildDate(year, month, 5),
        accountId: 'acc_caixa_pj',
        status,
        taxStatus: pickTaxStatus(),
        paymentMethod: 'Pix',
        notes: 'Projeto site institucional',
        createdBy: 'Seed'
      },
      {
        id: `inc_venda_${suffix}`,
        description: 'Venda de produto',
        amount: 980 + month * 40,
        category: 'Vendas',
        date: buildDate(year, month, 12),
        accountId: 'acc_caixa_pj',
        status,
        taxStatus: pickTaxStatus(),
        paymentMethod: 'Transferência',
        createdBy: 'Seed'
      },
      {
        id: `inc_reembolso_${suffix}`,
        description: 'Reembolso de despesas',
        amount: 120 + (month % 3) * 30,
        category: 'Reembolso',
        date: buildDate(year, month, 15),
        accountId: 'acc_pessoal',
        status,
        taxStatus: pickTaxStatus(),
        paymentMethod: 'Pix',
        createdBy: 'Seed'
      },
      {
        id: `inc_assinatura_${suffix}`,
        description: 'Assinatura mensal',
        amount: 900,
        category: 'Recorrente',
        date: buildDate(year, month, 20),
        accountId: 'acc_caixa_pj',
        status,
        taxStatus: pickTaxStatus(),
        paymentMethod: 'Pix',
        createdBy: 'Seed'
      },
      {
        id: `inc_juros_${suffix}`,
        description: 'Juros da conta',
        amount: 45 + (month % 4) * 10,
        category: 'Rendimentos',
        date: buildDate(year, month, 25),
        accountId: 'acc_pessoal',
        status,
        taxStatus: pickTaxStatus(),
        paymentMethod: 'Crédito',
        createdBy: 'Seed'
      }
    ];
  });

  const expenses: Expense[] = months.flatMap(month => {
    const status = statusForExpense(month);
    const suffix = `${year}-${pad2(month + 1)}`;
    const list: Expense[] = [
      {
        id: `exp_aluguel_${suffix}`,
        description: 'Aluguel do escritório',
        amount: 1800 + (month % 2) * 60,
        category: 'Aluguel',
        date: buildDate(year, month, 1),
        dueDate: buildDate(year, month, 5),
        paymentMethod: 'Boleto',
        accountId: 'acc_caixa_pj',
        status,
        type: 'fixed',
        taxStatus: pickTaxStatus(),
        createdBy: 'Seed'
      },
      {
        id: `exp_internet_${suffix}`,
        description: 'Internet fibra',
        amount: 160,
        category: 'Internet',
        date: buildDate(year, month, 8),
        dueDate: buildDate(year, month, 10),
        paymentMethod: 'Boleto',
        accountId: 'acc_caixa_pj',
        status,
        type: 'fixed',
        taxStatus: pickTaxStatus(),
        createdBy: 'Seed'
      },
      {
        id: `exp_software_${suffix}`,
        description: 'Licenças de software',
        amount: 280 + (month % 3) * 20,
        category: 'Software',
        date: buildDate(year, month, 3),
        dueDate: buildDate(year, month, 3),
        paymentMethod: 'Pix',
        accountId: 'acc_caixa_pj',
        status,
        type: 'variable',
        taxStatus: pickTaxStatus(),
        createdBy: 'Seed'
      },
      {
        id: `exp_marketing_${suffix}`,
        description: 'Anúncios pagos',
        amount: 480 + (month % 4) * 50,
        category: 'Marketing',
        date: buildDate(year, month, 18),
        dueDate: buildDate(year, month, 18),
        paymentMethod: 'Pix',
        accountId: 'acc_caixa_pj',
        status,
        type: 'variable',
        taxStatus: pickTaxStatus(),
        createdBy: 'Seed'
      },
      {
        id: `exp_hospedagem_${suffix}`,
        description: 'Hospedagem do site',
        amount: 89,
        category: 'Infraestrutura',
        date: buildDate(year, month, 14),
        dueDate: buildDate(year, month, 28),
        paymentMethod: 'Crédito',
        cardId: 'card_master_pf',
        status,
        type: 'variable',
        taxStatus: pickTaxStatus(),
        createdBy: 'Seed'
      },
      {
        id: `exp_mercado_${suffix}`,
        description: 'Supermercado',
        amount: 380 + (month % 5) * 25,
        category: 'Alimentação',
        date: buildDate(year, month, 7),
        dueDate: buildDate(year, month, 7),
        paymentMethod: 'Débito',
        accountId: 'acc_pessoal',
        status,
        type: 'personal',
        taxStatus: pickTaxStatus(),
        createdBy: 'Seed'
      },
      {
        id: `exp_academia_${suffix}`,
        description: 'Academia',
        amount: 120,
        category: 'Saúde',
        date: buildDate(year, month, 2),
        dueDate: buildDate(year, month, 2),
        paymentMethod: 'Débito',
        accountId: 'acc_pessoal',
        status,
        type: 'personal',
        taxStatus: pickTaxStatus(),
        createdBy: 'Seed'
      }
    ];

    if (month < 6) {
      list.push({
        id: `exp_notebook_${suffix}`,
        description: 'Notebook Dell',
        amount: 800,
        category: 'Equipamentos',
        date: buildDate(year, month, 10),
        dueDate: buildDate(year, month, 28),
        paymentMethod: 'Crédito',
        cardId: 'card_visa_pj',
        status,
        type: 'variable',
        taxStatus: pickTaxStatus(),
        installments: true,
        installmentNumber: month + 1,
        totalInstallments: 6,
        installmentGroupId: 'grp_notebook_dell',
        createdBy: 'Seed'
      });
    }

    return list;
  });

  const accountIds = accounts.map(account => account.id);
  const cardIds = creditCards.map(card => card.id);
  const pickAccountId = () => pick(accountIds);
  const pickCardId = () => pick(cardIds);

  const incomeCategories = [
    'Serviços',
    'Vendas',
    'Recorrente',
    'Reembolso',
    'Rendimentos',
    'Assinaturas',
    'Marketplace',
    'Consultoria',
    'Cursos',
    'Comissões',
    'Licenças'
  ];
  const incomeDescriptions = [
    'Projeto express',
    'Venda avulsa',
    'Consultoria premium',
    'Pacote de serviços',
    'Venda em marketplace',
    'Comissão de afiliados',
    'Treinamento in-company',
    'Setup de cliente',
    'Assinatura enterprise',
    'Receita de suporte'
  ];
  const expenseBuckets = [
    {
      type: 'fixed' as const,
      categories: ['Aluguel', 'Internet', 'Energia', 'Telefone', 'Impostos', 'Seguros']
    },
    {
      type: 'variable' as const,
      categories: ['Marketing', 'Ferramentas', 'Manutenção', 'Logística', 'Serviços bancários', 'Viagem', 'Educação', 'Software']
    },
    {
      type: 'personal' as const,
      categories: ['Alimentação', 'Saúde', 'Lazer', 'Transporte', 'Combustível', 'Compras pessoais']
    }
  ];
  const paymentMethods = ['Pix', 'Transferência', 'Boleto', 'Débito', 'Crédito'];

  const extraIncomes: Income[] = Array.from({ length: 30 }, (_, index) => {
    const month = randInt(0, 11);
    const day = randInt(1, 26);
    const amount = randInt(250, 5200);
    const description = pick(incomeDescriptions);
    const category = pick(incomeCategories);
    const status = statusForIncome(month);
    const accountId = pickAccountId();
    const date = buildDate(year, month, day);
    return {
      id: `inc_extra_${year}_${index + 1}`,
      description,
      amount,
      category,
      date,
      competenceDate: date,
      accountId,
      status,
      paymentMethod: pick(paymentMethods),
      taxStatus: pickTaxStatus(),
      createdBy: 'Seed'
    };
  });

  const extraExpenses: Expense[] = Array.from({ length: 30 }, (_, index) => {
    const month = randInt(0, 11);
    const day = randInt(1, 26);
    const dueDay = Math.min(day + randInt(0, 6), 28);
    const bucket = pick(expenseBuckets);
    const category = pick(bucket.categories);
    const paymentMethod = pick(paymentMethods);
    const usesCard = paymentMethod === 'Crédito';
    const status = statusForExpense(month);
    const amountBase = bucket.type === 'fixed' ? randInt(180, 2600) : randInt(80, 1800);
    return {
      id: `exp_extra_${year}_${index + 1}`,
      description: category === 'Impostos' ? 'Impostos e taxas' : category,
      amount: amountBase,
      category,
      date: buildDate(year, month, day),
      dueDate: buildDate(year, month, dueDay),
      paymentMethod,
      accountId: usesCard ? undefined : pickAccountId(),
      cardId: usesCard ? pickCardId() : undefined,
      status,
      type: bucket.type,
      taxStatus: pickTaxStatus(),
      createdBy: 'Seed'
    };
  });

  const agendaTopics = [
    'Reunião com cliente',
    'Follow-up de cobrança',
    'Envio de proposta',
    'Pagamento de impostos',
    'Planejamento financeiro',
    'Campanha de marketing',
    'Fechamento do mês',
    'Entrega de projeto',
    'Revisão de contratos',
    'Call com fornecedor'
  ];
  const agendaNotes = [
    'Separar documentos e relatórios.',
    'Revisar metas e indicadores.',
    'Preparar apresentação para o cliente.',
    'Conferir extratos e lançamentos.',
    'Atualizar planilha de controle.'
  ];
  const agendaItems: AgendaItem[] = Array.from({ length: 12 }, (_, index) => {
    const month = randInt(0, 11);
    const day = randInt(2, 26);
    const hour = randInt(8, 18);
    const minute = randInt(0, 5) * 10;
    return {
      id: `agenda_${year}_${index + 1}`,
      title: pick(agendaTopics),
      date: buildDate(year, month, day),
      time: `${pad2(hour)}:${pad2(minute)}`,
      notes: pick(agendaNotes),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });

  const allIncomes = [...incomes, ...extraIncomes];
  const allExpenses = [...expenses, ...extraExpenses];

  return {
    companyInfo,
    accounts,
    creditCards,
    incomes: allIncomes,
    expenses: allExpenses,
    agendaItems
  };
};

export const seedDevUserData = async ({ uid, licenseEpoch, year: targetYear }: SeedOptions) => {
  await purgeUserData(uid);

  const now = new Date();
  const year = targetYear ?? now.getFullYear();
  const currentMonth = now.getMonth();
  const seedBase = hashSeed(`${uid}:${year}`);
  const { companyInfo, accounts, creditCards, incomes, expenses, agendaItems } =
    buildSeedData(year, currentMonth, false, seedBase);

  await dataService.saveCompany(companyInfo, uid);
  await dataService.upsertAccounts(accounts, uid, licenseEpoch);
  await Promise.all(creditCards.map(card => dataService.upsertCreditCard(card, uid)));
  await dataService.upsertIncomes(incomes, uid, licenseEpoch);
  await dataService.upsertExpenses(expenses, uid, licenseEpoch);
  await Promise.all(agendaItems.map(item => dataService.upsertAgendaItem(item, uid)));

  await categoryService.setUserCategories(
    uid,
    ['Serviços', 'Vendas', 'Recorrente', 'Reembolso', 'Rendimentos', 'Assinaturas', 'Marketplace', 'Consultoria', 'Cursos', 'Comissões', 'Licenças'],
    ['Aluguel', 'Internet', 'Software', 'Marketing', 'Equipamentos', 'Infraestrutura', 'Alimentação', 'Saúde', 'Energia', 'Telefone', 'Impostos', 'Seguros', 'Ferramentas', 'Manutenção', 'Logística', 'Serviços bancários', 'Viagem', 'Educação', 'Transporte', 'Combustível', 'Compras pessoais']
  );

  await onboardingService.saveStatus(uid, {
    onboardingCompleted: true,
    onboardingCompletedAt: new Date().toISOString(),
    onboardingVersion: 1
  });

  console.info('[dev-seed] ready', {
    uid,
    accounts: accounts.length,
    creditCards: creditCards.length,
    incomes: incomes.length,
    expenses: expenses.length
  });
};

export const seedDevAnnualCoverage = async ({ uid, licenseEpoch, year: targetYear }: SeedOptions) => {
  const now = new Date();
  const year = targetYear ?? now.getFullYear();
  const currentMonth = now.getMonth();
  const seedBase = hashSeed(`${uid}:${year}:annual`);
  const { companyInfo, accounts, creditCards, incomes, expenses, agendaItems } =
    buildSeedData(year, currentMonth, true, seedBase);

  await dataService.saveCompany(companyInfo, uid);
  await dataService.upsertAccounts(accounts, uid, licenseEpoch);
  await Promise.all(creditCards.map(card => dataService.upsertCreditCard(card, uid)));
  await dataService.upsertIncomes(incomes, uid, licenseEpoch);
  await dataService.upsertExpenses(expenses, uid, licenseEpoch);
  await Promise.all(agendaItems.map(item => dataService.upsertAgendaItem(item, uid)));

  await categoryService.setUserCategories(
    uid,
    ['Serviços', 'Vendas', 'Recorrente', 'Reembolso', 'Rendimentos', 'Assinaturas', 'Marketplace', 'Consultoria', 'Cursos', 'Comissões', 'Licenças'],
    ['Aluguel', 'Internet', 'Software', 'Marketing', 'Equipamentos', 'Infraestrutura', 'Alimentação', 'Saúde', 'Energia', 'Telefone', 'Impostos', 'Seguros', 'Ferramentas', 'Manutenção', 'Logística', 'Serviços bancários', 'Viagem', 'Educação', 'Transporte', 'Combustível', 'Compras pessoais']
  );

  await onboardingService.saveStatus(uid, {
    onboardingCompleted: true,
    onboardingCompletedAt: new Date().toISOString(),
    onboardingVersion: 1
  });

  console.info('[dev-seed] annual coverage ready', {
    uid,
    year,
    incomes: incomes.length,
    expenses: expenses.length
  });
};
