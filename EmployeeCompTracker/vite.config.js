import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist', // Build files into the 'dist' folder
    rollupOptions: {
      input: 'src/index.html', // Entry point
    },
  },
});