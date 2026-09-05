# APP_SPEC.md

## 1. Product identity

- **Name:** Handy Convert
- **Japanese subtitle:** 日付・時刻・文字変換
- **English subtitle:** Date, time & text utilities
- **Repository:** `ttomohisa/htmlapps-handy-convert`
- **Browser Kitty path:** `/tools/handy-convert/`
- **Current implementation version:** v1.0.0
- **Release artifacts:** `dist/index.html` and `dist/index.self-extract.html`

## 2. Purpose

Handy Convert collects small conversions that people often search for individually: date differences, date arithmetic, Japanese era conversion, world clocks, time-zone conversion, kana conversion, and full-width / half-width conversion.

The product deliberately stays narrower than a general-purpose converter. Its scope is:

- calendar dates,
- local/world time,
- Japanese text representation.

It does not grow into unit, currency, media, developer-data, or general calculator tooling.

## 3. Primary users and outcome

A user should be able to open one page, choose **Date / Time / Text**, perform a small conversion immediately, copy the result where appropriate, and close the page. No account, installation, file upload, or server processing is required.

## 4. Navigation and responsive structure

- Desktop/tablet: category tabs stay available below the sticky header while scrolling.
- Smartphone: reuse the canonical `components/mobile-bottom-bar.html` page-tab pattern with exactly three destinations: Date, Time, Text.
- Only the active category is shown. Do not stack all tools into one long mobile page.
- Store only the selected language and last active category in local storage.
- Do not store entered text, dates, birth dates, or conversion history.

## 5. Date tools

### 5.1 Between two dates

Inputs:

- start date,
- end date,
- swap action,
- Today shortcut on both date fields,
- optional “count both endpoints” setting.

Results:

- elapsed days,
- weeks + days,
- calendar years / months / days where meaningful,
- weekdays excluding Saturdays and Sundays,
- direction when the second date is earlier.

Default semantics: equal dates = 0 days. “Count both endpoints” changes equal dates to 1 day.

Public holidays are not considered.

### 5.2 Add / subtract a period

Inputs:

- base date,
- positive integer quantity,
- unit: day / week / month / year,
- direction: after / before.

Month/year behavior is clamped to the last valid day of the destination month. Example: January 31 + 1 month = February 28 (or 29 in a leap year).

### 5.3 Age / elapsed period

Inputs:

- start date / birth date,
- reference date with Today shortcut.

Results:

- full elapsed years,
- calendar years / months / days,
- total elapsed days.

This is a calendar elapsed-period calculation, not a legal-age determination.

### 5.4 Gregorian / Japanese era

Support:

- Meiji,
- Taisho,
- Showa,
- Heisei,
- Reiwa.

The supported Gregorian range starts at **1873-01-01** to avoid implying pre-Gregorian Japanese dates are handled as modern Gregorian dates.

Requirements:

- Gregorian date to era date,
- era date to Gregorian date,
- display `元年` for the first year in Japanese,
- reject dates outside an era’s actual range,
- include weekday in displayed results,
- provide Copy for textual results.

## 6. Time tools

### 6.1 World clock (implemented in v0.3.0)

- Use the device clock; do not fetch network time.
- Bundle a curated city-to-IANA-time-zone list locally.
- Search and add cities.
- Remove a city with Toast + Undo.
- Persist selected cities only.
- Show previous/next-day context and UTC offset.
- Avoid duplicate “current location” and city entries when they resolve to the same zone.

### 6.2 Time-zone conversion (implemented in v0.4.0)

- Source city/time zone + local date/time.
- Primary destination city/time zone with Swap action.
- Additional same-instant results for cities already selected in the World clock.
- Current-time shortcut sets the wall-clock input in the selected source zone.
- Use IANA zones and browser `Intl` data rather than fixed UTC offsets.
- Resolve a wall-clock input back to matching instants. A daylight-saving gap produces an inline error; an overlap exposes first/second occurrence selection.
- Do not persist the entered conversion date/time.

## 7. Text tools (implemented in v0.5.0)

One shared text input shows multiple useful outputs without requiring a “from/to” selector.

Outputs:

- hiragana,
- full-width katakana,
- half-width katakana,
- half-width Latin letters/digits/selected punctuation/spaces,
- full-width Latin letters/digits/selected punctuation/spaces.

Detailed width-conversion settings may independently include/exclude letters, digits, punctuation, and spaces.

Do not apply broad Unicode normalization to the entire string when that would change characters outside the selected conversion scope.

Input text is never persisted.

## 8. Copy behavior

