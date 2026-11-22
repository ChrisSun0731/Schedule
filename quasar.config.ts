// Quasar CLI (Vite) configuration
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file
//
// GitHub Pages notes
// - Hash routing (`#/schedule`) means deep links work without a 404.html fallback.
// - PUBLIC_PATH is set by .github/workflows/deploy.yml to "/<repo-name>/" for project pages.
//   Leave it unset for a user/organisation page or a custom domain.

import { defineConfig } from '#q-app';

export default defineConfig(() => ({
  boot: ['ui', 'auth'],

  css: ['app.scss'],

  extras: ['material-icons'],

  build: {
    target: {},

    typescript: {
      strict: true,
      vueShim: true,
      extendTsConfig(tsConfig) {
        tsConfig.compilerOptions = {
          ...tsConfig.compilerOptions,
          // Firestore documents use many optional fields; this flag adds noise without real safety here.
          exactOptionalPropertyTypes: false,
        };
        // Cloud Functions have their own package.json / tsconfig.
        tsConfig.exclude = [...(tsConfig.exclude ?? []), './../functions'];
      },
    },

    vueRouterMode: 'hash',
    publicPath: process.env.PUBLIC_PATH || '/',

    env: {
      // Only VITE_* variables (from .env files or CI secrets) are exposed to the browser bundle.
      // Firebase web config values are public identifiers, not secrets.
      clientPrefix: 'VITE_',
    },
  },

  devServer: {
    open: false,
  },

  framework: {
    config: {
      notify: { position: 'top', timeout: 2500 },
      // Follow the OS light/dark setting; there is deliberately no in-app appearance switch.
      dark: 'auto',
    },
    lang: 'zh-TW',
    iconSet: 'material-icons',
    plugins: ['Notify', 'Dialog', 'Loading'],
  },

  animations: [],
}));
