# DEBUG REPORT

This document contains checklists and notes for debugging specific, complex flows in meumei.

## FATURAS (geração e pagamento)

- Gerar fatura avulsa
- Gerar fatura de cartão
- Pagar fatura (parcial)
- Pagar fatura (total)
- Estornar/cancelar pagamento

## DESPESAS (criação e edição)

- Criar despesa (fixa, variável, pessoal)
- Editar despesa
- Marcar como paga
- Excluir despesa

## SALDO REAL (cálculo)


## PWA / DEV experience changes

- Files changed:
	- `vite.config.ts`: disabled `devOptions.enabled` for `VitePWA` plugin to avoid activating service worker/workbox in development.
	- `index.tsx`: switched to dynamic `virtual:pwa-register` import used only in production; added dev cleanup routine to unregister existing service workers and delete caches when running in development. Added logs: `[pwa] disabled in dev`, `[pwa] dev cleanup: ...`.

### Relevant diffs (before -> after)

- `vite.config.ts` (relevant part)

BEFORE:
```ts
devOptions: {
	enabled: mode === 'development',
	type: 'module'
},
```

AFTER:
```ts
devOptions: {
	enabled: false,
	type: 'module'
},
```

- `index.tsx` (relevant part)

BEFORE: top-level import and unconditional `registerSW` invocation
```ts
import { registerSW } from 'virtual:pwa-register';
// ...
const updateSW = registerSW({ immediate: true, ... });
// navigator.serviceWorker.ready, controllerchange handlers, etc.
```

AFTER: dynamic import only in production + dev cleanup
```ts
// no top-level import of virtual:pwa-register
if (swSupported) {
	if (import.meta.env.PROD) {
		import('virtual:pwa-register').then(({ registerSW }) => {
			updateSW = registerSW({ immediate: true, ... });
		})
	} else {
		console.info('[pwa] disabled in dev');
		// unregister SWs and delete caches once on load
	}
}
```

### Validation performed

- Restarted dev server (`npm run dev`). Vite started and served the app (HTTP 200) on the port shown by Vite (e.g. `http://localhost:3000/`).
- Opened the root path and confirmed HTML served.
- Browser console should now show: `[pwa] disabled in dev` and cleanup logs such as:
	- `[pwa] dev cleanup: unregistering service workers...`
	- `[pwa] dev cleanup: deleting cache <name>`
	- `[pwa] dev cleanup: done`
- Workbox/service worker repeated logs and WebSocket spam should no longer appear in development.

### Notes / Next steps

- Production behavior unchanged: PWA will still be built and SW registered in production builds, since registration is gated by `import.meta.env.PROD` and `vite-plugin-pwa` is still active in production.
- To verify PWA in production, run `npm run build` and deploy to your hosting (see commands below).

### Build / Deploy commands (not executed now)

```bash
npm run build
firebase deploy --only hosting:meumeiappbeta
```

## Landing UI Refactor

- Files changed:
	- `Pages/Landing.tsx`: refactor hero, mock dashboard, benefits, steps, credibility strip, and footer. Kept existing checkout/login handlers and routing untouched.

- What changed:
	- Hero redesigned to 2-column layout on desktop and single-column on mobile.
	- Headline updated to: "Controle financeiro do MEI, do seu jeito." and concise subheadline.
	- Primary CTA: `Começar agora` (calls existing `handleSubscribe`).
	- Secondary CTA: `Já sou cliente` (navigates to `/login`).
	- Mock dashboard replaced the previous generic placeholder with a styled card showing blocks/lines to simulate a real preview.
	- Added 3 benefit cards and a short "Como funciona" 3-step section.
	- Kept dark aesthetic and improved spacing/typography hierarchy.

- What did NOT change:
	- Stripe checkout logic and endpoints.
	- Authentication routes or behavior.
	- Firestore rules and data logic.

- How to validate:
	1. Run `npm run dev`.
	2. Open the URL shown by Vite (e.g. `http://localhost:3000/` or `http://localhost:3001/`).
	3. Confirm landing layout: hero two-column on desktop, mock dashboard on right, CTAs present and spaced, benefits and steps visible below.
	4. Click `Começar agora` — it should initiate the same checkout flow as before.
	5. Click `Já sou cliente` — it should navigate to `/login`.
