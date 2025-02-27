/*import { defineConfig } from 'vite';

export default defineConfig({
 base: "/Burness/",

 build: {
   rollupOptions: {
    input: {
        app: './src/index.html',
    },
   },
   outDir: '../dist'
 }
});*/
import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist', // Output directory for Vite build
    rollupOptions: {
      input: 'src/index.html', // Entry point for the app
    },
  },
  plugins: [
    {
      name: 'log-output-dir',
      closeBundle() {
        // Print the full directory structure after the build is complete
        const outputDir = path.resolve(__dirname, 'dist');
        console.log('Vite build completed. Full directory structure:');
        fs.readdirSync(outputDir).forEach((file) => {
          const filePath = path.join(outputDir, file);
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            console.log(`Directory: ${filePath}`);
            fs.readdirSync(filePath).forEach((subfile) => {
              console.log(`  ${subfile}`);
            });
          } else {
            console.log(`File: ${filePath}`);
          }
        });
      },
    },
  ],
});