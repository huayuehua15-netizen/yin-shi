#!/usr/bin/env node
/**
 * Browser-level end-to-end checks.
 *
 * The HTTP smoke test proves the API contract; it cannot prove that a person
 * can actually ingest a call, filter the library, bookmark a turn, flip the
 * next-step state, delete a call, open the overview, or that the layout holds
 * at six widths. This script boots the real production build against a throw
 * away data directory, drives the UI in a local Chrome, and asserts exactly
 * those behaviours.
 *
 *   npm run build
 *   npm run e2e
 *
 * Optional environment variables:
 *   E2E_PORT=3197             port for the throwaway server
 *   CHROME_PATH=/path/to/chrome
 *   E2E_KEEP_DATA=1           keep the temporary data directory for debugging
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 3197);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 900, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

const NEW_CALL = {
  title: 'E2E Pilot — Renewal Risk Review',
  account: 'Meridian Labs',
  transcript: [
    'Rep: Thanks for making time today. I want to focus on the renewal timeline and the two blockers from last quarter.',
    'Prospect: The blocker is still the security review, and finance wants a clear number for the seat expansion.',
    'Rep: Understood. If we lock the security questionnaire today, can you commit to a decision before the December freeze?',
    'Prospect: I can commit to routing it, but I cannot promise the approval date. Our CISO is travelling until Friday.',
    'Rep: Fair. Let me send the questionnaire now and book thirty minutes on Friday to walk through it together.',
  ].join('\n'),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
let currentServer = null;
const externalFailures = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`FAIL  ${name} -> ${error.message}`);
  }
}

async function waitFor(predicate, label, timeoutMs = 8000, interval = 120) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw new Error(
    `${label} did not happen within ${timeoutMs}ms${lastError ? ` (${lastError.message})` : ''}`
  );
}

function resolveChrome() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) {
      throw new Error(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
    }
    return process.env.CHROME_PATH;
  }
  const candidates = {
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/opt/google/chrome/chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ],
  }[process.platform];

  const found = (candidates ?? []).find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      'Chrome was not found. Install Google Chrome or set CHROME_PATH to its executable.'
    );
  }
  return found;
}

async function startServer(dataDir) {
  const logs = [];
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      CADENCE_PROVIDER: 'local',
      CADENCE_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const capture = (chunk) => {
    logs.push(String(chunk));
    if (logs.length > 80) logs.shift();
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  currentServer = { child, logs };

  await waitFor(
    async () => {
      const response = await fetch(`${BASE_URL}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      return response.ok;
    },
    'server health',
    45_000,
    250
  ).catch((error) => {
    throw new Error(`${error.message}\n--- server output ---\n${logs.join('')}`);
  });
  return currentServer;
}

async function clickButtonByText(page, text, { exact = true } = {}) {
  const clicked = await page.evaluate(
    ({ needle, exactMatch }) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find((button) => {
        const label = (button.textContent ?? '').replace(/\s+/g, ' ').trim();
        return exactMatch ? label === needle : label.includes(needle);
      });
      if (!target) return false;
      target.click();
      return true;
    },
    { needle: text, exactMatch: exact }
  );
  if (!clicked) {
    throw new Error(`No button with text ${exact ? 'exactly' : 'containing'} "${text}" was found.`);
  }
}

async function listCalls() {
  const response = await fetch(`${BASE_URL}/api/calls`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`GET /api/calls responded ${response.status}`);
  const body = await response.json();
  return body.calls ?? [];
}

async function sidebarTitles(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Sales call library"]');
    if (!nav) return [];
    return Array.from(nav.querySelectorAll('button[title]')).map(
      (button) => button.getAttribute('title').split(' · ')[0]
    );
  });
}

/**
 * React tracks input values on the DOM node, so assigning `value` directly is
 * ignored. Go through the native setter, dispatch the event React listens for,
 * and let the re-render settle.
 */
