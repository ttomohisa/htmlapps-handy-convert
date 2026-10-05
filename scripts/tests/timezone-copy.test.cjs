// Exercise real time conversion/copy functions with Intl and minimal DOM/clipboard adapters.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(process.env.HANDY_CONVERT_HTML || path.join(__dirname, '../../src/index.template.html'), 'utf8');
function extract(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Production section exists: ${start}`);
  return source.slice(from, to);
}
function setup({ language = 'en', localTimeZone = 'UTC', fallback = false } = {}) {
  const elements = new Map(), copied = [], toasts = [], observers = new Map();
  let selectedArea;
  function element(id = '') {
    let text = '';
    return { id, value: '', hidden: false, checked: false, disabled: false, children: [], dataset: {}, style: {},
      set textContent(value) { text = value; this.children = []; for (const notify of observers.get(this) || []) queueMicrotask(notify); },
      get textContent() { return text; },
      append(...children) { this.children.push(...children); },
      focus() { document.activeElement = this; }, select() { selectedArea = this; }, remove() {},
      setAttribute() {}, removeAttribute() {}, addEventListener(type, callback) { this[type] = callback; }
    };
  }
  function get(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); }
  const buttons = [...source.matchAll(/<button\b[^>]*data-copy-target="([^"]+)"[^>]*>/g)].map(([html, target]) => {
    const button = element(); button.dataset.copyTarget = target; button.disabled = /\bdisabled\b/.test(html); return button;
  });
  const document = {
    getElementById: get, querySelector: get, createElement: element, body: { append() {} }, activeElement: get('timezoneTime'),
    execCommand(command) { assert.equal(command, 'copy'); copied.push(selectedArea.value); return true; }
  };
  const context = {
    language, localTimeZone, storageKeys: { cities: 'cities' }, document,
    localStorage: { getItem: () => '[]' },
    navigator: fallback ? {} : { clipboard: { writeText: async value => copied.push(value) } },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe(target) { observers.set(target, [...(observers.get(target) || []), this.callback]); } },
    AppToast: { show(value) { toasts.push(value); } },
    $: selector => get(selector.slice(1)), $$: selector => selector === '[data-copy-target]' ? buttons : []
  };
  vm.createContext(context);
  vm.runInContext([
    extract('      const DAY_MS =', '      const localTimeZone ='),
    extract('      function readStorage(', '      function detectLanguage('),
    extract('      function t(', '      function addDays('),
    extract('      function setError(', '      const AppToast ='),
    extract('      function cityById(', '      function syncDesktopTabs('),
    extract('      const FULL_TO_HALF_KANA =', '      function setCategory('),
    extract('      function copyTargetHasValue(', '      const today = readToday();'),
    'globalThis.state = { instant: () => timezoneCandidates[timezoneOccurrenceIndex], choose: index => { timezoneOccurrenceIndex = index; updateTimezoneConversion(); } };'
  ].join('\n'), context);
  context.setupCopyButtonStates();
  const binding = source.split('\n').find(line => line.includes("$$('[data-copy-target]').forEach(button => button.addEventListener"));
  vm.runInContext(binding, context);
  function convert({ from = 'local', to = 'tokyo', date = '2026-10-05', time = '12:34', occurrence = 0 } = {}) {
    get('timezoneSource').value = from; get('timezoneTarget').value = to;
    get('timezoneDate').value = date; get('timezoneTime').value = time;
    context.updateTimezoneConversion({ resetOccurrence: true });
    if (occurrence) context.state.choose(occurrence);
  }
  return { context, get, copied, toasts, buttons, convert, iso: () => get('timezoneResultIso').textContent, instant: () => context.state.instant()?.toISOString() };
}

for (const language of ['ja', 'en']) for (const fallback of [false, true]) {
  test(`${language} ${fallback ? 'fallback' : 'native'}: Copy ISO copies a distinct minute-precision value`, async () => {
    const app = setup({ language, fallback }); app.convert();
    await Promise.resolve();
    const isoButton = app.buttons.find(button => button.dataset.copyTarget === 'timezoneResultIso');
    assert.ok(isoButton, 'A separate ISO copy action is present');
    assert.equal(isoButton.disabled, false);
    await isoButton.click();
    assert.deepEqual(app.copied, ['2026-10-05T21:34+09:00']);
    await app.context.copyResult('timezoneResultCopy');
    assert.equal(app.copied[1], `${app.context.formatZoneFullDate(new Date('2026-10-05T12:34:00Z'), 'Asia/Tokyo')} 21:34 · ${language === 'ja' ? '東京' : 'Tokyo'}`);
    assert.equal(app.toasts.at(-1).message, app.context.t('copied'));
  });
}

for (const [name, options, conversion, expected] of [
  ['UTC', {}, { to: 'local' }, '2026-10-05T12:34+00:00'],
  ['half-hour offset', {}, { to: 'delhi' }, '2026-10-05T18:04+05:30'],
  ['quarter-hour offset', {}, { to: 'kathmandu' }, '2026-10-05T18:19+05:45'],
  ['negative half-hour offset', { localTimeZone: 'America/St_Johns' }, { from: 'tokyo', to: 'local', date: '2026-01-01', time: '12:00' }, '2025-12-31T23:30-03:30'],
  ['year rollover', {}, { to: 'tokyo', date: '2026-12-31', time: '23:59' }, '2027-01-01T08:59+09:00'],
  ['year 0001', {}, { to: 'local', date: '0001-01-01', time: '00:00' }, '0001-01-01T00:00+00:00'],
  ['year 0099', {}, { to: 'local', date: '0099-12-31', time: '23:59' }, '0099-12-31T23:59+00:00'],
  ['year 9999', {}, { to: 'local', date: '9999-12-31', time: '23:59' }, '9999-12-31T23:59+00:00'],
  ['BC UTC instant with supported destination year', { localTimeZone: 'Etc/GMT-14' }, { from: 'local', to: 'local', date: '0001-01-01', time: '00:00' }, '0001-01-01T00:00+14:00']
]) test(`Copy ISO handles ${name} without localized parsing`, () => {
  const app = setup(options); app.convert(conversion);
  assert.equal(app.iso(), expected);
  app.context.formatZoneFullDate = () => 'not a parseable date';
  app.context.formatWorldTime = () => 'not a parseable time';
  app.context.language = 'ja'; app.context.updateTimezoneConversion();
  assert.equal(app.iso(), expected, 'ISO value is independent of display strings and language');
  assert.equal(new Date(app.iso()).toISOString(), app.instant(), 'The numeric offset identifies the same instant');
});

test('Destination overlap occurrences have distinct ISO offsets while existing localized copy is unchanged', () => {
  const app = setup();
  app.convert({ from: 'tokyo', to: 'new-york', date: '2026-11-01', time: '14:30' });
  const firstLocalized = app.get('timezoneResultCopy').textContent;
  assert.equal(app.iso(), '2026-11-01T01:30-04:00');
  app.convert({ from: 'tokyo', to: 'new-york', date: '2026-11-01', time: '15:30' });
  assert.equal(app.get('timezoneResultCopy').textContent, firstLocalized);
  assert.equal(app.iso(), '2026-11-01T01:30-05:00');
  app.context.swapTimezones();
  assert.equal(app.iso(), '2026-11-01T15:30+09:00');
  app.context.state.choose(0);
  assert.equal(app.iso(), '2026-11-01T14:30+09:00');
  app.context.swapTimezones();
  assert.equal(app.iso(), '2026-11-01T01:30-04:00');
});

for (const [name, conversion] of [
  ['empty input', { date: '' }], ['invalid date', { date: '2026-02-30' }],
  ['invalid time', { time: '24:00' }], ['invalid source', { from: 'unknown' }],
  ['DST gap', { from: 'new-york', date: '2026-03-08', time: '02:30' }],
  ['historical source', { from: 'paris', date: '1900-01-01' }],
  ['historical destination', { to: 'paris', date: '1900-01-01' }],
  ['destination year overflow', { date: '9999-12-31', time: '23:00' }]
]) test(`Both copy actions clear and disable after ${name}, then recover`, async () => {
  const app = setup(); app.convert(); await Promise.resolve();
  assert.equal(app.iso(), '2026-10-05T21:34+09:00');
  app.convert(conversion); await Promise.resolve();
  for (const id of ['timezoneResultCopy', 'timezoneResultIso']) {
    assert.equal(app.get(id).textContent, '');
    assert.equal(app.buttons.find(button => button.dataset.copyTarget === id).disabled, true);
    await app.context.copyResult(id);
  }
  assert.deepEqual(app.copied, []);
  app.convert(); await Promise.resolve();
  assert.equal(app.buttons.find(button => button.dataset.copyTarget === 'timezoneResultIso').disabled, false);
  await app.context.copyResult('timezoneResultIso');
  assert.deepEqual(app.copied, ['2026-10-05T21:34+09:00']);
});

test('Unsupported historical overlap can select its supported occurrence and clear it again', async () => {
  const app = setup(); app.convert({ from: 'paris', to: 'local', date: '1911-03-10', time: '23:55' });
  assert.equal(app.iso(), '');
  app.context.state.choose(1); await Promise.resolve();
  assert.equal(app.iso(), '1911-03-10T23:55+00:00');
  assert.equal(app.buttons.find(button => button.dataset.copyTarget === 'timezoneResultIso').disabled, false);
  app.context.state.choose(0); await Promise.resolve();
  assert.equal(app.iso(), '');
  assert.equal(app.buttons.find(button => button.dataset.copyTarget === 'timezoneResultIso').disabled, true);
});

test('Both languages define Copy ISO and explain the format in in-app help', () => {
  for (const language of ['ja', 'en']) {
    const app = setup({ language });
    assert.notEqual(app.context.t('copyIso'), 'copyIso');
    assert.match(app.context.t('helpTimeCopyIso'), /YYYY-MM-DDTHH:mm±HH:mm/);
  }
  const help = source.slice(source.indexOf('APP:HELP:BEGIN'), source.indexOf('APP:HELP:END'));
  assert.match(help, /data-i18n="helpTimeCopyIso"/);
  assert.match(source, /data-copy-target="timezoneResultIso"[^>]*data-i18n="copyIso"/);
});

test('The two timezone copy actions can wrap with spacing on narrow screens', () => {
  // Static layout contract; actual browser viewport QA is deliberately separate.
  assert.match(source, /\.timezone-result\s+\.result-action-row\s*\{[^}]*gap:\s*8px;[^}]*flex-wrap:\s*wrap;/);
});

test('Unsupported runtime timezone data clears both prior copy values', async () => {
  const app = setup({ localTimeZone: 'Not/A_Time_Zone' });
  app.convert({ from: 'tokyo', to: 'new-york' }); await Promise.resolve();
  assert.notEqual(app.iso(), '');
  app.convert({ from: 'tokyo', to: 'local' }); await Promise.resolve();
  assert.equal(app.iso(), '');
  assert.equal(app.get('timezoneResultCopy').textContent, '');
  assert.equal(app.buttons.find(button => button.dataset.copyTarget === 'timezoneResultIso').disabled, true);
});
