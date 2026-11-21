/**
 * solar-roof-card / solar-roof-mini-card: the solar panels, panel by panel. Each micro-inverter, optimiser or string as a
 * cell coloured by its production, grouped by string; a shaded or silent panel flagged, with since when.
 * https://github.com/juju35/ha-solar-roof-card
 */

const SR_ICONS = { ok: "mdi:solar-panel-large", alert: "mdi:solar-panel-large", night: "mdi:weather-night", none: "mdi:solar-panel-large" };
// One loop of the banner's animations (s): the sun's rays turn by one step, a glint sweeps over the panels.
const SR_LOOP = 3;

// ── Banner ───────────────────────────────────────────────────────────────────
// The illustrated header's scene: 200 × 80, drawn to the banner's right edge. Hills and a house whose roof carries ten
// panels; the panels to check are grey (as many tenths as there are panels to check, at least one). While the panels
// produce, the sun's rays turn and a glint sweeps over them. The picture's night (`night`: the dark theme) darkens the
// sky, the hills and the house; the real night (`moon`: the sun set) puts the moon in place of the sun.
const srScene = ({ night, moon, bad, producing, animate, uid }) => {
  const hill = night ? "#24384f" : "#a8d58f";
  const wall = night ? "#3a4656" : "#f3e3c8";
  const roof = night ? "#5b3b30" : "#c8643a";
  const cell = night ? "#14243f" : "#24489c";
  const grey = night ? "#4a525e" : "#7d8794";
  const pos = [
    [96, 36],
    [109, 36],
    [122, 36],
    [135, 36],
    [148, 36],
    [102, 45],
    [115, 45],
    [128, 45],
    [141, 45],
    [154, 45],
  ];
  // The panels to check: from the middle of the lower row, so that one alone shows at a glance.
  const order = [7, 6, 8, 2, 5, 9, 1, 3, 0, 4];
  const greyed = new Set(order.slice(0, bad));
  const panels = pos.map(([x, y], i) => `<rect x="${x}" y="${y}" width="12" height="8" fill="${greyed.has(i) ? grey : cell}" stroke="${night ? "#2c4a78" : "#8fb0ff"}" stroke-width=".5"/>`).join("");
  const sweep = animate && producing ? `<animateTransform attributeName="transform" type="translate" from="-30 0" to="110 0" dur="${SR_LOOP}s" repeatCount="indefinite"/>` : "";
  const glint = producing ? `<g clip-path="url(#rf${uid})"><rect x="90" y="30" width="10" height="26" fill="#fff" opacity=".35" transform="skewX(-20)">${sweep}</rect></g>` : "";
  const sun = "#f5b400";
  const rays = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<path d="M52 7v-3" transform="rotate(${k * 45} 52 18)"/>`).join("");
  const spin = animate && producing ? `<animateTransform attributeName="transform" type="rotate" from="0 52 18" to="45 52 18" dur="${SR_LOOP}s" repeatCount="indefinite"/>` : "";
  const sky = moon
    ? `<circle cx="52" cy="18" r="7" fill="${night ? "#e8edf5" : "#f4f1e4"}"/><circle cx="55.5" cy="15.5" r="6" fill="${night ? "#1c3050" : "#cbe5f7"}"/>`
    : `<circle cx="52" cy="18" r="7" fill="${sun}"/><g stroke="${sun}" stroke-width="1.6" stroke-linecap="round">${rays}${spin}</g>`;
  return `<defs><clipPath id="rf${uid}">${pos.map(([x, y]) => `<rect x="${x}" y="${y}" width="12" height="8"/>`).join("")}</clipPath></defs>
    ${sky}<path d="M150 20c0-5 4-8 9-8 3 0 6 2 7 5 4 0 7 3 7 6h-23z" fill="#fff" opacity="${night ? 0.15 : 0.9}"/>
    <path d="M30 80 Q100 56 200 64 V80Z" fill="${hill}"/>
    <rect x="92" y="56" width="92" height="24" fill="${wall}"/>
    <path d="M80 58 L104 30 L176 30 L196 58Z" fill="${roof}"/>
    ${panels}${glint}
    <rect x="104" y="64" width="10" height="16" fill="${night ? "#2a2f38" : "#8a5a3b"}"/><rect x="132" y="64" width="16" height="10" fill="${moon ? "#f5d27a" : "#9cc4ea"}"/><rect x="160" y="64" width="16" height="10" fill="${moon ? "#f5d27a" : "#9cc4ea"}"/>`;
};

