// Run real production timezone functions and Intl data with minimal DOM adapters.
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

function setup({ language = 'en', localTimeZone = 'UTC', cities = [] } = {}) {
  const elements = new Map();
  function element() {
    let text = '';
    return {
      value: '', hidden: false, checked: false, children: [], dataset: {},
      set textContent(value) { text = value; this.children = []; },
      get textContent() { return text; },
      append(...children) { this.children.push(...children); },
      setAttribute() {}, removeAttribute() {}
    };
  }
  function get(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }
  const context = {
    language, localTimeZone, storageKeys: { cities: 'cities' },
    localStorage: { getItem: () => JSON.stringify(cities) },
    $: selector => get(selector.slice(1)), $$: () => [],
    document: { createElement: element, querySelector: get }
  };
  vm.createContext(context);
  vm.runInContext([
    extract('      const DAY_MS =', '      const localTimeZone ='),
    extract('      function readStorage(', '      function detectLanguage('),
    extract('      function t(', '      function addDays('),
    extract('      function setError(', '      const AppToast ='),
    extract('      function cityById(', '      function syncDesktopTabs('),
    'globalThis.state = { instant: () => timezoneCandidates[timezoneOccurrenceIndex], occurrence: () => timezoneOccurrenceIndex, choose: index => { timezoneOccurrenceIndex = index; updateTimezoneConversion(); } };'
  ].join('\n'), context);
  function convert({ from = 'local', to = 'local', date = '1900-01-01', time = '12:00', occurrence = 0 } = {}) {
    get('timezoneSource').value = from; get('timezoneTarget').value = to;
    get('timezoneDate').value = date; get('timezoneTime').value = time;
    context.updateTimezoneConversion({ resetOccurrence: true });
    if (occurrence) context.state.choose(occurrence);
  }
  return { context, get, convert, instant: () => context.state.instant()?.toISOString() };
}

function assertUnsupported(app) {
  const message = app.context.t('unsupportedTimezonePrecision');
  assert.notEqual(message, 'unsupportedTimezonePrecision', 'The limitation has localized explanatory text');
  assert.equal(app.get('timezoneError').textContent, message);
  assert.equal(app.get('timezoneError').hidden, false);
  assert.notEqual(message, app.context.t('nonexistentLocalTime'));
  assert.equal(app.get('timezoneResultTime').textContent, '—');
  assert.equal(app.get('timezoneResultZone').textContent, '—');
  assert.equal(app.get('timezoneResultCopy').textContent, '');
  assert.equal(app.get('timezoneAmbiguity').hidden, true);
  assert.equal(app.instant(), undefined);
}

test('Historical offset helpers preserve seconds rather than rounding to minutes', () => {
  const { context } = setup();
  assert.equal(context.zoneOffsetMinutes(new Date('1900-01-01T12:00:00Z'), 'Europe/Paris'), 561 / 60);
  assert.equal(context.zoneOffsetMinutes(new Date('1873-01-01T12:00:00Z'), 'Asia/Tokyo'), 33539 / 60);
});

test('Historical wall resolution finds the exact instant before the minute-only UI guard', () => {
  const { context } = setup();
  for (const [year, zone, expected] of [[1900, 'Europe/Paris', '1900-01-01T11:50:39.000Z'], [1873, 'Asia/Tokyo', '1873-01-01T02:41:01.000Z']]) {
    const candidates = context.resolveWallTime({ year, month: 1, day: 1, hour: 12, minute: 0 }, zone);
    assert.deepEqual(Array.from(candidates, date => date.toISOString()), [expected]);
    assert.equal(context.zoneDateParts(candidates[0], zone).second, 0);
  }
});

for (const language of ['en', 'ja']) {
  for (const [city, date] of [['paris', '1900-01-01'], ['tokyo', '1873-01-01']]) {
    test(`${language}: ${city} ${date} source gets a precision error instead of a wrong instant or DST-gap error`, () => {
      const app = setup({ language }); app.convert({ from: city, date }); assertUnsupported(app);
    });
    test(`${language}: ${city} ${date} primary destination gets a precision error`, () => {
      const app = setup({ language }); app.convert({ to: city, date }); assertUnsupported(app);
    });
  }
}

test('A historical current-device zone receives the same dynamic precision guard', () => {
  const app = setup({ localTimeZone: 'Europe/Paris' });
  app.convert({ to: 'london' }); assertUnsupported(app);
});