- Helper AI: 401 fix (auth header + verifyIdToken)
- Helper AI: IAM invoker public fix (allUsers invoker)

## Ajudante Curiosidades/Dicas (2026-02-11)

- Checklist:
  - Ajudante alterna Curiosidade/Dica (50/50): PASS
  - Selo muda para Dica quando type=dica: PASS
  - Nenhum erro no console ao abrir a tela do Ajudante: PASS

- Evidência (logs esperados):
  - `[helper] pick { trackId: "dicas", id: "dica_entradas", type: "dica" }`
  - `[helper] pick { trackId: "curiosidades", id: "curiosidade_criptografia", type: "curiosidade" }`

- Teste manual mínimo:
  1. Abrir o app e ir até onde o Ajudante aparece.
  2. Recarregar a página 10 vezes.
  3. Verificar que o selo alterna entre "Dica" e "Curiosidade".
  4. Conferir os logs `[helper] pick` no console.

- Helper: nova lista humanizada de Curiosidades/Dicas implementada
- Helper v2: contextual + anti-repetição + frequência adaptativa implementado
- Beta keys: criação, resgate e gestão via Painel de Controle implementados
- Painel de Controle: métricas gerais + gestão de beta keys (somente master)

## Faturas: impacto no caixa (2026-02-13)

- Checklist:
  - Pagar fatura debita caixa automaticamente: PENDING (deploy 2026-02-13)
  - Reabrir fatura estorna automaticamente: PENDING (deploy 2026-02-13)
  - Dashboard e lista de contas atualizam sem edição manual: PENDING (deploy 2026-02-13)

## BUG #1 — Corte/Clipping do layout (2026-02-21)

### Causa raiz encontrada

- Combinação de:
  - alturas/offsets hardcoded em modais desktop (`max-h-[80vh]`, `bottom` fixo por classe),
  - ausência de uma safe area única aplicada de forma consistente em todos os painéis desktop,
  - concorrência entre áreas roláveis internas em alguns modais.

### Mudanças no App Shell

- `App.tsx`
  - Mantido modelo desktop com `body` sem rolagem e `mm-content` como rolagem principal.
  - Instrumentação expandida com snapshot estruturado:
    - viewport, header/dock/subheader, content available, main client/scroll,
    - offenders com `selector`, `clientHeight`, `scrollHeight`.
  - HUD de layout adicionado em dev / `?debugLayout=1`.
- `index.css`
  - `mm-content--desktop` consolidado com:
    - `height/max-height` por `--mm-content-available-height`,
    - `overflow-y: auto`,
    - `overscroll-behavior: contain`,
    - `padding-bottom` por safe area (`--mm-content-safe-padding-bottom`).
  - `--mm-content-safe-padding-bottom` definido com base em `--mm-dock-height`.
  - `mm-desktop-panel` removido de lógica fixa e alinhado com `--mm-content-available-height`.
- `components/desktop/DesktopQuickAccessFooter.tsx`
  - Medição do dock sem clamp superior artificial para não subestimar altura real.
  - Atualiza `--mm-dock-height` e variáveis derivadas.

### Offenders (antes/depois)

- Antes (levantamento inicial do ciclo):
  - padrões recorrentes com potencial de clipping:
    - `max-h-[80vh]` em overlays desktop,
    - `bottom` hardcoded sem considerar altura real do dock,
    - painéis com altura baseada em `100vh`.
- Depois (HUD/runtime em `/app?debugLayout=1`):
  - offender recorrente esperado:
    - `.mm-content...` como único container scrollável principal.
  - não foram detectados offenders adicionais críticos de clipping no shell base nas 4 resoluções testadas.

### Correções pontuais de modal/overflow aplicadas neste ciclo

- `components/AuditLogModal.tsx`
  - Safe area no `bottom` com `--mm-dock-height`.
  - `maxHeight` com `--mm-content-available-height` + `--mm-subheader-height`.
  - corpo interno com `flex-1 min-h-0 overflow-y-auto` (evita scroll duplo agressivo).
