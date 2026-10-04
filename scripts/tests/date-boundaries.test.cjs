// Execute the production calendar helpers and result updates without browser dependencies.
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
function setup(language = 'en') {
  const elements = new Map();
  const context = { language, $: selector => {
    if (!elements.has(selector)) elements.set(selector, { value: '', textContent: '', hidden: true, checked: false });
    return elements.get(selector);
  } };
  vm.createContext(context);
  vm.runInContext(extract('      const DAY_MS =', '      const CITY_ZONES ='), context);
  vm.runInContext(extract('      function t(', '      const AppToast ='), context);
  vm.runInContext(extract('      function updateBetween()', '      function populateEraSelect()'), context);
  const set = (id, value) => { context.$(`#${id}`).value = value; };
  const get = id => context.$(`#${id}`);
  set('addBaseDate', '2024-01-31'); set('addQuantity', '1'); set('addUnit', 'month'); set('addDirection', 'after');
  return { context, set, get };
}
function assertYmd(result, value) {
  assert.ok(result, `${value} is a valid date`);
  assert.equal(result.value, value);
  assert.equal(result.date.toISOString(), `${value}T00:00:00.000Z`);
  assert.equal(result.date.getUTCFullYear(), result.year);
  assert.equal(result.date.getUTCMonth() + 1, result.month);
  assert.equal(result.date.getUTCDate(), result.day);
}

