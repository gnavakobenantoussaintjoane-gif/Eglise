import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * Adresse de l'API.
 *
 * `127.0.0.1` et non `localhost` : depuis Node 18, `localhost` peut resoudre en
 * IPv6 (`::1`) alors que l'API ecoute en IPv4 (`0.0.0.0`). Sous Windows, cela
 * produit des `ECONNREFUSED` alors que le serveur tourne. L'adresse explicite
 * supprime cette ambiguite.
 */
const apiTarget = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:4000';

/**
 * Message unique et lisible quand l'API n'est pas lancee.
 *
 * Sans cela, Vite repete la meme pile d'appels a chaque requete (une dizaine
 * par page), ce qui noie l'information utile.
 */
let apiDownNoticeShown = false;

function apiUnavailable(err: Error) {
  if (apiDownNoticeShown) return;
  apiDownNoticeShown = true;
  const lines = [
    '',
    '  ┌──────────────────────────────────────────────────────────────┐',
    '  │  API injoignable sur ' + apiTarget.padEnd(39) + '│',
    '  └──────────────────────────────────────────────────────────────┘',
    '  Les pages resteront vides tant que l\'API ne tourne pas.',
    '',
    '  Solution la plus simple, depuis la RACINE du projet :',
    '      npm run dev',
    '',
    '  Ou deux terminaux separes :',
    '      npm run dev:backend     (API, port 4000)',
    '      npm run dev:frontend    (interface, port 3000)',
    '',
    '  Diagnostic complet :  npm run doctor',
    '',
  ];
  console.warn(lines.join('\n'));
  if (process.env.DEBUG_API_PROXY) console.warn(err);
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    // Autorise les hotes de previsualisation (proxy Arena *.e2b.app)
    allowedHosts: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true, configure: (proxy) => proxy.on('error', apiUnavailable) },
      '/files': { target: apiTarget, changeOrigin: true, configure: (proxy) => proxy.on('error', apiUnavailable) },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