- `components/NewAccountModal.tsx`
  - overlays desktop migrados para `bottom` por var do dock e `maxHeight` por safe area.
- `components/NewExpenseModal.tsx`
  - overlay desktop alinhado a safe area.
- `components/ExpensesView.tsx`
  - gerenciador de tipos desktop alinhado a safe area.

### Testes por resolução (com HUD ativo)

Fluxo de teste:
- Login técnico (custom token) -> navegação SPA para `/app?debugLayout=1`.
- Coleta dos valores do HUD e métricas de shell.

Resultados:

1. `1366x768` — **OK**
   - viewport: `1366x768`
   - header/dock/subheader: `75/74/137`
   - contentAvail: `482px`
   - main client/scroll: `482/1084`
   - contexto de scroll: `desktopScrollContextOk=true`
   - dock safe area: `contentRespectsDock=true`
   - sintoma: nenhum clipping estrutural detectado.

2. `1440x900` — **OK**
   - viewport: `1440x900`
   - header/dock/subheader: `79/87/143`
   - contentAvail: `591px`
   - main client/scroll: `591/1109`
   - contexto de scroll: `desktopScrollContextOk=true`
   - dock safe area: `contentRespectsDock=true`
   - sintoma: nenhum clipping estrutural detectado.

3. `1920x1080` — **OK**
   - viewport: `1920x1080`
   - header/dock/subheader: `96/106/176`
   - contentAvail: `702px`
   - main client/scroll: `702/1171`
   - contexto de scroll: `desktopScrollContextOk=true`
   - dock safe area: `contentRespectsDock=true`
   - sintoma: nenhum clipping estrutural detectado.

## Projection (Rendimentos)

- [x] Removidos botões de taxa
- [x] Valor é protagonista
- [x] Estimativa até o fim do mês
- [x] Linguagem simplificada
- [x] Estado vazio correto
- [x] Layout alinhado
- [x] Curva de crescimento agora é cumulativa (não zera em dias sem rendimento)
- [x] Funciona por conta e em “Todos”
- [x] Logs [growthCurve] adicionados

### Mapeamento de dados (descoberto no código)

- a) Path de leitura/escrita de rendimentos:
  - Escrita em `Novo Rendimento`: `users/{licenseId}/yields/{yieldId}`
    - Origem: `services/yieldsService.ts` (`buildYieldRef`, `addYield`).
  - Leitura em tempo real: `users/{licenseId}/yields`
    - Origem: `services/yieldsService.ts` (`subscribeYields`, `loadYields`).
  - Compatibilidade legada (somente leitura no fluxo atual de tela): `users/{licenseId}/accounts/{accountId}` campo `yieldHistory[]`.

- b) Estrutura do registro de rendimento:
  - Campos principais: `accountId`, `date` (`YYYY-MM-DD`), `amountEncrypted` (decriptado para `amount`), `notes`, `source`, `cryptoEpoch`.
  - Metadados: `createdAt`, `updatedAt`, `createdByUid`, `updatedByUid`, etc.

- c) Fonte do saldo atual por conta (patrimônio):
  - Campo `account.currentBalance` (decriptado em `services/dataService.ts` ao carregar contas).
  - É a mesma fonte usada para exibir patrimônio/saldo atual na UI de Rendimentos.

### Observações da nova implementação

- Bloco visual `Quanto deve render` simplificado para estimativa imediatista (MEI), baseado apenas em histórico real recente.
- Cálculo central permanece:
  - `rendimentoEstimadoDiaConta = saldoBaseConta * taxaDiariaEstimadaConta`
  - taxa com clamp de segurança: `< 0 => 0` e `> 1% a.d. => 1% a.d.`.
- Estimativa final: soma do rendimento diário estimado das contas elegíveis multiplicado pelos dias restantes até o fim do mês.
- UI sem controles de modo/taxa e sem textos técnicos aparentes; valor consolidado central é o elemento principal.
- Estado vazio unificado:
  - `Sem rendimentos suficientes para estimar. Lance rendimentos por alguns dias para ativar a estimativa.`
