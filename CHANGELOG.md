# Changelog

## [1.0.0] - 2026-09-05

### Release
- Promoted Handy Convert to the first stable release after the v0.8.0 release-candidate pass.
- Rewrote README / README.ja to match the repository documentation style used by the reference repository, including demo, quick-start, GitHub Pages, build, privacy, limitations, dependencies, and contribution sections.
- Updated version metadata, APP_SPEC, third-party notices, generated standalone files, and screenshots for v1.0.0.

### Verified
- Re-ran desktop and 320px / 360px responsive checks in Japanese and English.
- Rechecked date equality/reverse ranges, leap years, month-end clamping, elapsed-period output, and Japanese-era boundaries.
- Rechecked world-clock behavior, date rollovers, daylight-saving gaps, and repeated local times.
- Rechecked kana and width conversion, dakuten / handakuten, multiline text, copy / Clear / Undo, and preservation of unrelated Unicode characters.
- Rechecked help-dialog scrolling, favicon consistency, CSP / runtime-network blocking, standalone placeholders, and self-extract payload integrity.

## [0.8.0] - 2026-09-05

### Changed
- Prepared the repository as the v1.0 release candidate without adding new product features.
- Removed version-specific development-status text from the user-facing help dialog.
- Updated README / README.ja, APP_SPEC, version metadata, and release documentation for the final packaging stage.

### Release checks
- Refresh Japanese, English, and smartphone screenshots from the generated standalone HTML.
- Recheck favicon consistency, CSP / runtime-network blocking, build placeholders, local-storage scope, and self-extract payload integrity.
- Re-run date, time-zone, text-conversion, help-dialog, PC, and smartphone regression checks before v1.0.0.

## [0.7.0] - 2026-09-05

### Fixed
- Reset the help dialog scroll position on open so the content always starts from the top.
- Reworked the help dialog layout into a stable flex column and improved mobile spacing to avoid clipped content.

### Verified
- Reconfirmed date calculations around same-day, reverse range, month-end clamping, leap years, and Japanese era boundaries.
- Reconfirmed time-zone conversion around day rollovers and DST nonexistent / repeated local times.
- Reconfirmed text conversion around dakuten / handakuten, half-width kana, width conversion options, and preserving kanji / emoji.

All notable changes to Handy Convert are documented here.

## [0.6.0] - 2026-09-05

### Changed

- Polished PC and smartphone interaction without changing the existing feature scope.
- Kept desktop Date / Time / Text tabs available while scrolling and increased key touch targets.
- Reworked text empty states, added a live character count, and disabled Clear / Copy actions when they have nothing useful to act on.
- Added Arrow Up / Arrow Down / Enter / Escape keyboard navigation to World-clock city search.
- Updated the page summary and help/status copy to reflect the complete Date / Time / Text tool set.

## [0.5.0] - 2026-09-05

### Added

- Shared text input with live Hiragana, Katakana, and half-width Kana results.
- Full-width / half-width conversion with independent letter, number, symbol, and space targets.
- Clear action with Toast + Undo and copy actions for each text result.

### Changed

- Replaced the bottom-left app icon symbol with a hand-drawn SVG hiragana `あ` and reused it for Text navigation.
- Updated help, README files, and product specification for the implemented Text category.

## [0.4.0] - 2026-09-05

### Added

- Time-zone conversion with source/destination city selection, current-time shortcut, swap, and copyable results.
- Explicit daylight-saving gap detection and first/second occurrence selection for overlapping local times.
- Same-instant previews for cities already selected in the World clock.
- Bottom-right conversion/swap symbol in the unified app icon.

### Changed

- Updated help and documentation for the v0.4.0 implementation scope.

## [0.3.0] - 2026-09-05

### Added

- World clock using the device clock and browser IANA time-zone data.
- Bundled bilingual city search with local add/remove preferences.
- Previous/next-day context and current UTC offset display.
- Toast + Undo when a saved city is removed.

### Changed

- Reworked the app/fav icon to combine the existing Date, Time, and Text symbols: calendar at top-left, clock at top-right, and text at bottom-left.
- Updated help and documentation for the v0.3.0 implementation scope.

## [0.2.0] - 2026-09-05

### Added

- Handy Convert product identity and Browser Kitty branding.
- Date / Time / Text category navigation.
- Canonical smartphone bottom page tabs based on the template component.
- Four date tools: date difference, date arithmetic, elapsed period, and Gregorian/Japanese era conversion.
- Japanese and English UI/help text.
- Local-only state policy with runtime network access blocked.
- Handy Convert favicon.

### Changed

- Replaced all starter workspace content and starter documentation with the Handy Convert product contract.

## [0.1.0] - 2026-09-05

### Added

- Initial Handy Convert application shell based on the current `htmlapps-template`.
