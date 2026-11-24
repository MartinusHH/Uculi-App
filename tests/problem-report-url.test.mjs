import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, test } from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const start = html.indexOf('/* problem-report:start */');
const end = html.indexOf('/* problem-report:end */');
assert.ok(start >= 0 && end > start, 'problem-report block is present in app.html');

const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(
  `${html.slice(start, end)}\nglobalThis.__problemReport = { APP_VERSION, PROBLEM_REPORT_FORM, PROBLEM_REPORT_SCREENS, buildProblemReportUrl, normalizeProblemReportScreen, problemReportSettingsHtml, problemReportFooterHtml };`,
  context
);

const api = context.globalThis.__problemReport;
const {
  APP_VERSION,
  PROBLEM_REPORT_FORM,
  PROBLEM_REPORT_SCREENS,
  buildProblemReportUrl,
  normalizeProblemReportScreen,
  problemReportSettingsHtml,
  problemReportFooterHtml
} = api;

const REAL = {
  appEntry: PROBLEM_REPORT_FORM.appEntry,
  techEntry: PROBLEM_REPORT_FORM.techEntry,
  nl: PROBLEM_REPORT_FORM.nl.url,
  en: PROBLEM_REPORT_FORM.en.url
};

const EXAMPLE_NL = 'https://example.invalid/form';
const EXAMPLE_EN = 'https://example.invalid/form-en';

function useExampleForms() {
  PROBLEM_REPORT_FORM.appEntry = 'entry.1';
  PROBLEM_REPORT_FORM.techEntry = 'entry.2';
  PROBLEM_REPORT_FORM.nl.url = EXAMPLE_NL;
  PROBLEM_REPORT_FORM.en.url = EXAMPLE_EN;
}

function clearFormUrls() {
  PROBLEM_REPORT_FORM.nl.url = '';
  PROBLEM_REPORT_FORM.en.url = '';
}

function restoreReal() {
  PROBLEM_REPORT_FORM.appEntry = REAL.appEntry;
  PROBLEM_REPORT_FORM.techEntry = REAL.techEntry;
  PROBLEM_REPORT_FORM.nl.url = REAL.nl;
  PROBLEM_REPORT_FORM.en.url = REAL.en;
}

function exampleUrl(base, screen) {
  const tech = `${APP_VERSION} · ${screen}`;
  return `${base}?usp=pp_url&entry.1=Uculi&entry.2=${encodeURIComponent(tech)}`;
}

