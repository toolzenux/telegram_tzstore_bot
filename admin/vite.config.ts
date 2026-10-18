import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: {
    outDir: path.resolve(__dirname, '../public/admin'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/webhooks': 'http://localhost:3000',
      '/logos': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
      '/tz-api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/tz-api/, '/api') },
    },
  },
  preview: { port: 5173 },
});
