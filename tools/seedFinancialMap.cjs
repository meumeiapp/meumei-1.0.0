/* eslint-disable no-console */
'use strict';

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const licenseIdArg = args.find(arg => !arg.startsWith('--')) || null;
const shouldCleanup = args.includes('--cleanup');
const dryRun = args.includes('--dry-run');
const forceCompany = args.includes('--force-company');
const readNumberArg = name => {
  const direct = args.find(arg => arg.startsWith(`${name}=`));
  if (direct) {
    const value = Number(direct.split('=')[1]);
    return Number.isFinite(value) ? value : null;
  }
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1]) {
    const value = Number(args[index + 1]);
    return Number.isFinite(value) ? value : null;
  }
  return null;
};
const readStringArg = name => {
  const direct = args.find(arg => arg.startsWith(`${name}=`));
  if (direct) {
    const value = direct.split('=').slice(1).join('=').trim();
    return value || null;
  }
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1].trim();
  }
  return null;
};
const emailArg = readStringArg('--email') || readStringArg('--user');
const targetMovement =
  readNumberArg('--target') ||
  readNumberArg('--total') ||
  readNumberArg('--movement');
const incomeCount = readNumberArg('--incomes') || 18;
const expenseCount = readNumberArg('--expenses') || 26;
const yieldCount = readNumberArg('--yields') || 6;

if (!licenseIdArg && !emailArg) {
  console.error(
    [
      'Usage:',
      'node tools/seedFinancialMap.cjs <licenseId> [--cleanup] [--dry-run]',
      'node tools/seedFinancialMap.cjs --email user@example.com [--cleanup] [--dry-run]',
      '[--target 1000000] [--incomes 24] [--expenses 36] [--yields 6]'
    ].join(' ')
  );
  process.exit(1);
}

const resolveCredential = () => {
  const keyPath = path.resolve(__dirname, '..', 'serviceAccountKey.json');
  if (fs.existsSync(keyPath)) {
    return admin.credential.cert(require(keyPath));
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const resolved = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (fs.existsSync(resolved)) {
      return admin.credential.cert(require(resolved));
    }
  }
  throw new Error('serviceAccountKey.json not found. Provide GOOGLE_APPLICATION_CREDENTIALS.');
};

admin.initializeApp({ credential: resolveCredential() });
const db = admin.firestore();

const seedCollections = ['accounts', 'expenses', 'incomes', 'credit_cards', 'yields'];

const nowISO = () => new Date().toISOString();
const todayISO = () => new Date().toISOString().split('T')[0];

const buildExpense = (licenseId, id, data, cryptoEpoch) => ({
  id,
  description: data.description,
  category: data.category,
  amount: data.amount,
  date: data.date,
  dueDate: data.dueDate,
  accountId: data.accountId,
  cardId: data.cardId || null,
  status: data.status,
  paymentMethod: data.paymentMethod,
  type: data.type,
  notes: '',
  taxStatus: 'PJ',
  createdBy: 'seed',
  source: 'seed',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  licenseId,
  cryptoEpoch
});

const buildIncome = (licenseId, id, data, cryptoEpoch) => ({
  id,
  description: data.description,
  category: data.category,
  amount: data.amount,
  date: data.date,
  competenceDate: data.date,
  accountId: data.accountId,
  status: data.status,
  paymentMethod: data.paymentMethod,
  notes: '',
  taxStatus: 'PJ',
  createdBy: 'seed',
  source: 'seed',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  licenseId,
  cryptoEpoch
});

const buildYield = (licenseId, id, data, cryptoEpoch) => ({
  id,
  accountId: data.accountId,
  amount: data.amount,
  date: data.date,
  notes: data.notes || 'Rendimento',
  source: 'seed',
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  licenseId,
  cryptoEpoch
});

const roundCurrency = value => Math.round(value * 100) / 100;
const sumAmounts = items => items.reduce((acc, item) => acc + item.amount, 0);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const createSeededRandom = seed => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  let state = hash || 123456789;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const pick = (list, random) => list[Math.floor(random() * list.length)];
const randomBetween = (min, max, random) => min + (max - min) * random();
const randomDate = (monthsBack, random) => {
  const now = new Date();
  const offsetMonths = Math.floor(randomBetween(0, monthsBack, random));
  const date = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1);
  const day = clamp(Math.floor(randomBetween(1, 27, random)), 1, 28);
  date.setDate(day);
  return date.toISOString().split('T')[0];
};

