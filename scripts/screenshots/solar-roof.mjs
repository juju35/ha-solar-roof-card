// Renders the solar roof cards with mock panels and saves the README screenshots.
// Usage: npm install && npm run build && node scripts/screenshots/solar-roof.mjs
import { pair, shoot } from "./harness.mjs";
import { setup } from "./mock.mjs";

// Stills: animations: false stops the sun and the glint, so a capture only changes when the card does.
const still = (file, s) => pair(file, { ...s, config: { animations: false, ...s.config } });
const scenes = ["alert", "ok", "night", "many"].flatMap((scene) => still(scene, { scene }));
await shoot({ prefix: "sr", tag: "solar-roof-card", shots: [...scenes, ...still("narrow", { scene: "alert", width: 300 })], setup });
await shoot({
  prefix: "sr-mini",
  tag: "solar-roof-mini-card",
  shots: [...still("alert", { scene: "alert" }), ...still("ok", { scene: "ok" }), ...still("zoom", { scene: "alert", open: ".zoom" })],
  setup,
});
