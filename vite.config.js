import { defineConfig } from 'vite'

// Root-level config so Vite actually loads it (see public/vite.config.js,
// which is NOT auto-discovered by Vite and has no effect).
// This only adds a dev-server proxy for api/*.js (Vercel functions,
// served locally by scripts/dev-api-server.mjs — run alongside `vite`
// via `npm run dev:api`) — it deliberately does not touch the
// PWA/plugin setup in public/vite.config.js.
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.DEV_API_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
})
