import puppeteer from 'puppeteer-core';
import fs from 'fs';

const ART = '/opt/cursor/artifacts';
fs.mkdirSync(ART, { recursive: true });
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/local/bin/google-chrome';
const APP = 'http://127.0.0.1:5173/app.html?dev-bypass=1&lang=nl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function relativeLuminance([r, g, b]) {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function parseRgb(str) {
  if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null;
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

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
    userSettings.name = 'A11y';
    recipes = [{
      id: 9,
      title: 'A11y Soep',
      author: 'A11y',
      source: 'local',
      category: 'Soup',
      country: 'Nederland',
      difficulty: 'Easy',
      ingredients: ['1 ui', '2 wortels'],
      instructions: ['Snijd', 'Kook'],
      checkedIngredients: [],
      checkedSteps: [],
      notebookStickyNotes: []
    }];
    saveData?.();
  });
  await sleep(500);
}

async function auditScreen(page, viewport, screen) {
  const data = await page.evaluate(() => {
    const isVisible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 0 && r.height > 0;
    };
    const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], label.custom-file-upload, .app-nav-button')]
      .filter(isVisible)
      .map((el) => {
        // Checkboxes/radios: measure the associated label (actual touch target).
        let target = el;
        if (el.matches('input[type="checkbox"], input[type="radio"]')) {
          const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
          const wrapping = el.closest('label');
          if (byFor && isVisible(byFor)) target = byFor;
          else if (wrapping && isVisible(wrapping)) target = wrapping;
        }
        const r = target.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') || el.title || target.textContent || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
          cls: (el.className || '').toString().slice(0, 80)
        };
      });

    const docEl = document.documentElement;
    const body = document.body;
    const overflowX = Math.max(docEl.scrollWidth, body.scrollWidth) - Math.max(docEl.clientWidth, body.clientWidth);

    const samples = [];
    const pick = (sel) => document.querySelector(sel);
    const opaqueBg = (value) => {
      if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return false;
      const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/i);
      if (!m) return false;
      return m[4] === undefined || Number(m[4]) >= 0.95;
    };
    const pushSample = (name, el) => {
      if (!el || !isVisible(el)) return;
      const cs = getComputedStyle(el);
      let bgEl = el;
      let bg = cs.backgroundColor;
      while (bgEl && !opaqueBg(bg)) {
        bgEl = bgEl.parentElement;
        if (!bgEl) break;
        bg = getComputedStyle(bgEl).backgroundColor;
      }
      samples.push({
        name,
        color: cs.color,
        background: bg,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)
      });
    };

    pushSample('hero-title', pick('.settings-hero h2, .index-hero-copy h2, .detail-hero-title, .shop-hero-copy h2'));
    pushSample('kicker', pick('.settings-panel-kicker, .shop-panel-kicker, .index-hero-kicker, .detail-panel-kicker'));
    pushSample('body-muted', pick('.settings-hero p, .index-hero-copy > p, .shop-hero-copy p'));
    pushSample('primary-btn', pick('button.app-btn-primary'));
    pushSample('secondary-btn', pick('button.app-btn-secondary'));
    pushSample('nav-label', pick('.app-nav-label'));
    pushSample('card-title', pick('.index-card-body h3'));

    return {
      interactive,
      overflowX,
      bodyScrollWidth: body.scrollWidth,
      clientWidth: docEl.clientWidth,
      samples
    };
  });

  // Recompute contrast in node with proper parse
  const contrastIssues = [];
  for (const sample of data.samples) {
    const fg = parseRgb(sample.color);
    const bg = parseRgb(sample.background);
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    const fontPx = parseFloat(sample.fontSize) || 16;
    const weight = parseInt(sample.fontWeight, 10) || 400;
    const large = fontPx >= 18 || (fontPx >= 14 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio + 1e-6 < need) {
      contrastIssues.push({
        ...sample,
        ratio: Math.round(ratio * 100) / 100,
        need,
        large
      });
    }
  }

  const smallTargets = data.interactive.filter((t) => t.w < 44 || t.h < 44);
  return {
    viewport,
    screen,
    overflowX: data.overflowX,
    smallTargets: smallTargets.slice(0, 40),
    smallCount: smallTargets.length,
    interactiveCount: data.interactive.length,
    contrastIssues,
    samples: data.samples
  };
}

const report = { findings: [] };
const screens = [
  ['index', (p) => p.evaluate(() => { setIndexViewMode('cards'); renderList(); })],
  ['detail', (p) => p.evaluate(() => renderDetail(9))],
  ['shop', (p) => p.evaluate(() => renderShoppingList())],
  ['settings', (p) => p.evaluate(() => renderSettings())],
  ['profile', (p) => p.evaluate(() => renderProfile())],
  ['add', (p) => p.evaluate(() => renderAddForm())]
];

async function runViewport(name, width, height) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', `--window-size=${width},${height}`]
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await boot(page);
  for (const [screen, go] of screens) {
    await go(page);
    await sleep(500);
    await page.evaluate(() => document.getElementById('uculi-cloud')?.remove());
    const result = await auditScreen(page, name, screen);
    report.findings.push(result);
    await page.screenshot({ path: `${ART}/a11y-${name}-${screen}.png`, fullPage: false });
    console.log(`[${name}/${screen}] overflowX=${result.overflowX} smallTargets=${result.smallCount}/${result.interactiveCount} contrastFails=${result.contrastIssues.length}`);
    if (result.smallTargets.length) {
      console.log('  small:', result.smallTargets.slice(0, 8).map((t) => `${t.label || t.tag} ${t.w}x${t.h}`).join(' | '));
    }
    if (result.contrastIssues.length) {
      console.log('  contrast:', result.contrastIssues.map((c) => `${c.name} ${c.ratio}:1 (need ${c.need})`).join(' | '));
    }
  }
  await browser.close();
}

await runViewport('phone', 390, 844);
await runViewport('desktop', 1280, 900);

const summary = {
  overflowScreens: report.findings.filter((f) => f.overflowX > 1).map((f) => `${f.viewport}/${f.screen}:${f.overflowX}`),
  smallTargetTotal: report.findings.reduce((n, f) => n + f.smallCount, 0),
  contrastFails: report.findings.flatMap((f) => f.contrastIssues.map((c) => ({ screen: `${f.viewport}/${f.screen}`, ...c }))),
  findings: report.findings
};
fs.writeFileSync(`${ART}/a11y-responsive-audit.json`, JSON.stringify(summary, null, 2));
console.log('\nSUMMARY', JSON.stringify({
  overflowScreens: summary.overflowScreens,
  smallTargetTotal: summary.smallTargetTotal,
  contrastFails: summary.contrastFails.length
}, null, 2));
