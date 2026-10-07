// Execute production time/state functions with real Intl data and minimal browser adapters.
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

function setup({ savedCities = null, localTimeZone = 'UTC', storageUnavailable = false } = {}) {
  const elements = new Map(), toasts = [], storage = new Map();
  if (savedCities !== null) storage.set('cities', savedCities);
  function element() {
    let content = '';
    return {
      value: '', hidden: false, checked: false, dataset: {}, children: [],
      set textContent(value) { content = value; this.children = []; },
      get textContent() { return content; },
      append(...children) { this.children.push(...children); },
      attrs: {}, setAttribute(key, value) { this.attrs[key] = String(value); }, removeAttribute(key) { delete this.attrs[key]; },
      getAttribute(key) { return this.attrs[key] ?? null; },
      addEventListener(type, callback) { this[type] = callback; }
    };
  }
  function getElement(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }
  const translated = [...source.matchAll(/<[^>]+\bdata-i18n(?:-[\w-]+)?="[^"]+"[^>]*>/g)].map(([html], index) => {
    const node = getElement(html.match(/\bid="([^"]+)"/)?.[1] || `translated-${index}`);
    for (const [, key, value] of html.matchAll(/data-(i18n[\w-]*)="([^"]+)"/g)) node.dataset[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    return node;
  });
  const context = {
    DAY_MS: 86400000, localTimeZone, storageKeys: { cities: 'cities', language: 'language' }, language: 'en',
    localStorage: {
      getItem(key) { if (storageUnavailable) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageUnavailable) throw new Error('Storage unavailable'); storage.set(key, value); }
    },
    $: selector => getElement(selector.slice(1)), $$: selector => { const key = selector.match(/^\[data-([\w-]+)\]$/)?.[1]?.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); return key ? translated.filter(node => key in node.dataset) : []; },
    APP_CONFIG: { name: 'Handy Convert' }, populateEraSelect() {}, refreshAllResults() {},
    document: { documentElement: {}, createElement: element, querySelector: selector => getElement(selector) },
    t: key => key, AppToast: { show(toast) { toasts.push(toast); } }
  };
  vm.createContext(context);
  vm.runInContext([
    extract('      const translations =', '      const localTimeZone ='),
    extract('      function readStorage(', '      function detectLanguage('),
    extract('      function readToday(', '      function addDays('),
    extract('      function setError(', '      const AppToast ='),
    extract('      function cityById(', '      function syncDesktopTabs('),
    extract('      function applyLanguage()', '      function copyTargetHasValue('),
    source.split('\n').find(line => line.trimStart().startsWith("$('#languageButton').addEventListener")),
    'globalThis.state = { cities: () => selectedCityIds, occurrence: () => timezoneOccurrenceIndex, instant: () => timezoneCandidates[timezoneOccurrenceIndex], chooseOccurrence: index => { timezoneOccurrenceIndex = index; updateTimezoneConversion(); } };'
  ].join('\n'), context);
  function convert({ from = 'tokyo', to = 'new-york', date = '2026-11-01', time = '15:30', occurrence = 0 } = {}) {
    getElement('timezoneSource').value = from; getElement('timezoneTarget').value = to;
    getElement('timezoneDate').value = date; getElement('timezoneTime').value = time;
    context.updateTimezoneConversion({ resetOccurrence: true });
    if (occurrence) context.state.chooseOccurrence(occurrence);
  }
  return { context, getElement, translated, storage, toasts, convert, cities: () => Array.from(context.state.cities()), instant: () => context.state.instant()?.toISOString() };
}

test('Saved empty World clock selection stays empty on reload', () => {
  const app = setup({ savedCities: '[]' });
  assert.deepEqual(app.cities(), []);
  app.context.renderWorldClocks();
  assert.equal(app.getElement('worldClockList').children.length, 1, 'Only the current location remains');
});

test('Removing the last city persists an empty selection that survives reload', () => {
  const app = setup({ savedCities: '["london"]' });
  app.context.removeWorldClockCity('london');
  assert.deepEqual(app.cities(), []);
  assert.equal(app.storage.get('cities'), '[]');
  assert.deepEqual(setup({ savedCities: app.storage.get('cities') }).cities(), []);
});

for (const [name, savedCities] of [
  ['missing', null], ['empty raw value', ''], ['malformed JSON', '{bad'],
  ['null', 'null'], ['object', '{}'], ['string', '"london"'], ['number', '42']
]) test(`${name} city storage uses the default selection`, () => {
  assert.deepEqual(setup({ savedCities }).cities(), ['tokyo', 'london', 'new-york', 'singapore']);
});

test('Unavailable storage uses defaults without throwing', () => {
  assert.deepEqual(setup({ storageUnavailable: true }).cities(), ['tokyo', 'london', 'new-york', 'singapore']);
});

