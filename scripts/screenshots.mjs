// Builds nothing itself: run `npm run build` first. Serves dist/ with `vite preview`,
// then captures README screenshots, PWA manifest screenshots and the Open Graph image.
// Usage: npm run build && npm run screenshots
import { mkdir } from 'node:fs/promises';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'silent' });
const base = 'http://localhost:4179/';
const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath });
await mkdir('docs/screenshots', { recursive: true });
await mkdir('public/screenshots', { recursive: true });

async function shot({ name, width, height, dpr = 1, scheme = 'light', wait = 9000, query = '', mobile = false, extra }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    colorScheme: scheme,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await ctx.newPage();
  await page.goto(base + query);
  await page.waitForTimeout(wait);
  if (extra) await extra(page);
  for (const path of [].concat(name)) await page.screenshot({ path });
  console.log('wrote', name);
  await ctx.close();
}

const fast = (count, thenTab) => async (page) => {
  if (await page.isVisible('#tab-learn')) await page.click('#tab-learn');
  await page.click(`[data-fast="${count}"]`);
  if (thenTab && (await page.isVisible('#tab-simulate'))) await page.click(`#tab-${thenTab}`);
  await page.waitForTimeout(600);
};

await shot({
  name: ['docs/screenshots/desktop-light.png', 'public/screenshots/desktop.png'],
  width: 1440,
  height: 900,
  query: '?autoplay=1',
  wait: 14000,
});
await shot({
  name: 'docs/screenshots/desktop-dark.png',
  width: 1440,
  height: 900,
  scheme: 'dark',
  query: '?rows=16&autoplay=1',
  wait: 15000,
});
await shot({
  name: ['docs/screenshots/mobile-portrait.png', 'public/screenshots/mobile.png'],
  width: 390,
  height: 844,
  dpr: 2,
  mobile: true,
  query: '?autoplay=1',
  wait: 12000,
});
await shot({
  name: 'docs/screenshots/mobile-dark-fast.png',
  width: 390,
  height: 844,
  dpr: 2,
  mobile: true,
  scheme: 'dark',
  query: '?rows=14&bias=0.6',
  wait: 400,
  extra: fast(100000, 'simulate'),
});
await shot({
  name: 'docs/screenshots/mobile-learn.png',
  width: 390,
  height: 844,
  dpr: 2,
  mobile: true,
  query: '?rows=12',
  wait: 400,
  extra: fast(10000),
});
await shot({ name: 'public/og-image.png', width: 1200, height: 630, query: '?autoplay=1', wait: 14000 });

await browser.close();
await server.close();