for (const language of ['en', 'ja']) test(`${language}: blank Add quantity clears a previous result with an inline error`, () => {
  const c = setup(language); c.context.updateAdd(); assert.notEqual(c.get('addResultCopy').textContent, '');
  for (const quantity of ['', '   ']) {
    c.set('addQuantity', quantity); c.context.updateAdd();
    assert.equal(c.get('addError').hidden, false);
    assert.equal(c.get('addError').textContent, c.context.t('invalidQuantity'));
    assert.equal(c.get('addResultMain').textContent, '—');
    assert.equal(c.get('addResultCopy').textContent, '');
  }
});
test('Explicit zero remains valid while invalid and oversized quantities are rejected', () => {
  const c = setup(); c.set('addQuantity', '0'); c.context.updateAdd();
  assert.equal(c.get('addError').hidden, true);
  assert.equal(c.get('addResultCopy').textContent, c.context.formatDate(c.context.parseYmd('2024-01-31')));
  for (const quantity of ['-1', '1.5', '100001', 'Infinity', 'bad']) {
    c.set('addQuantity', quantity); c.context.updateAdd();
    assert.equal(c.get('addError').textContent, c.context.t('invalidQuantity'));
    assert.equal(c.get('addResultCopy').textContent, '');
  }
});
test('Gregorian parsing preserves years 0001–0099 instead of mapping them to the 1900s', () => {
  const c = setup();
  for (const value of ['0001-01-01', '0004-02-29', '0096-02-29', '0099-12-31', '0100-01-01', '9999-12-31']) assertYmd(c.context.parseYmd(value), value);
});
test('Calendar construction preserves early years and Gregorian leap-year rules', () => {
  const c = setup();
  for (const [year, expected] of [[1, 28], [4, 29], [96, 29], [99, 28], [100, 28], [400, 29], [1900, 28], [2000, 29]]) assert.equal(c.context.daysInMonth(year, 2), expected);
  assertYmd(c.context.makeYmd(4, 2, 29), '0004-02-29');
  assertYmd(c.context.makeYmd(99, 12, 31), '0099-12-31');
});
test('Invalid dates and years outside 0001–9999 stay rejected', () => {
  const c = setup();
  for (const value of ['', '0000-01-01', '10000-01-01', '0099-02-29', '0100-02-29', '1900-02-29', '2024-02-30', '2024-13-01', '2024-00-01', '2024-01-00', '2024-1-01']) assert.equal(c.context.parseYmd(value), null, value);
  for (const args of [[0, 1, 1], [10000, 1, 1], [99, 2, 29], [2024, 13, 1], [2024, 1, 0]]) assert.equal(c.context.makeYmd(...args), null);
});
test('Month and year arithmetic crosses 0100 without corrupting the underlying Date', () => {
  const c = setup(); const date = value => c.context.parseYmd(value);
  assertYmd(c.context.addMonthsClamped(date('0100-03-31'), -12), '0099-03-31');
  assertYmd(c.context.addMonthsClamped(date('0100-01-31'), -1), '0099-12-31');
  assertYmd(c.context.addMonthsClamped(date('0099-12-31'), 1), '0100-01-31');
  assertYmd(c.context.addMonthsClamped(date('0004-01-31'), 1), '0004-02-29');
  assertYmd(c.context.addDays(date('0099-12-31'), 1), '0100-01-01');
  assert.equal(c.context.addDays(date('0001-01-01'), -1), null);
  assert.equal(c.context.addDays(date('9999-12-31'), 1), null);
  assert.equal(c.context.addMonthsClamped(date('0001-01-01'), -1), null);
  assert.equal(c.context.addMonthsClamped(date('9999-12-31'), 1), null);
});
for (const language of ['en', 'ja']) test(`${language}: early-year Add results use a consistent year and weekday`, () => {
  const c = setup(language); c.set('addBaseDate', '0100-03-31'); c.set('addUnit', 'year'); c.set('addDirection', 'before'); c.context.updateAdd();
  const expected = language === 'en' ? 'March 31, 99 (Tue)' : '99年3月31日（火）';
  assert.equal(c.get('addError').hidden, true); assert.equal(c.get('addResultMain').textContent, expected); assert.equal(c.get('addResultCopy').textContent, expected);
});
test('Equal dates, endpoint inclusion and reverse direction retain their semantics', () => {
  const c = setup(); const date = value => c.context.parseYmd(value);
  assert.equal(c.context.daysBetween(date('2024-05-13'), date('2024-05-13')), 0);
  assert.equal(c.context.countWeekdays(date('2024-05-13'), date('2024-05-13'), false), 0);
  assert.equal(c.context.countWeekdays(date('2024-05-13'), date('2024-05-13'), true), 1);
  assert.equal(c.context.daysBetween(date('2024-05-17'), date('2024-05-13')), -4);
  assert.equal(c.context.countWeekdays(date('2024-05-17'), date('2024-05-13'), false), -4);
  for (const includeBoth of [false, true]) {
    c.set('betweenStart', '2024-05-13'); c.set('betweenEnd', '2024-05-13'); c.get('countBothEndpoints').checked = includeBoth; c.context.updateBetween();
    assert.equal(c.get('betweenMain').textContent, includeBoth ? '1 day' : '0 days');
  }
  const diff = c.context.calendarDiff(date('2024-03-31'), date('2023-02-28'));
  assert.equal(JSON.stringify(diff), JSON.stringify({ sign: -1, years: 1, months: 1, days: 3 }));
  const earlyDiff = c.context.calendarDiff(date('0099-12-31'), date('0100-01-01'));
  assert.equal(JSON.stringify(earlyDiff), JSON.stringify({ sign: 1, years: 0, months: 0, days: 1 }));
});
test('Month-end and leap-day clamping retain existing behavior', () => {
  const c = setup();
  for (const [base, months, expected] of [['2023-01-31', 1, '2023-02-28'], ['2024-01-31', 1, '2024-02-29'], ['2024-03-31', -1, '2024-02-29'], ['2024-02-29', 12, '2025-02-28'], ['2024-02-29', -12, '2023-02-28'], ['2024-12-31', 1, '2025-01-31']]) assertYmd(c.context.addMonthsClamped(c.context.parseYmd(base), months), expected);
});
test('Era conversion retains its 1873 lower boundary and exact era transitions', () => {
  const c = setup();
  for (const [value, expected] of [['1872-12-31', null], ['1873-01-01', 'meiji'], ['1912-07-29', 'meiji'], ['1912-07-30', 'taisho'], ['1926-12-24', 'taisho'], ['1926-12-25', 'showa'], ['1989-01-07', 'showa'], ['1989-01-08', 'heisei'], ['2019-04-30', 'heisei'], ['2019-05-01', 'reiwa']]) assert.equal(c.context.eraForDate(c.context.parseYmd(value))?.id ?? null, expected);
  c.set('gregorianDate', '0099-12-31'); c.context.updateWesternToEra();
  assert.equal(c.get('eraWesternError').textContent, c.context.t('unsupportedEraDate')); assert.equal(c.get('eraResultCopy').textContent, '');
  c.set('eraSelect', 'heisei'); c.set('eraYear', '31'); c.set('eraMonth', '5'); c.set('eraDay', '1'); c.context.updateEraToWestern();
  assert.equal(c.get('eraInputError').textContent, c.context.t('invalidEraDate')); assert.equal(c.get('westernResultCopy').textContent, '');
  c.set('eraMonth', '4'); c.set('eraDay', '30'); c.context.updateEraToWestern();
  assert.equal(c.get('eraInputError').hidden, true); assert.equal(c.get('westernResultCopy').textContent, 'April 30, 2019 (Tue)');
});
