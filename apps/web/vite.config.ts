import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, '../../', 'VITE_');
  return {
    envDir: '../..',
    base: environment.VITE_BASE_PATH || '/',
    plugins: [react()],
    build: {
      sourcemap: true,
      target: 'es2022',
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      host: '127.0.0.1',
      port: 4173,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
    },
  };
});
