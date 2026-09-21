import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ['bh.gornog.com']
    }
  },
  output: 'server',
  adapter: node({
    mode: 'standalone'
  })
});
