import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { headerCheckMiddleware } from './server/headerCheck.ts';

const HOST = '127.0.0.1';
const DEV_PORT = 5173;
const PREVIEW_PORT = 4173;

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'none'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// Development differs from preview only by the hot-reload connection: the Vite
// client opens a WebSocket to this loopback port.
export const DEV_CSP = PREVIEW_CSP.replace(
  "connect-src 'self'",
  `connect-src 'self' ws://${HOST}:${DEV_PORT}`,
);

// The browser cannot read another site's response headers, so the loopback
// server fetches them. Static hosting has no such endpoint.
function headerCheck(): Plugin {
  return {
    name: 'parapet-header-check',
    configureServer(server) {
      server.middlewares.use(headerCheckMiddleware(`${HOST}:${DEV_PORT}`));
    },
    configurePreviewServer(server) {
      server.middlewares.use(headerCheckMiddleware(`${HOST}:${PREVIEW_PORT}`));
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), headerCheck()],
  server: {
    host: HOST,
    port: DEV_PORT,
    strictPort: true,
    hmr: { protocol: 'ws', host: HOST, port: DEV_PORT, clientPort: DEV_PORT },
    headers: { ...BASE_HEADERS, 'Content-Security-Policy': DEV_CSP },
  },
  preview: {
    host: HOST,
    port: PREVIEW_PORT,
    strictPort: true,
    headers: { ...BASE_HEADERS, 'Content-Security-Policy': PREVIEW_CSP },
  },
  build: {
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
});
