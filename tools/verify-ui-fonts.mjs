/**
 * UI fonts: index loads only Fraunces + Outfit; cover fonts lazy-load.
 *
 * Usage: node tools/verify-ui-fonts.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ART = process.env.UCULI_TEST_ARTIFACTS
  || (fs.existsSync('/opt/cursor/artifacts') ? '/opt/cursor/artifacts' : path.join(os.tmpdir(), 'uculi-test-artifacts'));
fs.mkdirSync(ART, { recursive: true });
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/local/bin/google-chrome';
const APP = 'http://127.0.0.1:5173/app.html?dev-bypass=1&lang=nl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const log = (name, ok, detail = '') => {
  results.push({ name, ok, detail: String(detail).slice(0, 400) });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + String(detail).slice(0, 220) : ''}`);
};

function classifyFontHref(href = '') {
  const h = String(href || '');
  const hasFraunces = /family=Fraunces/i.test(h);
  const hasOutfit = /family=Outfit/i.test(h);
  const hasCormorant = /Cormorant/i.test(h);
  const hasLibre = /Libre\+Baskerville|Libre Baskerville/i.test(h);
  const hasPlayfair = /Playfair/i.test(h);
  return { hasFraunces, hasOutfit, hasCormorant, hasLibre, hasPlayfair, href: h.slice(0, 180) };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900']
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 1280, height: 900 });

  const fontRequests = [];
  page.on('request', (req) => {
    const url = req.url();
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(url)) {
      fontRequests.push(url);
    }
  });

  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(900);
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    localStorage.setItem('uculiDeveloperBypass', '1');
    if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
    if (typeof startLocalTestModeFromGate === 'function') startLocalTestModeFromGate();
    if (typeof enterAppFromLanding === 'function' && document.getElementById('auth-gate')) {
      enterAppFromLanding('local-test-mode');
    }
    userSettings.language = 'nl';
    userSettings.termsAccepted = true;
    // Default cover uses Fraunces — must not force lazy cover fonts on index.
    if (typeof normalizeNotebookCover === 'function') {
      userSettings.notebookCover = normalizeNotebookCover({
        ...(userSettings.notebookCover || {}),
        titleFont: 'fraunces',
        title: 'Index kaft'
      });
    }
    if (typeof saveData === 'function') saveData();
    if (typeof renderList === 'function') renderList();
  });
  await sleep(1200);

  const indexFonts = await page.evaluate(() => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map((el) => el.href || el.getAttribute('href') || '')
      .filter((href) => /fonts\.googleapis\.com/i.test(href));
    const coverLink = document.getElementById('uculi-cover-fonts');
    const title = document.getElementById('header-page-title');
    const titleFamily = title ? getComputedStyle(title).fontFamily : '';
    return {
      links,
      coverLinkPresent: Boolean(coverLink),
      titleFamily,
      ensureFn: typeof ensureCoverFontsLoaded === 'function'
    };
  });

  const indexLinkFlags = indexFonts.links.map(classifyFontHref);
  const indexOnlyCore = indexLinkFlags.length >= 1
    && indexLinkFlags.every((f) => f.hasFraunces && f.hasOutfit && !f.hasCormorant && !f.hasLibre && !f.hasPlayfair)
    && !indexFonts.coverLinkPresent;
  const pageTitleUsesDisplay = /Fraunces/i.test(indexFonts.titleFamily);
  log(
    'fonts: index stylesheet is Fraunces+Outfit only',
    indexOnlyCore && indexFonts.ensureFn,
    JSON.stringify({ links: indexLinkFlags, coverLinkPresent: indexFonts.coverLinkPresent })
  );
  log(
    'fonts: top-bar page title uses Fraunces (display)',
    pageTitleUsesDisplay,
    indexFonts.titleFamily
  );

  const requestsBeforeCover = fontRequests.filter((u) => /fonts\.googleapis\.com/i.test(u));
  const coverRequestedBefore = requestsBeforeCover.some((u) => /Cormorant|Libre\+Baskerville|Playfair/i.test(u));
  log(
    'fonts: index network did not request cover families',
    !coverRequestedBefore,
    JSON.stringify(requestsBeforeCover.slice(0, 6))
  );

  await page.evaluate(() => {
    if (typeof openCoverEditor === 'function') openCoverEditor();
  });
  await sleep(900);

  const afterCover = await page.evaluate(() => {
    const coverLink = document.getElementById('uculi-cover-fonts');
    const href = coverLink?.href || coverLink?.getAttribute('href') || '';
    const modal = document.getElementById('cover-editor-modal');
    return {
      coverLinkPresent: Boolean(coverLink),
      href,
      modalOpen: Boolean(modal && !modal.classList.contains('hidden'))
    };
  });
  const coverFlags = classifyFontHref(afterCover.href);
  log(
    'fonts: cover editor injects Cormorant+Libre+Playfair once',
    afterCover.coverLinkPresent
      && afterCover.modalOpen
      && coverFlags.hasCormorant
      && coverFlags.hasLibre
      && coverFlags.hasPlayfair
      && !coverFlags.hasFraunces
      && !coverFlags.hasOutfit,
    JSON.stringify(afterCover)
  );

  // Second open must not duplicate the stylesheet.
  await page.evaluate(() => {
    if (typeof closeCoverEditor === 'function') closeCoverEditor();
  });
  await sleep(400);
  await page.evaluate(() => {
    if (typeof openCoverEditor === 'function') openCoverEditor();
  });
  await sleep(500);
  const linkCount = await page.evaluate(() => document.querySelectorAll('#uculi-cover-fonts').length);
  log('fonts: cover stylesheet injected only once', linkCount === 1, `count=${linkCount}`);

  await page.close();
} catch (error) {
  log('fatal', false, error?.stack || error);
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(ART, 'ui-fonts-verify.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
