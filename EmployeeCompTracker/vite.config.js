import { defineConfig } from 'vite';

export default defineConfig({
  root: './',  // Serve from the root directory
  build: {
    outDir: './dist',  // Build files into the 'dist' folder
    rollupOptions: {
      input: {
        main: 'src/index.html',  // Entry HTML file in the 'src' folder
      },
    },
  },
});
