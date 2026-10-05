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