test('Stored city selections still filter duplicates, unknown IDs and the local zone', () => {
  const app = setup({ savedCities: '["tokyo","london","london","unknown","new-york"]', localTimeZone: 'Asia/Tokyo' });
  assert.deepEqual(app.cities(), ['london', 'new-york']);
});

test('Undo after removing the last city restores and persists that city', () => {
  const app = setup({ savedCities: '["london"]' });
  app.context.removeWorldClockCity('london');
  app.toasts.at(-1).onAction();
  assert.deepEqual(app.cities(), ['london']);
  assert.equal(app.storage.get('cities'), '["london"]');
});

for (const [time, instant, occurrence] of [
  ['14:30', '2026-11-01T05:30:00.000Z', 0],
  ['15:30', '2026-11-01T06:30:00.000Z', 1]
]) test(`Swap into New York overlap preserves occurrence ${occurrence + 1} and the exact instant`, () => {
  const app = setup(); app.convert({ time });
  assert.equal(app.instant(), instant);
  assert.equal(app.getElement('timezoneResultTime').textContent, '01:30');
  app.context.swapTimezones();
  assert.equal(app.getElement('timezoneSource').value, 'new-york');
  assert.equal(app.getElement('timezoneTarget').value, 'tokyo');
  assert.equal(app.getElement('timezoneDate').value, '2026-11-01');
  assert.equal(app.getElement('timezoneTime').value, '01:30');
  assert.equal(app.instant(), instant);
  assert.equal(app.context.state.occurrence(), occurrence);
  assert.equal(app.getElement('timezoneResultTime').textContent, time);
  assert.equal(app.getElement('timezoneAmbiguity').hidden, false);
  assert.equal(app.getElement(`input[name="timezoneOccurrence"][value="${occurrence}"]`).checked, true);
});

for (const occurrence of [0, 1]) test(`Round-trip swap from overlap occurrence ${occurrence + 1} preserves the instant`, () => {
  const app = setup(); app.convert({ from: 'new-york', to: 'tokyo', time: '01:30', occurrence });
  const initialInstant = app.instant();
  app.context.swapTimezones(); assert.equal(app.instant(), initialInstant);
  app.context.swapTimezones(); assert.equal(app.instant(), initialInstant);
  assert.equal(app.getElement('timezoneTime').value, '01:30');
  assert.equal(app.context.state.occurrence(), occurrence);
});

test('Ordinary swap preserves a date-boundary conversion and supports swapping back', () => {
  const app = setup(); app.convert({ date: '2026-07-01', time: '08:15' });
  const initialInstant = app.instant();
  app.context.swapTimezones();
  assert.equal(app.getElement('timezoneDate').value, '2026-06-30');
  assert.equal(app.getElement('timezoneTime').value, '19:15');
  assert.equal(app.instant(), initialInstant);
  app.context.swapTimezones();
  assert.equal(app.getElement('timezoneDate').value, '2026-07-01');
  assert.equal(app.getElement('timezoneTime').value, '08:15');
  assert.equal(app.instant(), initialInstant);
});

test('DST gap and invalid input remain safe when swapping', () => {
  const app = setup(); app.convert({ from: 'new-york', to: 'tokyo', date: '2026-03-08', time: '02:30' });
  assert.equal(app.instant(), undefined);
  assert.equal(app.getElement('timezoneError').textContent, 'nonexistentLocalTime');
  app.context.swapTimezones();
  assert.equal(app.getElement('timezoneSource').value, 'tokyo');
  assert.equal(app.getElement('timezoneTime').value, '02:30');
  assert.equal(app.instant(), '2026-03-07T17:30:00.000Z');
  app.getElement('timezoneDate').value = ''; app.context.swapTimezones();
  assert.equal(app.getElement('timezoneError').textContent, 'invalidLocalDateTime');
  assert.equal(app.context.state.occurrence(), 0);
});

function freezeClock(app, now) {
  const NativeDate = vm.runInContext('Date', app.context);
  app.context.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return NativeDate.parse(now); }
  };
}

