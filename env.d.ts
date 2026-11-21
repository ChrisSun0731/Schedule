/**
 * Environment variables exposed to the client (prefix VITE_, see quasar.config.ts > build > env).
 * Set them in `.env.local` for development or as GitHub Actions secrets for deployment.
 * Quasar CLI parses values ("true" → boolean, digits → number); read them with envString().
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string | number | boolean;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string | number | boolean;
  readonly VITE_FIREBASE_PROJECT_ID?: string | number | boolean;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string | number | boolean;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string | number | boolean;
  readonly VITE_FIREBASE_APP_ID?: string | number | boolean;
  readonly VITE_FIREBASE_FUNCTIONS_REGION?: string | number | boolean;
  readonly VITE_USE_EMULATORS?: string | number | boolean;
  readonly VITE_EMAIL_PROVIDER?: string | number | boolean;
  readonly VITE_EMAILJS_SERVICE_ID?: string | number | boolean;
  readonly VITE_EMAILJS_TEMPLATE_ID?: string | number | boolean;
  readonly VITE_EMAILJS_PUBLIC_KEY?: string | number | boolean;
}
