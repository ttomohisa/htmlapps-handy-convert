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
      setAttribute() {}, removeAttribute() {}
    };
  }
  function getElement(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }
  const context = {
    DAY_MS: 86400000, localTimeZone, storageKeys: { cities: 'cities' }, language: 'en',
    localStorage: {
      getItem(key) { if (storageUnavailable) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageUnavailable) throw new Error('Storage unavailable'); storage.set(key, value); }
    },
    $: selector => getElement(selector.slice(1)), $$: () => [],
    document: { createElement: element, querySelector: selector => getElement(selector) },
    t: key => key, AppToast: { show(toast) { toasts.push(toast); } }
  };
  vm.createContext(context);
  vm.runInContext([
    extract('      const CITY_ZONES =', '      const localTimeZone ='),
    extract('      function readStorage(', '      function detectLanguage('),
    extract('      function readToday(', '      function addDays('),
    extract('      function setError(', '      const AppToast ='),
    extract('      function cityById(', '      function syncDesktopTabs('),
    'globalThis.state = { cities: () => selectedCityIds, occurrence: () => timezoneOccurrenceIndex, instant: () => timezoneCandidates[timezoneOccurrenceIndex], chooseOccurrence: index => { timezoneOccurrenceIndex = index; updateTimezoneConversion(); } };'
  ].join('\n'), context);
  function convert({ from = 'tokyo', to = 'new-york', date = '2026-11-01', time = '15:30', occurrence = 0 } = {}) {
    getElement('timezoneSource').value = from; getElement('timezoneTarget').value = to;
    getElement('timezoneDate').value = date; getElement('timezoneTime').value = time;
    context.updateTimezoneConversion({ resetOccurrence: true });
    if (occurrence) context.state.chooseOccurrence(occurrence);
  }
  return { context, getElement, storage, toasts, convert, cities: () => Array.from(context.state.cities()), instant: () => context.state.instant()?.toISOString() };
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
