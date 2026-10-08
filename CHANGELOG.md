# Changelog

All notable changes to the Luftrom support site. Newest first.

## 2026-10-08
### Added
- Landing page for spots shared from the app, `s/?lat=…&lon=…`: the coordinate with an "Open in Luftrom" button and the App Store button, or "This link is not valid". Norwegian or English from the browser language, with the same switch as the main page. No requests to third parties (no web fonts, scripts or analytics), enforced by a Content-Security-Policy; not indexed. `tests/share.test.js` covers the link parsing (`node --test tests/share.test.js`).

## 2026-10-07
### Changed
- Privacy policy for the new app build: what is stored on the device (drones, spots, logbook, checklist, operator ID, certificate dates), that saved spots' coordinates go to MET for the spot list, widget, Siri and notifications, the nearest place name lookup on every check, local notifications, Siri, CSV export and backups.

## 2026-10-06
### Fixed
- Sticky header and the sticky "How it works" phone now stick: `overflow-x: hidden` on `body` made it a scroll container, so `position: sticky` never engaged. Both use `clip` now.
- "How it works" steps now drive the phone: each step is taller than the reading band, so the column outruns the phone; the phone is sized to the viewport so it fits on a laptop screen.
- Altitude gauge sticks beside the phone and climbs 0 to 120 m while it is on screen, instead of sweeping past at double scroll speed.
- Inactive steps dim with `--muted` instead of 42 % opacity, which had dropped body text to 2.5:1 contrast.
- Altitude marker text in dark mode reaches 5.4:1 (was white on light blue, 3.3:1) via a new `--on-accent` token.
- "Personvernerklæring" no longer runs off the edge on phones: the privacy title steps down below 900 px, and headings wrap long words.
- Steps lost a 56 px left indent below 520 px that was left over for the hidden gauge.
### Changed
- Fade-in on scroll removed from section headings, intro paragraphs, legend rows and steps; the hero entrance, the step-driven phone and the contour draw remain.
- Fonts, shadows, reticle colours and the on-accent colour are tokens on `:root`; no literal colours or font stacks outside the token block.
- Curly quotes in the English copy.

## 2026-09-22
### Added
- Mobile: the check plays when the stage scrolls into view, rings clipped to the stage, numbered steps, stacked data table.
- Animated landing: the check plays in the hero, scroll-driven steps with an altitude gauge, contour reveal, FAQ open and close motion.
- Redesign: airspace-chart landing page and privacy page, Norwegian/English toggle, dark mode.
- Support page and privacy policy for the Luftrom iOS app.
