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

