#!/usr/bin/env node
/**
 * Regenerates the screenshots used by the README.
 *
 * Requires a running Cadence instance (`npm run dev`) and a local Chrome.
 *   node scripts/capture-docs.mjs
 *   BASE_URL=http://localhost:3000 CHROME_PATH=/path/to/chrome node scripts/capture-docs.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT_DIR = path.join(ROOT, 'docs', 'screenshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const CHROME_PATH =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome');

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickByText(page, text) {
  const clicked = await page.evaluate((needle) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find((button) => button.textContent?.trim().includes(needle));
    if (!target) return false;
    target.click();
    return true;
  }, text);
  if (!clicked) {
    throw new Error(`No button containing "${text}" found.`);
  }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: VIEWPORT,
    args: [
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--no-proxy-server',
      '--proxy-bypass-list=*',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('[data-testid="diarized-transcript-section"]', { timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    await wait(600);

    await page.screenshot({ path: path.join(OUTPUT_DIR, 'workspace.png') });
    console.log('captured workspace.png');

    // Scroll the transcript / coaching split into view.
    await page.evaluate(() => {
      const transcript = document.querySelector('[data-testid="diarized-transcript-section"]');
      if (transcript) {
        const top = transcript.getBoundingClientRect().top + window.scrollY - 96;
        window.scrollTo({ top, behavior: 'instant' });
      }
    });
    await wait(400);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'transcript.png') });
    console.log('captured transcript.png');

    // Team overview.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await clickByText(page, 'Overview');
    await wait(600);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'overview.png') });
    console.log('captured overview.png');

    // Ingestion modal, on top of the call workspace.
    await clickByText(page, 'Call Detail');
    await wait(400);
    await clickByText(page, 'New Call');
    await wait(600);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'ingest.png') });
    console.log('captured ingest.png');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
