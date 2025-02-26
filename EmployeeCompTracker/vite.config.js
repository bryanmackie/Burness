import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,  // Set to the current working directory explicitly
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'src/index.html',  // Point to the index.html file in the 'src' folder
      },
    },
  },
});