// The status pill's place, decided by measurement after each render and each new width (the same rule on every
// card): on the title row, right after the title, only when the whole title and the pill's whole label fit there;
// otherwise on its own line under the subtitle (clamped to one line). When the label is still cut there, or the text
// block leaves the banner or runs over its ground strip, the pill keeps its dot alone, on the title row (its label
// stays in title and aria-label). A card of 200 px or less shows the dot alone anyway (CSS), beside the title.
const srPlacePill = (head, row, ground) => {
  if (!head) return;
  head.removeAttribute("data-wrap");
  head.removeAttribute("data-dot");
  const pill = row.querySelector(":scope > .bpill, :scope > .pill");
  const text = pill?.querySelector(".bpt, .pt");
  if (!text?.getBoundingClientRect || text.getBoundingClientRect().width <= 1) return;
  const name = row.querySelector(".title");
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  const title = name ? (name.scrollWidth > name.clientWidth ? name.scrollWidth : name.getBoundingClientRect().width) + gap : 0;
  if (title + pill.getBoundingClientRect().width <= row.getBoundingClientRect().width + 0.5) return;
  head.setAttribute("data-wrap", "");
  const box = row.parentElement.getBoundingClientRect();
  const frame = head.getBoundingClientRect();
  const out = ground && (box.bottom > ground.getBoundingClientRect().top + 0.5 || box.top < frame.top - 0.5);
  if (text.scrollWidth > text.clientWidth + 0.5 || out) {
    head.removeAttribute("data-wrap");
    head.setAttribute("data-dot", "");
  }
};

// ── Card ─────────────────────────────────────────────────────────────────────
class SolarRoofCard extends RcCard {
  static tag = "solar-roof-card";
  static i18n = SR_I18N;
  static defaults = { illustration: true, illustration_theme: "auto", show_subtitle: true, show_alerts: true, show_tiles: true, animations: true, threshold: 50 };

  // The panels are found by the card: nothing to set.
  static getStubConfig() {
    return {};
  }

  getCardSize() {
    return 6;
  }

  connectedCallback() {
    super.connectedCallback?.();
    // A new width: the status pill is fitted again (in the next frame, and only for a new width).
    if (typeof ResizeObserver !== "function") return;
    this._resize ??= new ResizeObserver((entries) => {
      const w = Math.round(entries.at(-1).contentRect.width);
      if (w === this._fitWidth) return;
      this._fitWidth = w;
      cancelAnimationFrame(this._fitFrame);
      this._fitFrame = requestAnimationFrame(() => this._fitPill());
    });
    this._resize.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    this._resize?.disconnect();
    this._fitWidth = undefined;
    if (this._fitFrame) cancelAnimationFrame(this._fitFrame);
  }

