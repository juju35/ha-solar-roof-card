// A mock Home Assistant with twelve Hoymiles panels behind OpenDTU (MQTT discovery: one DC power sensor per input,
// on two inverters, plus each inverter's AC total which is not a panel), four Enphase micro-inverters, the sun, and a
// daily energy sensor.
export const st = (entity_id, state, attributes = {}, last_changed = "2026-06-21T09:42:00Z") => ({ entity_id, state, attributes, last_changed });

const W = { unit_of_measurement: "W", device_class: "power" };
export const POWERS = [312, 318, 309, 301, 296, 288, 41, 205, 297, 305, "unavailable", 290];

export const makeHass = ({ sun = "above_horizon", powers = POWERS, enphase = false, ...overrides } = {}) => {
  const states = { "sun.sun": st("sun.sun", sun), "sensor.solar_energy_today": st("sensor.solar_energy_today", "14.2", { unit_of_measurement: "kWh", device_class: "energy" }) };
  const entities = {};
  powers.forEach((p, i) => {
    const inv = i < 6 ? "hm_a" : "hm_b";
    const id = `sensor.${inv}_ch${(i % 6) + 1}_power`;
    states[id] = st(id, String(p), { ...W, friendly_name: `${inv.toUpperCase()} CH${(i % 6) + 1} Power` });
    entities[id] = { device_id: inv, platform: "mqtt" };
  });
  for (const inv of ["hm_a", "hm_b"]) {
    const id = `sensor.${inv}_ch0_power`;
    states[id] = st(id, "1800", W);
    entities[id] = { device_id: inv, platform: "mqtt" };
  }
  if (enphase)
    for (let i = 1; i <= 4; i++) {
      const id = `sensor.inverter_12210${i}`;
      states[id] = st(id, String(200 + i), W);
      entities[id] = { device_id: `env${i}`, platform: "enphase_envoy" };
    }
  return {
    language: "en",
    locale: { language: "en" },
    themes: { darkMode: false },
    devices: { hm_a: { name: "String A", manufacturer: "Hoymiles", model: "HM-1500" }, hm_b: { name: "String B", manufacturer: "Hoymiles", model: "HM-1500" }, env1: { name: "Inverter 122101" } },
    entities,
    states,
    calls: [],
    callService(domain, service, data) {
      this.calls.push([domain, service, data]);
    },
    ...overrides,
  };
};
