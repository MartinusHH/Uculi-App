/**
 * Shots of Opties (scrolled to the report control) and the landing footer.
 *
 * Usage: node tools/report-button-shots.mjs before|after [nl|en] [width]
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const PHASE = process.argv[2] === 'before' ? 'before' : 'after';
const LANG = process.argv[3] === 'en' ? 'en' : 'nl';
const WIDTHS = process.argv[4] ? [Number(process.argv[4])] : [390, 820, 1280, 1920];
const ART = '/opt/cursor/artifacts/report-button';
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/bin/google-chrome';
const APP = process.env.UCULI_APP_BASE || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fileSuffix = LANG === 'en' ? '-en' : '';

fs.mkdirSync(ART, { recursive: true });

async function quiet(page) {
  await page.evaluate(() => {
    document.getElementById('auth-loading-screen')?.remove();
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    document.querySelectorAll('.app-overlay').forEach((node) => {
      if (node.id?.startsWith('dynamic-modal')) node.remove();
    });
    const toast = document.getElementById('toast');
    if (toast) toast.style.display = 'none';
  });
}

async function openSettings(page) {
  await page.goto(`${APP}/app.html?dev-bypass=1&lang=${LANG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(900);
  await quiet(page);
  await page.evaluate((language) => {
    if (typeof showToast === 'function') window.showToast = () => {};
    localStorage.setItem('uculiDeveloperBypass', '1');
    if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
    if (typeof userSettings !== 'undefined') {
      userSettings.language = language;
      userSettings.termsAccepted = true;
      userSettings.privacyAccepted = true;
    }
    if (typeof renderSettings === 'function') renderSettings();
    document.getElementById('auth-loading-screen')?.remove();
    document.getElementById('uculi-tour')?.remove();
  }, LANG);
  await sleep(500);
  await quiet(page);
  await page.evaluate(() => {
    const target = document.getElementById('report-problem-settings')
      || document.querySelector('.settings-report')
      || document.querySelector('.settings-legal')
      || document.querySelector('.settings-sheet');
    const content = document.getElementById('app-content');
    if (target && content) {
      const top = target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop;
      content.scrollTop = Math.max(0, top - 80);
    } else if (content) {
      content.scrollTop = content.scrollHeight;
    }
  });
  await sleep(250);
}

async function openFooter(page) {
  await page.goto(`${APP}/app.html?lang=${LANG}&dev-bypass=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(400);
  await page.evaluate(() => {
    localStorage.removeItem('uculiDeveloperBypass');
    sessionStorage.removeItem('uculiLandingEntered');
  });
  await page.goto(`${APP}/app.html?lang=${LANG}&dev-bypass=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(900);
  await quiet(page);
  await page.evaluate((language) => {
    if (typeof showToast === 'function') window.showToast = () => {};
    localStorage.removeItem('uculiDeveloperBypass');
    document.getElementById('auth-loading-screen')?.remove();
    if (typeof userSettings !== 'undefined') userSettings.language = language;
    document.getElementById('auth-loading-screen')?.remove();
    const scroller = document.getElementById('app-landing');
    const links = document.querySelector('.landing-footer-links');
    if (scroller && links) {
      scroller.scrollTop = links.offsetTop - 40;
    } else {
      links?.scrollIntoView({ block: 'center' });
    }
  }, LANG);
  await sleep(400);
  await quiet(page);
}

async function shot(browser, width, kind) {
  const height = width === 390 ? 844 : 1000;
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    if (kind === 'settings') await openSettings(page);
    else await openFooter(page);
    const filePath = path.join(ART, `report-${PHASE}-${kind}-${width}${fileSuffix}.png`);
    await page.screenshot({ path: filePath });
    const marker = await page.evaluate((shotKind) => {
      if (shotKind === 'footer') {
        const links = document.querySelector('.landing-footer-links');
        return links ? (links.innerText || '').replace(/\s+/g, ' ').trim() : 'MISSING_FOOTER';
      }
      const button = document.getElementById('report-problem-settings');
      const legal = document.querySelector('.settings-legal');
      return button ? `button:${(button.textContent || '').trim()}` : (legal ? 'settings-bottom' : 'MISSING_SETTINGS');
    }, kind);
    console.log('wrote', filePath, marker);
  } finally {
    await context.close();
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

try {
  for (const width of WIDTHS) {
    await shot(browser, width, 'settings');
    await shot(browser, width, 'footer');
  }
} finally {
  await browser.close();
}
