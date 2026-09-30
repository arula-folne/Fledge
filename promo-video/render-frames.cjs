#!/usr/bin/env node
/**
 * Render Fledge intro by seeking the HTML timeline and capturing frames.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = __dirname;
const FRAMES = path.join(ROOT, 'frames');
const FPS = 30;
const DURATION = 30;
const TOTAL = FPS * DURATION;
const W = 1920;
const H = 1080;

fs.mkdirSync(FRAMES, { recursive: true });
for (const f of fs.readdirSync(FRAMES)) {
  if (f.endsWith('.png')) fs.unlinkSync(path.join(FRAMES, f));
}

async function main() {
  const fileUrl = 'file://' + path.join(ROOT, 'index.html');
  console.log('Launching Chrome…');
  const browser = await puppeteer.launch({
    executablePath: '/usr/local/bin/google-chrome',
    headless: 'new',
    args: [
      `--window-size=${W},${H}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--hide-scrollbars',
    ],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => window.__READY === true, { timeout: 30000 });
  await page.evaluate(() => window.__setTime(0));
  await new Promise((r) => setTimeout(r, 250));

  const t0 = Date.now();
  for (let i = 0; i < TOTAL; i++) {
    const t = i / FPS;
    await page.evaluate((time) => window.__setTime(time), t);
    const file = path.join(FRAMES, `frame_${String(i).padStart(5, '0')}.png`);
    await page.screenshot({ path: file, type: 'png', omitBackground: false });
    if (i % 30 === 0 || i === TOTAL - 1) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`frame ${i}/${TOTAL} (t=${t.toFixed(2)}s) elapsed=${elapsed}s`);
    }
  }

  await browser.close();
  console.log('Frames done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