const run = async () => {
  let licenseId = licenseIdArg;
  if (!licenseId && emailArg) {
    try {
      const user = await admin.auth().getUserByEmail(emailArg);
      licenseId = user.uid;
      console.log('[seed] resolved licenseId from email', {
        email: emailArg,
        licenseId
      });
    } catch (error) {
      console.error('[seed] user_not_found', { email: emailArg });
      throw error;
    }
  }
  if (!licenseId) {
    throw new Error('licenseId not resolved');
  }

  const userRef = db.collection('users').doc(licenseId);
  const userSnap = await userRef.get();
  const currentEpoch = userSnap.exists && typeof userSnap.data()?.cryptoEpoch === 'number'
    ? userSnap.data().cryptoEpoch
    : 1;
  if (!userSnap.exists) {
    if (!dryRun) {
      await userRef.set({ cryptoEpoch: currentEpoch, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    console.log('[seed] created user doc with cryptoEpoch=1');
  }

  if (shouldCleanup) {
    for (const col of seedCollections) {
      const snap = await userRef.collection(col).where('source', '==', 'seed').get();
      if (snap.empty) continue;
      const batch = db.batch();
      snap.docs.forEach(docSnap => batch.delete(docSnap.ref));
      if (!dryRun) {
        await batch.commit();
      }
      console.log(`[seed] cleaned ${snap.size} docs from ${col}`);
    }
    return;
  }

  const companyInfo = userSnap.exists ? userSnap.data()?.companyInfo : null;
  if (!companyInfo || forceCompany) {
    const today = todayISO();
    const payload = {
      name: companyInfo?.name || 'Empresa Teste Meumei',
      cnpj: companyInfo?.cnpj || '12.345.678/0001-90',
      startDate: companyInfo?.startDate || today,
      address: companyInfo?.address || 'Rua Principal, 123',
      zipCode: companyInfo?.zipCode || '85770-000',
      phone: companyInfo?.phone || '(46) 99110-3205',
      email: companyInfo?.email || emailArg || 'contato@meumei.test',
      website: companyInfo?.website || 'meumeiapp.com.br',
      licenseId
    };
    if (!dryRun) {
      await userRef.set({ companyInfo: payload }, { merge: true });
    }
    console.log('[seed] companyInfo ready', { name: payload.name, cnpj: payload.cnpj });
  }

  const accountsSnap = await userRef.collection('accounts').get();
  const existingAccounts = new Set(accountsSnap.docs.map(doc => doc.id));
  const seededAccounts = [
    {
      id: 'seed_account_main',
      name: 'Conta Principal',
      type: 'Conta Corrente',
      initialBalance: 3200,
      currentBalance: 3200,
      nature: 'PJ'
    },
    {
      id: 'seed_account_reserve',
      name: 'Conta Reserva',
      type: 'Conta Corrente',
      initialBalance: 1800,
      currentBalance: 1800,
      nature: 'PJ'
    },
    {
      id: 'seed_account_cash',
      name: 'Carteira / Dinheiro',
      type: 'Caixa',
      initialBalance: 450,
      currentBalance: 450,
      nature: 'PJ'
    }
  ];

  for (const account of seededAccounts) {
    if (existingAccounts.has(account.id)) continue;
    const accountPayload = {
      ...account,
      source: 'seed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      licenseId,
      cryptoEpoch: currentEpoch
    };
    if (!dryRun) {
      await userRef.collection('accounts').doc(account.id).set(accountPayload, { merge: true });
    }
  }
  const accountIds = seededAccounts.map(account => account.id);

  const cardSeeds = [
    {
      id: 'seed_card_main',
      name: 'Cartao Seed',
      brand: 'Visa',
      closingDay: 25,
      dueDay: 5,
      limit: 12000
    },
    {
      id: 'seed_card_corp',
      name: 'Cartao Corporativo',
      brand: 'Mastercard',
      closingDay: 10,
      dueDay: 20,
      limit: 18000
    }
  ];

  for (const card of cardSeeds) {
    const cardPayload = {
      ...card,
      source: 'seed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      licenseId,
      cryptoEpoch: currentEpoch
    };
    if (!dryRun) {
      await userRef.collection('credit_cards').doc(card.id).set(cardPayload, { merge: true });
    }
  }

  const random = createSeededRandom(licenseId);
  const incomeCategories = [
    'Vendas',
    'Servicos',
    'Assinaturas',
    'Marketplace',
    'Consultoria',
    'Treinamentos',
    'Retainer'
  ];
  const incomeDescriptions = [
    'Venda online',
    'Contrato mensal',
    'Projeto fechado',
    'Recebimento recorrente',
    'Parceria comercial'
  ];
  const expenseCatalog = [
    { category: 'Aluguel', type: 'fixed', description: 'Aluguel' },
    { category: 'Internet', type: 'fixed', description: 'Internet' },
    { category: 'Energia', type: 'fixed', description: 'Energia' },
    { category: 'Folha', type: 'fixed', description: 'Folha' },
    { category: 'Ferramentas', type: 'fixed', description: 'Ferramentas SaaS' },
    { category: 'Marketing', type: 'variable', description: 'Marketing' },
    { category: 'Transporte', type: 'variable', description: 'Transporte' },
    { category: 'Estoque', type: 'variable', description: 'Reposicao estoque' },
    { category: 'Impostos', type: 'fixed', description: 'Impostos DAS' },
    { category: 'Pessoal', type: 'personal', description: 'Gasto pessoal' },
    { category: 'Saude', type: 'personal', description: 'Saude' }
  ];

  const baseIncomes = Array.from({ length: incomeCount }).map((_, idx) => {
    const category = pick(incomeCategories, random);
    const description = pick(incomeDescriptions, random);
    const amount = roundCurrency(randomBetween(2500, 18000, random));
    const accountId = pick(accountIds, random);
    const date = randomDate(6, random);
    return buildIncome(licenseId, `seed_income_${idx + 1}`, {
      description,
      category,
      amount,
      date,
      accountId,
      status: 'received',
      paymentMethod: random() > 0.6 ? 'Boleto' : 'Pix'
    }, currentEpoch);
  });

  const baseExpenses = Array.from({ length: expenseCount }).map((_, idx) => {
    const entry = pick(expenseCatalog, random);
    const amount = roundCurrency(randomBetween(900, 14000, random));
    const accountId = pick(accountIds, random);
    const date = randomDate(6, random);
    const useCard = entry.type !== 'personal' && random() > 0.7;
    return buildExpense(licenseId, `seed_expense_${idx + 1}`, {
      description: entry.description,
      category: entry.category,
      amount,
      date,
      dueDate: date,
      accountId,
      status: 'paid',
      paymentMethod: useCard ? 'Credito' : 'Debito',
      type: entry.type,
      cardId: useCard ? pick(cardSeeds.map(card => card.id), random) : null
    }, currentEpoch);
  });

  const baseYields = Array.from({ length: yieldCount }).map((_, idx) => {
    const amount = roundCurrency(randomBetween(120, 1500, random));
    const accountId = pick(accountIds, random);
    const date = randomDate(6, random);
    return buildYield(licenseId, `seed_yield_${idx + 1}`, {
      accountId,
      amount,
      date,
      notes: 'Rendimento CDI'
    }, currentEpoch);
  });

  const baseMovement =
    sumAmounts(baseIncomes) + sumAmounts(baseExpenses) + sumAmounts(baseYields);
  const scale = targetMovement && baseMovement > 0 ? targetMovement / baseMovement : 1;

  if (scale !== 1) {
    console.log('[seed] scaling movement', {
      targetMovement,
      baseMovement,
      scale: Number(scale.toFixed(3))
    });
  }

  const incomes = baseIncomes.map(item => ({
    ...item,
    amount: roundCurrency(item.amount * scale)
  }));
  const expenses = baseExpenses.map(item => ({
    ...item,
    amount: roundCurrency(item.amount * scale)
  }));
  const yields = baseYields.map(item => ({
    ...item,
    amount: roundCurrency(item.amount * scale)
  }));

  const batch = db.batch();
  incomes.forEach(item => {
    const ref = userRef.collection('incomes').doc(item.id);
    batch.set(ref, item, { merge: true });
  });
  expenses.forEach(item => {
    const ref = userRef.collection('expenses').doc(item.id);
    batch.set(ref, item, { merge: true });
  });
  yields.forEach(item => {
    const ref = userRef.collection('yields').doc(item.id);
    batch.set(ref, item, { merge: true });
  });

  if (!dryRun) {
    await batch.commit();
  }

  console.log('[seed] inserted', {
    incomes: incomes.length,
    expenses: expenses.length,
    yields: yields.length,
    movement: roundCurrency(sumAmounts(incomes) + sumAmounts(expenses) + sumAmounts(yields)),
    accounts: accountIds.length,
    cards: cardSeeds.length
  });
};

run().catch(error => {
  console.error('[seed] failed', error);
  process.exit(1);
});
