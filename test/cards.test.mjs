import assert from "node:assert/strict";
import { test } from "node:test";
import { makeHass } from "./hass.mjs";
import { fakeNode, load } from "./load.mjs";

const sr = load();
const { cards } = sr;
const json = (v) => JSON.parse(JSON.stringify(v));

// A card whose shadow root answers every selector with nodes recording their click listeners.
const make = (tag, config = {}, hass = makeHass()) => {
  const card = new cards[tag]();
  card.attachShadow();
  const nodes = {};
  card.shadowRoot.querySelector = (s) => (nodes[s] ||= fakeNode());
  card._nodes = nodes;
  card.setConfig({ type: `custom:${tag}`, ...config });
  card.hass = hass;
  return card;
};

test("both cards are registered, with their editors and a picker entry", () => {
  for (const tag of ["solar-roof-card", "solar-roof-mini-card"]) {
    assert.ok(sr.customElements.get(tag), tag);
    assert.ok(sr.customElements.get(`${tag}-editor`), `${tag}-editor`);
  }
  assert.deepEqual(json(sr.window.customCards.map((c) => c.type)), ["solar-roof-card", "solar-roof-mini-card"]);
});

test("discovery: the DC inputs of each inverter in natural order, grouped by device; not the AC totals", () => {
  const p = sr.srPanels(makeHass({ enphase: true }));
  assert.equal(p.length, 16);
  assert.deepEqual(json(p.slice(0, 2).map((x) => [x.id, x.label, x.string])), [
    ["sensor.hm_a_ch1_power", "P1", "String A"],
    ["sensor.hm_a_ch2_power", "P2", "String A"],
  ]);
  assert.ok(!p.some((x) => x.id.includes("_ch0_")), "the AC total is not a panel");
  assert.ok(p.some((x) => x.id === "sensor.inverter_122101"), "Enphase micro-inverters");
  // `panels` in YAML wins, with names and strings.
  const own = sr.srPanels(makeHass(), ["sensor.hm_a_ch1_power", { entity: "sensor.hm_a_ch2_power", name: "East 2", string: "East" }]);
  assert.deepEqual(json(own.map((x) => [x.label, x.string])), [
    ["P1", ""],
    ["East 2", "East"],
  ]);
});

test("discovery: an MQTT sensor is a panel only on a Hoymiles or TSUN micro-inverter's device", () => {
  const h = makeHass();
  h.entities["sensor.shelly_pro_4pm_ch1_power"] = { device_id: "shelly", platform: "mqtt" };
  h.states["sensor.shelly_pro_4pm_ch1_power"] = { entity_id: "sensor.shelly_pro_4pm_ch1_power", state: "40", attributes: {} };
  h.devices.shelly = { name: "Shelly Pro 4PM", manufacturer: "Shelly", model: "SPSW-104PE16EU" };
  const ids = sr.srPanels(h).map((p) => p.id);
  assert.ok(!ids.includes("sensor.shelly_pro_4pm_ch1_power"), "a relay's channel is not a panel");
  assert.equal(ids.length, 12);
  h.devices.hm_b = { name: "String B", model: "HMS-2000-4T" };
  assert.equal(sr.srPanels(h).length, 12, "a Hoymiles model alone is enough");
});

test("power: W, kW and MW", () => {
  const w = (state, unit) => sr.srWatts({ state, attributes: { unit_of_measurement: unit } });
  assert.equal(w("310", "W"), 310);
  assert.equal(w("1.2", "kW"), 1200);
  assert.equal(w("0.004", "MW"), 4000);
  assert.equal(w("unavailable", "W"), null);
});

test("assessment: nothing is flagged while the sun is low", () => {
  const h = makeHass();
  h.states["sun.sun"].attributes = { elevation: 6.5 };
  assert.equal(sr.srAssess(h, sr.srPanels(h)).issues.length, 0, "at sunrise the panels wake up one by one");
  h.states["sun.sun"].attributes = { elevation: 24 };
  assert.equal(sr.srAssess(h, sr.srPanels(h)).issues.length, 2);
});

test("assessment: a panel far below its string's median is low, an unavailable one silent; nothing by night", () => {
  const h = makeHass();
  const a = sr.srAssess(h, sr.srPanels(h), 50);
  assert.deepEqual(json(a.issues.map((c) => [c.label, c.state])), [
    ["P7", "low"],
    ["P11", "silent"],
  ]);
  assert.equal(Math.round(a.total), 312 + 318 + 309 + 301 + 296 + 288 + 41 + 205 + 297 + 305 + 290);
  assert.equal(a.cells[0].level, 4);
  assert.equal(a.cells[6].level, 1);
  assert.equal(a.strings.length, 2);
  const n = makeHass({ sun: "below_horizon" });
  assert.equal(sr.srAssess(n, sr.srPanels(n)).issues.length, 0, "micro-inverters asleep are not silent panels");
  // A higher threshold flags the weaker P8 too.
  assert.ok(sr.srAssess(h, sr.srPanels(h), 75).issues.some((c) => c.label === "P8"));
});

