// ── Solar roof ───────────────────────────────────────────────────────────────
// A panel is a power sensor: a micro-inverter (Enphase, Hoymiles through OpenDTU, AhoyDTU or its Wi-Fi DTU), an input
// of an inverter (APsystems channels, Fox ESS strings) or an optimiser (Huawei, SolarEdge). `panels` lists them in
// YAML (each with an optional name, string and orientation); otherwise they are found by their integration and their name, and
// grouped by device (an inverter, a micro-inverter's DTU or gateway). A panel is low when it makes less than
// `threshold` % of the median of the panels of its string facing the same way (of all the panels facing that way, else
// of all the panels, when they are fewer than three), silent when it reports nothing.
// By night (the sun below the horizon, or every panel at almost nothing) nothing is flagged: micro-inverters sleep;
// nor while the sun is lower than SR_MIN_ELEVATION.
export const SR_PANELS = [
  ["enphase_envoy", /^sensor\.inverter_\d+$/],
  ["mqtt", /_ch[1-9]\d*_(power|p_dc)$/],
  ["hoymiles_wifi", /(port|pv)_?\d+.*power$/],
  ["apsystems_ecu_reader", /power_ch_?\d+$/],
  ["apsystemsapi_local", /power_p\d+$/],
  ["huawei_solar", /optimi[sz]er/],
  ["solaredgeoptimizers", /power/],
  ["foxess_modbus", /pv\d+_power$/],
];
export const SR_NOT = /total|_ch0_|ac_power|grid|load|battery|export|import/;
// An MQTT sensor is a panel only on a Hoymiles / TSUN micro-inverter's device (OpenDTU, AhoyDTU): many other MQTT
// devices name their channels ch1, ch2…
export const SR_MQTT_DTU = /hoymiles|tsun|opendtu|ahoy/i;
export const SR_MQTT_MODEL = /^(hm|hms|hmt|tsol)[-_ ]?\d/i;
export const srMqttPanel = (dev) => !!dev && (SR_MQTT_DTU.test(dev.manufacturer || "") || SR_MQTT_MODEL.test(dev.model || ""));
// Under this elevation of the sun (°) nothing is flagged: at sunrise and sunset the panels wake up one by one and the
// shade of the neighbours runs long.
export const SR_MIN_ELEVATION = 10;

export const srWatts = (st) => {
  if (!st || ["unavailable", "unknown", ""].includes(st.state)) return null;
  const v = Number(st.state);
  if (!Number.isFinite(v)) return null;
  const u = st.attributes?.unit_of_measurement || "W";
  return /^kW$/i.test(u) ? v * 1000 : /^MW$/i.test(u) ? v * 1e6 : v;
};

// Entity ids in their natural order: inverter_2 before inverter_10.
export const srOrder = (a, b) => a.localeCompare(b, "en", { numeric: true });

// The panels: `panels` (a list of entity ids, or of { entity, name, string, orientation }), else every power sensor of a
// panel integration but those in `exclude` (an unused string, say). Each gets a short label (P1, P2…: its name stays in
// the tooltip), its string and its orientation (the panels are compared with those facing the same way).
export const srPanels = (hass, list, exclude) => {
  const skip = new Set((Array.isArray(exclude) ? exclude : exclude ? [exclude] : []).map(String));
  if (Array.isArray(list) && list.length)
    return list
      .map((p) => (typeof p === "string" ? { entity: p } : p))
      .filter((p) => p?.entity && !skip.has(p.entity))
      .map((p, i) => ({
        id: p.entity,
        label: p.name || `P${i + 1}`,
        name: p.name || hass.states[p.entity]?.attributes.friendly_name || p.entity,
        string: p.string ?? "",
        orientation: p.orientation == null ? "" : String(p.orientation),
      }));
  const reg = hass.entities || {};
  const ids = Object.keys(reg)
    .filter((id) => {
      if (!id.startsWith("sensor.") || SR_NOT.test(id) || skip.has(id)) return false;
      const e = reg[id];
      if (e.platform === "mqtt" && !srMqttPanel(hass.devices?.[e.device_id])) return false;
      return SR_PANELS.some(([platform, re]) => e.platform === platform && (re.test(id) || re.test(e.translation_key || "")));
    })
    .sort(srOrder);
  const devName = (dev) => dev?.name_by_user || dev?.name || "";
  // Grouped by device; a micro-inverter that is a device of its own (Enphase) goes under its gateway (the Envoy).
  const panels = ids.map((id, i) => {
    const dev = hass.devices?.[reg[id].device_id];
    const via = dev?.via_device_id ? hass.devices?.[dev.via_device_id] : undefined;
    return { id, label: `P${i + 1}`, name: hass.states[id]?.attributes.friendly_name || id, string: devName(via) || devName(dev), orientation: "" };
  });
  // An integration whose every panel is alone in its group or has none (a device per micro-inverter, no gateway known):
  // one group for them all, the cells wrapping, rather than a group per panel.
  const count = new Map();
  for (const p of panels) count.set(p.string, (count.get(p.string) || 0) + 1);
  const platforms = new Map();
  for (const p of panels) {
    const platform = reg[p.id].platform;
    if (!platforms.has(platform)) platforms.set(platform, []);
    platforms.get(platform).push(p);
  }
  for (const group of platforms.values())
    if (group.length > 1 && group.every((p) => !p.string || count.get(p.string) === 1)) for (const p of group) p.string = "";
  return panels;
};