async function clearLibrarySearch(page) {
  await page.evaluate(() => {
    const input = document.querySelector('#sidebar-call-search');
    if (!(input instanceof HTMLInputElement)) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function main() {
  if (!existsSync(DIST_INDEX)) {
    throw new Error('dist/index.html is missing. Run `npm run build` before `npm run e2e`.');
  }

  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cadence-e2e-'));
  await startServer(dataDir);

  const chromePath = resolveChrome();
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    defaultViewport: VIEWPORTS[0],
    args: ['--disable-gpu', '--hide-scrollbars', '--no-proxy-server', '--proxy-bypass-list=*'],
  });

  const consoleErrors = [];
  const apiFailures = [];
  let page;

  try {
    page = await browser.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() < 500) return;
      apiFailures.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.startsWith('http://127.0.0.1')) {
        apiFailures.push(`request failed ${url} (${request.failure()?.errorText ?? 'unknown'})`);
      } else if (!url.startsWith('data:')) {
        externalFailures.push(`${url} (${request.failure()?.errorText ?? 'unknown'})`);
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await check('shell renders the workspace', async () => {
      await page.waitForSelector('[data-testid="diarized-transcript-section"]', {
        timeout: 20_000,
      });
      await page.waitForSelector('[data-testid="coaching-card-section"]', { timeout: 10_000 });
      await page.waitForSelector('[data-testid="sentiment-chart-svg"]', { timeout: 10_000 });
      const title = await page.$eval('main h1', (element) => element.textContent.trim());
      if (!title.includes('Q4 Enterprise Renewal')) {
        throw new Error(`unexpected first call title: ${title}`);
      }
      const brand = await page.$eval('aside span.font-display', (element) =>
        element.textContent.trim()
      );
      if (brand !== 'Cadence') throw new Error(`unexpected brand: ${brand}`);
    });

    await check('library lists the three seeded calls', async () => {
      const titles = await sidebarTitles(page);
      if (titles.length !== 3) throw new Error(`expected 3 calls, found ${titles.length}`);
      const searchBox = await page.$('#sidebar-call-search');
      if (!searchBox) throw new Error('library search box is missing for a 3-call library');
    });

    await check('ingest a call through the Paste Text flow', async () => {
      await page.click('button[aria-label="New Call"]');
      await page.waitForSelector('#upload-call-modal-title', { timeout: 10_000 });
      await clickButtonByText(page, 'Paste Text');
      await page.waitForSelector('#paste-transcript-input', { timeout: 5000 });
      await page.type('#paste-transcript-input', NEW_CALL.transcript);
      await page.type('#call-title-input', NEW_CALL.title);
      await page.type('#account-name-input', NEW_CALL.account);
      await page.waitForFunction(() => {
        const submit = Array.from(document.querySelectorAll('button')).find(
          (button) =>
            (button.textContent ?? '').replace(/\s+/g, ' ').trim() === 'Analyze Sales Call'
        );
        return Boolean(submit) && !submit.disabled;
      });
      await clickButtonByText(page, 'Analyze Sales Call');
      await waitFor(
        () => page.evaluate(() => !document.querySelector('#upload-call-modal-title')),
        'ingest modal to close',
        20_000
      );
      await waitFor(
        () =>
          page.evaluate(
            (title) => document.querySelector('main h1')?.textContent.trim() === title,
            NEW_CALL.title
          ),
        'new call to become active',
        10_000
      );
      const titles = await sidebarTitles(page);
      if (titles.length !== 4)
        throw new Error(`expected 4 calls after ingest, found ${titles.length}`);
      if (!titles.includes(NEW_CALL.title)) throw new Error('new call missing from the library');
    });

    await check('ingest persisted through the API', async () => {
      const calls = await listCalls();
      const created = calls.find((call) => call.title === NEW_CALL.title);
      if (!created) throw new Error('POST /api/calls did not persist the new call');
      if (!Array.isArray(created.transcript) || created.transcript.length < 3) {
        throw new Error(`expected at least 3 transcript turns, got ${created.transcript?.length}`);
      }
      if (created.coaching?.strengths?.length < 3) {
        throw new Error('coaching card has fewer than 3 strengths');
      }
      if (typeof created.durationSec !== 'number' || created.durationSec <= 0) {
        throw new Error('durationSec was not computed');
      }
    });

    await check('library search filters and clears', async () => {
      await page.click('#sidebar-call-search', { clickCount: 3 });
      await page.type('#sidebar-call-search', 'Meridian');
      await waitFor(
        async () => (await sidebarTitles(page)).length === 1,
        'library filtered to one call',
        5000
      );
      const filtered = await sidebarTitles(page);
      if (filtered[0] !== NEW_CALL.title)
        throw new Error(`unexpected filtered row: ${filtered[0]}`);

      await clearLibrarySearch(page);
      await waitFor(
        async () => (await sidebarTitles(page)).length === 4,
        'library search cleared',
        5000
      );
    });

    await check('bookmark a turn and persist it', async () => {
      const firstBookmark = await page.$eval('button[aria-label^="Bookmark turn at"]', (button) =>
        button.getAttribute('aria-label')
      );
      await page.click(`button[aria-label="${firstBookmark}"]`);
      await waitFor(
        () =>
          page.evaluate(
            (previous) => document.querySelector(`button[aria-label="${previous}"]`) === null,
            firstBookmark
          ),
        'bookmark button to flip to the remove state',
        5000
      );
      await waitFor(
        async () => {
          const calls = await listCalls();
          const created = calls.find((call) => call.title === NEW_CALL.title);
          return Boolean(created?.transcript?.some((turn) => turn.bookmarked === true));
        },
        'bookmark to persist through PATCH',
        8000
      );
    });

    await check('bookmarked filter narrows the transcript', async () => {
      await clickButtonByText(page, 'Bookmarked (1)');
      await waitFor(
        () =>
          page.evaluate(() => {
            const section = document.querySelector('[data-testid="diarized-transcript-section"]');
            return (
              section !== null &&
              section.querySelectorAll('button[aria-label^="Remove bookmark at"]').length === 1
            );
          }),
        'transcript to show only the bookmarked turn',
        5000
      );
      await clickButtonByText(page, 'All Speakers');
    });

    await check('next step toggle persists', async () => {
      const toggle = await page.$('[data-testid="coaching-card-section"] button[aria-pressed]');
      if (!toggle) throw new Error('next-step toggle not found');
      const before = await toggle.evaluate((button) => button.getAttribute('aria-pressed'));
      await toggle.click();
      await waitFor(
        () =>
          page.evaluate((previous) => {
            const button = document.querySelector(
              '[data-testid="coaching-card-section"] button[aria-pressed]'
            );
            return button !== null && button.getAttribute('aria-pressed') !== previous;
          }, before),
        'next-step toggle to flip',
        5000
      );
      await waitFor(
        async () => {
          const calls = await listCalls();
          const created = calls.find((call) => call.title === NEW_CALL.title);
          return created?.coaching?.nextStepCompleted === true;
        },
        'next-step completion to persist through PATCH',
        8000
      );
    });

    await check('delete removes the call everywhere', async () => {
      const callsBefore = await listCalls();
      const createdId = callsBefore.find((call) => call.title === NEW_CALL.title)?.id;
      if (!createdId) throw new Error('created call disappeared before the delete check');

      const label = `Delete call ${NEW_CALL.title}`;
      await page.click(`button[aria-label="${label}"]`);
      await waitFor(
        async () => !(await sidebarTitles(page)).includes(NEW_CALL.title),
        'call to leave the library',
        8000
      );
      await waitFor(
        async () => {
          const calls = await listCalls();
          return !calls.some((call) => call.title === NEW_CALL.title);
        },
        'DELETE to persist',
        8000
      );

      const patched = await fetch(`${BASE_URL}/api/calls/${encodeURIComponent(createdId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'should not apply' }),
        signal: AbortSignal.timeout(3000),
      });
      if (patched.status !== 404) {
        throw new Error(`expected 404 when patching a deleted call, got ${patched.status}`);
      }
    });

    await check('overview renders metrics and the next-step tracker', async () => {
      await clickButtonByText(page, 'Overview');
      await page.waitForSelector('[data-testid="team-overview-section"]', { timeout: 8000 });
      await page.waitForSelector('[data-testid="next-step-tracker-section"]', { timeout: 8000 });
      const trackerRows = await page.evaluate(() => {
        const section = document.querySelector('[data-testid="next-step-tracker-section"]');
        return section ? section.querySelectorAll('li, tr, div').length : 0;
      });
      if (trackerRows === 0) throw new Error('next-step tracker rendered no rows');
      await clickButtonByText(page, 'Call Detail');
      await page.waitForSelector('[data-testid="diarized-transcript-section"]', { timeout: 8000 });
    });

    await check('shortcuts dialog traps focus and closes with Escape', async () => {
      await clickButtonByText(page, 'Shortcuts', { exact: false });
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      for (let index = 0; index < 3; index += 1) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          return Boolean(
            dialog && document.activeElement && dialog.contains(document.activeElement)
          );
        });
        if (!inside) throw new Error(`focus escaped the dialog after Tab #${index + 1}`);
      }
      await page.keyboard.press('Escape');
      await waitFor(
        () => page.evaluate(() => !document.querySelector('[role="dialog"]')),
        'dialog to close on Escape',
        5000
      );
    });

    await check('layout holds at six widths', async () => {
      // An earlier filter would empty the drawer and mask the drawer check.
      await clearLibrarySearch(page);
      await waitFor(
        async () => (await sidebarTitles(page)).length === 3,
        'library reset to the three remaining calls',
        5000
      );

      const problems = [];
      for (const viewport of VIEWPORTS) {
        await page.setViewport(viewport);
        await sleep(320);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        );
        if (overflow > 1) {
          problems.push(`${viewport.width}px overflows by ${overflow}px`);
        }
      }
      if (problems.length > 0) throw new Error(problems.join('; '));

      await page.setViewport({ width: 390, height: 844 });
      await sleep(320);
      const desktopSidebarHidden = await page.evaluate(() => {
        const aside = document.querySelector('aside');
        return Boolean(aside) && getComputedStyle(aside).display === 'none';
      });
      if (!desktopSidebarHidden) throw new Error('desktop sidebar is still visible at 390px');

      await page.click('button[aria-label="Open call library menu"]');
      await waitFor(
        () => page.evaluate(() => document.querySelectorAll('aside').length > 1),
        'mobile drawer to open',
        5000
      );
      const picked = await page.evaluate(() => {
        const asides = Array.from(document.querySelectorAll('aside'));
        const drawer = asides[asides.length - 1];
        const first = drawer?.querySelector('nav button[title]');
        if (!first) return false;
        first.click();
        return true;
      });
      if (!picked) throw new Error('drawer had no call rows');
      await waitFor(
        () => page.evaluate(() => document.querySelectorAll('aside').length === 1),
        'drawer to close after selecting a call',
        5000
      );
      await page.setViewport(VIEWPORTS[0]);
    });

    await check('no console errors, no 5xx responses', async () => {
      const realErrors = consoleErrors.filter((line) => !line.includes('favicon'));
      if (realErrors.length > 0) {
        throw new Error(
          `${realErrors.length} console error(s): ${realErrors.slice(0, 3).join(' | ')}`
        );
      }
      if (apiFailures.length > 0) {
        throw new Error(`API failures: ${apiFailures.slice(0, 3).join(' | ')}`);
      }
    });
  } finally {
    if (page) {
      // Screenshots are diagnostics, not artifacts: keep them out of the repo.
      if (results.some((result) => !result.ok)) {
        const shot = path.join(os.tmpdir(), `cadence-e2e-failure-${Date.now()}.png`);
        await page.screenshot({ path: shot }).catch(() => {});
        console.log(`Diagnostic screenshot: ${shot}`);
      }
    }
    await browser.close().catch(() => {});
    if (currentServer) {
      currentServer.child.kill();
      currentServer = null;
    }
    if (process.env.E2E_KEEP_DATA === '1') {
      console.log(`Kept E2E data directory: ${dataDir}`);
    } else {
      await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main()
  .then(() => {
    const failed = results.filter((result) => !result.ok);
    const external = externalFailures.length;
    console.log(
      `\n${results.length - failed.length}/${results.length} browser checks passed` +
        (external > 0 ? ` (${external} external asset request(s) failed, not fatal)` : '')
    );
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    if (currentServer) {
      console.error('--- server output ---');
      console.error(currentServer.logs.join(''));
    }
    process.exitCode = 1;
  });
