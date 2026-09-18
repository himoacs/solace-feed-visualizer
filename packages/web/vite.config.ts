import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Not Vite's own well-known default (5173) - avoids colliding with any
    // other Vite app already running on a workshop laptop.
    port: 4300,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4001',
    },
  },
});