test('UTC year 0099 is exact, keeps the early date serial and survives Swap', () => {
  const app = setup(); const date = new Date('0099-12-31T12:00:00Z');
  assert.equal(app.context.zoneOffsetMinutes(date, 'UTC'), 0);
  assert.equal(app.context.zoneDateSerial(date, 'UTC'), Math.floor(new Date('0099-12-31T00:00:00Z').getTime() / 86400000));
  app.convert({ date: '0099-12-31' });
  assert.equal(app.instant(), date.toISOString());
  assert.equal(app.get('timezoneError').hidden, true);
  app.context.swapTimezones();
  assert.equal(app.instant(), date.toISOString());
  assert.equal(app.get('timezoneDate').value, '0099-12-31');
  assert.equal(app.get('timezoneTime').value, '12:00');
});

test('Intl BC parts use astronomical year zero and do not produce a bogus century-sized offset', () => {
  const { context } = setup(); const instant = new Date('0001-01-01T00:00:00Z');
  const parts = context.zoneDateParts(instant, 'America/New_York');
  assert.equal(parts.year, 0); assert.equal(parts.month, 12); assert.equal(parts.day, 31);
  assert.equal(context.zoneOffsetMinutes(instant, 'America/New_York'), -17762 / 60);
  assert.equal(context.zoneDateSerial(instant, 'America/New_York'), context.zoneDateSerial(instant, 'UTC') - 1);
});

test('Exact fixed-offset inputs at year 0001 may resolve to a BC UTC instant and still swap losslessly', () => {
  const app = setup({ localTimeZone: 'Etc/GMT-14' });
  app.convert({ date: '0001-01-01', time: '00:00' });
  assert.equal(app.instant(), '0000-12-31T10:00:00.000Z');
  app.context.swapTimezones();
  assert.equal(app.instant(), '0000-12-31T10:00:00.000Z');
  assert.equal(app.get('timezoneDate').value, '0001-01-01');
});

for (const [name, options, conversion] of [
  ['lower', {}, { to: 'new-york', date: '0001-01-01', time: '00:00' }],
  ['upper', {}, { to: 'tokyo', date: '9999-12-31', time: '23:00' }]
]) test(`Primary destination outside the ${name} editable year boundary is rejected`, () => {
  const app = setup(options); app.convert(conversion); assertUnsupported(app);
});

test('Unsupported additional cities show individual limitations without blocking an exact historical primary result', () => {
  const app = setup({ cities: ['paris', 'tokyo', 'london'] }); app.convert();
  assert.equal(app.instant(), '1900-01-01T12:00:00.000Z');
  assert.equal(app.get('timezoneError').hidden, true);
  const cards = app.get('timezoneOtherCities').children;
  assert.equal(cards.length, 3);
  assert.equal(cards[0].children[1].textContent, '—');
  assert.equal(cards[0].children[2].textContent, app.context.t('unsupportedTimezonePrecision'));
  assert.equal(cards[0].children.length, 3, 'An unsupported preview has no day-relation claim');
  assert.equal(cards[1].children[1].textContent, '21:00');
  assert.equal(cards[2].children[1].textContent, '12:00');
});

test('Additional city outside editable years is labelled instead of showing a misleading date', () => {
  const app = setup({ cities: ['tokyo', 'london'] }); app.convert({ date: '9999-12-31', time: '23:00' });
  assert.equal(app.instant(), '9999-12-31T23:00:00.000Z');
  assert.equal(app.get('timezoneOtherCities').children[0].children[1].textContent, '—');
  assert.equal(app.get('timezoneOtherCities').children[0].children[2].textContent, app.context.t('unsupportedTimezonePrecision'));
});

test('Swap after a rejected historical source does not truncate a recomputed instant into valid output', () => {
  const app = setup(); app.convert({ from: 'paris' }); assertUnsupported(app);
  app.context.swapTimezones();
  assert.equal(app.get('timezoneTime').value, '12:00');
  assert.equal(app.get('timezoneDate').value, '1900-01-01');
  assertUnsupported(app);
});