export const srMedian = (vals) => {
  const v = [...vals].sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Each panel's power and state (ok, low or silent), grouped by string, with the totals.
export const srAssess = (hass, panels, threshold = 50) => {
  const cells = panels.map((p) => {
    const st = hass.states[p.id];
    return { ...p, w: srWatts(st), since: st?.last_changed ? new Date(st.last_changed).getTime() : null };
  });
  const live = cells.filter((c) => c.w != null).map((c) => c.w);
  const all = srMedian(live);
  const sun = hass.states["sun.sun"];
  const night = sun ? sun.state === "below_horizon" : !live.length || Math.max(...live) < 5;
  const elevation = Number(sun?.attributes?.elevation);
  const lowSun = !night && Number.isFinite(elevation) && elevation < SR_MIN_ELEVATION;
  const groups = new Map();
  for (const c of cells) {
    if (!groups.has(c.string)) groups.set(c.string, []);
    groups.get(c.string).push(c);
  }
  // Compared within its string and its orientation (an east panel with the east panels of its string); a group of fewer
  // than three with the panels facing the same way, else with them all.
  const facing = new Map();
  const peers = new Map();
  for (const c of cells) {
    const o = c.orientation || "";
    const key = `${c.string}\u0000${o}`;
    if (!peers.has(key)) peers.set(key, []);
    peers.get(key).push(c);
    if (!facing.has(o)) facing.set(o, []);
    if (c.w != null) facing.get(o).push(c.w);
  }
  for (const group of peers.values()) {
    const vals = group.filter((c) => c.w != null).map((c) => c.w);
    const same = facing.get(group[0].orientation || "");
    const med = vals.length >= 3 ? srMedian(vals) : group[0].orientation && same.length >= 3 ? srMedian(same) : all;
    for (const c of group) {
      c.ratio = med > 0 && c.w != null ? c.w / med : null;
      c.state = night || lowSun ? "ok" : c.w == null ? "silent" : med > 30 && c.w < (med * threshold) / 100 ? "low" : "ok";
    }
  }
  const max = Math.max(0, ...live);
  for (const c of cells) c.level = c.w == null || max <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((c.w / max) * 4)));
  return {
    cells,
    strings: [...groups.entries()].map(([name, group]) => ({ name, cells: group, w: group.reduce((s, c) => s + (c.w || 0), 0) })),
    total: live.reduce((s, w) => s + w, 0),
    issues: cells.filter((c) => c.state !== "ok"),
    night,
  };
};

// The Intl formats, made once per language and options (a render formats many numbers).
export const srIntlCache = new Map();
export const srIntl = (Kind, lang, opts) => {
  const key = `${Kind.name}|${lang}|${JSON.stringify(opts)}`;
  if (!srIntlCache.has(key)) srIntlCache.set(key, new Kind(lang, opts));
  return srIntlCache.get(key);
};
