import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist', // Build files into the 'dist' folder
    rollupOptions: {
      input: 'index.html', // Entry point
    },
  },
});