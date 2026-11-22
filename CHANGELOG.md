# Changelog

## 1.0.1 - 2026-11-22

### Performance
- Card picker: the cards no longer ask Home Assistant for a live preview (`preview: false` in `window.customCards`). The picker drew every card at once (history requests, animations), which made the list slow to open; it now shows each card's description instead.

## 1.0.0 - 2026-11-22

### Features
- First release: `solar-roof-card` and `solar-roof-mini-card`. Each panel as a cell coloured by its production, grouped by string; a panel far below its string's median flagged low, a silent one flagged, with an alert saying since when; the power now, today's energy and the panels to check in three tiles; an illustrated header whose roof greys the panels to check. Enphase Envoy, OpenDTU / AhoyDTU, Hoymiles, APsystems, Huawei Solar, SolarEdge Optimizers and Fox ESS found automatically, or any power sensors listed under `panels`.
