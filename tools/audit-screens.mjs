import puppeteer from 'puppeteer-core';
import fs from 'fs';

const ART = '/opt/cursor/artifacts';
fs.mkdirSync(ART, { recursive: true });
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/local/bin/google-chrome';
const APP = 'http://127.0.0.1:5173/app.html?dev-bypass=1&lang=nl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const findings = [];
const note = (viewport, area, severity, detail) => {
  findings.push({ viewport, area, severity, detail });
  console.log(`[${severity}] ${severity}/${area}: ${detail}`);
};

async function dismissOverlays(page) {
  await page.evaluate(() => {
    document.getElementById('uculi-tour')?.remove();
    document.getElementById('terms-accept-modal')?.remove();
    document.querySelectorAll('.app-overlay').forEach((node) => {
      if (node.id === 'cover-editor-modal' || node.id === 'notes-modal' || node.id === 'timer-modal') {
        node.classList.add('hidden', 'opacity-0');
      } else if (node.id?.startsWith('dynamic-modal-')) {
        node.remove();
      }
    });
    if (typeof userSettings !== 'undefined') {
      userSettings.termsAccepted = true;
      userSettings.language = 'nl';
      if (typeof saveData === 'function') saveData();
    }
  });
}

async function enterApp(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1000);
  await dismissOverlays(page);
  const ok = await page.evaluate(() => {
    localStorage.setItem('uculiDeveloperBypass', '1');
    if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
    if (typeof startLocalTestModeFromGate === 'function') startLocalTestModeFromGate();
    if (typeof enterAppFromLanding === 'function' && document.getElementById('auth-gate')) {
      enterAppFromLanding('local-test-mode');
    }
    return typeof renderList === 'function' && Boolean(document.getElementById('app-content'));
  });
  await sleep(1200);
  await dismissOverlays(page);
  return ok;
}

async function seedRecipes(page) {
  await page.evaluate(() => {
    const now = Date.now();
    recipes = [
      {
        id: now,
        title: 'Audit Soep',
        source: 'local',
        category: 'Soup',
        difficulty: 'Easy',
        diet: [],
        ingredients: ['1 ui', '2 wortels'],
        instructions: ['Snijd de ui', 'Kook 20 minuten'],
        notes: '',
        image: '',
        checkedIngredients: [],
        checkedSteps: [],
        notebookStickyNotes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    if (typeof saveData === 'function') saveData();
  });
}

async function collectVisibleButtons(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
    };
    return [...document.querySelectorAll('button, [role="button"], a[href], .app-nav-button')]
      .filter(isVisible)
      .map((el) => {
        const onclick = el.getAttribute('onclick') || '';
        const href = el.getAttribute('href') || '';
        const label = (el.getAttribute('aria-label') || el.title || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        return {
          tag: el.tagName.toLowerCase(),
          label,
          onclick,
          href,
          disabled: Boolean(el.disabled),
          brokenOnclick: Boolean(onclick) && /undefined|null\(|NaN/.test(onclick)
        };
      });
  });
}

async function probeScreen(page, viewport, area, action) {
  const beforeErrors = page.__consoleErrors.length;
  const beforeExceptions = page.__pageErrors.length;
  try {
    await action();
    await sleep(700);
    await dismissOverlays(page);
  } catch (error) {
    note(viewport, area, 'error', `action threw: ${error.message}`);
  }
  const newErrors = page.__consoleErrors.slice(beforeErrors);
  const newExceptions = page.__pageErrors.slice(beforeExceptions);
  for (const err of newErrors) note(viewport, area, 'console', err);
  for (const err of newExceptions) note(viewport, area, 'exception', err);

  const buttons = await collectVisibleButtons(page);
  const broken = buttons.filter((b) => b.brokenOnclick || (!b.onclick && !b.href && b.tag !== 'button' && !b.label));
  for (const b of broken) note(viewport, area, 'button', `suspect: ${b.label || '(no label)'} onclick=${b.onclick}`);

  // Click primary nav/actions that should not throw
  const clickTargets = await page.evaluate(() => {
    const picks = [];
    document.querySelectorAll('[data-nav-view], #options-button, button[onclick*="renderAddForm"], button[onclick*="setIndexViewMode"]').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        picks.push({
          sel: el.id ? `#${el.id}` : null,
          onclick: el.getAttribute('onclick'),
          nav: el.getAttribute('data-nav-view'),
          text: (el.textContent || '').trim().slice(0, 40)
        });
      }
    });
    return picks.slice(0, 12);
  });

  await page.screenshot({ path: `${ART}/audit-${viewport}-${area}.png`, fullPage: false });
  return { buttons: buttons.length, clickTargets, newErrors, newExceptions };
}