describe('problem report url', { concurrency: false }, () => {
  test('empty url hides the settings button and the footer link', () => {
    useExampleForms();
    clearFormUrls();
    assert.equal(buildProblemReportUrl('nl', 'settings'), '');
    assert.equal(buildProblemReportUrl('en', 'settings'), '');
    assert.equal(problemReportSettingsHtml('nl', 'settings', 'Probleem melden', 'app-btn-secondary'), '');
    assert.equal(problemReportFooterHtml('nl', 'other', 'Probleem melden'), '');
    assert.equal(problemReportSettingsHtml('en', 'settings', 'Report a problem', 'app-btn-secondary'), '');
    assert.equal(problemReportFooterHtml('en', 'other', 'Report a problem'), '');
  });

  test('fictional forms encode technical info into two fields', () => {
    useExampleForms();
    const url = buildProblemReportUrl('nl', 'a b&c');
    const tech = `${APP_VERSION} · other`;
    assert.equal(normalizeProblemReportScreen('a b&c'), 'other');
    assert.equal(url, exampleUrl(EXAMPLE_NL, 'other'));
    assert.equal(url.includes('entry.1=Uculi'), true);
    assert.equal(url.includes(`entry.2=${encodeURIComponent(tech)}`), true);
    assert.equal(url.includes('entry.56646792'), false);
    assert.equal(url.includes(' '), false);
    assert.equal(url.includes('a b&c'), false);
    assert.equal(url.includes('a%20b%26c'), false);
    assert.equal(url.includes('·'), false);
    assert.equal(decodeURIComponent(url.split('entry.2=')[1]), tech);
  });

  test('English UI uses the en form and every other language uses nl', () => {
    useExampleForms();
    const nlUrl = buildProblemReportUrl('nl', 'shopping');
    const enUrl = buildProblemReportUrl('en', 'shopping');
    assert.equal(nlUrl, exampleUrl(EXAMPLE_NL, 'shopping'));
    assert.equal(enUrl, exampleUrl(EXAMPLE_EN, 'shopping'));
    assert.equal(buildProblemReportUrl('de', 'shopping'), nlUrl);
    assert.equal(buildProblemReportUrl('', 'index'), buildProblemReportUrl('nl', 'index'));
    PROBLEM_REPORT_FORM.en.url = '';
    assert.equal(buildProblemReportUrl('en', 'settings'), '');
    assert.equal(buildProblemReportUrl('nl', 'settings'), exampleUrl(EXAMPLE_NL, 'settings'));
  });

  test('unknown views and views with a recipe id stay on the allowlist', () => {
    useExampleForms();
    assert.deepEqual(
      [...PROBLEM_REPORT_SCREENS],
      ['index', 'recipe', 'editor', 'cook', 'shopping', 'browse', 'profile', 'settings', 'cover', 'other']
    );
    for (const name of PROBLEM_REPORT_SCREENS) {
      assert.equal(normalizeProblemReportScreen(name), name);
    }
    assert.equal(normalizeProblemReportScreen('detail'), 'recipe');
    assert.equal(normalizeProblemReportScreen('add'), 'editor');
    assert.equal(normalizeProblemReportScreen('beheer'), 'other');
    assert.equal(normalizeProblemReportScreen(''), 'other');

    const recipeView = 'detail/rec_991?uid=user_55';
    assert.equal(normalizeProblemReportScreen(recipeView), 'recipe');
    const recipeUrl = buildProblemReportUrl('nl', recipeView);
    assert.equal(recipeUrl, exampleUrl(EXAMPLE_NL, 'recipe'));
    assert.equal(recipeUrl.includes('rec_991'), false);
    assert.equal(recipeUrl.includes('user_55'), false);
    assert.equal(recipeUrl.includes('uid'), false);

    const titled = buildProblemReportUrl('nl', 'recipe/Tomato Soup');
    assert.equal(titled, exampleUrl(EXAMPLE_NL, 'recipe'));
    assert.equal(titled.includes('Tomato'), false);
    assert.equal(titled.includes('Soup'), false);

    const queried = buildProblemReportUrl('nl', 'settings?uid=user_1&recipe=rec_2');
    assert.equal(queried, exampleUrl(EXAMPLE_NL, 'settings'));
    assert.equal(queried.includes('user_1'), false);
    assert.equal(queried.includes('rec_2'), false);

    const fullUrl = 'https://uculi.example/recipe/123?uid=abc';
    assert.equal(normalizeProblemReportScreen(fullUrl), 'other');
    const blocked = buildProblemReportUrl('nl', fullUrl);
    assert.equal(blocked, exampleUrl(EXAMPLE_NL, 'other'));
    assert.equal(blocked.includes('uculi.example'), false);
    assert.equal(blocked.includes('123'), false);
    assert.equal(blocked.includes('abc'), false);

    const emailView = buildProblemReportUrl('nl', 'profile/chef@example.com');
    assert.equal(emailView, exampleUrl(EXAMPLE_NL, 'other'));
    assert.equal(emailView.includes('chef'), false);
    assert.equal(emailView.includes('example.com'), false);
    assert.equal(normalizeProblemReportScreen('profile/uid_abc123'), 'profile');
    assert.equal(buildProblemReportUrl('nl', 'profile/uid_abc123').includes('uid_abc123'), false);
  });

  test('filled controls are new-tab links and disappear again when the url is cleared', () => {
    useExampleForms();
    const settings = problemReportSettingsHtml('nl', 'settings', 'Probleem melden', 'app-btn-secondary');
    const footer = problemReportFooterHtml('en', 'other', 'Report a problem');
    assert.match(settings, /id="report-problem-settings"/);
    assert.match(settings, /class="app-btn-secondary"/);
    assert.match(settings, /target="_blank"/);
    assert.match(settings, /rel="noopener noreferrer"/);
    assert.match(settings, /aria-label="Probleem melden"/);
    assert.match(settings, /title="Probleem melden"/);
    assert.match(settings, /<svg/);
    const settingsHref = settings.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
    assert.equal(settingsHref, buildProblemReportUrl('nl', 'settings'));
    assert.match(footer, /id="report-problem-footer"/);
    assert.match(footer, /target="_blank"/);
    assert.match(footer, /rel="noopener noreferrer"/);
    assert.equal(footer.includes('<svg'), false);
    assert.equal(footer.includes(EXAMPLE_EN), true);
    clearFormUrls();
    assert.equal(problemReportSettingsHtml('nl', 'settings', 'Probleem melden', 'app-btn-secondary'), '');
    assert.equal(problemReportFooterHtml('nl', 'other', 'Probleem melden'), '');
  });

  test('shipped config has two shared fields and no third screen entry', () => {
    restoreReal();
    assert.equal(REAL.appEntry, 'entry.984342368');
    assert.equal(REAL.techEntry, 'entry.1371737567');
    assert.equal(REAL.nl, 'https://docs.google.com/forms/d/e/1FAIpQLSfUdUosLuN4iEuxw-OT-0-Xwn4iGdjT6Sxxrgkll2Jf8yH3pw/viewform');
    assert.equal(REAL.en, 'https://docs.google.com/forms/d/e/1FAIpQLSdiCbTVI_mGQSOI7eB7g5nxx10mCH0Pf6reA1TNTGzz8paluQ/viewform');
    assert.equal(Object.hasOwn(PROBLEM_REPORT_FORM, 'screenEntry'), false);
    assert.equal(Object.hasOwn(PROBLEM_REPORT_FORM.nl, 'techEntry'), false);
    assert.equal(html.includes('entry.56646792'), false);

    const nlUrl = buildProblemReportUrl('nl', 'settings');
    const enUrl = buildProblemReportUrl('en', 'cover');
    const tech = `${APP_VERSION} · settings`;
    assert.equal(nlUrl, `${REAL.nl}?usp=pp_url&${REAL.appEntry}=Uculi&${REAL.techEntry}=${encodeURIComponent(tech)}`);
    assert.equal(enUrl.startsWith(`${REAL.en}?usp=pp_url&${REAL.appEntry}=Uculi&${REAL.techEntry}=`), true);
    for (const url of [nlUrl, enUrl]) {
      const ids = [...url.matchAll(/entry\.\d+/g)].map((match) => match[0]);
      assert.deepEqual(ids, [REAL.appEntry, REAL.techEntry]);
      assert.equal(ids.length, 2);
      assert.equal(url.includes('entry.56646792'), false);
    }
    assert.equal(decodeURIComponent(enUrl.split(`${REAL.techEntry}=`)[1]), `${APP_VERSION} · cover`);
  });
});
