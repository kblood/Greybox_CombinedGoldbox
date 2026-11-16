// Capture every frame of a web ?intro=<route> to PNGs (canvas pixels). Needs a running vite dev server.
// usage: node tools/imggen_capture_intro.mjs <baseUrl> <route> <outDir>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const [base, route, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  // Hook putImageData so we capture the UNSCALED native framebuffer, not the aspect-scaled display canvas.
  await page.evaluateOnNewDocument(() => {
    const orig = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (img, ...r) {
      if (img.width === 320 && img.height === 200) window.__native = [img.width, img.height, Array.from(img.data)];
      return orig.call(this, img, ...r);
    };
  });
  await page.goto(`${base}?intro=${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.__intro || window.__rendered !== undefined', { timeout: 60000 });
  const n = await page.evaluate('window.__intro ? window.__intro.frameCount : 0');
  for (let i = 0; i < n; i++) {
    const nat = await page.evaluate('window.__native');
    if (!nat) throw new Error('no 320x200 putImageData captured');
    writeFileSync(`${outDir}/frame${i}.rgba`, Buffer.from(nat[2]));
    console.log(`frame${i}`, nat[0] + 'x' + nat[1]);
    if (i + 1 < n) await page.evaluate('window.__intro.advance()');
  }
} finally { await browser.close(); }