for (const language of ['en', 'ja']) test(`${language}: mixed historical overlap keeps the exact supported Swap without a decimal-minute offset label`, () => {
  const app = setup({ language });
  app.convert({ from: 'london', to: 'tokyo', date: '1887-12-31', time: '15:00' });
  const instant = '1887-12-31T15:00:00.000Z';
  assert.equal(app.instant(), instant);
  app.context.swapTimezones();
  assert.equal(app.instant(), instant);
  assert.equal(app.context.state.occurrence(), 1);
  assert.equal(app.get('timezoneDate').value, '1888-01-01');
  assert.equal(app.get('timezoneTime').value, '00:00');
  assert.equal(app.get('timezoneAmbiguity').hidden, false);
  assert.equal(app.get('timezoneOccurrenceFirst').textContent, `${app.context.t('firstOccurrence')} · ${app.context.t('unsupportedTimezonePrecision')}`);
  assert.equal(app.get('timezoneOccurrenceSecond').textContent, `${app.context.t('secondOccurrence')} · UTC+9`);
  app.context.swapTimezones(); assert.equal(app.instant(), instant);
});

for (const language of ['en', 'ja']) test(`${language}: rejecting the first historical overlap occurrence leaves the valid second occurrence selectable`, () => {
  const app = setup({ language });
  app.convert({ from: 'paris', date: '1911-03-10', time: '23:55' });
  assert.equal(app.get('timezoneError').textContent, app.context.t('unsupportedTimezonePrecision'));
  assert.equal(app.get('timezoneResultTime').textContent, '—');
  assert.equal(app.get('timezoneResultCopy').textContent, '');
  assert.equal(app.get('timezoneAmbiguity').hidden, false);
  assert.equal(app.get('timezoneOccurrenceFirst').textContent, `${app.context.t('firstOccurrence')} · ${app.context.t('unsupportedTimezonePrecision')}`);
  app.context.state.choose(1);
  assert.equal(app.instant(), '1911-03-10T23:55:00.000Z');
  assert.equal(app.get('timezoneError').hidden, true);
  assert.equal(app.get('timezoneResultTime').textContent, '23:55');
  assert.notEqual(app.get('timezoneResultCopy').textContent, '');
  app.context.swapTimezones(); assert.equal(app.instant(), '1911-03-10T23:55:00.000Z');
  app.context.swapTimezones(); assert.equal(app.instant(), '1911-03-10T23:55:00.000Z');
  assert.equal(app.context.state.occurrence(), 1);
  app.context.state.choose(0);
  assert.equal(app.get('timezoneError').textContent, app.context.t('unsupportedTimezonePrecision'));
  assert.equal(app.get('timezoneResultCopy').textContent, '');
  assert.equal(app.get('timezoneAmbiguity').hidden, false);
});

test('Modern Tokyo to New York conversion and both Swap directions remain exact', () => {
  const app = setup({ cities: ['paris'] }); app.convert({ from: 'tokyo', to: 'new-york', date: '2026-07-01', time: '08:15' });
  const instant = '2026-06-30T23:15:00.000Z';
  assert.equal(app.instant(), instant); assert.equal(app.get('timezoneResultTime').textContent, '19:15');
  app.context.swapTimezones(); assert.equal(app.instant(), instant);
  app.context.swapTimezones(); assert.equal(app.instant(), instant);
  assert.equal(app.get('timezoneOtherCities').children[0].children[1].textContent, '01:15');
});

for (const occurrence of [0, 1]) test(`DST overlap occurrence ${occurrence + 1} survives both swaps`, () => {
  const app = setup(); app.convert({ from: 'new-york', to: 'tokyo', date: '2026-11-01', time: '01:30', occurrence });
  const instant = occurrence ? '2026-11-01T06:30:00.000Z' : '2026-11-01T05:30:00.000Z';
  assert.equal(app.instant(), instant);
  assert.equal(app.get('timezoneAmbiguity').hidden, false);
  app.context.swapTimezones(); assert.equal(app.instant(), instant);
  app.context.swapTimezones(); assert.equal(app.instant(), instant);
  assert.equal(app.context.state.occurrence(), occurrence);
});

test('An actual modern DST gap keeps its existing gap error', () => {
  const app = setup(); app.convert({ from: 'new-york', to: 'tokyo', date: '2026-03-08', time: '02:30' });
  assert.equal(app.instant(), undefined);
  assert.equal(app.get('timezoneError').textContent, app.context.t('nonexistentLocalTime'));
  assert.equal(app.get('timezoneResultCopy').textContent, '');
});
