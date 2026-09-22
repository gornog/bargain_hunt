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
  security: {
    allowedDomains: ['bh.gornog.com'],
    checkOrigin: true,
  },
  output: 'server',
  adapter: node({
    mode: 'standalone'
  })
});
