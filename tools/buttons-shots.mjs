import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const ART = process.env.BUTTONS_ART || '/opt/cursor/artifacts/buttons-A';
const PREFIX = process.env.BUTTONS_PREFIX || 'buttons-A';
const CHROME = fs.existsSync('/usr/bin/google-chrome-stable')
  ? '/usr/bin/google-chrome-stable'
  : '/usr/local/bin/google-chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTHS = [390, 820, 1280, 1920];
const PHASE = process.argv[2] === 'before' ? 'before' : 'after';
const APP_BASE = process.argv[3] || 'http://127.0.0.1:5173';
const APP = `${APP_BASE}/app.html?dev-bypass=1&lang=nl`;

fs.mkdirSync(ART, { recursive: true });

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

    const toastRoot = document.getElementById('toast') || document.getElementById('app-toast');
    if (toastRoot) {
      toastRoot.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
      toastRoot.style.display = 'none';
    }
    document.body.classList.remove('toast-open');
    document.documentElement.style.removeProperty('--toast-clearance');
    document.querySelectorAll('.app-toast, [data-toast], #toast-container').forEach((n) => {
      n.style.display = 'none';
    });

    // Hide Testmodus Premium copy in the harness only (keep paired buttons visible).
    document.querySelectorAll('.index-plan-note').forEach((n) => {
      n.style.display = 'none';
    });
    document.querySelectorAll('.settings-status, .index-plan-kicker, .index-plan-detail').forEach((n) => {
      if (/Testmodus Premium|Test mode Premium|Testmodus|Test mode/i.test(n.textContent || '')) {
        n.style.visibility = 'hidden';
      }
    });
    document.querySelectorAll('.settings-row').forEach((row) => {
      if (/Huidig plan|Current plan/i.test(row.textContent || '') && /Testmodus|Test mode/i.test(row.textContent || '')) {
        row.style.display = 'none';
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
  await sleep(800);
  await dismissOverlays(page);
  await page.evaluate(() => {
    if (typeof showToast === 'function' && !window.__buttonsShotToastMuted) {
      window.__buttonsShotToastMuted = true;
      window.showToast = function mutedToast() { /* no-op for shots */ };
    }
    localStorage.setItem('uculiDeveloperBypass', '1');
    if (typeof activateDeveloperBypassSession === 'function') activateDeveloperBypassSession();
    if (typeof startLocalTestModeFromGate === 'function') startLocalTestModeFromGate();
    if (typeof enterAppFromLanding === 'function' && document.getElementById('auth-gate')) {
      enterAppFromLanding('local-test-mode');
    }
  });
  await sleep(1000);
  await dismissOverlays(page);
}

async function seed(page) {
  await page.evaluate(() => {
    const now = Date.now();
    recipes = [
      {
        id: now,
        title: 'Forester Mushroom Stew',
        source: 'local',
        category: 'Cooking',
        difficulty: 'Easy',
        diet: ['Vegetarisch'],
        ingredients: ['200 g champignons', '1 ui', '2 el boter', '500 ml bouillon', '100 ml room', '1 tl tijm'],
        instructions: ['Snijd de champignons', 'Fruit de ui', 'Voeg bouillon toe', 'Laat sudderen'],
        notes: '',
        image: '',
        profile: '',
        checkedIngredients: [],
        checkedSteps: [],
        notebookStickyNotes: [],
        servings: 4,
        prepTime: 15,
        cookTime: 30,
        favorite: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: now + 1,
        title: 'Avocado toast',
        source: 'published',
        category: 'Cooking',
        difficulty: 'Easy',
        diet: [],
        ingredients: ['2 avocado', '2 sneetjes brood'],
        instructions: ['Prak de avocado', 'Smeer op brood'],
        notes: '',
        image: '',
        profile: '',
        checkedIngredients: [],
        checkedSteps: [],
        notebookStickyNotes: [],
        servings: 2,
        publishedId: 'pub-avoc',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    userSettings.language = 'nl';
    userSettings.measurementSystem = 'Metric';
    userSettings.name = 'Miems H.';
    userSettings.indexViewMode = 'cards';
    userSettings.shoppingList = {
      items: [
        { id: 's1', label: 'Melk', kind: 'custom', checked: false, assignedTo: '', sourceRecipeTitles: [], sourceRecipeIds: [], note: '', updatedAt: new Date().toISOString() }
      ],
      collaborators: [],
      syncMode: 'local',
      sharedMembers: [],
      pendingInviteEmails: []
    };
    if (typeof normalizeShoppingListState === 'function') {
      userSettings.shoppingList = normalizeShoppingListState(userSettings.shoppingList);
    }
    if (typeof saveData === 'function') saveData();
  });
}

async function shot(page, width, name) {
  const file = path.join(ART, `${PREFIX}-${PHASE}-${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', file);
}

async function measureButtons(page, selector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const buttons = [...root.querySelectorAll('button')];
    return buttons.map((b) => {
      const box = b.getBoundingClientRect();
      const style = getComputedStyle(b);
      return {
        text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
        w: Math.round(box.width),
        h: Math.round(box.height),
        radius: style.borderRadius,
        bg: style.backgroundColor
      };
    });
  }, selector);
}

async function runWidth(browser, width) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width, height: width <= 420 ? 844 : 900, deviceScaleFactor: 1 });
  await enterApp(page);
  await seed(page);
  await dismissOverlays(page);

  // 1) Index with filters open (diet chips + favorites + toolbar)
  await page.evaluate(() => {
    indexViewMode = 'cards';
    userSettings.indexViewMode = 'cards';
    showListFilters = true;
    showDietFilters = true;
    showFavoritesOnly = true;
    activeDietFilters = new Set(['Vegetarisch']);
    renderList();
  });
  await sleep(700);
  await dismissOverlays(page);
  await page.evaluate(() => {
    document.querySelector('.index-filters-panel, .source-filter-row')?.scrollIntoView({ block: 'start' });
  });
  await sleep(250);
  console.log(`filters@${width}`, JSON.stringify(await measureButtons(page, '.index-filters-panel') || await measureButtons(page, '#app-content')));
  await shot(page, width, 'filters');

  // 2) Recipe detail (basket, scale, cook CTA)
  await page.evaluate(() => {
    showFavoritesOnly = false;
    activeDietFilters = new Set();
    renderDetail(recipes[0].id);
  });
  await sleep(700);
  await dismissOverlays(page);
  await page.evaluate(() => {
    document.querySelector('.detail-scale-control, button[onclick*="toggleRecipeIngredients"]')
      ?.scrollIntoView({ block: 'center' });
  });
  await sleep(250);
  console.log(`detail@${width}`, JSON.stringify(await measureButtons(page, '#app-content')));
  await shot(page, width, 'detail');

  // 3) Cooking mode (prove ~62px stay)
  await page.evaluate(() => {
    if (typeof toggleCookingMode === 'function') {
      if (!isCookingMode) toggleCookingMode();
    } else {
      isCookingMode = true;
      renderDetail(recipes[0].id);
    }
  });
  await sleep(900);
  await dismissOverlays(page);
  await page.evaluate(() => {
    document.querySelector('.cook-begin, .cook-nav, .cook-prepare, #cook-sheet')?.scrollIntoView({ block: 'center' });
  });
  await sleep(300);
  const cookSizes = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { h: Math.round(box.height), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
    };
    return {
      begin: pick('.cook-begin'),
      next: pick('.cook-nav-btn--next'),
      prev: pick('.cook-nav-btn:not(.cook-nav-btn--next)'),
      exit: pick('.cooking-mode-exit-btn'),
      phase: typeof cookSession !== 'undefined' ? cookSession?.phase : null
    };
  });
  console.log(`cook@${width}`, JSON.stringify(cookSizes));
  await shot(page, width, 'cook');

  // Leave cooking
  await page.evaluate(() => {
    if (typeof exitCookingMode === 'function') exitCookingMode();
    else {
      isCookingMode = false;
      cookSession = null;
      renderDetail(recipes[0].id);
    }
  });
  await sleep(400);

  // 4) Settings — Opslaan/Uitloggen pair (equal width at 390)
  await page.evaluate(() => renderSettings());
  await sleep(700);
  await dismissOverlays(page);
  await page.evaluate(() => {
    document.querySelectorAll('.settings-status, .index-plan-kicker, .index-plan-detail').forEach((n) => {
      if (/Testmodus Premium|Test mode Premium|Testmodus|Test mode/i.test(n.textContent || '')) {
        n.style.visibility = 'hidden';
      }
    });
    document.querySelectorAll('.settings-row').forEach((row) => {
      if (/Huidig plan|Current plan/i.test(row.textContent || '') && /Testmodus|Test mode/i.test(row.textContent || '')) {
        row.style.display = 'none';
      }
    });
    const pairs = [...document.querySelectorAll('.settings-actions.button-pair')];
    const target = pairs.find((row) => row.querySelectorAll('button').length >= 2) || pairs[0];
    target?.scrollIntoView({ block: 'center' });
    if (target) target.dataset.shotPair = '1';
  });
  await sleep(250);
  const pair = await page.evaluate(() => {
    const row = document.querySelector('.settings-actions.button-pair[data-shot-pair="1"]')
      || [...document.querySelectorAll('.settings-actions.button-pair')].find((el) => el.querySelectorAll('button').length >= 2);
    if (!row) return null;
    const rowBox = row.getBoundingClientRect();
    return {
      rowW: Math.round(rowBox.width),
      buttons: [...row.querySelectorAll('button')].map((b) => {
        const box = b.getBoundingClientRect();
        const style = getComputedStyle(b);
        return {
          text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
          w: Math.round(box.width),
          h: Math.round(box.height),
          radius: style.borderRadius,
          bg: style.backgroundColor
        };
      })
    };
  });
  console.log(`settings-pair@${width}`, JSON.stringify(pair));
  await shot(page, width, 'settings-pair');

  // 5) Header + index cards (chrome radius/height)
  await page.evaluate(() => {
    indexViewMode = 'cards';
    userSettings.indexViewMode = 'cards';
    showListFilters = false;
    renderList();
  });
  await sleep(600);
  await dismissOverlays(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  await shot(page, width, 'index');

  await page.close();
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900']
});

try {
  for (const width of WIDTHS) {
    console.log(`=== ${PREFIX} ${PHASE} @ ${width} ===`);
    await runWidth(browser, width);
  }
} finally {
  await browser.close();
}

console.log(`done ${PREFIX} ${PHASE}`);