  _fmt(v, digits) {
    try {
      return srIntl(Intl.NumberFormat, this._lang(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    } catch {
      return v.toFixed(digits);
    }
  }

  _watts(v) {
    if (v == null) return "—";
    return v >= 1000 ? `${this._fmt(v / 1000, 2)} kW` : `${this._fmt(v, 0)} W`;
  }

  _hm(t) {
    try {
      return srIntl(Intl.DateTimeFormat, this._lang(), { hour: "numeric", minute: "2-digit" }).format(new Date(t));
    } catch {
      return new Date(t).toTimeString().slice(0, 5);
    }
  }

  // The panels, their states and the totals.
  _collect() {
    const h = this._hass;
    const c = this._config;
    const panels = rcMemo((this._memo ||= {}), "panels", [c.panels, h.entities, h.devices], () => srPanels(h, c.panels));
    const threshold = Math.min(95, Math.max(5, Number(c.threshold) || 50));
    const a = srAssess(h, panels, threshold);
    const state = !panels.length ? "none" : a.night ? "night" : a.issues.length ? "alert" : "ok";
    const energySt = c.energy ? h.states[c.energy] : undefined;
    const e = Number(energySt?.state);
    const unitE = energySt?.attributes?.unit_of_measurement || "kWh";
    return {
      ...a,
      none: state === "none",
      state,
      name: c.title || this._t("title"),
      count: panels.length,
      peak: Number(c.peak_power) || null,
      energy: energySt && Number.isFinite(e) ? (/^Wh$/i.test(unitE) ? e / 1000 : e) : null,
      energyId: c.energy || null,
    };
  }

  _dark() {
    return !!this._hass.themes?.darkMode;
  }

  // The banner's night: forced by `illustration_theme`, else Home Assistant's dark theme alone (a light theme keeps the
  // day picture after sunset).
  _night() {
    const theme = this._config.illustration_theme;
    if (theme === "night" || theme === "day") return theme === "night";
    return this._dark();
  }

  _animate() {
    if (this._config.animations === false) return false;
    try {
      return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  }

  // Unique per card: the SVG ids of several cards on one page never clash.
  _id() {
    this._uid ||= Math.random().toString(36).slice(2, 8);
    return this._uid;
  }

  _status(m) {
    return m.state === "alert" ? this._t("st_alert", { n: m.issues.length }) : this._t(`st_${m.state}`);
  }

  // The illustrated header: the badge (the state's icon, in the state's colour), the title and `sub` on the sky at
  // the left, the house and its panels at the right, a 10 px grass strip edge to edge. `ring`: the mini card's share
  // of panels in line, around the badge.
  _banner(m, sub, ring = "", pill = "") {
    const c = this._config;
    const nav = c.navigation_path;
    const night = this._night();
    const bad = m.issues?.length ? Math.max(1, Math.round((m.issues.length / m.count) * 10)) : 0;
    const scene = srScene({ night, moon: m.state === "night", bad, producing: m.state === "ok" || m.state === "alert", animate: this._animate(), uid: this._id() });
    const chip = pill ? `<span class="bpill" title="${rcEsc(pill)}" aria-label="${rcEsc(pill)}"><span class="bdot"></span><span class="bpt">${rcEsc(pill)}</span></span>` : "";
    return `
      <div class="banner${night ? " night" : ""}">
        <div class="head${nav ? " nav" : ""}"${nav ? ' role="link" tabindex="0"' : ""}>
          <div class="badge">${ring}<ha-icon icon="${SR_ICONS[m.state]}"></ha-icon></div>
          <div class="tt"><div class="trow"><div class="title">${rcEsc(m.name)}</div>${chip}</div>${sub}</div>
        </div>
        <svg class="room" viewBox="0 0 200 80" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">${scene}</svg>
        <div class="ground"></div>
      </div>`;
  }

  // The status pill's place, on the banner and on the classic header (see srPlacePill).
  _fitPill() {
    for (const row of this.shadowRoot?.querySelectorAll?.(".trow") || []) {
      const banner = row.closest(".banner");
      srPlacePill(banner || row.closest(".head"), row, banner?.querySelector(".ground"));
    }
  }

  // One cell per panel: its label and power, coloured by its share of the strongest panel; low: grey ringed in red,
  // silent: red.
  _cell(p) {
    const title = [p.name, p.w != null ? this._watts(p.w) : this._t("silent"), p.state === "low" ? this._t("low") : ""].filter(Boolean).join(" · ");
    const value = p.w == null ? "—" : p.w >= 1000 ? `${this._fmt(p.w / 1000, 1)}<small> kW</small>` : `${this._fmt(p.w, 0)}<small> W</small>`;
    return `<button class="pc l${p.level} ${p.state}" data-id="${rcEsc(p.id)}" title="${rcEsc(title)}"><span class="pl">${rcEsc(p.label)}</span><span class="pv">${value}</span></button>`;
  }

  _grid(m) {
    return `<div class="box grid2">${m.strings
      .map(
        (s) =>
          `<div class="sh"><span>${rcEsc(s.name || this._t("panels_group"))}</span><span>${rcEsc(this._watts(s.w))}</span></div><div class="cells">${s.cells.map((p) => this._cell(p)).join("")}</div>`,
      )
      .join("")}</div>`;
  }

  // What to check: each low panel at its share of its neighbours, each silent one, since when.
  _alerts(m) {
    if (this._config.show_alerts === false || !m.issues.length) return "";
    const msg = m.issues
      .map((p) =>
        p.state === "low"
          ? `${this._t("low_msg", { p: `<b>${rcEsc(p.label)}</b>`, n: this._fmt((p.ratio || 0) * 100, 0), t: p.since ? this._hm(p.since) : "—" })} (${rcEsc(this._t("shade"))})`
          : this._t("silent_msg", { p: `<b>${rcEsc(p.label)}</b>`, t: p.since ? this._hm(p.since) : "—" }),
      )
      .join(" · ");
    return `<div class="box alert" role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg><span>${msg}</span></div>`;
  }

  _tileRow(m) {
    if (this._config.show_tiles === false) return "";
    const tile = (label, value, sub, id, cls = "") =>
      `<button class="xt${cls}"${id ? ` data-id="${rcEsc(id)}"` : ""}><span class="xl">${rcEsc(this._t(label))}</span><span class="xv">${rcEsc(value)}</span>${sub ? `<span class="xs">${rcEsc(sub)}</span>` : ""}</button>`;
    const now = tile("t_now", this._watts(m.total), m.peak ? this._t("of_peak", { v: m.peak >= 1000 ? `${this._fmt(m.peak / 1000, 2)} kWp` : `${this._fmt(m.peak, 0)} Wp` }) : "");
    const second = m.energy != null ? tile("t_today", `${this._fmt(m.energy, 1)} kWh`, "", m.energyId) : tile("t_panels", String(m.count), "");
    const kinds = [...new Set(m.issues.map((p) => this._t(p.state === "low" ? "low" : "silent")))].join(" · ");
    const check = tile("t_check", m.issues.length ? m.issues.map((p) => p.label).join(", ") : this._t("t_none"), kinds, "", m.issues.length ? " bad" : "");
    return `<div class="tiles">${now}${second}${check}</div>`;
  }

  _draw(m) {
    const c = this._config;
    const status = this._status(m);
    const parts = [m.state, m.cells.map((p) => [p.w, p.state, p.since]), m.total, m.energy, this._night(), this._dark()];
    if (!this._changed(parts)) return;
    const sub = !m.none && c.show_subtitle !== false ? `<div class="subt">${rcEsc(this._t("sub_now", { p: this._watts(m.total), n: m.count }))}</div>` : "";
    const head =
      c.illustration !== false
        ? this._banner(m, sub, "", m.none ? "" : status)
        : `<div class="head${c.navigation_path ? " nav" : ""}"${c.navigation_path ? ' role="link" tabindex="0"' : ""}>
            <div class="badge"><ha-icon icon="${SR_ICONS[m.state]}"></ha-icon></div>
            <div class="tt"><div class="trow"><div class="title">${rcEsc(m.name)}</div>${m.none ? "" : `<span class="pill" title="${rcEsc(status)}" aria-label="${rcEsc(status)}"><span class="pt">${rcEsc(status)}</span></span>`}</div>${sub}</div>
          </div>`;
    const dk = this._dark() ? " dk" : "";
    if (m.none) {
      this._paint("none", `${head}<div class="box empty">${rcEsc(this._t("no_panels"))}</div>`, "", dk);
      this._fitPill();
      return;
    }
    const night = m.state === "night" && c.show_alerts !== false ? `<div class="box calm">${rcEsc(this._t("night_msg"))}</div>` : "";
    this._paint(m.state, head + this._grid(m) + this._alerts(m) + night + this._tileRow(m), "", dk);
    this._fitPill();
  }

  _bindAfter(root) {
    for (const b of root.querySelectorAll(".pc[data-id], .xt[data-id]") || []) b.addEventListener("click", () => rcMoreInfo(this, b.dataset.id));
  }

  static styles = `
    :host { --sr-l0: rgba(127,127,127,.18); --sr-l1: #ffe3a3; --sr-l2: #ffc94d; --sr-l3: #ffa94d; --sr-l4: #f08c00;
            --sr-low: #d0d5dc; --sr-silent: #e5484d; --sr-ink: #3d2a00; }
    ha-card.dk { --sr-l1: #4a3d1f; --sr-l2: #7a5a1c; --sr-l3: #b07818; --sr-l4: #e08a18; --sr-low: #3a3f46; --sr-silent: #b3261e; --sr-ink: #fff6e6; }
    ha-card.lvl-ok { --c: #1c7ed6; }
    ha-card.lvl-alert { --c: #e8590c; }
    ha-card.lvl-night, ha-card.lvl-none { --c: var(--rc-idle); }
    .tt { flex: 1 1 0; min-width: 5ch; display: flex; flex-direction: column; }
    .tt .title { flex: none; }
    .subt { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host([hide-title]) .head .tt { visibility: hidden; }
    .box { margin-top: 10px; border-radius: 12px; padding: 10px 12px; background: var(--secondary-background-color, rgba(127,127,127,.08)); }
    .empty, .calm { font-size: 13px; color: var(--secondary-text-color); }
    .grid2 { display: flex; flex-direction: column; gap: 8px; }
    .sh { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--secondary-text-color); }
    .sh span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cells { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 6px; }
    .pc { all: unset; box-sizing: border-box; cursor: pointer; min-width: 0; border-radius: 10px; padding: 7px 8px; display: flex; flex-direction: column; gap: 1px;
          background: var(--sr-l0); color: var(--primary-text-color); }
    .pc.l1 { background: var(--sr-l1); color: var(--sr-ink); } .pc.l2 { background: var(--sr-l2); color: var(--sr-ink); }
    .pc.l3 { background: var(--sr-l3); color: var(--sr-ink); } .pc.l4 { background: var(--sr-l4); color: var(--sr-ink); }
    .pc.low { background: var(--sr-low); color: var(--primary-text-color); box-shadow: inset 0 0 0 2px #c92a2a; }
    .pc.silent { background: var(--sr-silent); color: #fff; box-shadow: inset 0 0 0 2px #c92a2a; }
    .pc:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    .pl { font-size: 11px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pv { font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pv small { font-size: 10px; font-weight: 400; }
    .alert { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.35;
             background: color-mix(in srgb, #e8590c 12%, var(--card-background-color, #fff)); color: color-mix(in srgb, #c92a2a 55%, var(--primary-text-color, #212121)); }
    .alert svg { flex: none; width: 20px; height: 20px; fill: #c92a2a; }
    .alert b { font-weight: 500; }
    .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
    .xt { all: unset; box-sizing: border-box; min-width: 0; border-radius: 12px; padding: 9px 11px; display: flex; flex-direction: column; gap: 3px;
          background: var(--secondary-background-color, rgba(127,127,127,.08)); }
    .xt[data-id] { cursor: pointer; }
    .xt:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    .xl { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .xv { font-size: 18px; font-weight: 500; line-height: 1.15; color: var(--primary-text-color); overflow-wrap: anywhere; }
    .xt.bad .xv { color: color-mix(in srgb, #c92a2a 70%, var(--primary-text-color, #212121)); }
    .xs { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    @container (max-width: 300px) {
      .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tiles > :nth-child(3):last-child { grid-column: 1 / -1; }
    }
    /* Illustrated header (banner): 90 px, edge to edge, the title on the sky, the house and its roof of panels at the right,
       a 10 px grass strip at the bottom. The badge's icon is in the state's colour, grey when idle, by day and night. */
    .banner { position: relative; display: flex; height: 90px; margin: -12px -12px 0; overflow: hidden;
              background: linear-gradient(180deg, #d6ecfb 0%, #bfe0f6 100%);
              --bt: #0d2a45; --bs: #3b5b78; --ic: color-mix(in srgb, var(--c) 85%, #10283f); --sw: min(200px, 56%); }
    .banner.night { background: linear-gradient(180deg, #142339 0%, #1d3150 100%); --bt: #fff; --bs: rgba(255,255,255,.78); --ic: color-mix(in srgb, var(--c) 72%, #fff); }
    .lvl-night .banner, .lvl-none .banner { --ic: #6b7680; }
    .lvl-night .banner.night, .lvl-none .banner.night { --ic: #a7b0b8; }
    .banner .head { position: relative; z-index: 1; flex: 1; min-width: 0; height: 80px; box-sizing: border-box;
                    padding: 0 calc(var(--sw) + 4px) 0 14px; flex-wrap: nowrap; }
    .banner .head::after { content: none; }
    .banner .badge { position: relative; color: var(--ic); background: rgba(255,255,255,.62); box-shadow: inset 0 0 0 1px rgba(13,42,69,.12); }
    .banner.night .badge { background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
    .banner .title { color: var(--bt); }
    .banner .subt { color: var(--bs); font-size: 13px; }
    .banner .room { position: absolute; right: 0; bottom: 10px; width: var(--sw); height: calc(80px * var(--sk, 1)); }
    .banner .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: repeating-linear-gradient(90deg, #5aa83c 0 22px, #6fbe4e 22px 44px); }
    .banner.night .ground { background: repeating-linear-gradient(90deg, #1f3a2a 0 22px, #25442f 22px 44px); }
    /* The mini card's expand / collapse button: 24 px, frosted, 5 px from the banner's top right corner. */
    .banner .zoom { position: absolute; z-index: 2; top: 5px; right: 5px; width: 24px; height: 24px; margin: 0; color: #33506b;
                    background: rgba(255,255,255,.55); box-shadow: inset 0 0 0 1px rgba(255,255,255,.7); backdrop-filter: blur(4px); }
    .banner.night .zoom { color: #fff; background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.2); }
    .banner .zoom:hover { background: rgba(255,255,255,.75); color: #33506b; }
    .banner.night .zoom:hover { background: rgba(255,255,255,.22); color: #fff; }
    .banner .tt { min-width: 0; flex: 1 1 auto; }
    /* Status pill right after the title (see sfPlacePill). */
    .trow { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .trow > .title { flex: 0 1 auto; min-width: 0; }
    .trow > .bpill, .trow > .pill { flex: none; max-width: none; }
    :host([hide-title]) .trow .title { visibility: hidden; }
    .head:has(.trow) { flex-wrap: nowrap; }
    .head:has(.trow)::after { content: none; }
    .bpill { display: inline-flex; align-items: center; gap: 4px; min-width: 0; box-sizing: border-box; overflow: hidden;
             white-space: nowrap; padding: 1px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; line-height: 16px;
             background: color-mix(in srgb, var(--c) 18%, rgba(255,255,255,.78)); color: color-mix(in srgb, var(--c) 45%, #0d2a45); }
    .banner.night .bpill { background: color-mix(in srgb, var(--c) 30%, rgba(8,18,38,.55)); color: color-mix(in srgb, var(--c) 35%, #ffffff); }
    .bdot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; }
    .bpt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    [data-wrap] .trow { display: contents; }
    [data-wrap] .trow > .bpill, [data-wrap] .trow > .pill { order: 9; align-self: flex-start; max-width: 100%; margin-top: 3px; }
    .banner[data-wrap] .trow > .bpill { max-width: calc(100cqw - 80px); }
    [data-wrap] .subt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    [data-dot] .bpill { padding: 0; background: none; }
    [data-dot] .bpt, [data-dot] .trow > .pill .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    [data-dot] .trow > .pill { padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
    [data-dot] .trow > .pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    @container (max-width: 200px) {
      .bpill { padding: 0; background: none; }
      .bpt, .trow > .pill .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
      .trow > .pill { padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
      .trow > .pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    }
    /* The mini card: the banner alone, its readings as chips on the sky. */
    ha-card.bn { padding: 0; }
    ha-card.bn > .banner { margin: 0; --sw: min(200px, 46%); }
    /* Narrower cards: the scene is drawn smaller (75 %, 62 %, then 50 % of its height, its left part cropped). */
    @container (max-width: 420px) { .banner, ha-card.bn > .banner { --sw: 150px; --sk: .75; } }
    @container (max-width: 340px) { .banner, ha-card.bn > .banner { --sw: 112px; --sk: .62; } }
    @container (max-width: 260px) { .banner, ha-card.bn > .banner { --sw: 70px; --sk: .5; } }
    /* The chips that do not fit wrap to a second line, hidden: never a chip cut to "R…". */
    .banner .rs { display: flex; flex-wrap: wrap; gap: 4px; height: 20px; margin: 3px 0 0 -2px; min-width: 0; overflow: hidden; }
    .banner .r { flex: none; line-height: 20px; padding: 0 7px; color: var(--bt); background: rgba(255,255,255,.62); }
    .banner.night .r { background: rgba(10,20,40,.4); }
    .banner .ringb { position: absolute; inset: 0; }
    /* The mini card's strip: one small cell per panel, in its colour. */
    .banner .strip { display: flex; flex-wrap: wrap; gap: 2px; height: 10px; overflow: hidden; margin-top: 4px; }
    .banner .strip i { width: 9px; height: 10px; border-radius: 2px; background: var(--sr-l0); }
    .banner .strip i.l1 { background: var(--sr-l1); } .banner .strip i.l2 { background: var(--sr-l2); }
    .banner .strip i.l3 { background: var(--sr-l3); } .banner .strip i.l4 { background: var(--sr-l4); }
    .banner .strip i.low { background: var(--sr-low); box-shadow: inset 0 0 0 1px #c92a2a; } .banner .strip i.silent { background: var(--sr-silent); }
  `;
}

// ── Editor ───────────────────────────────────────────────────────────────────
const srSchema = (booleans) => (lang) => [
  { name: "title", selector: { text: {} } },
  { name: "navigation_path", selector: { navigation: {} } },
  { name: "peak_power", selector: { number: { min: 0, max: 100000, step: 10, mode: "box", unit_of_measurement: "Wp" } } },
  { name: "energy", selector: { entity: { domain: "sensor", device_class: "energy" } } },
  { name: "threshold", selector: { number: { min: 5, max: 95, step: 5, mode: "box", unit_of_measurement: "%" } } },
  ...rcBooleans(...booleans),
  {
    name: "illustration_theme",
    selector: { select: { mode: "dropdown", options: ["auto", "day", "night"].map((value) => ({ value, label: rcT(SR_I18N, lang, `ed_theme_${value}`) })) } },
  },
  ...rcAdvanced(SR_I18N, lang, "panels", "language"),
];

const SR_HELPERS = ["title", "peak_power", "energy", "threshold", "zoom", "panels", "language"];

const SolarRoofCardEditor = rcEditor({
  card: SolarRoofCard,
  helpers: SR_HELPERS,
  schema: srSchema(["show_title", "show_subtitle", "illustration", "show_alerts", "show_tiles", "animations"]),
});

rcRegister(SolarRoofCard, SolarRoofCardEditor, "Solar Roof Card", "The solar panels, panel by panel: each one coloured by its production, a shaded or silent panel flagged");

// ── Mini card ────────────────────────────────────────────────────────────────
// The panels on two lines: a ring with the share of panels in line as the badge, the title and the state, then the
// power now as a chip and one small cell per panel; the zoom button opens the full card in place.
class SolarRoofMiniCard extends rcMini(
  SolarRoofCard,
  "solar-roof-mini-card",
  `
    .mini > .badge { background: none; }
    .ringb { width: 40px; height: 40px; }
  `,
) {
  getCardSize() {
    return this._zoomed ? super.getCardSize() : 1;
  }

  _drawMini(m) {
    const night = this._night();
    if (!this._changed(["mini", m.state, m.total, m.cells.map((p) => [p.level, p.state]), night, this._dark()])) return;
    const status = this._status(m);
    const chips = m.none ? `<button class="r"><span>${rcEsc(this._t("no_panels"))}</span></button>` : `<button class="r"><span>${rcEsc(this._watts(m.total))}</span></button>`;
    const strip = m.none ? "" : `<div class="strip" aria-hidden="true">${m.cells.map((p) => `<i class="l${p.level} ${p.state}"></i>`).join("")}</div>`;
    // The ring around the badge: the share of panels in line.
    const pct = m.count ? ((m.count - m.issues.length) / m.count) * 100 : 0;
    const L = 2 * Math.PI * 17;
    const ring = `<svg class="ringb" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="color-mix(in srgb, var(--c) 18%, transparent)" stroke-width="4"/><circle cx="20" cy="20" r="17" fill="none" stroke="var(--c)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${((L * pct) / 100).toFixed(1)} 999" transform="rotate(-90 20 20)"/></svg>`;
    const c = this._config;
    this.shadowRoot.innerHTML = `<style>${RC_BASE_STYLES}${this.constructor.styles}</style>
      <ha-card class="lvl-${m.state} bn${this._dark() ? " dk" : ""}">${this._banner(m, `<div class="rs">${chips}</div>${strip}`, ring, m.none ? "" : status)}</ha-card>`;
    if (c.navigation_path) rcBindNav(this.shadowRoot.querySelector(".head"), c.navigation_path);
    this._fitPill();
  }
}

const SolarRoofMiniCardEditor = rcEditor({
  card: SolarRoofMiniCard,
  helpers: SR_HELPERS,
  schema: srSchema(["show_title", "show_subtitle", "illustration", "show_alerts", "show_tiles", "animations", "zoom"]),
});

rcRegister(SolarRoofMiniCard, SolarRoofMiniCardEditor, "Solar Roof Mini Card", "The solar panels on two lines: the power now and one cell per panel, with a zoom to the full card");
