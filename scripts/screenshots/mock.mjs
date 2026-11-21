// The mock home of the screenshots and animations: twelve Hoymiles panels behind OpenDTU on two strings (one shaded,
// one silent), or twenty-four Enphase micro-inverters on three roofs, the sun, and the installation's energy today.
// The times are fixed, so that a capture only changes when the card does.
const st = (entity_id, state, attributes = {}, last_changed = "2026-06-21T09:42:00Z") => ({ entity_id, state, attributes, last_changed });
const W = { unit_of_measurement: "W", device_class: "power" };

// `scene`: alert (P7 shaded since 11:00, P11 silent since 09:42), ok, night, many (24 micro-inverters, 3 strings).
const SCENES = {
  alert: [312, 318, 309, 301, 296, 288, 41, 205, 297, 305, "unavailable", 290],
  ok: [312, 318, 309, 301, 296, 288, 284, 279, 297, 305, 301, 290],
  night: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "unavailable", 0],
};

export const setup = (s) => {
  const states = { "sun.sun": st("sun.sun", s.scene === "night" ? "below_horizon" : "above_horizon") };
  const entities = {};
  const devices = {};
  if (s.scene === "many") {
    for (let i = 0; i < 24; i++) {
      const id = `sensor.inverter_1221${String(i + 1).padStart(2, "0")}`;
      const roof = ["South roof", "East roof", "Garage"][Math.floor(i / 8)];
      const base = [262, 214, 148][Math.floor(i / 8)];
      states[id] = st(id, String(base + ((i * 7) % 13) - (i === 13 ? 150 : 0)), W, "2026-06-21T13:10:00Z");
      entities[id] = { entity_id: id, device_id: roof, platform: "enphase_envoy" };
      devices[roof] = { name: roof };
    }
  } else {
    SCENES[s.scene].forEach((p, i) => {
      const inv = i < 6 ? "hm_a" : "hm_b";
      const id = `sensor.${inv}_ch${(i % 6) + 1}_power`;
      states[id] = st(id, String(p), W, i === 6 ? "2026-06-21T11:00:00Z" : "2026-06-21T09:42:00Z");
      entities[id] = { entity_id: id, device_id: inv, platform: "mqtt" };
    });
    devices.hm_a = { name: "String A" };
    devices.hm_b = { name: "String B" };
  }
  states["sensor.solar_energy_today"] = st("sensor.solar_energy_today", s.scene === "night" ? "21.6" : "14.2", { unit_of_measurement: "kWh", device_class: "energy" });
  return {
    hass: { language: "en", locale: { language: "en" }, devices, entities, states },
    config: { energy: "sensor.solar_energy_today", peak_power: s.scene === "many" ? 7200 : 3840, ...s.config },
    open: s.open,
  };
};