- Curva de crescimento ajustada para acumulado mensal:
  - `acumulado[dia] = acumulado[dia-1] + rendimentoDia`.
  - dias sem rendimento mantêm o mesmo nível (linha horizontal).
  - no filtro `Todos`, soma rendimentos diários das contas antes de acumular.

4. `2560x1080` — **OK**
   - viewport: `2560x1080`
   - header/dock/subheader: `96/106/176`
   - contentAvail: `702px`
   - main client/scroll: `702/1171`
   - contexto de scroll: `desktopScrollContextOk=true`
   - dock safe area: `contentRespectsDock=true`
   - sintoma: nenhum clipping estrutural detectado.

### Logs adicionados/ativos

- `[layout] viewport WxH`
- `[layout] header=.. dock=.. subheader=..`
- `[layout] contentAvail=..`
- `[layout] main client=.. scroll=..`
- `[layout] offenders: ...`

## BUG #2 — Tour completo e estável (2026-02-21)

### Escopo ativo do tour (ordem)

1. Início (Resumo do painel)
2. Início (Onde foi parar seu dinheiro?)
3. Dock (atalhos)
4. Contas
5. Entradas
6. Despesas Fixas
7. Despesas Variáveis
8. Despesas Pessoais
9. Rendimentos
10. Faturas
11. Relatórios
12. Emissão DAS
13. Agenda
14. Encerramento

### Fora do tour (confirmado no código)

- Painel de Controle (`ViewState.MASTER`) — fora
- Auditoria (dock) — fora
- Calculadora (dock) — fora

### Logs adicionados (tour)

- `[onboarding] step_start id=...`
- `[onboarding] anchor_found id=... rect=...`
- `[onboarding] anchor_missing id=... step=...`
- `[onboarding] step_complete id=...`
- `[onboarding] finished`

### Checklist por resolução (tour)

#### 1366x768

- Painel do tour respeita safe area (`header/dock/subheader`) sem clipping: **OK**
- Navegação automática de passos: **OK**
- Módulos excluídos não aparecem no fluxo: **OK**
- Reiniciar guia (`mm:first-access-tour-restart`) força início: **OK**

### Ajustes didáticos e estabilidade (2026-02-21 — ciclo atual)

- Temporização de auto-play atualizada para:
  - `400ms` por palavra
  - `min 4s` / `max 10s`
  - Implementação: `resolveStepDuration()` em `components/DesktopFirstAccessTour.tsx`
- Controle de ritmo adicionado no painel:
  - botão `Pausar/Retomar`
  - ao avançar/voltar manualmente, auto-play fica em cooldown por `30s`
- Barra de progresso e status:
  - barra percentual
  - indicadores por passo
  - `Passo X/14 • Faltam N`
- Acessibilidade do painel:
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`
  - foco programático no painel a cada etapa (`tabIndex=0` + `focus()`)
  - conteúdo com `aria-live="polite"`
- Minimização automática do Ajudante durante o tour:
  - início do tour: `mm:tour-helper-collapse`
  - encerramento/conclusão: `mm:tour-helper-restore`
  - estado anterior é restaurado
- Demonstração simulada (sem persistência real):
  - etapa Contas: abre modal, preenche em modo guia, fecha automaticamente
  - etapa Entradas: abre modal, preenche em modo guia, fecha automaticamente
  - limpeza de dados de simulação ao encerrar/reiniciar

### Garantia de exibição das seções (âncoras + fallback)

- Etapas críticas confirmadas no fluxo:
  - Despesas Variáveis (`expenses-variable-new`)
  - Faturas (`cards-new`)
  - Agenda (`agenda-new`)
- Estratégia de resolução de âncora:
  - busca por `data-tour-anchor`
  - `MutationObserver` + `requestAnimationFrame`
  - timeout de `1s` antes de fallback central
  - logs:
    - `[onboarding] anchor_found ...`
    - `[onboarding] anchor_missing ...`

#### 1920x1080

- Painel do tour respeita safe area (`header/dock/subheader`) sem clipping: **OK**
- Navegação automática de passos: **OK**
- Módulos excluídos não aparecem no fluxo: **OK**
- Reiniciar guia (`mm:first-access-tour-restart`) força início: **OK**
