/**
 * Playwright check: Opties button and landing footer link.
 * Empty form URL hides both. Filled config (the shipped forms) opens a new tab.
 *
 * Usage: node tools/verify-problem-report.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/bin/google-chrome';
const APP = process.env.UCULI_APP_BASE || 'http://127.0.0.1:5173';
const WIDTHS = [390, 1280];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
const log = (name, ok, detail = '') => {
  results.push({ name, ok, detail: String(detail).slice(0, 400) });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + String(detail).slice(0, 220) : ''}`);
};

async function quiet(page) {
  await page.evaluate(() => {
    document.getElementById('auth-loading-screen')?.remove();
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    const toast = document.getElementById('toast');
    if (toast) toast.style.display = 'none';
  });
}

async function readControl(page, id) {
  return page.locator(`#${id}`).evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      href: node.getAttribute('href') || '',
      target: node.getAttribute('target') || '',
      rel: node.getAttribute('rel') || '',
      label: node.getAttribute('aria-label') || '',
      title: node.getAttribute('title') || '',
      text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
      className: node.className,
      width: Math.round(box.width),
      height: Math.round(box.height)
    };
  });
}

function assertLink(name, control, expectedHref, expectedLabel) {
  const leaks = /rec_|uid|user_|@|uculi\.example|Tomato|__uculi_local_dev__|entry\.56646792/;
  log(`${name}: href`, control.href === expectedHref, control.href);
  log(`${name}: target`, control.target === '_blank', control.target);
  log(`${name}: rel`, control.rel === 'noopener noreferrer', control.rel);
  log(`${name}: label`, control.label === expectedLabel && control.title === expectedLabel, control.label);
  log(`${name}: visible`, control.width > 0 && control.height > 0, `${control.width}x${control.height}`);
  log(`${name}: no personal data`, !leaks.test(control.href), control.href);
  const entries = [...control.href.matchAll(/entry\.\d+/g)].map((match) => match[0]);
  log(`${name}: two entries`, entries.length === 2 && !control.href.includes('entry.56646792'), entries.join(','));
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

try {
  for (const width of WIDTHS) {
    const height = width === 390 ? 844 : 1000;
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));

    await page.goto(`${APP}/app.html?dev-bypass=1&lang=nl`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(800);
    await quiet(page);
    await page.evaluate(() => {
      localStorage.setItem('uculiDeveloperBypass', '1');
      if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
      if (typeof userSettings !== 'undefined') {
        userSettings.language = 'nl';
        userSettings.termsAccepted = true;
      }
      const saved = PROBLEM_REPORT_FORM.nl.url;
      PROBLEM_REPORT_FORM.nl.url = '';
      renderSettings();
      window.__reportHidden = !document.getElementById('report-problem-settings');
      PROBLEM_REPORT_FORM.nl.url = saved;
      renderSettings();
    });
    await sleep(300);
    await quiet(page);
    const hidden = await page.evaluate(() => window.__reportHidden === true);
    log(`settings ${width}: hidden while nl url is empty`, hidden);
    const expectedSettings = await page.evaluate(() => buildProblemReportUrl('nl', 'settings'));
    const settings = await readControl(page, 'report-problem-settings');
    assertLink(`settings ${width}`, settings, expectedSettings, 'Probleem melden');
    log(`settings ${width}: secondary button`, settings.className.includes('app-btn-secondary'), settings.className);
    log(`settings ${width}: lifebuoy`, await page.locator('#report-problem-settings svg').count() === 1);

    await page.goto(`${APP}/app.html?lang=nl&dev-bypass=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(700);
    await quiet(page);
    await page.evaluate(() => {
      localStorage.removeItem('uculiDeveloperBypass');
      const saved = PROBLEM_REPORT_FORM.nl.url;
      PROBLEM_REPORT_FORM.nl.url = '';
      document.getElementById('app-landing')?.remove();
      sessionStorage.removeItem('uculiLandingEntered');
      showAppLanding();
      window.__footerHidden = !document.getElementById('report-problem-footer');
      const privacy = [...document.querySelectorAll('.landing-legal-link')].some((node) => /privacy/i.test(node.textContent || ''));
      PROBLEM_REPORT_FORM.nl.url = saved;
      document.getElementById('app-landing')?.remove();
      sessionStorage.removeItem('uculiLandingEntered');
      showAppLanding();
      window.__privacyKept = privacy;
    });
    await sleep(250);
    const footerState = await page.evaluate(() => ({
      hidden: window.__footerHidden === true,
      privacy: window.__privacyKept === true
    }));
    log(`footer ${width}: hidden while nl url is empty`, footerState.hidden);
    log(`footer ${width}: privacy link stays`, footerState.privacy);
    const expectedFooter = await page.evaluate(() => buildProblemReportUrl('nl', 'other'));
    const footer = await readControl(page, 'report-problem-footer');
    assertLink(`footer ${width}`, footer, expectedFooter, 'Probleem melden');
    log(`footer ${width}: no pageerror`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  const enContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const enPage = await enContext.newPage();
  await enPage.goto(`${APP}/app.html?lang=en&dev-bypass=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(800);
  await quiet(enPage);
  const enFooter = await readControl(enPage, 'report-problem-footer');
  const expectedEn = await enPage.evaluate(() => buildProblemReportUrl('en', 'other'));
  assertLink('footer en 390', enFooter, expectedEn, 'Report a problem');
  log('footer en 390: english form', enFooter.href.includes('1FAIpQLSdiCbTVI_mGQSOI7eB7g5nxx10mCH0Pf6reA1TNTGzz8paluQ'), enFooter.href);
  await enContext.close();
} catch (error) {
  log('fatal', false, error?.stack || error);
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
