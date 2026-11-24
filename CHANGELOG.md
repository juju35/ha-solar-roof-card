# Changelog

## 1.0.3 - 2026-11-24

### Maintenance
- The card source is split into ES modules: `src/shared/` (entry `src/shared/index.js`), cut at its sections, with the translations in one file per language (`i18n/<lang>.js`). `scripts/bundle.mjs` concatenates them back, in their original order, into the same single file and per-language files as before; the tests evaluate that bundle.

## 1.0.2 - 2026-11-22

### Performance
- Card picker: the previews are back (`preview: true`), and light. Each card's preview is drawn only once it scrolls into view of Home Assistant's card picker, which otherwise builds the preview of every card at once: until then it holds Home Assistant's state (no render, no history request, no animation). On a dashboard or in the card editor the card is drawn as before.

## 1.0.1 - 2026-11-22

### Performance
- Card picker: the cards no longer ask Home Assistant for a live preview (`preview: false` in `window.customCards`). The picker drew every card at once (history requests, animations), which made the list slow to open; it now shows each card's description instead.

## 1.0.0 - 2026-11-22

### Features
- First release: `solar-roof-card` and `solar-roof-mini-card`. Each panel as a cell coloured by its production, grouped by string; a panel far below its string's median flagged low, a silent one flagged, with an alert saying since when; the power now, today's energy and the panels to check in three tiles; an illustrated header whose roof greys the panels to check. Enphase Envoy, OpenDTU / AhoyDTU, Hoymiles, APsystems, Huawei Solar, SolarEdge Optimizers and Fox ESS found automatically, or any power sensors listed under `panels`.
