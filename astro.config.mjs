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
    allowedDomains: [
      {
        hostname: 'bh.gornog.com',
        protocol: 'https',
        port: '443',
      },
    ],
    checkOrigin: true,
  },
  output: 'server',
  adapter: node({
    mode: 'standalone'
  })
});
