<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1vemEpPR1hEVwjLKTXoJas2l0CYQFPeXr

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Configure crypto salt (required for encrypted data):
   - Copy `.env.example` to `.env.local`
   - Set `VITE_CRYPTO_SALT` to the same value used in production
   - **Do not** commit `.env.local` or `.env.production.local`
3. Create/adjust your Firebase web config in `src/services/firebase.ts` (same values for dev/prod).
4. Run the app:
   `npm run dev`

## Deploy to Firebase Hosting

```
cd ~/Downloads/meumei
npm install
cp .env.example .env.production.local
# Set VITE_CRYPTO_SALT in .env.production.local (must match existing production salt)
# Do not commit .env.production.local
npm run build
firebase deploy --only hosting
```

## Administrative scripts

- **Migrar a licença legada T7aV-qP2r-9ZgH para o login agencia.dk22@gmail.com**  
  1. Abra o terminal do VS Code com o projeto carregado e navegue até o repositório:
     ```
     cd /Users/alekamers/Downloads/meumei-1.0.1-local - cópia/meumei beta 1.0.2
     npm install
     ```
  2. Executar a migração em modo dry-run (padrão, apenas lista o que seria copiado):
     ```
     npm run migrate:license-to-email
     ```
  3. Se o dry-run estiver ok, aplicar as mudanças reais:
     ```
     npm run migrate:license-to-email -- --apply
     ```
  > O script usa Application Default Credentials (gcloud auth já configurado) e não apaga nada em `licenses/T7aV-qP2r-9ZgH`.

> O script utiliza Firebase Admin. Configure `FIREBASE_SERVICE_ACCOUNT` ou `GOOGLE_APPLICATION_CREDENTIALS` antes de executá-lo.
