import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';

const frontendPort = parseInt(process.env.PORT || '5173', 10);
const backendPort = parseInt(process.env.BACKEND_PORT || '3001', 10);

export default defineConfig({
  plugins: [react(), vue()],
  server: {
    port: frontendPort,
    proxy: {
      '/ws': {
        target: `ws://localhost:${backendPort}`,
        ws: true,
      },
      '/api': {
        target: `http://localhost:${backendPort}`,
      },
    },
  },
});
