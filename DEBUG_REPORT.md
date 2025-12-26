# DEBUG_REPORT.md

Date: 2025-12-22 (local)

## 2025-12-24 - Series edit exige groupId

### Alteracoes
- [x] "Este e proximos" so aplica em series quando existe installmentGroupId.
- [x] Sem groupId: aviso no formulario e queda forçada para update single.
- [x] Log `[series-edit]` com shouldApply=false + candidatesFound quando faltar groupId.

### Checklist
- [ ] Despesa parcelada sem groupId: selecionar "Este e proximos" aplica apenas no item atual com aviso.
- [ ] Despesa parcelada com groupId: "Este e proximos" atualiza parcelas futuras.
- [ ] Entrada parcelada sem groupId: aplicar "Este e proximos" volta para item unico com aviso.
- [ ] Entrada parcelada com groupId: atualiza parcelas futuras.
- [ ] Desktop e mobile ok.

### Comandos
- [x] `npm run build` (dist/assets/index-CRtCP8XD.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.56 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-CGolDRlb.css                       0.34 kB │ gzip:   0.23 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-CRtCP8XD.js                    1,148.26 kB │ gzip: 284.35 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
PWA v1.2.0
precache  16 entries (1191.79 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Git baseline init

### Alteracoes
- [x] Repositorio git inicializado dentro da pasta do projeto.
- [x] .gitignore criado com regras para node_modules, dist, env locais e logs Firebase.
- [x] Commit baseline criado: 3591ebf

### Diff (git show --stat)
```
3591ebf chore: baseline before series-edit + global form labels
 .env.example                                   |    3 +
 .firebaserc                                    |   14 +
 .gitignore                                     |   29 +
 AUDIT_FIRESTORE_CLEANUP.md                     |   44 +
 App.tsx                                        | 1866 +++++
 DEBUG_REPORT.md                                | 1341 ++++
 README.md                                      |   55 +
 appVersion.ts                                  |    7 +
 assets/meumei.png                              |  Bin 0 -> 18148 bytes
 components/AccountsView.tsx                    |  604 ++
 components/AuditLogModal.tsx                   |  140 +
 components/AuthScreen.tsx                      |  216 +
 components/CalculatorModal.tsx                 |  262 +
 components/CardTag.tsx                         |   42 +
 components/CompanyDetailsView.tsx              |  154 +
 components/CompanySetup.tsx                    |  142 +
 components/CompoundInterestCalculatorModal.tsx |  493 ++
 components/Dashboard.tsx                       |   13 +
 components/DashboardDesktop.tsx                | 1569 ++++
 components/DashboardMobile.tsx                 | 1537 ++++
 components/DashboardMobileV2.tsx               | 1532 ++++
 components/ErrorBoundary.tsx                   |   85 +
 components/ExpensesView.tsx                    |  983 +++
 components/FaturasErrorBoundary.tsx            |   26 +
 components/GlobalHeader.tsx                    |  197 +
 components/IncomesView.tsx                     |  926 +++
 components/InstallAppModal.tsx                 |  101 +
 components/InvoicesView.tsx                    |  652 ++
 components/Logo.tsx                            |   32 +
 components/MobileHeader.tsx                    |  218 +
 components/NewAccountModal.tsx                 |  402 +
 components/NewCreditCardModal.tsx              |  218 +
 components/NewExpenseModal.tsx                 |  859 +++
 components/NewIncomeModal.tsx                  |  724 ++
 components/NewYieldModal.tsx                   |  271 +
 components/PayInvoiceModal.tsx                 |  125 +
 components/ReportsView.tsx                     |  758 ++
 components/Settings.tsx                        |  601 ++
 components/VariableExpensesView.tsx            |  258 +
 components/YieldsMobileV2.tsx                  |  466 ++
 components/YieldsView.tsx                      | 1367 ++++
 components/mobile/MobileModalShell.tsx         |   75 +
 components/mobile/MobileModuleHeader.tsx       |   42 +
 components/mobile/MobilePageShell.tsx          |   40 +
 components/mobile/MobileTransactionCard.tsx    |   75 +
 components/mobile/MobileTransactionDrawer.tsx  |  117 +
 constants.ts                                   |   52 +
 contexts/AuthContext.tsx                       |  165 +
 contexts/GlobalActionsContext.tsx              |   96 +
 firebase.json                                  |   59 +
 firestore.rules                                |  103 +
 functions/.gitignore                           |    2 +
 functions/package-lock.json                    | 2749 +++++++
 functions/package.json                         |   20 +
 functions/src/index.ts                         |    5 +
 functions/tsconfig.json                        |   13 +
 hooks/useIsMobile.ts                           |   41 +
 hooks/useIsMobileLandscape.ts                  |   41 +
 hooks/useMobileTopOffset.ts                    |  117 +
 hooks/usePwaInstallPrompt.ts                   |  148 +
 index.css                                      |   33 +
 index.html                                     |   49 +
 index.tsx                                      |  105 +
 metadata.json                                  |    0
 package-lock.json                              | 9260 ++++++++++++++++++++++++
 package.json                                   |   29 +
 public/apple-touch-icon.png                    |  Bin 0 -> 8936 bytes
 public/favicon-32x32.png                       |  Bin 0 -> 822 bytes
 public/pwa-192x192.png                         |  Bin 0 -> 9590 bytes
 public/pwa-512x512-maskable.png                |  Bin 0 -> 18856 bytes
 public/pwa-512x512.png                         |  Bin 0 -> 25516 bytes
 scripts/audit-firestore-cleanup.ts             |  177 +
 scripts/createEntitlement.js                   |   59 +
 scripts/generate-pwa-icons.js                  |   51 +
 scripts/migrate-license-to-email.ts            |  295 +
 scripts/setRole.js                             |   52 +
 services/api.ts                                |    0
 services/auditService.ts                       |   72 +
 services/cardColorUtils.ts                     |  110 +
 services/categoryService.ts                    |  333 +
 services/cryptoService.ts                      |  150 +
 services/dataService.ts                        | 1217 ++++
 services/entitlementService.ts                 |   57 +
 services/exportUtils.ts                        |   83 +
 services/firebase.ts                           |   60 +
 services/invoiceUtils.ts                       |   39 +
 services/preferencesService.ts                 |  210 +
 services/reportService.ts                      |  232 +
 services/resetService.ts                       |   78 +
 services/supportAccessService.ts               |  126 +
 services/yieldsService.ts                      |  352 +
 tsconfig.json                                  |   29 +
 types.ts                                       |  187 +
 utils/debug.ts                                 |    5 +
 utils/firestoreLogger.ts                       |   38 +
 utils/formLabels.ts                            |    4 +
 utils/installmentSeries.ts                     |  130 +
 utils/normalizeEmail.ts                        |    7 +
 utils/stringUtils.ts                           |    7 +
 vite.config.ts                                 |  135 +
 100 files changed, 37063 insertions(+)
```

## 2025-12-24 - Labels de formulario + escopo de edicao em series

### Alteracoes
- [x] Helper `getPrimaryActionLabel` padroniza labels de criar/editar (Salvar alteracoes vs Adicionar {entidade}).
- [x] Logs `[form-save]` adicionados nos formularios principais (conta, cartao, despesa, entrada, rendimento).
- [x] Escopo de edicao em parcelas para Despesas e Entradas (Apenas este item / Este e proximos).
- [x] Atualizacao segura de series com heuristica (fallback para item unico).

### Checklist
- [ ] Em modo editar, nenhum formulario mostra label de criacao.
- [ ] Despesa parcelada: editar categoria e aplicar "Este e proximos" atualiza 2/4, 3/4, 4/4.
- [ ] Entrada parcelada: editar categoria e aplicar "Este e proximos" atualiza parcelas futuras.
- [ ] Sem duplicatas ao salvar edicao em series.
- [ ] Desktop e mobile ok.

### Comandos
- [x] `npm run build` (dist/assets/index-CiAmP2ZQ.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.56 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-CGolDRlb.css                       0.34 kB │ gzip:   0.23 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-CiAmP2ZQ.js                    1,147.30 kB │ gzip: 284.04 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
PWA v1.2.0
precache  16 entries (1190.85 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Mobile page shell padronizado

### Alteracoes
- [x] `MobilePageShell` aplicado como shell padrao nas telas mobile principais.
- [x] Migradas: Contas, Entradas, Despesas (fixas/variaveis/pessoais via `ExpensesView`), Faturas e Rendimentos (`YieldsMobileV2`).
- [x] `renderLayout` com `skipMobileOffset` para evitar offset duplicado nas telas com shell.
- [x] Desktop mantido sem alteracao.

### Checklist
- [ ] Mobile: header pill consistente em Contas/Entradas/Despesas/Faturas/Rendimentos.
- [ ] Mobile: buraco no topo removido (sem offset duplicado).
- [ ] Desktop: layout inalterado.

### Comandos
- [x] `npm run build` (dist/assets/index-Bdl7e4vf.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.56 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-CGolDRlb.css                       0.34 kB │ gzip:   0.23 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-Bdl7e4vf.js                    1,140.04 kB │ gzip: 281.87 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
PWA v1.2.0
precache  16 entries (1183.76 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Mobile topo + orientation lock + voltar padrao

### Alteracoes
- [x] `--mm-mobile-top` agora prioriza o bottom do seletor mensal (fallback no header).
- [x] `--mm-mobile-top` sempre soma safe area e registra source (month/header).
- [x] Labels mobile padronizados para "Voltar" em telas principais (exceto Relatorios).
- [x] Manifest PWA com orientation portrait + overlay web em landscape mobile.
- [x] Desktop mantido sem alteracao.

### Checklist
- [ ] Mobile: sem buraco extra no topo nas telas listadas.
- [ ] Mobile: "Definir meta de patrimonio" sem sobreposicao do topo.
- [ ] Mobile: labels "Voltar" padronizados (exceto Relatorios).
- [ ] Mobile: em landscape aparece overlay "Use em modo retrato".
- [ ] Desktop: inalterado.

### Comandos
- [x] `npm run build` (dist/assets/index-DWLOOFtg.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.56 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-CGolDRlb.css                       0.34 kB │ gzip:   0.23 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-DWLOOFtg.js                    1,139.45 kB │ gzip: 281.45 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
PWA v1.2.0
precache  16 entries (1183.19 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Mobile modal offset global (topo fixo + safe area)

### Alteracoes
- [x] `--mm-mobile-top` agora mede header + seletor mensal e considera safe area no mobile.
- [x] Calculo usa `max(DEFAULT_OFFSET, measuredBottom + safeTop)` e loga `measuredBottom`.
- [x] `MobileModalShell` aplica padding default de `var(--mm-mobile-top) + 16px`.
- [x] Removidos overrides manuais de offset em modais de rendimento (meta e simulador).
- [x] Desktop mantido sem alteracao.

### Checklist
- [ ] Mobile: "Definir meta de patrimonio" sem sobreposicao do topo.
- [ ] Mobile: outros modais mobile nao ficam por baixo do header.
- [ ] Mobile: sem scroll horizontal.
- [ ] Desktop: modais inalterados.
- [ ] Desktop: layout geral inalterado.

### Comandos
- [x] `npm run build` (dist/assets/index-BUo37oY9.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.53 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-CGolDRlb.css                       0.34 kB │ gzip:   0.23 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-BUo37oY9.js                    1,138.22 kB │ gzip: 281.15 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
PWA v1.2.0
precache  16 entries (1181.97 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Mobile meta de patrimonio (offset extra)

### Alteracoes
- [x] Modal "Definir meta de patrimonio" com offset extra no mobile para evitar sobreposicao.
- [x] Desktop mantido sem alteracao.

### Checklist
- [ ] Mobile: abrir "Definir meta de patrimonio" e confirmar titulo abaixo do header.
- [ ] Mobile: sem sobreposicao com seletor mensal.
- [ ] Desktop: modal inalterado.

### Comandos
- [x] `npm run build` (dist/assets/index-z_HBM7_K.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.53 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-E7nA-7kK.css                       0.29 kB │ gzip:   0.22 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-z_HBM7_K.js                    1,137.29 kB │ gzip: 280.79 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
PWA v1.2.0
precache  16 entries (1181.00 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Mobile simulador (botao voltar visivel)

### Alteracoes
- [x] Header mobile in-flow no simulador com botao "Voltar" e titulo centralizado.
- [x] Voltar agora respeita o seletor mensal (sem X) no mobile.
- [x] Offset do simulador ajustado via `contentPaddingTop` para maior folga.
- [x] Ajuste fino: topo do simulador com folga extra no mobile.
- [x] Simulador mobile: ajuste fino do topo (+dedinho).
- [x] Log one-time `[layout][mobile] simulator_header_back_enabled` ao abrir o modal.
- [x] Desktop mantido sem alteracao.

### Checklist
- [ ] Mobile: abrir Simular crescimento e ver "Voltar" + titulo centralizado.
- [ ] Mobile: "Voltar" 100% visivel abaixo do seletor mensal (sem X).
- [ ] Mobile: topo do simulador abaixo do seletor mensal com folga.
- [ ] Mobile: topo do simulador com folga extra (ajuste fino).
- [ ] Mobile: topo do simulador com folga extra (ajuste +dedinho).
- [ ] Mobile: botao "Voltar" fecha o modal e retorna para Rendimentos.
- [ ] Mobile: nenhum texto coberto pela barra do mes.
- [ ] Mobile: sem scroll horizontal.
- [ ] Desktop: simulador inalterado.

### Comandos
- [x] `npm run build` (dist/assets/index-BTUebqrg.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.53 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-E7nA-7kK.css                       0.29 kB │ gzip:   0.22 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-BTUebqrg.js                    1,137.23 kB │ gzip: 280.77 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
PWA v1.2.0
precache  16 entries (1180.95 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Mobile Rendimentos (lancamentos por conta + editar)

### Alteracoes
- [x] Detalhamento por conta (mobile) agora lista lancamentos do mes por conta.
- [x] Botao interno "Adicionar rendimento" removido do accordion (mantido CTA principal no hero).
- [x] Acao "Editar" por lancamento abre o fluxo existente de edicao.
- [x] Logs de expand/editar/salvar adicionados para mobile.

### Checklist
- [ ] Mobile Rendimentos: expandir cada conta mostra "Lancamentos no mes".
- [ ] Listagem ordenada por data (desc) e filtrada pelo mes selecionado.
- [ ] Ao trocar o mes, a lista atualiza corretamente.
- [ ] Tap em Editar abre modal com dados do lancamento.
- [ ] Salvar edicao atualiza valor e nao duplica lancamentos.
- [ ] Nao existe botao "Adicionar rendimento" dentro do accordion.
- [ ] Desktop Rendimentos inalterado.

### Comandos
- [x] `npm run build` (dist/assets/index-Ck9bRBUx.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.53 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-E7nA-7kK.css                       0.29 kB │ gzip:   0.22 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-Ck9bRBUx.js                    1,136.38 kB │ gzip: 280.60 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
PWA v1.2.0
precache  16 entries (1180.12 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Mobile Yields V2

### Alteracoes
- [x] Rendimentos mobile refatorado para layout v2 (hero, acoes rapidas, listas, curva compacta, pie + legenda, accordion).
- [x] Log de montagem mobile: `[layout][mobile] yields_v2_loaded`.
- [x] Desktop Rendimentos mantido sem alteracoes.

### Checklist
- [ ] Mobile Rendimentos sem scroll horizontal.
- [ ] Hero card mostra patrimonio + variacao e CTA "Adicionar rendimento".
- [ ] Acoes rapidas em lista vertical (Simular, Definir meta, Historico).
- [ ] Resumo mensal por conta mostra total + ultimo rendimento.
- [ ] Curva de crescimento compacta sem eixos/legenda.
- [ ] Onde rende mais com pizza + legenda.
- [ ] Accordion por conta com taxa, ultimo rendimento e CTA.
- [ ] Desktop Rendimentos inalterado.

### Comandos
- [x] `npm run build` (dist/assets/index-UK20ZT9v.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.53 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-E7nA-7kK.css                       0.29 kB │ gzip:   0.22 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-UK20ZT9v.js                    1,127.80 kB │ gzip: 278.55 kB
PWA v1.2.0
precache  16 entries (1171.74 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Mobile global top offset (month selector safe area)

### Alteracoes
- [x] Month selector com id fixo para medir altura no mobile.
- [x] Hook `useMobileTopOffset` calcula padding-top via CSS var global.
- [x] Offset aplicado no layout mobile global (exceto DashboardMobileV2).
- [x] Log one-time `[layout][mobile-offset]` com altura e padding aplicado.
- [x] Fix: Simular crescimento respeita `--mm-mobile-top` no mobile (sem sobreposicao).

### Checklist
- [ ] Dashboard (mobile) mantem layout atual sem padding duplicado.
- [ ] Rendimentos (mobile) sem sobreposicao do seletor mensal.
- [ ] Simular crescimento (mobile) nao fica coberto pela barra do mes.
- [ ] Entradas (mobile) lista e form sem sobreposicao do seletor.
- [ ] Despesas (mobile) lista e form sem sobreposicao do seletor.
- [ ] Contas/Configuracoes/Relatorios/Calculadora (mobile) sem sobreposicao.
- [ ] Desktop (>= 1024px) inalterado.
- [ ] Sem scroll horizontal.

### Comandos
- [x] `npm run build` (dist/assets/index-BHwB9gdW.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.53 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-E7nA-7kK.css                       0.29 kB │ gzip:   0.22 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-BHwB9gdW.js                    1,129.24 kB │ gzip: 279.07 kB
PWA v1.2.0
precache  16 entries (1173.14 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Mobile modal UX padronizado

### Alteracoes
- [x] Shell padrao de modal mobile com header in-flow (Voltar + titulo).
- [x] Removido header flutuante/X nos modais mobile de rendimento e calculadoras.
- [x] Modais mobile respeitam `--mm-mobile-top` sem sobrepor o seletor mensal.
- [x] Logs one-time `[layout][mobile-modal] <modal>` adicionados via shell.

### Checklist
- [ ] Entradas/Despesas (mobile) continuam sem sobreposicao do seletor mensal.
- [ ] Novo Rendimento (mobile) com Voltar in-flow e sem X.
- [ ] Simular crescimento (mobile) com Voltar in-flow e sem X.
- [ ] Calculadora (mobile) com Voltar in-flow e sem X.
- [ ] Sem scroll horizontal em modais mobile.
- [ ] Desktop inalterado.

### Comandos
- [x] `npm run build` (dist/assets/index-B5JXkn6O.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run build
dist/manifest.webmanifest                            0.53 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-E7nA-7kK.css                       0.29 kB │ gzip:   0.22 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-B5JXkn6O.js                    1,133.68 kB │ gzip: 279.74 kB
PWA v1.2.0
precache  16 entries (1177.48 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Mobile Transactions (Entradas/Despesas) - no horizontal scroll

### Alteracoes
- [x] Subheader mobile (Voltar + titulo) em fluxo para Entradas/Despesas (lista e novo) abaixo do seletor de mes.
- [x] CTA "Nova ..." logo abaixo do subheader, sem sobrepor resumo ou formulario.
- [x] Listas mobile em cards (sem tabela) com drawer de detalhes e acoes.
- [x] Formulario mobile inline mantendo a mesma logica e validacoes.
- [x] Logs `[mobile-ui]` para transicoes list/form/drawer.
- [x] Views mobile com `overflow-x-hidden` para evitar scroll lateral.

### Checklist
- [ ] Entradas lista: subheader abaixo do seletor, nao cobre "Resumo do mes".
- [ ] Nova Entrada: subheader abaixo do seletor, nao cobre "Descricao/Origem".
- [ ] Despesas Fixas lista: subheader abaixo do seletor, nao cobre "Resumo do mes".
- [ ] Nova Despesa Fixa: subheader abaixo do seletor, nao cobre o primeiro campo.
- [ ] Despesas Variaveis lista: subheader abaixo do seletor, nao cobre "Resumo do mes".
- [ ] Nova Despesa Variavel: subheader abaixo do seletor, nao cobre o primeiro campo.
- [ ] Despesas Pessoais lista: subheader abaixo do seletor, nao cobre "Resumo do mes".
- [ ] Nova Despesa Pessoal: subheader abaixo do seletor, nao cobre o primeiro campo.
- [ ] Mobile Entradas: cards empilhados, CTA visivel, sem overflow horizontal.
- [ ] Tap em entrada abre drawer com detalhes e acoes.
- [ ] Drawer cobre header/seletor de mes corretamente.
- [ ] Editar no drawer abre formulario mobile com header sticky e back funcionando.
- [ ] Nova entrada abre formulario; voltar retorna para lista; lista volta ao Dashboard.
- [ ] Desktop Entradas inalterado.
- [ ] Mobile Despesas: cards empilhados, CTA visivel, sem overflow horizontal.
- [ ] Tap em despesa abre drawer com detalhes e acoes.
- [ ] Editar no drawer abre formulario mobile com header sticky e back funcionando.
- [ ] Desktop Despesas inalterado.

### Comandos
- [x] `npm run dev` (Vite em http://localhost:3001/, 3000 ocupado)
- [x] `npm run build` (dist/assets/index-53CEOFYw.js + PWA files)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run dev
> meumei@0.0.0 dev
> vite

Port 3000 is in use, trying another one...

  VITE v6.4.1  ready in 94 ms

  ➜  Local:   http://localhost:3001/
  ➜  Network: http://192.168.2.102:3001/
```
```
npm run build
dist/manifest.webmanifest                            0.53 kB
dist/index.html                                      1.76 kB │ gzip:   0.85 kB
dist/assets/index-E7nA-7kK.css                       0.29 kB │ gzip:   0.22 kB
dist/assets/workbox-window.prod.es5-BIl4cyR9.js      5.76 kB │ gzip:   2.37 kB
dist/assets/index-53CEOFYw.js                    1,117.19 kB │ gzip: 276.61 kB
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
PWA v1.2.0
precache  16 entries (1161.38 KiB)
files generated
  dist/sw.js
  dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - Realtime + PWA update flow (beta 1.0.2)

### Alterações
- [x] Realtime Firestore com listeners por view para accounts/expenses/incomes/credit_cards (subscribeXxx + onSnapshot).
- [x] Yields com subscribeYields/onSnapshot e logs de realtime.
- [x] Logs de realtime: `[realtime][entidade] subscribe_start/snapshot/unsubscribe`.
- [x] Logs de escrita: `[sync][write] <entidade> ok` em upserts/deletes críticos.
- [x] PWA update robusto: checks periódicos, foco, SKIP_WAITING, controllerchange reload.
- [x] BroadcastChannel para `please_reload`/`update_applied`.
- [x] Workbox com `clientsClaim` + `skipWaiting`.

### Checklist funciona
- [ ] Alê cria despesa e Nat vê em tempo real sem refresh.
- [ ] Alê cria entrada e Nat vê em tempo real sem refresh.
- [ ] PWA instalado recebe update pós-deploy (sem reset=1).
- [ ] App web recebe update (aba normal).

### Logs esperados
```
[realtime][accounts] subscribe_start
[realtime][accounts] snapshot
[realtime][accounts] unsubscribe
[realtime][expenses] subscribe_start
[realtime][expenses] snapshot
[realtime][expenses] unsubscribe
[realtime][incomes] subscribe_start
[realtime][incomes] snapshot
[realtime][incomes] unsubscribe
[realtime][credit_cards] subscribe_start
[realtime][credit_cards] snapshot
[realtime][credit_cards] unsubscribe
[realtime][yields] subscribe_start
[realtime][yields] snapshot
[realtime][yields] unsubscribe
[pwa][sw] update_available
[pwa][sw] controller_changed_reload
[sync][write] expense ok
[sync][write] income ok
```

### Build/Deploy
- [x] `npm run build` (dist/assets/index-MbkTp1QT.js)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

## 2025-12-24 - Mobile Mode UI (Dashboard + Header)

### Alteracoes
- [x] Hook `useIsMobile` para breakpoint < 768px.
- [x] Dashboard dividido em Desktop/Mobile com wrapper seletor.
- [x] Dashboard Mobile com layout compacto (cards, MEI e grid ajustados).
- [x] Header reduzido apenas em mobile (padding/logo/acoes menores).
- [x] Removida barra "Tema do painel" do Dashboard (desktop/mobile).

### Checklist Desktop x Mobile
- [ ] Desktop (>= 768px) renderiza exatamente como antes.
- [ ] Mobile (< 768px) sem overflow horizontal em Dashboard e Header.
- [ ] Header compacto no mobile (logo e botoes menores, mesma funcionalidade).
- [ ] Toggle sol/lua troca tema e persiste.

### Testes manuais sugeridos
- [ ] Abrir DevTools em modo responsivo (ex: 360x800) e navegar Dashboard.
- [ ] Validar Desktop em largura >= 1024px (sem mudancas visuais).

### Build/Deploy
- [x] `npm run dev` (Vite em http://localhost:3001/, encerrado por timeout 3s)
- [x] `npm run build` (dist/assets/index-DCfdUfvl.js)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

## 2025-12-24 - Mobile header fix

### Alteracoes
- [x] Header mobile reorganizado em blocos verticais (logo, empresa, email, grade de acoes).
- [x] Email no mobile com truncate e sem info extra.
- [x] Toggle de tema mantido no header em mobile/desktop.
- [x] Seletor de mes centralizado e responsivo no mobile (sem overflow).
- [x] Header mobile mais compacto (padding reduzido).

### Checklist
- [ ] Mobile sem overflow horizontal no header.
- [ ] Botoes do header em grade, clicaveis, sem estourar largura.
- [ ] Email visivel com truncate no mobile.
- [ ] Desktop inalterado.

### Comandos
- [x] `npm run dev` (Vite em http://localhost:3001/, encerrado por timeout 3s)
- [x] `npm run build` (dist/assets/index-DToa0njG.js)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

## 2025-12-24 - Accounts view redesign + full-screen PWA tweaks

### Alteracoes
- [x] Contas Bancarias redesenhadas em lista moderna com acoes alinhadas e saldo destacado.
- [x] Lapis e lixeira com hit area >= 44px e alinhamento fixo.
- [x] Logs [ui][accounts] no mount e render da lista; logs de edit/delete.
- [x] CSS global para remover margem default, garantir altura 100% e evitar overflow-x no mobile.
- [x] Viewport com `viewport-fit=cover` e safe-area no header apenas em standalone.

### Checklist
- [ ] Desktop sem regressao visual no header e em Contas.
- [ ] Mobile sem overflow horizontal (header e lista de contas).
- [ ] Acoes de editar/excluir alinhadas e clicaveis (>= 44px).
- [ ] Toggle de tema continua no header.

### Comandos
- [x] `npm run build` (dist/assets/index-CuSlpDAm.js, dist/assets/index-E7nA-7kK.css)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

## 2025-12-24 - Header sticky + logo central absoluto + email abaixo dos ícones

### Alteracoes
- [x] Header sticky com z-index alto e background preservado.
- [x] Logo centralizado via posicionamento absoluto no container do header.
- [x] Bloco direito em coluna: acoes no topo e email menor abaixo com truncate.
- [x] Larguras maximas no mobile para blocos esquerdo/direito evitarem overlap/overflow.

### Checklist
- [ ] Desktop: header permanece visivel ao rolar.
- [ ] Desktop: logo centralizado visualmente.
- [ ] Desktop: e-mail abaixo dos icones no canto direito.
- [ ] Mobile: sem overflow horizontal no header; email truncado ok.
- [ ] Botoes do header continuam funcionais.

### Comandos
- [x] `npm i`
- [x] `npm run dev` (Vite em http://localhost:3001/, encerrado por timeout 5s)
- [x] `npm run build` (dist/assets/index-CMCnicbc.js, dist/assets/index-E7nA-7kK.css)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

### Observacoes
- [ ] Validacao pos-deploy em https://meumeiapp.web.app (pendente).

## 2025-12-24 - Dashboard Mobile v2 (hamburguer + listas + pizza)

### Alteracoes
- [x] Mobile header com hamburguer e drawer (tema, configuracoes, relatorios, calculadora, auditoria, sair).
- [x] Acesso rapido em lista vertical (um item por linha com chevron).
- [x] Card MEI compacto com resumo e detalhes expandiveis.
- [x] KPIs em lista vertical (saldo, entradas, saidas).
- [x] Faturas dos cartoes em lista vertical.
- [x] "Onde foi parar seu dinheiro?" com pizza + legenda por categoria.

### Checklist
- [ ] Desktop >= 1024px: visual do Dashboard igual ao anterior.
- [ ] Mobile: header sticky, logo limpo, sem overflow horizontal.
- [ ] Mobile: drawer abre e mostra email + acoes.
- [ ] Mobile: acesso rapido em lista vertical.
- [ ] Mobile: MEI mostra resumo sem rolagem interna.
- [ ] Mobile: KPIs e faturas em lista vertical.
- [ ] Mobile: pizza + legenda exibidos corretamente.

### Comandos
- [x] `npm run dev` (Vite em http://localhost:3001/, encerrado por timeout 5s)
- [x] `npm run build` (dist/assets/index-9nKnZHSy.js, dist/assets/index-E7nA-7kK.css)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

## 2025-12-24 - Mobile drawer z-index acima do seletor de mes

### Alteracoes
- [x] Drawer/backdrop com z-index explicito alto e renderizados via portal.
- [x] Log [mobile-drawer] open ao abrir/fechar.

### Checklist
- [ ] Mobile: drawer/backdrop acima do seletor de mes.
- [ ] Mobile: fechar drawer e seletor de mes normal.
- [ ] Desktop: header e seletor intactos.

### Comandos
- [x] `npm run build` (dist/assets/index-HHhkRDSu.js, dist/assets/index-E7nA-7kK.css)
- [x] `firebase deploy --only hosting:meumeiapp` (https://meumeiapp.web.app)

## 2025-12-23 - Yields Monthly Summary (beta 1.0.2)

### Alterações
- [x] Removido card "Rendimentos lançados hoje".
- [x] Histórico substituído por "Resumo do mês" com totais por conta e cor da conta.
- [x] Drawer lateral somente leitura com lançamentos do mês por conta.
- [x] Logs [yields-monthly] para mês, perAccount e openDrawer.
- [x] Remoção do toggle de modo de visualização (modo minimalista/completo).
- [x] Layout completo definido como padrão fixo (sem estado/preferência).
- [x] Curva de Crescimento agora em linhas (acumulado por conta no mês).
- [x] Remoção da visão "Histórico" no gráfico.

### Testes manuais (pendentes)
- [ ] Trocar o mês no seletor do topo e ver o "Resumo do mês" recalcular.
- [ ] Conferir se as cores das contas batem com as cores configuradas.
- [ ] Clicar numa conta e ver o drawer com itens somente daquele mês.
- [ ] Confirmar que não existe mais o bloco "Rendimentos lançados hoje".
- [ ] Confirmar que a tela não tem ícones de edição onde não deve.
- [ ] Confirmar visualmente o gráfico de linhas (acumulado diário por conta) sem visão "Histórico".

### Execução local
- [x] npm install
- [x] npm run dev (iniciado; encerrado por timeout em 10s, porta 3001)
- [x] npm run build
- [x] firebase use meumei-d88be
- [ ] firebase deploy --only hosting:meumei-beta-102 (falhou: target não encontrado em firebase.json)

## 2025-12-23 - Limpeza Rendimentos 2025-12 (Agência DK)

### Exclusão manual (Firestore)
- [x] Tenant: `agencia.dk22@gmail.com`
- [x] Mês alvo: 2025-12
- [x] Docs removidos em `licenses/{licenseId}/yields`: 0
- [x] Entradas removidas de `licenses/{licenseId}/accounts/{accountId}.yieldHistory`: 2
- [x] Ajuste de saldo total (soma removida de `currentBalance`): R$ 2,82
- [x] lastYield* recalculado/limpo quando apontava para 2025-12
- [x] Verificação pós-execução: 0 docs no mês e 0 entradas de yieldHistory no mês

### Testes manuais (pendentes)
- [ ] Confirmar visualmente no app: mês 2025-12 zerado (Resumo do mês, Curva de Crescimento, Drawer)

## 2025-12-23 - Edição de Contas Bancárias

### Alterações
- [x] Botão "Editar" adicionado nos cards de contas bancárias (exclui contas de rendimento/investimento).
- [x] Modal de conta reutilizado em modo edição com dados pré-preenchidos.
- [x] Atualização preserva id e histórico (sem criar nova conta).

### Testes manuais (pendentes)
- [ ] Editar uma conta bancária (ex: Sicredi/Cora/Nubank) e confirmar atualização no card.
- [ ] Editar conta "Dinheiro" e confirmar atualização no card.

## 2025-12-23 - Auditoria + Ajuste Manual de Saldo

### Alterações
- [x] Ícone de edição refatorado para botão discreto no canto superior direito dos cards.
- [x] Modal de conta agora permite ajuste de saldo atual com registro em balanceHistory (manual_edit).
- [x] Sistema de auditoria com logs persistentes em `licenses/{licenseId}/auditLogs`.
- [x] Modal de Auditoria com ações do dia (somente leitura).

### Testes manuais (pendentes)
- [ ] Ajustar saldo de uma conta e confirmar atualização imediata.
- [ ] Conferir log de auditoria para ajuste manual de saldo.
- [ ] Editar nome da conta e confirmar log de auditoria.
- [ ] Abrir modal de auditoria e validar ações do dia.

## 2025-12-23 - Bugfix: Ícone de edição + Acesso Auditoria

### Alterações
- [x] Helper `isEditableAccount` normalizado para garantir lápis em todas as contas bancárias/dinheiro.
- [x] Ícone de edição com `z-index` e visibilidade consistente nos cards editáveis.
- [x] Ícone "Auditoria do dia" conectado no header global e na tela de Contas.

### Testes manuais (pendentes)
- [ ] Abrir Contas e ver lápis em todas as contas bancárias/dinheiro.
- [ ] Clicar no lápis e validar modal pré-preenchido.
- [ ] Abrir auditoria pelo header e pela tela de Contas.
- [ ] Se vazio, confirmar mensagem "Nenhuma ação registrada hoje".
- [ ] Editar nome de conta e confirmar log no modal.

## 2025-12-23 - Single-user + Reset 1.0.0

### Alterações
- [x] Removido módulo "Gestão de Usuários" (UI + lógica) e excluídos serviços de members/invites/roles.
- [x] Fluxo de acesso simplificado: usuário autenticado = dono da licença (sem roles/permissões intermediárias).
- [x] Modal de reset com confirmação digitando "RESET".
- [x] Função `resetTenantData(licenseId)` implementada para limpeza total do tenant.
- [x] Firestore rules simplificadas (owner-only).
- [x] Logs de reset em cloud: `[reset-cloud] start/done/error`.

### Execução reset (tenant atual)
- [x] Tenant: `agencia.dk22@gmail.com`
- [x] Coleções removidas (subcoleções encontradas):
  - categories: 2 docs
  - members: 1 doc
- [x] Total deletado (aprox): 3 docs
- [x] Reset executado via rotina administrativa (sem Firestore Console).

### Output resumido (reset admin)
```
[reset-admin] start { licenseId: 'agencia.dk22@gmail.com', subcollections: [ 'categories', 'members' ] }
[reset-admin] deleting { collection: 'licenses/agencia.dk22@gmail.com/categories', topLevelDocs: 2 }
[reset-admin] deleting { collection: 'licenses/agencia.dk22@gmail.com/members', topLevelDocs: 1 }
[reset-admin] complete { totalTopLevel: 3 }
```

### Testes manuais (pendentes)
- [ ] Abrir app e confirmar dashboard vazio (estado 1.0.0).
- [ ] Validar modal de reset com input "RESET".

## 2025-12-23 - Deploy produção (meumeiapp)

### Versão exibida (header)
- [x] v1.0.2-beta+cardsmove • cloud

### Build/Deploy
- [x] npm install
- [x] npm run build
- [x] firebase use meumei-d88be
- [x] firebase hosting:sites:list (confirmado `meumeiapp.web.app`)
- [x] firebase deploy --only hosting:meumeiapp

### Outputs resumidos
```
npm run build
vite v6.4.1 building for production...
dist/assets/index-CRras3LA.js ...
```
```
firebase hosting:sites:list
Site ID: meumeiapp → https://meumeiapp.web.app
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
```

### Observações
- firebase target:list não disponível na CLI atual (erro retornado).
```
Error: target:list is not a Firebase command
```

## 2025-12-23 - Cartões movidos para Faturas

### Alterações
- [x] Removido bloco “Cartões de Crédito” de Configurações.
- [x] Seção “Cartões de Crédito” adicionada em Faturas (listar, criar, editar, remover).
- [x] Modal de cartão movido para Faturas.

### Testes manuais (pendentes)
- [ ] Local: Configurações sem “Cartões de Crédito”.
- [ ] Cloud: Configurações sem “Cartões de Crédito”.
- [ ] Faturas: seção “Cartões de Crédito” aparece.
- [ ] Criar novo cartão e confirmar persistência.
- [ ] Recarregar página e confirmar cartão persistido.

## 2025-12-23 - Hotfix crash Faturas (produção)

### Alterações
- [x] Faturas com fallback defensivo para `creditCards` nulos/indefinidos.
- [x] ErrorBoundary dedicado em Faturas com log `[Faturas] render error`.

### Testes manuais (pendentes)
- [ ] Local: abrir Faturas e confirmar sem crash.
- [ ] Cloud: abrir Faturas e confirmar sem crash.

### Build/Deploy (hotfix)
- [x] npm run build
- [x] firebase use meumei-d88be
- [x] firebase deploy --only hosting:meumeiapp

### Outputs resumidos
```
npm run build
dist/assets/index-BYvgG5iN.js ...
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
```

## Summary of Changes
- Added services for members and invites (beta-only).
- Gate now supports owner (master-only) and active members via uid.
- New Accept Invite screen at `/accept`.
- Settings includes Gestão de Usuários (members + invites).
- Firestore rules updated to allow members/invites while keeping owner fallback.
- BUG 1: categories persisted in Firestore at `licenses/{licenseId}/categories/{type}` with defaults + add/remove (no localStorage).
- BUG 3: yields now persisted in Firestore at `licenses/{licenseId}/yields/{yieldId}` with hybrid legacy merge.

## Checklist (Beta)
- [ ] Owner login OK (beta)
- [ ] Owner membership bootstrap OK
- [ ] Admin convite criado OK
- [ ] Admin aceita convite OK
- [ ] Member acessa dados financeiros OK
- [ ] Member NÃO vê Gestão de Usuários OK
- [ ] Non-member bloqueado OK
- [ ] Produção 1.0.1 não afetada (sem deploy rules restritivas)
- [ ] load categories incomes ok
- [ ] add category incomes persists ok
- [ ] remove category incomes persists ok
- [ ] load categories expenses ok
- [ ] add category expenses persists ok
- [ ] remove category expenses persists ok
- [ ] fallback defaults ok
- [ ] no impact on financial collections ok
- [ ] yields add persists in Firestore ok
- [ ] yields load from Firestore ok
- [ ] yields legacy merge ok
- [ ] yields UI unchanged ok

## Expected Logs
```
[gate] identity
[gate] resolve_license_ok
[gate] license_doc {exists:true}
[gate] master_check {allowed:true/false}
[gate] membership_check {exists:true/false,status}
[members] bootstrap_owner_ok
[invite] create_ok
[invite] accept_ok
[categories] load_start
[categories] load_ok
[categories] add_ok
[categories] remove_ok
[yields] UI_add_click
[yields] add_start
[yields] add_ok
[yields] load_ok
[yields] legacy_preview
[yields] merged_ok
```

## Tracer Categories
- [ ] UI_add_click aparece ao clicar +
- [ ] add_start aparece com path correto `licenses/{licenseId}/categories/incomes`
- [ ] add_ok aparece
- [ ] load_ok após F5 inclui a categoria

## BUG 2 - Remove Categories (incomes/expenses)
- [ ] UI_remove_click aparece
- [ ] remove_start aparece com path correto
- [ ] remove_ok aparece com afterCount = beforeCount - 1
- [ ] F5 → load_ok (status exists) e itemsPreview sem a categoria removida
- [ ] Firestore Console confirma items[] atualizado

## BUG 3 - Yields (Rendimentos)
- [ ] UI_add_click aparece
- [ ] add_start aparece com path correto `licenses/{licenseId}/yields/{yieldId}`
- [ ] add_ok aparece
- [ ] load_ok (source firestore) após F5
- [ ] legacy_preview (source legacy) aparece
- [ ] merged_ok mostra contagem final
- [ ] Firestore Console confirma doc em `licenses/{licenseId}/yields`
- [ ] UI e saldo continuam iguais (accounts atualiza)

### Como testar o tracer
1) Abrir https://meumeiapp.web.app
2) DevTools > Console (filtro `categories`)
3) Abrir Nova Entrada
4) Editar/Nova categoria → digitar `TesteTracer1` → clicar `+`
5) Verificar logs nesta ordem:
   - `[categories] UI_add_click`
   - `[categories] add_start`
   - `[categories] add_ok` (ou `add_err`)
6) Recarregar a página e confirmar `load_ok` com a categoria.

## How to Validate (Firestore Console)
Paths:
- `licenses/{licenseId}/categories/incomes`
- `licenses/{licenseId}/categories/expenses`

Expected fields:
- `type`
- `items`
- `updatedAt`
- `updatedByUid`
- `updatedByEmailNormalized`

## Manual Test (BUG 1)
1) Login with `agencia.dk22@gmail.com`.
2) Open Nova Entrada -> Editar/Nova categoria -> add `Teste Persistência`.
3) Confirm console log `[categories] add_ok` with path `licenses/{licenseId}/categories/incomes`.
4) Check Firestore doc exists and includes the new item.
5) Refresh (F5) -> category still present.
6) Remove the category -> confirm `[categories] remove_ok` and Firestore `items` updated.
7) Repeat with Despesas (`licenses/{licenseId}/categories/expenses`).

## Manual Test (BUG 3)
1) Login with `agencia.dk22@gmail.com`.
2) Abrir Rendimentos -> Novo rendimento -> salvar.
3) Verificar logs:
   - `[yields] UI_add_click`
   - `[yields] add_start` (path `licenses/{licenseId}/yields/{yieldId}`)
   - `[yields] add_ok`
4) Firestore Console: confirmar doc em `licenses/{licenseId}/yields`.
5) Dar F5 com cache desativado:
   - `[yields] load_ok` (source firestore)
   - `[yields] legacy_preview` (source legacy)
   - `[yields] merged_ok`
6) Conferir que o saldo e a UI continuam iguais (accounts atualiza).

## Deploy (Do Not Run Yet)
```
firebase use meumei-d88be
firebase deploy --only hosting,firestore:rules
```

## Deploy Verification (Production)
- Deploy realizado para hosting `meumeiapp`
- Hash local gerado: `index-DMys4KuX.js`
- Hash confirmado no ar pós-deploy: `index-DMys4KuX.js`
- Resultado: match ok

## Login - Visualizar Senha
### Alteracoes
- [x] Toggle de visibilidade da senha no login (Eye/EyeOff) dentro do input.
- [x] Versao do app atualizada: `1.0.2-beta+pwpeek`.

### Testes/Execucao
- [x] `npm run dev` (Vite em http://localhost:3001/).
- [ ] Validacao manual do toggle no login.
- [x] `npm run build` OK (dist/assets/index-jRQvQ-Lj.js).
- [x] `firebase use meumei-d88be`.
- [!] `firebase target:list` nao disponivel na CLI (erro retornado).
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app).

## 2025-12-23 - Hotfix crash isAdmin + ajustes UI
### Alteracoes
- [x] Removida referencia a `isAdmin` em `components/Dashboard.tsx`.
- [x] Log `[dashboard] auth` com email/licenseId/isMaster quando a Dashboard monta.
- [x] Log `[gate] resolved` apos resolver a licenca.
- [x] Log `[cards] view` ao abrir Faturas.
- [x] Toggle de senha no login (olhinho).
- [x] Cartoes continuam apenas na guia Faturas (Settings sem cartoes).

### Testes manuais
- [ ] Login ok com toggle de senha.
- [ ] Dashboard abre sem crash (sem ReferenceError).
- [ ] Configuracoes abre sem crash.
- [ ] Faturas mostra Cartoes de Credito e log `[cards] view`.
- [ ] Produção ok apos deploy.

### Build/Deploy
- [x] `npm run dev` (Vite em http://localhost:3001/).
- [x] `npm run build` OK (dist/assets/index-DNMuk05N.js).
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app).

## 2025-12-23 - Preferencias por tenant (userPreferences)
### Alteracoes
- [x] Preferencias movidas para `licenses/{licenseId}/userPreferences/{normalizedEmail}`.
- [x] Migracao automatica do legado `userPreferences/{email}` para novo path.
- [x] Logs obrigatorios `[prefs] load-start/read-new/read-legacy/migrated/save/error` adicionados.
- [x] Regras Firestore atualizadas para novo path de preferencias.

### Testes manuais
- [x] `npm run dev` (Vite em http://localhost:3001/).
- [ ] Login e ver logs `[prefs]` no console.
- [ ] Firestore: confirmar doc em `licenses/{licenseId}/userPreferences/{normalizedEmail}`.
- [ ] Trocar tema e recarregar: persistencia OK.
- [ ] Confirmar que nao ha gravacoes no path raiz `userPreferences/{email}`.

### Build/Deploy
- [x] `npm run build` OK (dist/assets/index-DKTdeV1c.js).
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app).

## 2025-12-23 - LGPD-first (prefs + suporte + telemetria)
### Alteracoes
- [x] Preferencias migradas para `licenses/{licenseId}/userPreferences/{normalizedEmail}` com seed no primeiro login.
- [x] Leitura do legado `userPreferences/{email}` apenas para migracao (sem escrita).
- [x] Logs `[prefs] load-start/read-new/read-legacy/migrated/save/error` e `[prefs] loaded from licenses/{licenseId}/userPreferences`.
- [x] Regras para dados sensiveis com suporte somente leitura via `supportAccess` (consentimento + expiracao).
- [x] Logs `[support] access granted|denied|expired` adicionados.
- [x] Logs `[rules] sensitive data protected` adicionados.
- [x] Telemetria agregada em `adminMetrics/{licenseId}` (counts + lastActivityAt, sem valores financeiros).

### Testes manuais
- [x] `npm run dev` (Vite em http://localhost:3001/).
- [ ] Console: logs `[prefs]` e `[rules] sensitive data protected`.
- [ ] Firestore: doc em `licenses/{licenseId}/userPreferences/{normalizedEmail}` criado/migrado.
- [ ] Trocar tema e recarregar: persistencia OK.
- [ ] Sem gravacao no root `userPreferences/{email}`.
- [ ] (Suporte) Com `supportAccess` ativo: leituras logam `support_read` em `auditLogs`.

### Build/Deploy
- [x] `npm run build` OK (dist/assets/index-hkJp09AU.js).
- [x] `firebase deploy --only firestore:rules` OK.
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app).

## 2025-12-23 - Field-level encryption (LGPD hardening)
### Alteracoes
- [x] Crypto AES-GCM client-side para campos sensiveis (amount/balance).
- [x] Armazenamento somente encrypted: `amountEncrypted`, `currentBalanceEncrypted`, `initialBalanceEncrypted` e historico.
- [x] Migracao automatica remove campos em claro e grava encrypted (`[crypto][migrate]`).
- [x] Logs `[crypto] encrypt/decrypt field=`, `[lgpd] sensitive value protected`.

### Testes manuais
- [ ] Console: logs `[crypto]` e `[lgpd]`.
- [ ] Firestore Console: campos sensiveis aparecem como blob/base64 (nao em claro).
- [ ] App mostra valores normalmente (saldos, entradas, despesas, rendimentos).
- [ ] Confirmar migracao dos campos antigos (sem `amount`/`currentBalance` em claro).

### Build/Deploy
- [x] `npm run build` OK (dist/assets/index-BLOL_Cta.js).
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app).

## 2025-12-23 - Crypto stability (locked accounts)
### Alteracoes
- [x] Causa raiz: `VITE_CRYPTO_SALT` ausente/inconsistente gerava falha de decrypt e contas sumindo.
- [x] Falha controlada quando `VITE_CRYPTO_SALT` ausente (`[crypto][warn]` + modo protegido).
- [x] `decryptNumber` retorna resultado estruturado e loga sucesso/erro.
- [x] Contas com falha de decrypt permanecem visiveis com `locked: true` e label de protecao.
- [x] UI bloqueia edicao/uso da conta quando `locked`.

### Testes manuais
- [ ] Criar conta, recarregar: conta continua visivel.
- [ ] Se decrypt falhar: conta aparece como "Conta protegida (dados criptografados)".
- [ ] Logs: `[crypto] decrypt success`, `[crypto][error]`, `[ui][account] rendered as locked`.

### Build/Deploy
- [x] `npm run build` OK (dist/assets/index-D9s_lqIT.js).
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app).

## 2025-12-23 - Crypto env guard
### Alteracoes
- [x] `ensureCrypto` nao interrompe o app: retorna status estruturado (sem throw).
- [x] `App.tsx` deixa a UI rodar e exibe aviso de modo protegido quando necessario (sem tela bloqueante).
- [x] Logs `[crypto][status]`, `[app][env]`, `[crypto][warn]`, `[app][guard]`, `[ui][state]` adicionados.
- [x] Guard de build em `vite.config.ts` bloqueia `npm run build` sem `VITE_CRYPTO_SALT`.
- [x] `.env.example` adicionado com instrucoes de salt.

### Checklist
- [ ] PROD abre sem tela pendente quando `VITE_CRYPTO_SALT` configurado no build.
- [ ] DEV sem salt abre com banner e bloqueia writes sensiveis.
- [ ] Logs `[crypto][status]` aparecem no console.
- [ ] ErrorBoundary nao e acionado.
- [ ] Build falha sem salt (guard ativo).

### Build/Deploy
- [x] `npm install` OK.
- [x] `npm run dev` (Vite em http://localhost:3001/, encerrado por timeout 10s).
- [x] `npm run build` falhou como esperado (guard ativo sem `VITE_CRYPTO_SALT`).
- [x] `npm run build` OK com `.env.production.local` (dist/assets/index-_49gzmc5.js).
- [x] `firebase use meumei-d88be`.
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app).

## 2025-12-23 - Crypto recovery epoch
### Alteracoes
- [x] `cryptoEpoch` armazenado em `licenses/{licenseId}` com default 1 (resgate).
- [x] Itens com `cryptoEpoch` diferente do da licença ficam `locked` (epoch mismatch, sem decrypt).
- [x] Payloads novos gravam `cryptoEpoch` e mantem dados legados inalterados.
- [x] UI exibe aviso “Dados anteriores arquivados” e badges “Arquivado”.
- [x] Logs `[crypto][epoch] initialized`, `[crypto][locked] epoch_mismatch`, `[ui][state] recovery mode active`.
- [x] PROD build+deploy com VITE_CRYPTO_SALT presente (valor redacted).
- [x] `loadData` carrega somente a trilha com `cryptoEpoch` (sem double fetch).
- [x] Escritas sensiveis exigem `cryptoEpoch` (blocked quando ausente).
- [x] Fix: `loadData` estava sem `getExpenses`; corrigido.

### Checklist
- [ ] PROD abre com `VITE_CRYPTO_SALT` novo e sem tela pendente.
- [ ] Itens legados sem epoch aparecem como arquivados/locked sem crash.
- [ ] Novos itens criados possuem `cryptoEpoch=1` e operam normal.
- [ ] Nenhuma migracao automatica de legado ocorre.
- [x] loadData carrega accounts/expenses/incomes com `cryptoEpoch`.
- [ ] Writes nao gravam legado (somente com `cryptoEpoch`).
- [ ] Logs `[crypto][epoch] ready` e `[data][load] ok` aparecem.

### Build/Deploy
- [x] `npm run dev` (Vite em http://localhost:3001/, encerrado por timeout 10s).
- [x] `npm run build` OK (dist/assets/index-D4At6Zcw.js).
- [x] `firebase use meumei-d88be`.
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app).

### Logs esperados
```
[crypto][epoch] initialized
[crypto][epoch] ready
[crypto][locked] epoch_mismatch
[crypto][warn] write blocked
[data][load] ok
```

## 2025-12-23 - PWA enablement
### Alteracoes
- [x] `vite-plugin-pwa` adicionado e configurado com `registerType: autoUpdate`.
- [x] Manifesto definido (name, short_name, start_url, display, theme/background colors).
- [x] Service Worker registrado via `registerSW` com logs `[pwa]`.
- [x] Runtime caching: NetworkFirst para navegacao e CacheFirst para assets.
- [x] Runtime caching evita cache agressivo de Firestore/Storage (NetworkOnly).
- [x] Icones PWA adicionados em `public/` (placeholders).

### Checklist
- [x] Manifest gerado (dist/manifest.webmanifest).
- [ ] SW registrado em PROD.
- [ ] App instalavel (Chrome).
- [ ] Auto update funcionando.
- [ ] Offline shell abre (assets + index).
- [x] Firebase deploy ok.

### Logs esperados
```
[pwa] mode
[pwa] sw supported
[pwa] registered
[pwa] offline ready
[pwa] update available
[pwa] updating / reloading
```

### Build/Deploy
- [x] `npm install`
- [x] `npm run dev` (Vite em http://localhost:3001/, encerrado por timeout 10s).
- [x] `npm run build` OK (dist/assets/index-BBdTxLOu.js, manifest + sw gerados).
- [x] `firebase use meumei-d88be`
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run dev
VITE v6.4.1  ready in 93 ms
Local:   http://localhost:3001/
```
```
npm run build
dist/manifest.webmanifest
dist/assets/index-BBdTxLOu.js
PWA v1.2.0
files generated: dist/sw.js, dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-23 - PWA Install Prompt UI

### Alteracoes
- [x] Hook `usePwaInstallPrompt` com captura de `beforeinstallprompt`, flags em localStorage e logs `[pwa][install]`.
- [x] Modal de instalacao com CTA dinamico (Instalar agora / Como instalar) e instrucoes para iOS.
- [x] Botao "Instalar app" em Configuracoes abre o modal manualmente.
- [x] Dismiss (X/Agora nao) grava `pwa_install_dismissed=1` e evita auto abertura.
- [x] Install accepted grava `pwa_install_installed=1` e bloqueia auto abertura.

### Checklist
- [ ] Modal auto aparece apenas uma vez por dispositivo (respeita dismissed).
- [ ] Botao em Configuracoes abre o modal mesmo se dismissed.
- [ ] `beforeinstallprompt` so chama `prompt()` ao clicar no CTA.
- [ ] Outcome logged (`accepted`/`dismissed`).
- [ ] iOS mostra instrucoes quando nao ha BIP.
- [ ] Instalado bloqueia abertura automatica.
- [x] Build/Deploy ok.

### Logs esperados
```
[pwa][install] init
[pwa][install] beforeinstallprompt captured
[pwa][install] modal auto_open
[pwa][install] modal manual_open
[pwa][install] modal close { reason }
[pwa][install] prompt outcome { outcome }
[pwa][install] appinstalled event
```

### Build/Deploy
- [x] `npm install`
- [x] `npm run dev` (Vite em http://localhost:3001/, encerrado por timeout 10s).
- [x] `npm run build` OK (dist/assets/index-Cyp3Crkm.js, manifest + sw gerados).
- [x] `firebase use meumei-d88be`
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run dev
VITE v6.4.1  ready in 85 ms
Local:   http://localhost:3001/
```
```
npm run build
dist/manifest.webmanifest
dist/assets/index-Cyp3Crkm.js
PWA v1.2.0
files generated: dist/sw.js, dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-24 - PWA Install Prompt + Icons

### Alteracoes
- [x] Modal de instalacao com CTA "Instalar" e estado iOS/instrucoes.
- [x] Auto prompt apenas quando instalavel e nao dismissado (localStorage `pwa_install_dismissed_v1`).
- [x] Botao "Instalar app" movido para Preferencias (Dashboard).
- [x] Hook `usePwaInstallPrompt` refeito (fluxo simples e estavel) com logs `[pwa]`.
- [x] Icons PWA gerados a partir de `assets/meumei.png` (public/*).
- [x] Manifesto e index.html atualizados com apple-touch-icon e favicon.
- [x] Script `scripts/generate-pwa-icons.js` (sharp) criado para gerar os assets.

### Checklist
- [ ] Auto prompt aparece 1x em desktop Chrome quando instalavel.
- [ ] Ao fechar, nao aparece mais automaticamente.
- [ ] Botao em Preferencias abre o modal sempre.
- [ ] Instalacao dispara e outcome e logado.
- [ ] iOS mostra instrucoes.
- [ ] Icones aparecem corretos no Dock e tela inicial.
- [ ] Manifest e apple-touch-icon validados no DevTools.
- [x] Build/Deploy ok.

### Logs esperados
```
[pwa] beforeinstallprompt captured
[pwa] prompt result { outcome }
[pwa] auto_open
[pwa] auto_open_skipped { reason }
[pwa] manual_open
[pwa] dismissed
```

### Build/Deploy
- [x] `npm install`
- [x] `npm run dev` (Vite em http://localhost:3001/, encerrado por timeout 10s).
- [x] `npm run build` OK (dist/assets/index-lTmtsy8m.js, manifest + sw gerados).
- [x] `firebase use meumei-d88be`
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run dev
VITE v6.4.1  ready in 117 ms
Local:   http://localhost:3001/
```
```
npm run build
dist/manifest.webmanifest
dist/assets/index-lTmtsy8m.js
PWA v1.2.0
files generated: dist/sw.js, dist/workbox-6296680e.js
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```

## 2025-12-23 - Bugfix TDZ currentView + Login toggle
### Alteracoes
- [x] Corrigido crash "Cannot access 'currentView' before initialization" ao reordenar declaracao de `currentView` antes de uso em hooks.
- [x] Log `[app] AppInner render start` adicionado.
- [x] Log `[app] currentView ready` adicionado.
- [x] Log `[login] render` com `emailPresent`.
- [x] Toggle de visualizar senha mantido isolado no login (sem tocar em `currentView`).

### Testes manuais
- [ ] Localhost: abrir app sem crash (Dashboard / Configuracoes / Faturas).
- [ ] Login: olhinho alterna senha (password/text).
- [ ] Produção: sem crash e login ok.

### Build/Deploy
- [x] `npm run dev` (Vite em http://localhost:3001/).
- [x] `npm run build` OK (dist/assets/index-B286LRNn.js).
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app).

## 2025-12-26 - Crash ao abrir Despesas (TDZ no NewExpenseModal)

### Causa raiz
- [x] Erro ao navegar para Despesas: `ReferenceError: Cannot access 'ee' before initialization` (nao foi possivel capturar stack trace via browser neste ambiente CLI).
- [x] Causa: `NewExpenseModal` usava `isEditing` antes de declarar a const (TDZ) e quebrava quando o componente era renderizado na tela de Despesas.

### Mudancas
- [x] Reordenada a declaracao de `isEditing` para vir antes de `showApplyScope`.

### Repro/observacoes
- [x] `npm run dev` iniciou em http://localhost:3001 (timeout 5s).
- [ ] Clique manual em "Despesas" e captura do stack trace (nao disponivel sem browser).

### Madge (ANTES)
```
npx madge --circular src/components/ExpensesView.tsx
✖ Error: ENOENT: no such file or directory, stat '.../src/components/ExpensesView.tsx'
```
```
npx madge --circular src/components/NewExpenseModal.tsx
✖ Error: ENOENT: no such file or directory, stat '.../src/components/NewExpenseModal.tsx'
```
```
npx madge --circular src/utils/installmentSeries.ts
✖ Error: ENOENT: no such file or directory, stat '.../src/utils/installmentSeries.ts'
```
```
npx madge --circular src/utils/formLabels.ts
✖ Error: ENOENT: no such file or directory, stat '.../src/utils/formLabels.ts'
```
```
npx madge --circular src
✖ Error: ENOENT: no such file or directory, stat '.../src'
```
```
npx madge --circular components/ExpensesView.tsx
✔ No circular dependency found!
```
```
npx madge --circular components/NewExpenseModal.tsx
✔ No circular dependency found!
```
```
npx madge --circular utils/installmentSeries.ts
✔ No circular dependency found!
```
```
npx madge --circular utils/formLabels.ts
✔ No circular dependency found!
```
```
npx madge --circular .
✔ No circular dependency found!
```

### Madge (DEPOIS)
```
npx madge --circular components/ExpensesView.tsx
✔ No circular dependency found!
```

### Checklist
- [ ] Dashboard abre e Despesas abre sem crash (validar no browser).
- [ ] Modal de editar despesa abre com "Salvar alteracoes".
- [ ] Entradas e Rendimentos abrem normalmente.
- [x] Build OK.
- [x] Deploy OK.

### Build/Preview/Deploy
- [x] `npm run dev` (Vite em http://localhost:3001/, timeout 5s).
- [x] `npm run build` OK (dist/assets/index-D7GY8nvm.js, manifest + sw gerados).
- [x] `npm run preview` (http://localhost:4173/, timeout 5s).
- [x] `firebase deploy --only hosting:meumeiapp` OK (https://meumeiapp.web.app)

### Outputs resumidos
```
npm run dev
VITE v6.4.1  ready in 110 ms
Local:   http://localhost:3001/
```
```
npm run build
dist/manifest.webmanifest
dist/assets/index-D7GY8nvm.js
PWA v1.2.0
files generated: dist/sw.js, dist/workbox-6296680e.js
```
```
npm run preview
Local:   http://localhost:4173/
```
```
firebase deploy --only hosting:meumeiapp
hosting[meumeiapp]: release complete
Hosting URL: https://meumeiapp.web.app
```
