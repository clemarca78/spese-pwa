import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(new Date().toISOString()) },
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Spese',
        short_name: 'Spese',
        lang: 'it',
        display: 'standalone',
        start_url: '.',
        background_color: '#2457d6',
        theme_color: '#2457d6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'jsdom', include: ['tests/**/*.test.{ts,tsx}'] },
});
