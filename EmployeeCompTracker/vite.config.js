import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: __dirname,  // Root set to current directory
  build: {
    outDir: 'dist',  // Output directory
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src', 'index.html'),  // Absolute path to src/index.html
      },
    },
  },
});