for (const [name, now, from, expected, occurrence] of [
  ['first New York overlap occurrence', '2026-11-01T05:30:42.123Z', 'new-york', '2026-11-01T05:30:00.000Z', 0],
  ['second New York overlap occurrence', '2026-11-01T06:30:42.123Z', 'new-york', '2026-11-01T06:30:00.000Z', 1],
  ['ordinary New York time', '2026-10-05T12:34:56.789Z', 'new-york', '2026-10-05T12:34:00.000Z', 0],
  ['Tokyo time', '2026-11-01T06:30:42.123Z', 'tokyo', '2026-11-01T06:30:00.000Z', 0],
  ['last minute before the spring gap', '2026-03-08T06:59:45.000Z', 'new-york', '2026-03-08T06:59:00.000Z', 0],
  ['first minute after the spring gap', '2026-03-08T07:00:45.000Z', 'new-york', '2026-03-08T07:00:00.000Z', 0]
]) test(`Current time preserves ${name} at minute precision`, () => {
  const app = setup(); app.convert({ from, to: from === 'tokyo' ? 'new-york' : 'tokyo' });
  freezeClock(app, now); app.context.setTimezoneNow();
  assert.equal(app.instant(), expected);
  assert.equal(app.context.state.occurrence(), occurrence);
  app.context.setTimezoneNow();
  assert.equal(app.instant(), expected, 'Repeated Current time remains stable');
});

for (const [now, occurrence] of [['2026-11-01T05:30:42.123Z', 0], ['2026-11-01T06:30:42.123Z', 1]]) {
  test(`Startup in New York preserves overlap occurrence ${occurrence + 1}`, () => {
    const app = setup({ localTimeZone: 'America/New_York' });
    freezeClock(app, now);
    const bootstrapLine = source.split('\n').find(line => line.trimStart().startsWith('populateTimezoneSelects();'));
    assert.ok(bootstrapLine, 'Execute the real converter initialization');
    vm.runInContext(bootstrapLine, app.context);
    app.context.updateTimezoneConversion();
    assert.equal(app.instant(), now.replace('42.123Z', '00.000Z'));
    assert.equal(app.context.state.occurrence(), occurrence);
    assert.equal(app.getElement('timezoneTime').value, '01:30');
  });
}

test('Explicit occurrence selection and edits remain available after Current time', () => {
  const app = setup(); app.convert({ from: 'new-york', to: 'tokyo' });
  freezeClock(app, '2026-11-01T06:30:42.123Z'); app.context.setTimezoneNow();
  assert.equal(app.context.state.occurrence(), 1);
  app.context.state.chooseOccurrence(0);
  assert.equal(app.instant(), '2026-11-01T05:30:00.000Z');
  app.context.setTimezoneNow();
  app.context.updateTimezoneConversion({ resetOccurrence: true });
  assert.equal(app.context.state.occurrence(), 0, 'Editing still defaults to the first occurrence');
});


for (const language of ['ja', 'en']) test(`${language}: target-language header labels preserve privacy and Help`, () => {
  const app = setup();
  app.context.language = language;
  app.context.t = key => vm.runInContext('translations', app.context)[app.context.language][key] || key;
  app.context.applyLanguage();
  for (const current of [language, language === 'ja' ? 'en' : 'ja', language]) {
    const button = app.getElement('languageButton');
    const label = current === 'ja' ? '英語に切り替え' : 'Switch to Japanese';
    assert.equal(app.context.document.documentElement.lang, current);
    assert.equal(button.textContent, current === 'ja' ? 'EN' : 'JA');
    assert.equal(button.getAttribute('aria-label'), label);
    assert.equal(button.title, label);
    assert.equal(app.translated.find(node => node.dataset.i18n === 'localBadge').textContent, current === 'ja' ? '完全ローカル処理' : 'Fully local processing');
    assert.equal(app.getElement('helpButton').getAttribute('aria-label'), current === 'ja' ? '使い方と注意事項' : 'How to use & notes');
    button.click();
  }
});

for (const [zone, time, occurrence] of [['tokyo', '15:30', 0], ['local', '15:30', 0], ['new-york', '01:30', 0], ['new-york', '01:30', 1]]) {
  test(`Language changes preserve equal ${zone} zones and occurrence ${occurrence + 1}`, () => {
    const app = setup(); app.convert({ from: zone, to: zone, time, occurrence });
    const instant = app.instant();
    const iso = app.getElement('timezoneResultIso').textContent;
    for (let index = 0; index < 4; index++) {
      app.getElement('languageButton').click();
      assert.equal(app.getElement('timezoneSource').value, zone);
      assert.equal(app.getElement('timezoneTarget').value, zone);
      assert.equal(app.getElement('timezoneDate').value, '2026-11-01');
      assert.equal(app.getElement('timezoneTime').value, time);
      assert.equal(app.context.state.occurrence(), occurrence);
      assert.equal(app.instant(), instant);
      assert.equal(app.getElement('timezoneResultIso').textContent, iso);
    }
  });
}

for (const [localTimeZone, target] of [['UTC', 'tokyo'], ['Asia/Tokyo', 'new-york']]) test(`Fresh ${localTimeZone} converter retains its distinct default zones`, () => {
  const app = setup({ localTimeZone }); app.context.populateTimezoneSelects();
  assert.equal(app.getElement('timezoneSource').value, 'local');
  assert.equal(app.getElement('timezoneTarget').value, target);
});
