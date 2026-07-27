// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-07-19',
  future: {
    compatibilityVersion: 3,
  },
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  // Nuxt 3.21/Vite 7 tries to resolve the server-only #app-manifest alias
  // in the browser transform. This app does not need client route manifests.
  experimental: {
    appManifest: false,
  },

  ssr: true,

  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxt/icon',
    'nuxt-auth-utils',
  ],

  nitro: {
    // The project is run with Bun locally, so the production artifact must use
    // Bun export conditions as well (not Nitro's default Node preset).
    preset: 'bun',
    routeRules: {
      '/**': {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'X-Permitted-Cross-Domain-Policies': 'none',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; upgrade-insecure-requests",
        },
      },
    },
  },

  // Variables d'environnement runtime
  runtimeConfig: {
    // Session (nuxt-auth-utils utilise NUXT_SESSION_PASSWORD)
    session: {
      password: process.env.NUXT_SESSION_PASSWORD || '',
    },
    // Base de données SQLite locale
    dbPath: process.env.DB_PATH || './data/bitlock.db',
    // App URL
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    // Public
    public: {
      appName: 'BitLock',
    },
  },

  tailwindcss: {
    cssPath: '~/assets/css/main.css',
  },

  // Passing the preset prevents cssnano/lilconfig from walking into unrelated
  // parent package.json files during Windows production builds.
  postcss: {
    plugins: {
      cssnano: { preset: 'default' },
    },
  },

  imports: {
    dirs: ['composables/**'],
  },

  app: {
    head: {
      title: 'BitLock - Votre coffre-fort numérique',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'BitLock - Stockez vos mots de passe, liens et clés crypto en toute sécurité avec un chiffrement zero-knowledge.' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/bitlock-logo.svg' },
        { rel: 'shortcut icon', type: 'image/svg+xml', href: '/bitlock-logo.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-v2.png' },
      ],
    },
  },
})
