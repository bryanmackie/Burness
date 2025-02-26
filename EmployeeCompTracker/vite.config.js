import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,  // Set to the current working directory explicitly
  build: {
    outDir: 'dist',  // The output directory
    rollupOptions: {
      input: {
        main: 'src/index.html',  // The entry point for your HTML file
      },
    },
    // Make sure index.html gets output to dist/
    html: {
      inject: {
        // You can also inject environment variables or scripts here if needed
      },
    },
  },
});