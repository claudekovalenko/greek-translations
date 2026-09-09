#!/usr/bin/env node
// Renders icons/icon.svg and icons/maskable.svg to the PNG sizes the manifest
// needs, using the Chromium that ships with Playwright.
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../icons/', import.meta.url);
const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon.svg', 'apple-touch-icon.png', 180],
  ['maskable.svg', 'maskable-512.png', 512],
];
const browser = await chromium.launch();
for (const [src, out, size] of jobs) {
  const svg = await readFile(new URL(src, root), 'utf8');
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.locator('svg').screenshot({ path: new URL(out, root).pathname, omitBackground: true });
  await page.close();
  console.log(`${out} ${size}px`);
}
await browser.close();