async function auditViewport(name, width, height) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', `--window-size=${width},${height}`]
  });
  const page = await browser.newPage();
  page.__consoleErrors = [];
  page.__pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') page.__consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => page.__pageErrors.push(String(err?.message || err)));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  try {
    const entered = await enterApp(page);
    if (!entered) note(name, 'boot', 'error', 'failed to enter app');
    await seedRecipes(page);

    await probeScreen(page, name, 'index-cards', async () => {
      await page.evaluate(() => {
        if (typeof setIndexViewMode === 'function') setIndexViewMode('cards');
        renderList();
      });
    });

    await probeScreen(page, name, 'index-list', async () => {
      await page.evaluate(() => {
        setIndexViewMode('list');
        renderList();
      });
    });

    await probeScreen(page, name, 'index-book', async () => {
      await page.evaluate(() => {
        notebookCoverOpen = false;
        setIndexViewMode('book');
        renderList();
      });
    });

    await probeScreen(page, name, 'detail', async () => {
      await page.evaluate(() => {
        const id = recipes[0]?.id;
        if (id) renderDetail(id);
      });
    });

    await probeScreen(page, name, 'add', async () => {
      await page.evaluate(() => {
        if (typeof renderAddForm === 'function') renderAddForm();
      });
    });

    await probeScreen(page, name, 'shop', async () => {
      await page.evaluate(() => renderShoppingList());
    });

    await probeScreen(page, name, 'browse', async () => {
      await page.evaluate(async () => { await renderBrowse(); });
    });

    await probeScreen(page, name, 'profile', async () => {
      await page.evaluate(() => renderProfile());
    });

    await probeScreen(page, name, 'settings', async () => {
      await page.evaluate(() => {
        if (typeof renderSettings === 'function') renderSettings();
      });
    });

    await probeScreen(page, name, 'cover-editor', async () => {
      await page.evaluate(() => {
        setIndexViewMode('book');
        notebookCoverOpen = false;
        renderList();
        if (typeof openCoverEditor === 'function') openCoverEditor();
      });
      await sleep(500);
      const open = await page.evaluate(() => {
        const modal = document.getElementById('cover-editor-modal');
        return Boolean(modal && !modal.classList.contains('hidden'));
      });
      if (!open) note(name, 'cover-editor', 'error', 'cover editor did not open');
      await page.evaluate(() => {
        if (typeof closeCoverEditor === 'function') closeCoverEditor();
      });
    });

    // Premium gate while free
    await probeScreen(page, name, 'premium-gate', async () => {
      await page.evaluate(() => {
        window.__origPremium = accountHasPremiumPlan;
        accountHasPremiumPlan = () => false;
        hasPremiumAccess = () => false;
        showPremiumModal('recipeSharing');
      });
      await sleep(400);
      const hasModal = await page.evaluate(() => document.body.innerText.includes('Premium') || document.body.innerText.includes('upgrade') || document.body.innerText.includes('Upgrade') || document.body.innerText.includes('delen') || document.body.innerText.includes('Share'));
      if (!hasModal) note(name, 'premium-gate', 'error', 'premium modal text missing');
      await page.evaluate(() => {
        if (typeof closeModal === 'function') closeModal();
        if (window.__origPremium) accountHasPremiumPlan = window.__origPremium;
      });
    });

    // Click through nav buttons for real click path
    for (const view of ['index', 'shopping', 'browse', 'profile']) {
      const before = page.__consoleErrors.length;
      await page.evaluate((v) => {
        const btn = document.querySelector(`[data-nav-view="${v}"]`);
        btn?.click();
      }, view);
      await sleep(600);
      await dismissOverlays(page);
      const errs = page.__consoleErrors.slice(before);
      for (const err of errs) note(name, `nav-${view}`, 'console', err);
      await page.screenshot({ path: `${ART}/audit-${name}-nav-${view}.png`, fullPage: false });
    }
  } catch (error) {
    note(name, 'fatal', 'error', String(error?.stack || error));
  } finally {
    await browser.close();
  }
}

await auditViewport('desktop', 1280, 900);
await auditViewport('phone', 390, 844);

const summary = {
  total: findings.length,
  errors: findings.filter((f) => f.severity === 'error' || f.severity === 'exception').length,
  console: findings.filter((f) => f.severity === 'console').length,
  buttons: findings.filter((f) => f.severity === 'button').length,
  findings
};
fs.writeFileSync(`${ART}/screen-audit.json`, JSON.stringify(summary, null, 2));
console.log('\n=== AUDIT SUMMARY ===');
console.log(JSON.stringify({ total: summary.total, errors: summary.errors, console: summary.console, buttons: summary.buttons }, null, 2));
process.exit(0);
