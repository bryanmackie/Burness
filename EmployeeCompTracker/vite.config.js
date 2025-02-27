import { defineConfig } from 'vite';

export default defineConfig({
 base: "/Burness/",

 build: {
   rollupOptions: {
    input: {
        app: 'src/index.html',
    },
   },
   outDir: '../dist'
 }
});