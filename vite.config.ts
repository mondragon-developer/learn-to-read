import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

const src = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@domain': src('./src/domain'),
      '@ui': src('./src/ui'),
      '@data': src('./src/data'),
      '@platform': src('./src/platform'),
    },
  },
  build: {
    rollupOptions: {
      // spike.html is the M1 device check page; it ships so it can be opened on the real iPad/iPhone.
      input: { main: src('./index.html'), spike: src('./spike.html') },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Goal Reader',
        short_name: 'Goal Reader',
        description: 'Five minutes a day of reading practice: sounds, words, stories.',
        theme_color: '#1F7A4D',
        background_color: '#F3F8EF',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Separate entry: a maskable icon needs its art inside the middle 80% or Android crops it.
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // App shell, content and every audio clip are precached so a session runs with no network.
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2,mp3}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
