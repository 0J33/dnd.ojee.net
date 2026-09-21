import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Every build gets an id. The bundle carries its own and /version.json says
// which one is live, so a page served from a stale cache can tell (src/freshness.jsx).
const BUILD_ID = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'build-id',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ build: BUILD_ID })}\n` });
      },
    },
  ],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5173 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
});
