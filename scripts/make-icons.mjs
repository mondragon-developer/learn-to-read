// Renders public/icon.svg to the PNG sizes iOS and the manifest need (uses Playwright's Chromium).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const render = async (file, size, pad = 0) => {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - pad * 2;
  await page.setContent(`<body style="margin:0;background:#1F7A4D"><div style="padding:${pad}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`);
  await page.screenshot({ path: `public/${file}`, omitBackground: false });
};
await render('pwa-192.png', 192);
await render('pwa-512.png', 512);
await render('apple-touch-icon.png', 180);
await render('favicon-32.png', 32);
// Maskable: art inside the middle 80% so Android's mask never crops it.
await render('maskable-512.png', 512, 51);
await browser.close();
console.log('icons written');
