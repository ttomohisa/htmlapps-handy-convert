# Offline Verification — Handy Convert

1. Run `build-standalone.bat` on Windows.
2. Open `dist/index.html` directly with `file://`.
3. Open browser developer tools, clear the Network panel, then enable offline mode or disconnect the device.
4. Reload the local HTML.
5. Confirm Date / Time / Text navigation works and no external request appears.
6. In **Between two dates**, test equal dates, reverse order, endpoint counting, and a range crossing a weekend.
7. In **Add or subtract a period**, verify at least:
   - January 31 + 1 month → the final valid day of February,
   - February 29 + 1 year → February 28 in a non-leap year,
   - before/after switching.
8. In **Age / elapsed period**, test a normal date and a leap-day start date.
9. In **Gregorian / Japanese era**, verify the Showa/Heisei and Heisei/Reiwa boundaries, and confirm an invalid era date is rejected inline.
10. Switch Japanese / English and confirm the current results update without a reload.
11. At smartphone widths, switch all three bottom tabs and confirm there is no horizontal scrolling or content hidden at the bottom of the page.
12. Open and scroll the help dialog to its end, then close it with its close button, Escape, and backdrop click.
13. Confirm the console contains no unexpected error.

Handy Convert stores only small UI preferences: language, the last active category, and cities added to the World clock. Entered dates, birth dates, text input, and conversion history must not be persisted.

## Self-extracting variant

Repeat the same checks with `dist/index.self-extract.html`.

Confirm that:

- the loading screen disappears,
- the favicon matches `dist/index.html`,
- decompression produces the same application,
- no decompression/CSP error appears,
- no network request is required.

`scripts/verify-self-extract.ps1` additionally verifies an ASCII-only loader and byte-for-byte restoration of the readable HTML.

## GitHub Pages / Azure Static Web Apps

Hosting itself requires the initial HTML request. After the page is loaded, clear the Network panel and exercise the complete app flow again. No runtime API, CDN, font, analytics, or telemetry request should occur.
