import { defineConfig } from 'vite';

export default defineConfig({
 base: "/Burness/",
 root: "/src",
 build: {
   rollupOptions: {
    input: {
        app: './src/index.html',
    },
   },
   outDir: '../dist'
 }
});