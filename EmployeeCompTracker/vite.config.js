import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',  // Point to the 'src' folder for your frontend files
  build: {
    outDir: '../dist',  // Output the build files into the 'dist' folder at the root
    rollupOptions: {
      input: {
        main: 'src/index.html',  // Entry HTML file in the 'src' folder
      },
    },
  },
});