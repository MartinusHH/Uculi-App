/**
 * Recipe detail XSS: user text in ingredients/steps/notes/title/author must be escaped.
 *
 * Usage: node tools/verify-detail-escape.mjs
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

async function enterApp(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(700);
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    if (typeof showToast === 'function') window.showToast = function mutedToast() {};
    localStorage.setItem('uculiDeveloperBypass', '1');
    if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
    if (typeof startLocalTestModeFromGate === 'function') startLocalTestModeFromGate();
    if (typeof enterAppFromLanding === 'function' && document.getElementById('auth-gate')) {
      enterAppFromLanding('local-test-mode');
    }
    userSettings.language = 'nl';
    userSettings.termsAccepted = true;
    if (typeof saveData === 'function') saveData();
  });
  await sleep(900);
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900']
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 390, height: 844 });
  await enterApp(page);

  const xss = await page.evaluate(() => {
    const recipeId = 909091;
    const payloadImg = '<img src=x onerror=alert(1)>';
    const payloadScript = '<script>alert(1)</script>';
    const safeChars = 'Zout & peper < 1 tl · crème fraîche · ½ ui';
    recipes = [
      {
        id: recipeId,
        source: 'local',
        title: `XSS ${payloadImg}`,
        author: `Chef ${payloadScript}`,
        category: 'Cooking',
        country: 'Nederland',
        ingredients: [payloadImg, payloadScript, safeChars],
        instructions: [
          { text: payloadImg, minutes: 1, image: '' },
          { text: payloadScript, minutes: 1, image: '' },
          { text: 'Roer & breng op smaak met ½ tl zout < 1 tl', minutes: 2, image: '' }
        ],
        tips: `Tip ${payloadImg}`,
        personalNotes: `Note ${payloadScript}`,
        prepTime: 5,
        cookTime: 10,
        servings: 2,
        difficulty: 'Easy',
        cuisine: '',
        diet: [],
        mealType: [],
        profile: null,
        checkedIngredients: [],
        checkedSteps: []
      },
      ...(recipes || []).filter((r) => r.id !== recipeId)
    ];
    renderDetail(recipeId);

    const root = document.getElementById('app-content') || document.body;
    const html = root.innerHTML;
    const titleEl = document.querySelector('.detail-hero-title');
    const authorEl = document.querySelector('.detail-hero-meta');
    const ingredientSpans = [...document.querySelectorAll('#ingredients-list .detail-ingredient-row span, .detail-ingredients-panel .detail-ingredient-row span')];
    const stepPs = [...document.querySelectorAll('.detail-instructions-panel .detail-step p, .detail-step p')];
    const tipsEl = document.querySelector('.detail-notes-callout p.text-base, .detail-notes-callout .text-base');
    const notesEl = document.querySelector(`#notes-section-${recipeId}`);

    const injectedImgs = [...root.querySelectorAll('img[src="x"], img[onerror]')];
    const scriptTagsFromPayload = [...root.querySelectorAll('script')].filter((el) => /alert\(1\)/.test(el.textContent || ''));

    const ingredientTexts = ingredientSpans.map((el) => el.textContent || '');
    const stepTexts = stepPs.map((el) => el.textContent || '');

    return {
      titleText: titleEl?.textContent || '',
      authorText: authorEl?.textContent || '',
      ingredientTexts,
      stepTexts,
      tipsText: tipsEl?.textContent || '',
      notesText: notesEl?.textContent || '',
      hasRawImgTagInIngHtml: ingredientSpans.some((el) => /<img/i.test(el.innerHTML)),
      hasRawScriptInStepHtml: stepPs.some((el) => /<script/i.test(el.innerHTML)),
      injectedImgCount: injectedImgs.length,
      payloadScriptNodes: scriptTagsFromPayload.length,
      literalImgVisible: ingredientTexts.some((t) => t.includes('<img src=x onerror=alert(1)>'))
        && stepTexts.some((t) => t.includes('<img src=x onerror=alert(1)>')),
      literalScriptVisible: ingredientTexts.some((t) => t.includes('<script>alert(1)</script>'))
        && stepTexts.some((t) => t.includes('<script>alert(1)</script>')),
      safeCharsVisible: ingredientTexts.some((t) => t.includes('Zout & peper') && t.includes('½') && t.includes('crème')),
      safeStepVisible: stepTexts.some((t) => t.includes('½') && t.includes('&') && t.includes('<')),
      escapedAmpInHtml: ingredientSpans.some((el) => el.innerHTML.includes('&amp;'))
        || stepPs.some((el) => el.innerHTML.includes('&amp;')),
      titleEscaped: /&lt;img/i.test(titleEl?.innerHTML || '') || (titleEl?.textContent || '').includes('<img')
    };
  });

  log(
    'detail: XSS payloads render as literal text (no HTML execution)',
    xss.injectedImgCount === 0
      && xss.payloadScriptNodes === 0
      && !xss.hasRawImgTagInIngHtml
      && !xss.hasRawScriptInStepHtml
      && xss.literalImgVisible
      && xss.literalScriptVisible
      && xss.titleEscaped,
    JSON.stringify(xss)
  );

  log(
    'detail: normal characters (&, <, é, ½) display correctly',
    xss.safeCharsVisible && xss.safeStepVisible && xss.escapedAmpInHtml,
    JSON.stringify({
      safeCharsVisible: xss.safeCharsVisible,
      safeStepVisible: xss.safeStepVisible,
      escapedAmpInHtml: xss.escapedAmpInHtml,
      tipsText: xss.tipsText,
      notesText: xss.notesText
    })
  );

  await page.screenshot({ path: path.join(ART, 'detail-escape-xss-390.png'), fullPage: false });
  await page.close();
} catch (error) {
  log('fatal', false, error?.stack || error);
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(ART, 'detail-escape-verify.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
