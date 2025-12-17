import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'service-worker.js', dest: '' },
        { src: 'manifest.json', dest: '' }
      ]
    })
  ],
  // ADD THIS: This helps Vite find your folders regardless of where the file is
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@screens': path.resolve(__dirname, './screens'),
    },
  },
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // ADD THIS: Ensures the build doesn't fail on small warnings
    minify: 'esbuild',
  }
});