test("full card: the banner, the grid by string, the alert and the tiles", () => {
  const card = make("solar-roof-card", { energy: "sensor.solar_energy_today", peak_power: 3840 });
  const m = card._items;
  assert.equal(m.state, "alert");
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /class="banner"/);
  assert.match(html, /<span class="bpt">2 to check<\/span>/);
  assert.match(html, /<div class="subt">2\.96 kW now · panels: 12<\/div>/);
  assert.match(html, /<div class="sh"><span>String A<\/span><span>1\.82 kW<\/span><\/div>/);
  assert.equal((html.match(/class="pc /g) || []).length, 12);
  assert.match(html, /class="pc l1 low" data-id="sensor\.hm_b_ch1_power"/);
  assert.match(html, /class="pc l0 silent" data-id="sensor\.hm_b_ch5_power"/);
  assert.match(html, /role="alert"><svg[\s\S]*<b>P7<\/b> at 14% of its neighbours since [^<]+ \(shade\?\) · <b>P11<\/b> silent since /);
  assert.match(html, /<span class="xv">14\.2 kWh<\/span>/);
  assert.match(html, /<span class="xs">of 3\.84 kWp<\/span>/);
  assert.match(html, /<button class="xt bad"><span class="xl">Check<\/span><span class="xv">P7, P11<\/span><span class="xs">low · no data<\/span>/);
});

test("all fine, night, and no panels", () => {
  const ok = make("solar-roof-card", {}, makeHass({ powers: [300, 310, 305, 298] }));
  assert.equal(ok._items.state, "ok");
  assert.match(ok.shadowRoot.innerHTML, /<span class="bpt">All fine<\/span>/);
  assert.doesNotMatch(ok.shadowRoot.innerHTML, /role="alert"/);
  const night = make("solar-roof-card", {}, makeHass({ sun: "below_horizon" }));
  assert.equal(night._items.state, "night");
  assert.match(night.shadowRoot.innerHTML, /asleep until sunrise/);
  const none = make("solar-roof-card", {}, makeHass({ powers: [] }));
  assert.equal(none._items.state, "none");
  assert.match(none.shadowRoot.innerHTML, /No panels found/);
});

test("a cell opens its sensor's details", () => {
  const card = make("solar-roof-card");
  const events = [];
  card.dispatchEvent = (e) => events.push(e.detail?.entityId);
  const buttons = [{ dataset: { id: "sensor.hm_a_ch1_power" } }];
  for (const b of buttons)
    b.addEventListener = (_type, fn) => {
      b.fn = fn;
    };
  card.shadowRoot.querySelectorAll = () => buttons;
  card._bindAfter(card.shadowRoot);
  buttons[0].fn();
  assert.deepEqual(events, ["sensor.hm_a_ch1_power"]);
});

test("mini card: the ring, the power chip and one strip cell per panel; the zoom shows the grid", () => {
  const card = make("solar-roof-mini-card");
  const html = card.shadowRoot.innerHTML;
  assert.match(html, /<ha-card class="lvl-alert bn">/);
  assert.match(html, /class="ringb"/);
  assert.match(html, /<span class="r"><span>2\.96 kW<\/span><\/span>/);
  assert.equal((html.match(/<i class="l/g) || []).length, 12);
  card._zoomed = true;
  card._sig = null;
  card._render();
  assert.match(card.shadowRoot.innerHTML, /class="cells"/);
});

test("the dark theme darkens the cells and the banner", () => {
  const card = make("solar-roof-card", {}, makeHass({ themes: { darkMode: true } }));
  assert.match(card.shadowRoot.innerHTML, /<ha-card class="lvl-alert dk">/);
  assert.match(card.shadowRoot.innerHTML, /class="banner night"/);
});

test("translations: every language has every English key", () => {
  const en = Object.keys(sr.SR_I18N.en);
  for (const [lang, table] of Object.entries(sr.SR_I18N)) {
    const missing = en.filter((k) => !(k in table));
    assert.deepEqual(missing, [], lang);
  }
  assert.equal(Object.keys(sr.SR_I18N).length, 22);
});

test("the editor writes only what differs from the defaults", () => {
  const ed = new (sr.customElements.get("solar-roof-card-editor"))();
  ed.setConfig({ type: "custom:solar-roof-card" });
  ed.hass = makeHass();
  const form = ed.children[0];
  const names = form.schema.flatMap((s) => (s.schema ? s.schema.map((x) => x.name) : [s.name]));
  for (const n of ["peak_power", "energy", "threshold", "show_alerts", "show_tiles", "illustration_theme", "panels", "language"]) assert.ok(names.includes(n), n);
  let out;
  ed.dispatchEvent = (e) => {
    out = e.detail.config;
  };
  form.listeners["value-changed"]({ detail: { value: { type: "custom:solar-roof-card", threshold: 50, show_alerts: true, peak_power: 3840 } } });
  assert.deepEqual(json(out), { type: "custom:solar-roof-card", peak_power: 3840 });
});
