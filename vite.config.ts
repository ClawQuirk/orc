import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  // Load .env file so PORT and BACKEND_PORT are available
  const env = loadEnv(mode, process.cwd(), '');
  const frontendPort = parseInt(env.PORT || process.env.PORT || '5173', 10);
  const backendPort = parseInt(env.BACKEND_PORT || process.env.BACKEND_PORT || '3001', 10);

  return {
    plugins: [react(), vue()],
    server: {
      port: frontendPort,
      strictPort: true, // Don't auto-increment — fail if port is taken
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
  };
});
