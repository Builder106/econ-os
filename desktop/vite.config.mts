import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// ECONOS_KERNEL_WS_URL points the static build at a remote kernel (the Vercel deploy).
// Left empty, the desktop connects to the host that served it (the standalone image).
const kernel = (process.env.ECONOS_KERNEL_WS_URL ?? '').trim();
// The dev server proxies a local kernel; ECONOS_DEV_KERNEL moves it off port 8000.
const dev = (process.env.ECONOS_DEV_KERNEL ?? '127.0.0.1:8000').trim();

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: {
    __KERNEL_WS_URL__: JSON.stringify(kernel),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    proxy: {
      '/ws': { target: `ws://${dev}`, ws: true },
      '/healthz': `http://${dev}`,
      '/state': `http://${dev}`,
      '/export': `http://${dev}`,
    },
  },
});