- Copy buttons appear only for useful textual outputs and remain disabled while the related result is empty or invalid.
- Use the Clipboard API with the template-compatible fallback.
- Show success/failure through the canonical Toast component.
- Do not maintain clipboard history.

## 9. Data and privacy

- All calculations run in the browser.
- Runtime network access is disabled with `connect-src 'none'`.
- No analytics, telemetry, remote fonts, API calls, CDN assets, or hidden update checks.
- No login or server-side storage.
- User-entered dates and text are not persisted.
- Language, active category, and future world-clock city preferences may be stored locally.

## 10. Non-goals

v1.0 does not include:

- public-holiday calendars,
- business calendars beyond excluding Saturday/Sunday,
- currency or unit conversion,
- Base64 / URL encoding / JSON / hashes,
- QR codes,
- general calculator functions,
- natural-language date parsing,
- network time synchronization,
- cloud sync,
- conversion history,
- Unix timestamps unless a later product decision explicitly adds them.

## 11. UX and accessibility

- Mobile-first from 320px upward.
- Brand color `#16624F` for primary/action states.
- Light-only UI.
- Inline SVG icons; no emoji used as interface icons.
- Handy Convert brand/favicon icon uses four quadrants: calendar (top-left), clock (top-right), a hand-drawn SVG hiragana `あ` symbol (bottom-left), and the existing swap/convert arrows (bottom-right). The same `あ` symbol is reused by the Text navigation icon.
- Visible focus styles and keyboard operation.
- `aria-live` for result/status updates where appropriate.
- Respect `prefers-reduced-motion`.
- Help dialog closes with its close button, Escape, and backdrop click.
- Long labels must not create horizontal scrolling in Japanese or English.
- Interactive controls should provide comfortable touch targets on smartphones.
- Text conversion shows a clear empty-result message and a live character count.
- World-clock city search supports Arrow Up / Arrow Down / Enter / Escape keyboard operation.

## 12. Browser and runtime target

- Current stable Chrome / Edge as primary targets.
- Current Firefox and Safari where browser `Intl` support allows.
- Direct `file://` opening is required.
- No runtime dependency is allowed.

## 13. Current v1.0.0 implementation scope

Release status: v1.0.0 is the first stable release of the planned Date / Time / Text scope. No new product feature was added during the final release pass; the release was promoted after documentation, packaging, regression, and edge-case verification.

Implemented now:

- template-derived bilingual shell,
- Date / Time / Text category navigation,
- canonical smartphone bottom page tabs,
- local-only privacy boundary,
- Between two dates,
- Add / subtract period,
- Age / elapsed period,
- Gregorian / Japanese era conversion,
- World clock with current device zone, bundled city search, add/remove, Toast + Undo, previous/next-day context, UTC offset, and locally persisted city selection,
- time-zone conversion with source/destination selection, current-time shortcut, swap, previous/next-day context, and additional World-clock city previews,
- explicit daylight-saving gap and overlap handling,
- localized help and error/status states,
- one shared, non-persisted text input,
- hiragana, full-width katakana, and half-width kana conversion,
- full-width / half-width conversion with independent letter, digit, symbol, and space targets,
- text Clear with Toast + Undo, character count, actionable empty states, and copy actions for all text results,
- disabled copy actions when a result is empty or invalid,
- sticky desktop category tabs, larger header/touch targets, and keyboard city-search navigation.

The Text category must preserve characters outside the intended conversion ranges and must not broadly normalize the whole input string.

## 14. Acceptance criteria

- `build-standalone.ps1` produces readable and self-extracting one-file variants.
- `scripts/verify-standalone.ps1` passes.
- Build placeholders appear exactly once in source and are fully resolved in generated output.
- CSP retains `connect-src 'none'`.
- No runtime external script, stylesheet, font, image, module, frame, or network API dependency.
- Japanese and English UI both fit at 320px / 360px without horizontal scrolling.
- Smartphone navigation uses the canonical bottom page-tab pattern and reserves safe-area bottom space.
- Date calculations cover equal dates, reverse direction, month/year boundaries, leap years, month-end clamping, and era boundaries.
- Time-zone conversion covers ordinary offsets, date-boundary changes, a DST gap, and a DST overlap with both occurrences selectable.
- Text conversion covers voiced/semi-voiced kana, half-width kana, mixed full/half-width ASCII, punctuation, spaces, multiline input, and preservation of kanji/emoji outside the conversion scope.
- Gregorian/era invalid inputs produce an explanatory inline error rather than a native alert.
- Copy result works with a compatibility fallback and produces a Toast.
- Help content matches current behavior and contains no starter text.
- README files, config, changelog, screenshots, and favicon match Handy Convert.
