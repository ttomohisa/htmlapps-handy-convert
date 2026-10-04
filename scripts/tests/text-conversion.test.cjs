// Execute the production text workflow with minimal browser adapters. No runtime/test dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(process.env.HANDY_CONVERT_HTML || path.join(__dirname, '../../src/index.template.html'), 'utf8');
const resultIds = ['hiraganaResult', 'katakanaResult', 'halfwidthKanaResult', 'fullwidthResult', 'halfwidthResult'];
function extract(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Production section exists: ${start}`);
  return source.slice(from, to);
}
function setup({ fallback = false, copyOk = true, copyThrows = false } = {}) {
  const elements = new Map(), copied = [], areas = [], toasts = [];
  function element(id = '') {
    const classes = new Set();
    return { id, value: '', textContent: '', checked: true, disabled: false, dataset: {}, style: {},
      classList: { contains: name => classes.has(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
      focus() { document.activeElement = this; }, select() { document.activeElement = this; },
      setAttribute() {}, remove() { this.removed = true; },
      addEventListener(type, fn) { this[type] = fn; }
    };
  }
  for (const id of ['textInput', 'clearTextButton', 'textCharacterCount', 'widthLetters', 'widthDigits', 'widthSymbols', 'widthSpaces', 'dateResult', ...resultIds]) elements.set(id, element(id));
  const copyButtons = [...resultIds, 'dateResult'].map(id => ({ dataset: { copyTarget: id }, disabled: false }));
  const reuseButtons = [...source.matchAll(/data-reuse-target="([^"]+)"/g)].map(([, id]) => ({ dataset: { reuseTarget: id }, disabled: false, addEventListener(type, fn) { this[type] = fn; } }));
  const document = {
    activeElement: elements.get('textInput'),
    getElementById: id => elements.get(id),
    createElement() { const area = element(); areas.push(area); return area; },
    body: { append() {} },
    execCommand(command) { assert.equal(command, 'copy'); if (copyThrows) throw new Error('Copy unavailable'); if (copyOk) copied.push(areas.at(-1).value); return copyOk; }
  };
  const context = {
    document, navigator: fallback ? {} : { clipboard: { writeText: async value => copied.push(value) } },
    MutationObserver: class { observe() {} }, language: 'en',
    t: (key, params = {}) => `${key}${params.n ?? ''}`, AppToast: { show(value) { toasts.push(value); } },
    $: selector => elements.get(selector.slice(1)),
    $$: selector => selector === '[data-copy-target]' ? copyButtons : selector === '[data-reuse-target]' ? reuseButtons : []
  };
  vm.createContext(context);
  vm.runInContext(extract('      const FULL_TO_HALF_KANA =', '      function setCategory'), context);
  vm.runInContext(extract('      function copyTargetHasValue', '      const today = readToday();'), context);
  for (const line of source.split('\n').filter(line => line.includes("$('#textInput').addEventListener('input'") || line.includes("$('#clearTextButton').addEventListener('click'") || line.includes("$$('[data-reuse-target]').forEach(button => button.addEventListener"))) vm.runInContext(line, context);
  function type(value) { elements.get('textInput').value = value; elements.get('textInput').input(); }
  function reuse(id) { const button = reuseButtons.find(item => item.dataset.reuseTarget === id); assert.ok(button, `Reuse button exists for ${id}`); if (!button.disabled) button.click(); }
  context.updateTextConversions(); context.setupCopyButtonStates();
  return { context, elements, copied, copyButtons, reuseButtons, type, reuse, toasts, areas, document };
}

for (const fallback of [false, true]) {
  for (const [name, input, result, expected] of [
    ['surrounding spaces and multiline kana', '  ABC がぱ\n\n', 'katakanaResult', '  ABC ガパ\n\n'],
    ['whitespace-only full-width output', ' \n\t ', 'fullwidthResult', '　\n\t　'],
    ['literal em dash', '—', 'katakanaResult', '—'],
    ['emoji, kanji and mixed kana', '\nＡｂ12 がﾊﾟ漢字😀\n', 'halfwidthResult', '\nAb12 がﾊﾟ漢字😀\n']
  ]) test(`${fallback ? 'Fallback' : 'Clipboard API'} preserves ${name}`, async () => {
    const c = setup({ fallback }); c.type(input);
    assert.equal(c.context.copyTargetHasValue(c.elements.get(result)), true);
    await c.context.copyResult(result); assert.equal(c.copied[0], expected);
  });
}
test('Empty text and invalid date placeholders cannot be copied', async () => {
  const c = setup();
  for (const id of [...resultIds, 'dateResult']) { c.elements.get('dateResult').textContent = '—'; assert.equal(c.context.copyTargetHasValue(c.elements.get(id)), false); await c.context.copyResult(id); }
  assert.deepEqual(c.copied, []);
  c.elements.get('dateResult').textContent = '  2026-10-04 (Sunday)  '; await c.context.copyResult('dateResult'); assert.equal(c.copied[0], '2026-10-04 (Sunday)');
});
test('All five text results have disabled reuse actions for empty or identical input', () => {
  const c = setup(); assert.equal(c.reuseButtons.length, 5); assert.ok(c.reuseButtons.every(button => button.disabled));
  c.type('漢字😀—\n'); assert.ok(c.reuseButtons.every(button => button.disabled));
  c.reuse('hiraganaResult'); assert.equal(c.toasts.length, 0);
});
test('Chain katakana, full width, half width and hiragana without losing text', () => {
  const c = setup(); c.type('  abc12 がぱ漢字😀\n');
  c.reuse('katakanaResult'); assert.equal(c.elements.get('textInput').value, '  abc12 ガパ漢字😀\n');
  c.reuse('fullwidthResult'); assert.equal(c.elements.get('textInput').value, '　　ａｂｃ１２　ガパ漢字😀\n');
  c.reuse('halfwidthResult'); assert.equal(c.elements.get('textInput').value, '  abc12 ｶﾞﾊﾟ漢字😀\n');
  c.reuse('hiraganaResult'); assert.equal(c.elements.get('textInput').value, '  abc12 がぱ漢字😀\n');
  assert.equal(c.document.activeElement.id, 'textInput');
});
test('Reuse and Clear Undo restore the previous exact input immediately', () => {
  const c = setup(); const original = ' が\n'; c.type(original); c.reuse('katakanaResult'); c.toasts.at(-1).onAction(); assert.equal(c.elements.get('textInput').value, original);
  c.elements.get('clearTextButton').click(); assert.equal(c.elements.get('textInput').value, ''); c.toasts.at(-1).onAction(); assert.equal(c.elements.get('textInput').value, original);
});
for (const action of ['clear', 'reuse']) test(`${action} Undo cannot overwrite newer edits, even if the value returns to the replacement`, () => {
  const c = setup(); c.type('かな'); if (action === 'clear') c.elements.get('clearTextButton').click(); else c.reuse('katakanaResult');
  const undo = c.toasts.at(-1).onAction, replacement = c.elements.get('textInput').value;
  c.type('new draft'); undo(); assert.equal(c.elements.get('textInput').value, 'new draft');
  c.type(replacement); undo(); assert.equal(c.elements.get('textInput').value, replacement);
});
test('Clear Undo cannot overwrite a value changed without an input event', () => {
  const c = setup(); c.type('old draft'); c.elements.get('clearTextButton').click(); c.elements.get('textInput').value = 'new draft'; c.toasts.at(-1).onAction(); assert.equal(c.elements.get('textInput').value, 'new draft');
});
test('Older replacement Undo is stale after successive reuse and only newest Undo applies', () => {
  const c = setup(); c.type('かな'); c.reuse('katakanaResult'); const firstUndo = c.toasts.at(-1).onAction;
  c.reuse('halfwidthKanaResult'); const lastUndo = c.toasts.at(-1).onAction;
  firstUndo(); assert.equal(c.elements.get('textInput').value, 'ｶﾅ'); lastUndo(); assert.equal(c.elements.get('textInput').value, 'カナ'); firstUndo(); assert.equal(c.elements.get('textInput').value, 'カナ');
});
test('Width toggles and language refresh recalculate actions without invalidating Undo', () => {
  const c = setup(); c.type(' a1! が'); c.reuse('katakanaResult'); const undo = c.toasts.at(-1).onAction;
  for (const id of ['widthLetters', 'widthDigits', 'widthSymbols', 'widthSpaces']) c.elements.get(id).checked = false;
  c.context.language = 'ja'; c.context.updateTextConversions(); assert.equal(c.elements.get('fullwidthResult').textContent, ' a1! ガ');
  c.reuse('fullwidthResult'); assert.equal(c.toasts.length, 1); undo(); assert.equal(c.elements.get('textInput').value, ' a1! が');
});
test('Large multiline input preserves exact content and code-point count', () => {
  const c = setup(); const input = ' がぱ漢字😀 \n'.repeat(10000); c.type(input);
  assert.equal(c.elements.get('katakanaResult').textContent, input.replaceAll('がぱ', 'ガパ'));
  assert.equal(c.elements.get('textCharacterCount').textContent, `characterCount${new Intl.NumberFormat('en-US').format(Array.from(input).length)}`);
});
test('Fallback failure reports failure and removes temporary textarea', async () => {
  const c = setup({ fallback: true, copyOk: false }); c.type('かな'); await c.context.copyResult('katakanaResult'); assert.equal(c.toasts.at(-1).message, 'copyFailed'); assert.equal(c.areas.at(-1).removed, true);
});
test('Copy finishing after Clear preserves the newer Undo toast', async () => {
  const c = setup(); let finishCopy; c.context.navigator.clipboard.writeText = () => new Promise(resolve => { finishCopy = resolve; });
  c.type('かな'); const pendingCopy = c.context.copyResult('katakanaResult'); c.elements.get('clearTextButton').click(); const undoToast = c.toasts.at(-1);
  finishCopy(); await pendingCopy; assert.equal(c.toasts.at(-1), undoToast); undoToast.onAction(); assert.equal(c.elements.get('textInput').value, 'かな');
});
test('Throwing fallback reports failure, cleans up and restores focus', async () => {
  const c = setup({ fallback: true, copyThrows: true }); c.type('かな'); await c.context.copyResult('katakanaResult');
  assert.equal(c.toasts.at(-1).message, 'copyFailed'); assert.equal(c.areas.at(-1).removed, true); assert.equal(c.document.activeElement.id, 'textInput');
});

test('Complete inline application script parses and both languages define the new actions/help', () => {
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(script.replace('__APP_CONFIG_JSON__', '{}').replace('__BUILD_MANIFEST_JSON__', '{}').replace('__EMBEDDED_ASSET_BUNDLE_JSON__', '{}'));
  const c = vm.createContext({});
  vm.runInContext(extract('      const translations =', '      const ERAS =') + '; globalThis.copy = translations;', c);
  for (const language of ['ja', 'en']) for (const key of ['useAsInput', 'textReused', 'helpTextReuse', 'helpTextUndo']) assert.ok(c.copy[language][key], `${language} defines ${key}`);
});
test('Smartphone CSS gives text result cards one column through the 600px navigation breakpoint', () => {
  // Contract check only: actual viewport layout still requires browser QA.
  const mobileCss = source.slice(source.indexOf('@media (max-width: 600px)'), source.indexOf('@media (max-width: 360px)'));
  assert.match(mobileCss, /\.text-result-grid\.three,\s*\.text-result-grid\.two\s*\{\s*grid-template-columns:\s*1fr;/);
});
