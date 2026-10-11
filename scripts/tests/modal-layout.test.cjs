// Source/artifact contracts only; native scrolling and focus require browser QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(process.env.HANDY_CONVERT_HTML || path.join(root, 'src/index.template.html'), 'utf8');
const css = source.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.config.json'), 'utf8'));

test('native modal state locks both document scroll containers', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const selector of ['html:has(dialog:modal)', 'body:has(dialog:modal)']) {
    const declarations = rules.filter(([, selectors]) => selectors.split(',').some(value => value.trim() === selector))
      .map(([, , body]) => body).join(';');
    assert.match(declarations, /(?:^|;)\s*overflow\s*:\s*hidden\s*(?:;|$)/, `${selector} must prevent background wheel scrolling only while modal`);
  }
});

test('Help retains its bounded shell and separately scrollable content', () => {
  assert.match(css, /dialog\s*\{[^}]*max-height:\s*min\(760px,\s*calc\(100dvh - 28px\)\)/);
  assert.match(css, /dialog\[open\]\s*\{\s*display:\s*flex;\s*\}/);
  assert.match(css, /\.dialog-body\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;[^}]*overscroll-behavior:\s*contain;/);
  assert.match(source, /<dialog id="helpDialog" aria-labelledby="helpDialogTitle">/);
  assert.match(source, /const openHelpDialog = \(\) => \{ helpDialog\.showModal\(\);/);
  assert.match(source, /\$\('#closeHelpButton'\)\.addEventListener\('click', \(\) => helpDialog\.close\(\)\)/);
});

test('initial version labels match the release config before initialization', () => {
  assert.equal(source.match(/id="versionBadge">([^<]+)/)[1], `v${config.version}`);
  assert.equal(source.match(/id="buildVersion">([^<]+)/)[1], config.version);
});

test('Help explains dismissal in both languages', () => {
  const help = source.match(/<!-- APP:HELP:BEGIN -->([\s\S]*?)<!-- APP:HELP:END -->/)[1];
  assert.match(help, /data-i18n="helpDialogScroll"/);
  assert.match(source, /helpDialogScroll: '[^']*閉じる[^']*Escape[^']*'/);
  assert.match(source, /helpDialogScroll: '[^']*Close[^']*Escape[^']*'/);
});

test('local-processing badge retains its existing shield icon', () => {
  const badge = source.match(/<div class="local-badge">([\s\S]*?)<\/div>/)[1];
  assert.match(badge, /<svg[^>]*aria-hidden="true"/);
  assert.match(badge, /<path d="M12 3 5 6v5c0 4\.6 2\.8 8 7 10 4\.2-2 7-5\.4 7-10V6z"/);
  assert.match(badge, /data-i18n="localBadge"/);
});
