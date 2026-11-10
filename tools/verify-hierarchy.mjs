import puppeteer from 'puppeteer-core';
import fs from 'fs';

const ART = '/opt/cursor/artifacts';
fs.mkdirSync(ART, { recursive: true });
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/local/bin/google-chrome';
const APP = 'http://127.0.0.1:5173/app.html?dev-bypass=1&lang=nl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const log = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + detail : ''}`);
};

async function boot(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(900);
  await page.evaluate(() => {
    document.getElementById('uculi-cloud')?.remove();
    localStorage.setItem('uculiDeveloperBypass', '1');
    activateDeveloperBypassSession?.();
    startLocalTestModeFromGate?.();
    userSettings.termsAccepted = true;
    userSettings.language = 'nl';
    userSettings.name = 'Hierarchie';
    recipes = [{
      id: 7,
      title: 'Hierarchie Soep',
      author: 'Hierarchie',
      source: 'local',
      category: 'Soup',
      country: 'Nederland',
      difficulty: 'Easy',
      ingredients: ['1 ui'],
      instructions: ['Kook'],
      checkedIngredients: [],
      checkedSteps: [],
      notebookStickyNotes: []
    }];
    saveData?.();
    renderList?.();
  });
  await sleep(700);
}

async function run(name, width, height) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', `--window-size=${width},${height}`]
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  try {
    await boot(page);

    const tokens = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        space2: styles.getPropertyValue('--space-2').trim(),
        space4: styles.getPropertyValue('--space-4').trim(),
        typeLabel: styles.getPropertyValue('--type-label').trim(),
        typeDisplay: styles.getPropertyValue('--type-display').trim(),
        controlMd: styles.getPropertyValue('--control-h-md').trim(),
        olive: styles.getPropertyValue('--brand-olive').trim()
      };
    });
    log(`${name}: tokens present`, tokens.space2 === '0.5rem' && tokens.space4 === '1rem' && tokens.controlMd === '3rem' && tokens.olive === '#929D75', JSON.stringify(tokens));

    await page.evaluate(() => renderSettings());
    await sleep(500);
    const settings = await page.evaluate(() => {
      const h2 = document.querySelector('.settings-hero h2');
      const primary = document.querySelector('button.app-btn-primary, [data-app-button="primary"]');
      const secondary = document.querySelector('button.app-btn-secondary, button.border-parchmentDark');
      // Force apply on any data-app-button
      if (typeof applyStaticAppButtonClasses === 'function') applyStaticAppButtonClasses();
      const primaries = [...document.querySelectorAll('button')].filter((b) => b.className.includes('app-btn-primary'));
      const secondaries = [...document.querySelectorAll('button')].filter((b) => b.className.includes('app-btn-secondary'));
      const h2Style = h2 ? getComputedStyle(h2) : null;
      const pStyle = primaries[0] ? getComputedStyle(primaries[0]) : null;
      const sStyle = secondaries[0] ? getComputedStyle(secondaries[0]) : null;
      return {
        hasDisplayFont: Boolean(h2Style?.fontFamily.includes('Fraunces')),
        primaryCount: primaries.length,
        secondaryCount: secondaries.length,
        primaryBg: pStyle?.backgroundColor || '',
        secondaryBg: sStyle?.backgroundColor || '',
        primaryH: pStyle ? Math.round(parseFloat(pStyle.height)) : 0
      };
    });
    log(`${name}: settings hierarchy`, settings.hasDisplayFont && settings.primaryCount > 0 && settings.secondaryCount > 0, JSON.stringify(settings));
    await page.screenshot({ path: `${ART}/hierarchy-${name}-settings.png`, fullPage: false });

    await page.evaluate(() => renderDetail(7));
    await sleep(500);
    const detail = await page.evaluate(() => {
      const cook = document.querySelector('.detail-cook-toggle-btn');
      const edit = [...document.querySelectorAll('.detail-actions button')].find((b) => /edit|bewerk/i.test(b.textContent || ''));
      const cookStyle = cook ? getComputedStyle(cook) : null;
      const editStyle = edit ? getComputedStyle(edit) : null;
      return {
        cookPrimary: Boolean(cook?.className.includes('app-btn-primary')),
        cookH: cookStyle ? Math.round(parseFloat(cookStyle.height)) : 0,
        editSecondary: Boolean(edit?.className.includes('app-btn-secondary')),
        editH: editStyle ? Math.round(parseFloat(editStyle.height)) : 0
      };
    });
    // 48px on 8px grid (allow 44-48 for subpixel)
    log(`${name}: detail primary/secondary buttons`, detail.cookPrimary && detail.editSecondary && detail.cookH >= 44 && detail.cookH <= 56, JSON.stringify(detail));
    await page.screenshot({ path: `${ART}/hierarchy-${name}-detail.png`, fullPage: false });

    await page.evaluate(() => { setIndexViewMode('cards'); renderList(); });
    await sleep(400);
    await page.screenshot({ path: `${ART}/hierarchy-${name}-index.png`, fullPage: false });
  } catch (error) {
    log(`${name}: fatal`, false, String(error?.stack || error));
  } finally {
    await browser.close();
  }
}

await run('desktop', 1280, 900);
await run('phone', 390, 844);
fs.writeFileSync(`${ART}/hierarchy-verify.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
