// ── Card picker: light previews ──────────────────────────────────────────────
// Home Assistant's card picker builds a live preview of every card registered with `preview: true`, all at once and
// with no lazy loading. A preview here is drawn only once it scrolls into view: the picker calls getStubConfig() right
// before it creates the preview, which marks the next instance of that card; once connected under <hui-card-picker>,
// that instance holds Home Assistant's state (no render, no history, no animation) until it is visible. Anywhere else
// (a dashboard, the card editor) the card behaves as before. Editors and other elements are defined unchanged.
function pickerDefine(tag, Card, options) {
  const isCard = !tag.endsWith("-editor") && (typeof Card.getStubConfig === "function" || typeof Card.getConfigElement === "function");
  if (!isCard || typeof IntersectionObserver !== "function") return customElements.define(tag, Card, options);
  let marks = [];
  const lazy = class extends Card {
    static getStubConfig(...args) {
      marks.push(Date.now());
      return Card.getStubConfig ? Card.getStubConfig(...args) : {};
    }

    constructor() {
      super();
      const now = Date.now();
      marks = marks.filter((t) => now - t < 5000);
      if (marks.length) {
        marks.shift();
        this._plHold = true;
      }
    }

    set hass(hass) {
      if (this._plHold) this._plHass = hass;
      else super.hass = hass;
    }

    get hass() {
      return this._plHold ? this._plHass : super.hass;
    }

    connectedCallback() {
      if (!this._plHold) return super.connectedCallback?.();
      if (this.getRootNode()?.host?.localName !== "hui-card-picker") return this._plRelease();
      if (this._plIo) return;
      // A custom element is inline until its styles arrive: a block of a card's height keeps the cells apart, so
      // that only the previews actually on screen intersect.
      this.style.display = "block";
      this.style.minHeight = "120px";
      this._plIo = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && this._plRelease(), {
        rootMargin: "200px",
      });
      this._plIo.observe(this);
    }

    disconnectedCallback() {
      if (this._plHold) return;
      super.disconnectedCallback?.();
    }

    _plRelease() {
      this._plIo?.disconnect();
      this._plIo = null;
      this._plHold = false;
      this.style.display = "";
      this.style.minHeight = "";
      if (this._plHass !== undefined) super.hass = this._plHass;
      this._plHass = undefined;
      if (this.isConnected) super.connectedCallback?.();
    }
  };
  return customElements.define(tag, lazy, options);
}

/**
 * Shared by the solar roof cards (its names are used by the other src/ files): the panels and their states, i18n helpers,
 * the base card (header, tiles, tap / hold), the mini card, the visual editor and the common styles. Same base as ha-room-card.
 * https://github.com/juju35/ha-solar-roof-card
 */
const RC_VERSION = "__VERSION__";

const RC_HOLD_MS = 500;
const RC_MOVE_PX = 8;
// A held arrow key repeats some 30 times a second: one brightness step every RC_REPEAT_MS at most.
const RC_REPEAT_MS = 150;

// ── Overviews ────────────────────────────────────────────────────────────────
// Shared by room-overview-card and room-environment-overview-card.

// The zoom / detail button: the same icons on the overviews and the mini cards.
const rcZoomIcon = (card) => (card._zoomed ? "mdi:arrow-collapse" : "mdi:arrow-expand");

// Back to the compact view (mini card, or overview showing the rooms needing a look), when zoomed in.
const rcUnzoom = (card) => {
  if (!card._zoomed) return;
  card._zoomed = false;
  card._sig = null;
  card._render();
};

// True for a click outside `card` that is not in a dialog opened from it (more-info, say): it folds the card back.
const rcOutside = (card, ev) => !ev.composedPath().includes(card) && !rcInDialog(ev);

// "A click elsewhere" is caught on the pointer, not only on the click event: on iOS (Safari and the companion app)
// a tap on something that is not clickable (the background, an empty spot, a card with no action) sends no click to
// the page. The handler runs when the press and the release are both outside the card (a slider dragged out of the
// card does not count), and a scroll does not count (the browser cancels the pointer); keyboard clicks still go
// through the click event. The handler keeps its own checks (outside of the card, not in a dialog).
const watchOutside = (card, handler) => {
  let downOutside = false;
  const onDown = (ev) => {
    downOutside = !ev.composedPath().includes(card);
  };
  const onUp = (ev) => {
    if (downOutside) handler(ev);
    downOutside = false;
  };
  const onClick = (ev) => {
    if (ev.detail === 0) handler(ev);
  };
  return {
    on() {
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("click", onClick, true);
    },
    off() {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("click", onClick, true);
    },
    // A tap (press and release at the same spot), for the tests.
    tap(ev) {
      onDown(ev);
      onUp(ev);
    },
  };
};

// A click on the detail button: every room, or back to the rooms needing a look. True when handled.
const rcZoomClick = (card, ev) => {
  if (!ev.target.closest?.(".zoom")) return false;
  ev.stopPropagation();
  card._zoomed = !card._zoomed;
  card._sig = null;
  card._render();
  if (ev.detail === 0) card.shadowRoot.querySelector(".zoom")?.focus({ preventScroll: true });
  return true;
};

// ── i18n ─────────────────────────────────────────────────────────────────────
// Strings shared by the cards; a card's own dictionary wins over these.
const RC_I18N = {
  en: {
    unavailable: "Unavailable",
    turn_all_off: "Turn everything off",
    ed_title: "Title",
    ed_show_title: "Show title",
    ed_advanced: "Advanced",
    ed_language: "Language",
    ed_language_helper: "Empty: the Home Assistant language",
    ed_language_auto: "Automatic",
    ed_navigation_path: "Navigation path",
    err_config: "Set `area` or `entities`",
    zoom_in: "Show the full card",
    zoom_out: "Back to the compact view",
    ed_zoom: "Zoom button",
    ed_zoom_helper: "Switches the mini card to the full card and back",
  },
  fr: {
    unavailable: "Indisponible",
    turn_all_off: "Tout éteindre",
    ed_title: "Titre",
    ed_show_title: "Afficher le titre",
    ed_advanced: "Avancé",
    ed_language: "Langue",
    ed_language_helper: "Vide : la langue de Home Assistant",
    ed_language_auto: "Automatique",
    ed_navigation_path: "Chemin de navigation",
    err_config: "Définis `area` ou `entities`",
    zoom_in: "Afficher la carte complète",
    zoom_out: "Revenir à la vue compacte",
    ed_zoom: "Bouton zoom",
    ed_zoom_helper: "Bascule la mini-carte en carte complète, et inversement",
  },
  de: {
    unavailable: "Nicht verfügbar",
    turn_all_off: "Alles ausschalten",
    ed_title: "Titel",
    ed_show_title: "Titel anzeigen",
    ed_advanced: "Erweitert",
    ed_language: "Sprache",
    ed_language_helper: "Leer: die Sprache von Home Assistant",
    ed_language_auto: "Automatisch",
    ed_navigation_path: "Navigationspfad",
    err_config: "Lege `area` oder `entities` fest",
    zoom_in: "Vollständige Karte anzeigen",
    zoom_out: "Zurück zur kompakten Ansicht",
    ed_zoom: "Zoom-Schaltfläche",
    ed_zoom_helper: "Wechselt von der Mini-Karte zur vollständigen Karte und zurück",
  },
  es: {
    unavailable: "No disponible",
    turn_all_off: "Apagar todo",
    ed_title: "Título",
    ed_show_title: "Mostrar el título",
    ed_advanced: "Avanzado",
    ed_language: "Idioma",
    ed_language_helper: "Vacío: el idioma de Home Assistant",
    ed_language_auto: "Automático",
    ed_navigation_path: "Ruta de navegación",
    err_config: "Define `area` o `entities`",
    zoom_in: "Mostrar la tarjeta completa",
    zoom_out: "Volver a la vista compacta",
    ed_zoom: "Botón de zoom",
    ed_zoom_helper: "Cambia de la minitarjeta a la tarjeta completa y viceversa",
  },
  sr: {
    unavailable: "Недоступно",
    turn_all_off: "Искључи све",
    ed_title: "Наслов",
    ed_show_title: "Прикажи наслов",
    ed_advanced: "Напредно",
    ed_language: "Језик",
    ed_language_helper: "Празно: језик Home Assistant-а",
    ed_language_auto: "Аутоматски",
    ed_navigation_path: "Путања за навигацију",
    err_config: "Подесите `area` или `entities`",
    zoom_in: "Прикажи целу картицу",
    zoom_out: "Назад на компактни приказ",
    ed_zoom: "Дугме за увећање",
    ed_zoom_helper: "Пребацује мини картицу на пун приказ и назад",
  },
  "sr-Latn": {
    unavailable: "Nedostupno",
    turn_all_off: "Isključi sve",
    ed_title: "Naslov",
    ed_show_title: "Prikaži naslov",
    ed_advanced: "Napredno",
    ed_language: "Jezik",
    ed_language_helper: "Prazno: jezik Home Assistant-a",
    ed_language_auto: "Automatski",
    ed_navigation_path: "Putanja za navigaciju",
    err_config: "Podesite `area` ili `entities`",
    zoom_in: "Prikaži celu karticu",
    zoom_out: "Nazad na kompaktni prikaz",
    ed_zoom: "Dugme za uvećanje",
    ed_zoom_helper: "Prebacuje mini karticu na pun prikaz i nazad",
  },
  it: {
    unavailable: "Non disponibile",
    turn_all_off: "Spegni tutto",
    ed_title: "Titolo",
    ed_show_title: "Mostra il titolo",
    ed_advanced: "Avanzate",
    ed_language: "Lingua",
    ed_language_helper: "Vuoto: la lingua di Home Assistant",
    ed_language_auto: "Automatica",
    ed_navigation_path: "Percorso di navigazione",
    err_config: "Imposta `area` o `entities`",
    zoom_in: "Mostra la scheda completa",
    zoom_out: "Torna alla vista compatta",
    ed_zoom: "Pulsante zoom",
    ed_zoom_helper: "Passa dalla mini scheda alla scheda completa e viceversa",
  },
  nl: {
    unavailable: "Niet beschikbaar",
    turn_all_off: "Alles uitschakelen",
    ed_title: "Titel",
    ed_show_title: "Titel tonen",
    ed_advanced: "Geavanceerd",
    ed_language: "Taal",
    ed_language_helper: "Leeg: de taal van Home Assistant",
    ed_language_auto: "Automatisch",
    ed_navigation_path: "Navigatiepad",
    err_config: "Stel `area` of `entities` in",
    zoom_in: "Volledige kaart tonen",
    zoom_out: "Terug naar de compacte weergave",
    ed_zoom: "Zoomknop",
    ed_zoom_helper: "Schakelt de minikaart naar de volledige kaart en terug",
  },
  pt: {
    unavailable: "Indisponível",
    turn_all_off: "Desligar tudo",
    ed_title: "Título",
    ed_show_title: "Mostrar o título",
    ed_advanced: "Avançado",
    ed_language: "Idioma",
    ed_language_helper: "Vazio: o idioma do Home Assistant",
    ed_language_auto: "Automático",
    ed_navigation_path: "Caminho de navegação",
    err_config: "Defina `area` ou `entities`",
    zoom_in: "Mostrar o cartão completo",
    zoom_out: "Voltar à vista compacta",
    ed_zoom: "Botão de zoom",
    ed_zoom_helper: "Alterna entre o minicartão e o cartão completo",
  },
  pl: {
    unavailable: "Niedostępne",
    turn_all_off: "Wyłącz wszystko",
    ed_title: "Tytuł",
    ed_show_title: "Pokaż tytuł",
    ed_advanced: "Zaawansowane",
    ed_language: "Język",
    ed_language_helper: "Puste: język Home Assistanta",
    ed_language_auto: "Automatyczny",
    ed_navigation_path: "Ścieżka nawigacji",
    err_config: "Ustaw `area` lub `entities`",
    zoom_in: "Pokaż pełną kartę",
    zoom_out: "Wróć do widoku kompaktowego",
    ed_zoom: "Przycisk powiększenia",
    ed_zoom_helper: "Przełącza minikartę na pełną kartę i z powrotem",
  },
  ro: {
    unavailable: "Indisponibil",
    turn_all_off: "Oprește tot",
    ed_title: "Titlu",
    ed_show_title: "Afișează titlul",
    ed_advanced: "Avansat",
    ed_language: "Limbă",
    ed_language_helper: "Gol: limba Home Assistant",
    ed_language_auto: "Automată",
    ed_navigation_path: "Cale de navigare",
    err_config: "Setează `area` sau `entities`",
    zoom_in: "Afișează cardul complet",
    zoom_out: "Înapoi la vizualizarea compactă",
    ed_zoom: "Buton de zoom",
    ed_zoom_helper: "Comută între mini-card și cardul complet",
  },
  da: {
    unavailable: "Utilgængelig",
    turn_all_off: "Sluk alt",
    ed_title: "Titel",
    ed_show_title: "Vis titel",
    ed_advanced: "Avanceret",
    ed_language: "Sprog",
    ed_language_helper: "Tomt: Home Assistants sprog",
    ed_language_auto: "Automatisk",
    ed_navigation_path: "Navigationssti",
    err_config: "Angiv `area` eller `entities`",
    zoom_in: "Vis hele kortet",
    zoom_out: "Tilbage til den kompakte visning",
    ed_zoom: "Zoomknap",
    ed_zoom_helper: "Skifter fra minikortet til hele kortet og tilbage",
  },
  sv: {
    unavailable: "Ej tillgänglig",
    turn_all_off: "Stäng av allt",
    ed_title: "Titel",
    ed_show_title: "Visa rubrik",
    ed_advanced: "Avancerat",
    ed_language: "Språk",
    ed_language_helper: "Tomt: Home Assistants språk",
    ed_language_auto: "Automatiskt",
    ed_navigation_path: "Navigeringssökväg",
    err_config: "Ange `area` eller `entities`",
    zoom_in: "Visa hela kortet",
    zoom_out: "Tillbaka till kompakt vy",
    ed_zoom: "Zoomknapp",
    ed_zoom_helper: "Växlar mellan minikortet och hela kortet",
  },
  bg: {
    unavailable: "Недостъпно",
    turn_all_off: "Изключи всичко",
    ed_title: "Заглавие",
    ed_show_title: "Показване на заглавието",
    ed_advanced: "Разширени",
    ed_language: "Език",
    ed_language_helper: "Празно: езикът на Home Assistant",
    ed_language_auto: "Автоматично",
    ed_navigation_path: "Път за навигация",
    err_config: "Задайте `area` или `entities`",
    zoom_in: "Покажи пълната карта",
    zoom_out: "Обратно към компактния изглед",
    ed_zoom: "Бутон за увеличение",
    ed_zoom_helper: "Превключва от мини картата към пълната карта и обратно",
  },
  ru: {
    unavailable: "Недоступно",
    turn_all_off: "Выключить всё",
    ed_title: "Заголовок",
    ed_show_title: "Показывать заголовок",
    ed_advanced: "Дополнительно",
    ed_language: "Язык",
    ed_language_helper: "Пусто: язык Home Assistant",
    ed_language_auto: "Автоматически",
    ed_navigation_path: "Путь навигации",
    err_config: "Укажите `area` или `entities`",
    zoom_in: "Показать полную карточку",
    zoom_out: "Вернуться к компактному виду",
    ed_zoom: "Кнопка масштаба",
    ed_zoom_helper: "Переключает мини-карточку на полную карточку и обратно",
  },
  uk: {
    unavailable: "Недоступно",
    turn_all_off: "Вимкнути все",
    ed_title: "Заголовок",
    ed_show_title: "Показувати заголовок",
    ed_advanced: "Додатково",
    ed_language: "Мова",
    ed_language_helper: "Порожньо: мова Home Assistant",
    ed_language_auto: "Автоматично",
    ed_navigation_path: "Шлях навігації",
    err_config: "Вкажіть `area` або `entities`",
    zoom_in: "Показати повну картку",
    zoom_out: "Повернутися до компактного вигляду",
    ed_zoom: "Кнопка масштабу",
    ed_zoom_helper: "Перемикає міні-картку на повну картку й назад",
  },
  hu: {
    unavailable: "Nem elérhető",
    turn_all_off: "Minden kikapcsolása",
    ed_title: "Cím",
    ed_show_title: "Cím megjelenítése",
    ed_advanced: "Speciális",
    ed_language: "Nyelv",
    ed_language_helper: "Üres: a Home Assistant nyelve",
    ed_language_auto: "Automatikus",
    ed_navigation_path: "Navigációs útvonal",
    err_config: "Állítsd be az `area` vagy az `entities` értékét",
    zoom_in: "A teljes kártya megjelenítése",
    zoom_out: "Vissza a kompakt nézethez",
    ed_zoom: "Nagyítás gomb",
    ed_zoom_helper: "Vált a mini kártya és a teljes kártya között",
  },
  sk: {
    unavailable: "Nedostupné",
    turn_all_off: "Vypnúť všetko",
    ed_title: "Názov",
    ed_show_title: "Zobraziť názov",
    ed_advanced: "Rozšírené",
    ed_language: "Jazyk",
    ed_language_helper: "Prázdne: jazyk Home Assistanta",
    ed_language_auto: "Automaticky",
    ed_navigation_path: "Navigačná cesta",
    err_config: "Nastavte `area` alebo `entities`",
    zoom_in: "Zobraziť celú kartu",
    zoom_out: "Späť na kompaktné zobrazenie",
    ed_zoom: "Tlačidlo priblíženia",
    ed_zoom_helper: "Prepína minikartu na celú kartu a späť",
  },
  cs: {
    unavailable: "Nedostupné",
    turn_all_off: "Vypnout vše",
    ed_title: "Název",
    ed_show_title: "Zobrazit název",
    ed_advanced: "Pokročilé",
    ed_language: "Jazyk",
    ed_language_helper: "Prázdné: jazyk Home Assistanta",
    ed_language_auto: "Automaticky",
    ed_navigation_path: "Navigační cesta",
    err_config: "Nastavte `area` nebo `entities`",
    zoom_in: "Zobrazit celou kartu",
    zoom_out: "Zpět na kompaktní zobrazení",
    ed_zoom: "Tlačítko přiblížení",
    ed_zoom_helper: "Přepíná minikartu na celou kartu a zpět",
  },
  sl: {
    unavailable: "Ni na voljo",
    turn_all_off: "Izklopi vse",
    ed_title: "Naslov",
    ed_show_title: "Prikaži naslov",
    ed_advanced: "Napredno",
    ed_language: "Jezik",
    ed_language_helper: "Prazno: jezik Home Assistanta",
    ed_language_auto: "Samodejno",
    ed_navigation_path: "Navigacijska pot",
    err_config: "Nastavite `area` ali `entities`",
    zoom_in: "Prikaži celotno kartico",
    zoom_out: "Nazaj na strnjen pogled",
    ed_zoom: "Gumb za povečavo",
    ed_zoom_helper: "Preklopi mini kartico v celotno kartico in nazaj",
  },
  lv: {
    unavailable: "Nav pieejams",
    turn_all_off: "Izslēgt visu",
    ed_title: "Virsraksts",
    ed_show_title: "Rādīt virsrakstu",
    ed_advanced: "Papildu",
    ed_language: "Valoda",
    ed_language_helper: "Tukšs: Home Assistant valoda",
    ed_language_auto: "Automātiski",
    ed_navigation_path: "Navigācijas ceļš",
    err_config: "Iestatiet `area` vai `entities`",
    zoom_in: "Rādīt pilno karti",
    zoom_out: "Atpakaļ uz kompakto skatu",
    ed_zoom: "Tālummaiņas poga",
    ed_zoom_helper: "Pārslēdz mini karti uz pilno karti un atpakaļ",
  },
  el: {
    unavailable: "Μη διαθέσιμο",
    turn_all_off: "Απενεργοποίηση όλων",
    ed_title: "Τίτλος",
    ed_show_title: "Εμφάνιση τίτλου",
    ed_advanced: "Για προχωρημένους",
    ed_language: "Γλώσσα",
    ed_language_helper: "Κενό: η γλώσσα του Home Assistant",
    ed_language_auto: "Αυτόματα",
    ed_navigation_path: "Διαδρομή πλοήγησης",
    err_config: "Ορίστε `area` ή `entities`",
    zoom_in: "Εμφάνιση της πλήρους κάρτας",
    zoom_out: "Επιστροφή στη συμπαγή προβολή",
    ed_zoom: "Κουμπί ζουμ",
    ed_zoom_helper: "Εναλλάσσει τη μίνι κάρτα με την πλήρη κάρτα",
  },
};

// ── Solar roof ───────────────────────────────────────────────────────────────
// A panel is a power sensor: a micro-inverter (Enphase, Hoymiles through OpenDTU, AhoyDTU or its Wi-Fi DTU), an input
// of an inverter (APsystems channels, Fox ESS strings) or an optimiser (Huawei, SolarEdge). `panels` lists them in
// YAML (each with an optional name and string); otherwise they are found by their integration and their name, and
// grouped by device (an inverter, a micro-inverter's DTU). A panel is low when it makes less than `threshold` % of
// the median of its string (of all the panels when its string has fewer than three), silent when it reports nothing.
// By night (the sun below the horizon, or every panel at almost nothing) nothing is flagged: micro-inverters sleep;
// nor while the sun is lower than SR_MIN_ELEVATION.
const SR_PANELS = [
  ["enphase_envoy", /^sensor\.inverter_\d+$/],
  ["mqtt", /_ch[1-9]\d*_(power|p_dc)$/],
  ["hoymiles_wifi", /(port|pv)_?\d+.*power$/],
  ["apsystems_ecu_reader", /power_ch_?\d+$/],
  ["apsystemsapi_local", /power_p\d+$/],
  ["huawei_solar", /optimi[sz]er/],
  ["solaredgeoptimizers", /power/],
  ["foxess_modbus", /pv\d+_power$/],
];
const SR_NOT = /total|_ch0_|ac_power|grid|load|battery|export|import/;
// An MQTT sensor is a panel only on a Hoymiles / TSUN micro-inverter's device (OpenDTU, AhoyDTU): many other MQTT
// devices name their channels ch1, ch2…
const SR_MQTT_DTU = /hoymiles|tsun|opendtu|ahoy/i;
const SR_MQTT_MODEL = /^(hm|hms|hmt|tsol)[-_ ]?\d/i;
const srMqttPanel = (dev) => !!dev && (SR_MQTT_DTU.test(dev.manufacturer || "") || SR_MQTT_MODEL.test(dev.model || ""));
// Under this elevation of the sun (°) nothing is flagged: at sunrise and sunset the panels wake up one by one and the
// shade of the neighbours runs long.
const SR_MIN_ELEVATION = 10;

const srWatts = (st) => {
  if (!st || ["unavailable", "unknown", ""].includes(st.state)) return null;
  const v = Number(st.state);
  if (!Number.isFinite(v)) return null;
  const u = st.attributes?.unit_of_measurement || "W";
  return /^kW$/i.test(u) ? v * 1000 : /^MW$/i.test(u) ? v * 1e6 : v;
};

// Entity ids in their natural order: inverter_2 before inverter_10.
const srOrder = (a, b) => a.localeCompare(b, "en", { numeric: true });

// The panels: `panels` (a list of entity ids, or of { entity, name, string }), else every power sensor of a panel
// integration. Each gets a short label (P1, P2…: its name stays in the tooltip) and its string.
const srPanels = (hass, list) => {
  if (Array.isArray(list) && list.length)
    return list
      .map((p) => (typeof p === "string" ? { entity: p } : p))
      .filter((p) => p?.entity)
      .map((p, i) => ({ id: p.entity, label: p.name || `P${i + 1}`, name: p.name || hass.states[p.entity]?.attributes.friendly_name || p.entity, string: p.string ?? "" }));
  const reg = hass.entities || {};
  const ids = Object.keys(reg)
    .filter((id) => {
      if (!id.startsWith("sensor.") || SR_NOT.test(id)) return false;
      const e = reg[id];
      if (e.platform === "mqtt" && !srMqttPanel(hass.devices?.[e.device_id])) return false;
      return SR_PANELS.some(([platform, re]) => e.platform === platform && (re.test(id) || re.test(e.translation_key || "")));
    })
    .sort(srOrder);
  return ids.map((id, i) => {
    const dev = hass.devices?.[reg[id].device_id];
    return { id, label: `P${i + 1}`, name: hass.states[id]?.attributes.friendly_name || id, string: dev?.name_by_user || dev?.name || "" };
  });
};

const srMedian = (vals) => {
  const v = [...vals].sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Each panel's power and state (ok, low or silent), grouped by string, with the totals.
const srAssess = (hass, panels, threshold = 50) => {
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
  for (const group of groups.values()) {
    const vals = group.filter((c) => c.w != null).map((c) => c.w);
    const med = vals.length >= 3 ? srMedian(vals) : all;
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
const srIntlCache = new Map();
const srIntl = (Kind, lang, opts) => {
  const key = `${Kind.name}|${lang}|${JSON.stringify(opts)}`;
  if (!srIntlCache.has(key)) srIntlCache.set(key, new Kind(lang, opts));
  return srIntlCache.get(key);
};

// Strings of the solar roof cards; the shared ones above (editor basics) complete them.
const SR_I18N = {
  en: {
    title: "Solar roof",
    st_ok: "All fine",
    st_alert: "{n} to check",
    st_night: "Night",
    st_none: "No panels",
    sub_now: "{p} now · panels: {n}",
    panels_group: "Panels",
    low_msg: "{p} at {n} of its neighbours since {t}",
    shade: "shade?",
    silent_msg: "{p} silent since {t}",
    night_msg: "The panels are asleep until sunrise",
    t_now: "Now",
    t_today: "Today",
    t_check: "Check",
    t_panels: "Panels",
    of_peak: "of {v}",
    t_none: "None",
    low: "low",
    silent: "no data",
    no_panels: "No panels found: list their power sensors under panels",
    ed_peak_power: "Peak power",
    ed_peak_power_helper: "The installation's peak power (Wp), shown with the power now",
    ed_energy: "Energy today",
    ed_energy_helper: "A daily energy sensor of the installation (kWh)",
    ed_threshold: "Low panel threshold",
    ed_threshold_helper: "A panel below this share of its string's median is flagged (%)",
    ed_show_alerts: "Alerts",
    ed_show_tiles: "Tiles",
    ed_show_subtitle: "Show subtitle",
    ed_illustration: "Illustrated header",
    ed_illustration_theme: "Header theme",
    ed_theme_auto: "Automatic (follows the theme)",
    ed_theme_day: "Day",
    ed_theme_night: "Night",
    ed_animations: "Animations",
    ed_panels: "Panels (YAML)",
    ed_panels_helper: "A list of power sensors, each with an optional name and string; empty: found automatically",
    ed_title_helper: "Empty: Solar roof",
  },
  fr: {
    title: "Toit solaire",
    st_ok: "Tout va bien",
    st_alert: "{n} à vérifier",
    st_night: "Nuit",
    st_none: "Aucun panneau",
    sub_now: "{p} maintenant · panneaux : {n}",
    panels_group: "Panneaux",
    low_msg: "{p} à {n} de ses voisins depuis {t}",
    shade: "ombre ?",
    silent_msg: "{p} muet depuis {t}",
    night_msg: "Les panneaux dorment jusqu'au lever du soleil",
    t_now: "Maintenant",
    t_today: "Aujourd'hui",
    t_check: "À vérifier",
    t_panels: "Panneaux",
    of_peak: "sur {v}",
    t_none: "Aucun",
    low: "faible",
    silent: "sans données",
    no_panels: "Aucun panneau trouvé : liste leurs capteurs de puissance sous panels",
    ed_peak_power: "Puissance crête",
    ed_peak_power_helper: "La puissance crête de l'installation (Wc), affichée avec la puissance actuelle",
    ed_energy: "Énergie du jour",
    ed_energy_helper: "Un capteur d'énergie journalière de l'installation (kWh)",
    ed_threshold: "Seuil de panneau faible",
    ed_threshold_helper: "Un panneau sous cette part de la médiane de sa string est signalé (%)",
    ed_show_alerts: "Alertes",
    ed_show_tiles: "Tuiles",
    ed_show_subtitle: "Afficher le sous-titre",
    ed_illustration: "En-tête illustré",
    ed_illustration_theme: "Thème de l'en-tête",
    ed_theme_auto: "Automatique (suit le thème)",
    ed_theme_day: "Jour",
    ed_theme_night: "Nuit",
    ed_animations: "Animations",
    ed_panels: "Panneaux (YAML)",
    ed_panels_helper: "Une liste de capteurs de puissance, chacun avec un nom et une string facultatifs ; vide : trouvés automatiquement",
    ed_title_helper: "Vide : Toit solaire",
  },
  de: {
    title: "Solardach",
    st_ok: "Alles gut",
    st_alert: "{n} zu prüfen",
    st_night: "Nacht",
    st_none: "Keine Module",
    sub_now: "{p} jetzt · Module: {n}",
    panels_group: "Module",
    low_msg: "{p} bei {n} seiner Nachbarn seit {t}",
    shade: "Schatten?",
    silent_msg: "{p} stumm seit {t}",
    night_msg: "Die Module schlafen bis zum Sonnenaufgang",
    t_now: "Jetzt",
    t_today: "Heute",
    t_check: "Prüfen",
    t_panels: "Module",
    of_peak: "von {v}",
    t_none: "Keine",
    low: "schwach",
    silent: "keine Daten",
    no_panels: "Keine Module gefunden: liste ihre Leistungssensoren unter panels auf",
    ed_peak_power: "Spitzenleistung",
    ed_peak_power_helper: "Die Spitzenleistung der Anlage (Wp), mit der aktuellen Leistung angezeigt",
    ed_energy: "Energie heute",
    ed_energy_helper: "Ein täglicher Energiesensor der Anlage (kWh)",
    ed_threshold: "Schwelle für schwache Module",
    ed_threshold_helper: "Ein Modul unter diesem Anteil des Medians seines Strings wird gemeldet (%)",
    ed_show_alerts: "Warnungen",
    ed_show_tiles: "Kacheln",
    ed_show_subtitle: "Untertitel anzeigen",
    ed_illustration: "Illustrierte Kopfzeile",
    ed_illustration_theme: "Design der Kopfzeile",
    ed_theme_auto: "Automatisch (folgt dem Design)",
    ed_theme_day: "Tag",
    ed_theme_night: "Nacht",
    ed_animations: "Animationen",
    ed_panels: "Module (YAML)",
    ed_panels_helper: "Eine Liste von Leistungssensoren, jeweils mit optionalem Namen und String; leer: automatisch gefunden",
    ed_title_helper: "Leer: Solardach",
  },
  es: {
    title: "Tejado solar",
    st_ok: "Todo bien",
    st_alert: "{n} por revisar",
    st_night: "Noche",
    st_none: "Sin paneles",
    sub_now: "{p} ahora · paneles: {n}",
    panels_group: "Paneles",
    low_msg: "{p} al {n} de sus vecinos desde las {t}",
    shade: "¿sombra?",
    silent_msg: "{p} en silencio desde las {t}",
    night_msg: "Los paneles duermen hasta el amanecer",
    t_now: "Ahora",
    t_today: "Hoy",
    t_check: "Revisar",
    t_panels: "Paneles",
    of_peak: "de {v}",
    t_none: "Ninguno",
    low: "bajo",
    silent: "sin datos",
    no_panels: "No se encontraron paneles: enumera sus sensores de potencia en panels",
    ed_peak_power: "Potencia pico",
    ed_peak_power_helper: "La potencia pico de la instalación (Wp), mostrada con la potencia actual",
    ed_energy: "Energía de hoy",
    ed_energy_helper: "Un sensor de energía diaria de la instalación (kWh)",
    ed_threshold: "Umbral de panel bajo",
    ed_threshold_helper: "Se señala un panel por debajo de esta parte de la mediana de su string (%)",
    ed_show_alerts: "Alertas",
    ed_show_tiles: "Mosaicos",
    ed_show_subtitle: "Mostrar subtítulo",
    ed_illustration: "Encabezado ilustrado",
    ed_illustration_theme: "Tema del encabezado",
    ed_theme_auto: "Automático (sigue el tema)",
    ed_theme_day: "Día",
    ed_theme_night: "Noche",
    ed_animations: "Animaciones",
    ed_panels: "Paneles (YAML)",
    ed_panels_helper: "Una lista de sensores de potencia, cada uno con nombre y string opcionales; vacío: encontrados automáticamente",
    ed_title_helper: "Vacío: Tejado solar",
  },
  sr: {
    title: "Соларни кров",
    st_ok: "Све у реду",
    st_alert: "{n} за проверу",
    st_night: "Ноћ",
    st_none: "Нема панела",
    sub_now: "{p} сада · панели: {n}",
    panels_group: "Панели",
    low_msg: "{p} на {n} суседа од {t}",
    shade: "сенка?",
    silent_msg: "{p} ћути од {t}",
    night_msg: "Панели спавају до изласка сунца",
    t_now: "Сада",
    t_today: "Данас",
    t_check: "Провера",
    t_panels: "Панели",
    of_peak: "од {v}",
    t_none: "Нема",
    low: "слаб",
    silent: "нема података",
    no_panels: "Нису пронађени панели: наведите њихове сензоре снаге под panels",
    ed_peak_power: "Вршна снага",
    ed_peak_power_helper: "Вршна снага инсталације (Wp), приказана уз тренутну снагу",
    ed_energy: "Енергија данас",
    ed_energy_helper: "Дневни сензор енергије инсталације (kWh)",
    ed_threshold: "Праг слабог панела",
    ed_threshold_helper: "Панел испод овог удела медијане свог стринга се означава (%)",
    ed_show_alerts: "Упозорења",
    ed_show_tiles: "Плочице",
    ed_show_subtitle: "Прикажи поднаслов",
    ed_illustration: "Илустровано заглавље",
    ed_illustration_theme: "Тема заглавља",
    ed_theme_auto: "Аутоматски (прати тему)",
    ed_theme_day: "Дан",
    ed_theme_night: "Ноћ",
    ed_animations: "Анимације",
    ed_panels: "Панели (YAML)",
    ed_panels_helper: "Листа сензора снаге, сваки са опционим именом и стрингом; празно: пронађени аутоматски",
    ed_title_helper: "Празно: Соларни кров",
  },
  "sr-Latn": {
    title: "Solarni krov",
    st_ok: "Sve u redu",
    st_alert: "{n} za proveru",
    st_night: "Noć",
    st_none: "Nema panela",
    sub_now: "{p} sada · paneli: {n}",
    panels_group: "Paneli",
    low_msg: "{p} na {n} suseda od {t}",
    shade: "senka?",
    silent_msg: "{p} ćuti od {t}",
    night_msg: "Paneli spavaju do izlaska sunca",
    t_now: "Sada",
    t_today: "Danas",
    t_check: "Provera",
    t_panels: "Paneli",
    of_peak: "od {v}",
    t_none: "Nema",
    low: "slab",
    silent: "nema podataka",
    no_panels: "Nisu pronađeni paneli: navedite njihove senzore snage pod panels",
    ed_peak_power: "Vršna snaga",
    ed_peak_power_helper: "Vršna snaga instalacije (Wp), prikazana uz trenutnu snagu",
    ed_energy: "Energija danas",
    ed_energy_helper: "Dnevni senzor energije instalacije (kWh)",
    ed_threshold: "Prag slabog panela",
    ed_threshold_helper: "Panel ispod ovog udela medijane svog stringa se označava (%)",
    ed_show_alerts: "Upozorenja",
    ed_show_tiles: "Pločice",
    ed_show_subtitle: "Prikaži podnaslov",
    ed_illustration: "Ilustrovano zaglavlje",
    ed_illustration_theme: "Tema zaglavlja",
    ed_theme_auto: "Automatski (prati temu)",
    ed_theme_day: "Dan",
    ed_theme_night: "Noć",
    ed_animations: "Animacije",
    ed_panels: "Paneli (YAML)",
    ed_panels_helper: "Lista senzora snage, svaki sa opcionim imenom i stringom; prazno: pronađeni automatski",
    ed_title_helper: "Prazno: Solarni krov",
  },
  it: {
    title: "Tetto solare",
    st_ok: "Tutto ok",
    st_alert: "{n} da controllare",
    st_night: "Notte",
    st_none: "Nessun pannello",
    sub_now: "{p} adesso · pannelli: {n}",
    panels_group: "Pannelli",
    low_msg: "{p} al {n} dei vicini dalle {t}",
    shade: "ombra?",
    silent_msg: "{p} muto dalle {t}",
    night_msg: "I pannelli dormono fino all'alba",
    t_now: "Adesso",
    t_today: "Oggi",
    t_check: "Controllare",
    t_panels: "Pannelli",
    of_peak: "su {v}",
    t_none: "Nessuno",
    low: "basso",
    silent: "nessun dato",
    no_panels: "Nessun pannello trovato: elenca i loro sensori di potenza sotto panels",
    ed_peak_power: "Potenza di picco",
    ed_peak_power_helper: "La potenza di picco dell'impianto (Wp), mostrata con la potenza attuale",
    ed_energy: "Energia di oggi",
    ed_energy_helper: "Un sensore di energia giornaliera dell'impianto (kWh)",
    ed_threshold: "Soglia pannello basso",
    ed_threshold_helper: "Un pannello sotto questa quota della mediana della sua stringa viene segnalato (%)",
    ed_show_alerts: "Avvisi",
    ed_show_tiles: "Riquadri",
    ed_show_subtitle: "Mostra sottotitolo",
    ed_illustration: "Intestazione illustrata",
    ed_illustration_theme: "Tema dell'intestazione",
    ed_theme_auto: "Automatico (segue il tema)",
    ed_theme_day: "Giorno",
    ed_theme_night: "Notte",
    ed_animations: "Animazioni",
    ed_panels: "Pannelli (YAML)",
    ed_panels_helper: "Un elenco di sensori di potenza, ciascuno con nome e stringa facoltativi; vuoto: trovati automaticamente",
    ed_title_helper: "Vuoto: Tetto solare",
  },
  nl: {
    title: "Zonnedak",
    st_ok: "Alles in orde",
    st_alert: "{n} te controleren",
    st_night: "Nacht",
    st_none: "Geen panelen",
    sub_now: "{p} nu · panelen: {n}",
    panels_group: "Panelen",
    low_msg: "{p} op {n} van zijn buren sinds {t}",
    shade: "schaduw?",
    silent_msg: "{p} stil sinds {t}",
    night_msg: "De panelen slapen tot zonsopgang",
    t_now: "Nu",
    t_today: "Vandaag",
    t_check: "Controleren",
    t_panels: "Panelen",
    of_peak: "van {v}",
    t_none: "Geen",
    low: "laag",
    silent: "geen gegevens",
    no_panels: "Geen panelen gevonden: zet hun vermogenssensoren onder panels",
    ed_peak_power: "Piekvermogen",
    ed_peak_power_helper: "Het piekvermogen van de installatie (Wp), getoond bij het huidige vermogen",
    ed_energy: "Energie vandaag",
    ed_energy_helper: "Een dagelijkse energiesensor van de installatie (kWh)",
    ed_threshold: "Drempel voor zwak paneel",
    ed_threshold_helper: "Een paneel onder dit deel van de mediaan van zijn string wordt gemeld (%)",
    ed_show_alerts: "Waarschuwingen",
    ed_show_tiles: "Tegels",
    ed_show_subtitle: "Ondertitel tonen",
    ed_illustration: "Geïllustreerde koptekst",
    ed_illustration_theme: "Thema van de koptekst",
    ed_theme_auto: "Automatisch (volgt het thema)",
    ed_theme_day: "Dag",
    ed_theme_night: "Nacht",
    ed_animations: "Animaties",
    ed_panels: "Panelen (YAML)",
    ed_panels_helper: "Een lijst van vermogenssensoren, elk met optionele naam en string; leeg: automatisch gevonden",
    ed_title_helper: "Leeg: Zonnedak",
  },
  pt: {
    title: "Telhado solar",
    st_ok: "Tudo bem",
    st_alert: "{n} a verificar",
    st_night: "Noite",
    st_none: "Sem painéis",
    sub_now: "{p} agora · painéis: {n}",
    panels_group: "Painéis",
    low_msg: "{p} a {n} dos vizinhos desde as {t}",
    shade: "sombra?",
    silent_msg: "{p} sem sinal desde as {t}",
    night_msg: "Os painéis dormem até ao nascer do sol",
    t_now: "Agora",
    t_today: "Hoje",
    t_check: "Verificar",
    t_panels: "Painéis",
    of_peak: "de {v}",
    t_none: "Nenhum",
    low: "baixo",
    silent: "sem dados",
    no_panels: "Nenhum painel encontrado: liste os sensores de potência em panels",
    ed_peak_power: "Potência de pico",
    ed_peak_power_helper: "A potência de pico da instalação (Wp), mostrada com a potência atual",
    ed_energy: "Energia de hoje",
    ed_energy_helper: "Um sensor de energia diária da instalação (kWh)",
    ed_threshold: "Limiar de painel baixo",
    ed_threshold_helper: "Um painel abaixo desta parte da mediana da sua string é assinalado (%)",
    ed_show_alerts: "Alertas",
    ed_show_tiles: "Mosaicos",
    ed_show_subtitle: "Mostrar subtítulo",
    ed_illustration: "Cabeçalho ilustrado",
    ed_illustration_theme: "Tema do cabeçalho",
    ed_theme_auto: "Automático (segue o tema)",
    ed_theme_day: "Dia",
    ed_theme_night: "Noite",
    ed_animations: "Animações",
    ed_panels: "Painéis (YAML)",
    ed_panels_helper: "Uma lista de sensores de potência, cada um com nome e string opcionais; vazio: encontrados automaticamente",
    ed_title_helper: "Vazio: Telhado solar",
  },
  pl: {
    title: "Dach solarny",
    st_ok: "Wszystko w porządku",
    st_alert: "{n} do sprawdzenia",
    st_night: "Noc",
    st_none: "Brak paneli",
    sub_now: "{p} teraz · panele: {n}",
    panels_group: "Panele",
    low_msg: "{p} na {n} sąsiadów od {t}",
    shade: "cień?",
    silent_msg: "{p} milczy od {t}",
    night_msg: "Panele śpią do wschodu słońca",
    t_now: "Teraz",
    t_today: "Dziś",
    t_check: "Do sprawdzenia",
    t_panels: "Panele",
    of_peak: "z {v}",
    t_none: "Brak",
    low: "słaby",
    silent: "brak danych",
    no_panels: "Nie znaleziono paneli: wypisz ich czujniki mocy w panels",
    ed_peak_power: "Moc szczytowa",
    ed_peak_power_helper: "Moc szczytowa instalacji (Wp), pokazana przy bieżącej mocy",
    ed_energy: "Energia dziś",
    ed_energy_helper: "Dzienny czujnik energii instalacji (kWh)",
    ed_threshold: "Próg słabego panelu",
    ed_threshold_helper: "Panel poniżej tej części mediany swojego stringu jest zgłaszany (%)",
    ed_show_alerts: "Alerty",
    ed_show_tiles: "Kafelki",
    ed_show_subtitle: "Pokaż podtytuł",
    ed_illustration: "Ilustrowany nagłówek",
    ed_illustration_theme: "Motyw nagłówka",
    ed_theme_auto: "Automatycznie (zgodnie z motywem)",
    ed_theme_day: "Dzień",
    ed_theme_night: "Noc",
    ed_animations: "Animacje",
    ed_panels: "Panele (YAML)",
    ed_panels_helper: "Lista czujników mocy, każdy z opcjonalną nazwą i stringiem; puste: znalezione automatycznie",
    ed_title_helper: "Puste: Dach solarny",
  },
  ro: {
    title: "Acoperiș solar",
    st_ok: "Totul e bine",
    st_alert: "{n} de verificat",
    st_night: "Noapte",
    st_none: "Niciun panou",
    sub_now: "{p} acum · panouri: {n}",
    panels_group: "Panouri",
    low_msg: "{p} la {n} din vecini de la {t}",
    shade: "umbră?",
    silent_msg: "{p} tăcut de la {t}",
    night_msg: "Panourile dorm până la răsăritul soarelui",
    t_now: "Acum",
    t_today: "Azi",
    t_check: "De verificat",
    t_panels: "Panouri",
    of_peak: "din {v}",
    t_none: "Niciunul",
    low: "slab",
    silent: "fără date",
    no_panels: "Nu s-au găsit panouri: listează senzorii lor de putere sub panels",
    ed_peak_power: "Putere de vârf",
    ed_peak_power_helper: "Puterea de vârf a instalației (Wp), afișată lângă puterea actuală",
    ed_energy: "Energie azi",
    ed_energy_helper: "Un senzor de energie zilnică al instalației (kWh)",
    ed_threshold: "Prag de panou slab",
    ed_threshold_helper: "Un panou sub această parte din mediana stringului său este semnalat (%)",
    ed_show_alerts: "Alerte",
    ed_show_tiles: "Plăci",
    ed_show_subtitle: "Afișează subtitlul",
    ed_illustration: "Antet ilustrat",
    ed_illustration_theme: "Tema antetului",
    ed_theme_auto: "Automat (urmează tema)",
    ed_theme_day: "Zi",
    ed_theme_night: "Noapte",
    ed_animations: "Animații",
    ed_panels: "Panouri (YAML)",
    ed_panels_helper: "O listă de senzori de putere, fiecare cu nume și string opționale; gol: găsiți automat",
    ed_title_helper: "Gol: Acoperiș solar",
  },
  da: {
    title: "Solcelletag",
    st_ok: "Alt i orden",
    st_alert: "{n} skal tjekkes",
    st_night: "Nat",
    st_none: "Ingen paneler",
    sub_now: "{p} nu · paneler: {n}",
    panels_group: "Paneler",
    low_msg: "{p} på {n} af naboerne siden {t}",
    shade: "skygge?",
    silent_msg: "{p} tavs siden {t}",
    night_msg: "Panelerne sover til solopgang",
    t_now: "Nu",
    t_today: "I dag",
    t_check: "Tjek",
    t_panels: "Paneler",
    of_peak: "af {v}",
    t_none: "Ingen",
    low: "lav",
    silent: "ingen data",
    no_panels: "Ingen paneler fundet: angiv deres effektsensorer under panels",
    ed_peak_power: "Spidseffekt",
    ed_peak_power_helper: "Anlæggets spidseffekt (Wp), vist ved den aktuelle effekt",
    ed_energy: "Energi i dag",
    ed_energy_helper: "En daglig energisensor for anlægget (kWh)",
    ed_threshold: "Tærskel for svagt panel",
    ed_threshold_helper: "Et panel under denne andel af sin strengs median markeres (%)",
    ed_show_alerts: "Advarsler",
    ed_show_tiles: "Felter",
    ed_show_subtitle: "Vis undertitel",
    ed_illustration: "Illustreret overskrift",
    ed_illustration_theme: "Overskriftens tema",
    ed_theme_auto: "Automatisk (følger temaet)",
    ed_theme_day: "Dag",
    ed_theme_night: "Nat",
    ed_animations: "Animationer",
    ed_panels: "Paneler (YAML)",
    ed_panels_helper: "En liste over effektsensorer, hver med valgfrit navn og streng; tom: fundet automatisk",
    ed_title_helper: "Tom: Solcelletag",
  },
  sv: {
    title: "Soltak",
    st_ok: "Allt bra",
    st_alert: "{n} att kontrollera",
    st_night: "Natt",
    st_none: "Inga paneler",
    sub_now: "{p} nu · paneler: {n}",
    panels_group: "Paneler",
    low_msg: "{p} på {n} av grannarna sedan {t}",
    shade: "skugga?",
    silent_msg: "{p} tyst sedan {t}",
    night_msg: "Panelerna sover till soluppgången",
    t_now: "Nu",
    t_today: "I dag",
    t_check: "Kontrollera",
    t_panels: "Paneler",
    of_peak: "av {v}",
    t_none: "Inga",
    low: "låg",
    silent: "ingen data",
    no_panels: "Inga paneler hittades: lista deras effektsensorer under panels",
    ed_peak_power: "Toppeffekt",
    ed_peak_power_helper: "Anläggningens toppeffekt (Wp), visad med aktuell effekt",
    ed_energy: "Energi i dag",
    ed_energy_helper: "En daglig energisensor för anläggningen (kWh)",
    ed_threshold: "Tröskel för svag panel",
    ed_threshold_helper: "En panel under denna andel av sin strängs median flaggas (%)",
    ed_show_alerts: "Varningar",
    ed_show_tiles: "Rutor",
    ed_show_subtitle: "Visa underrubrik",
    ed_illustration: "Illustrerad rubrik",
    ed_illustration_theme: "Rubrikens tema",
    ed_theme_auto: "Automatiskt (följer temat)",
    ed_theme_day: "Dag",
    ed_theme_night: "Natt",
    ed_animations: "Animationer",
    ed_panels: "Paneler (YAML)",
    ed_panels_helper: "En lista med effektsensorer, var och en med valfritt namn och sträng; tom: hittas automatiskt",
    ed_title_helper: "Tom: Soltak",
  },
  bg: {
    title: "Слънчев покрив",
    st_ok: "Всичко е наред",
    st_alert: "{n} за проверка",
    st_night: "Нощ",
    st_none: "Няма панели",
    sub_now: "{p} сега · панели: {n}",
    panels_group: "Панели",
    low_msg: "{p} на {n} от съседите от {t}",
    shade: "сянка?",
    silent_msg: "{p} мълчи от {t}",
    night_msg: "Панелите спят до изгрев",
    t_now: "Сега",
    t_today: "Днес",
    t_check: "Проверка",
    t_panels: "Панели",
    of_peak: "от {v}",
    t_none: "Няма",
    low: "слаб",
    silent: "няма данни",
    no_panels: "Не са намерени панели: изброете сензорите им за мощност под panels",
    ed_peak_power: "Пикова мощност",
    ed_peak_power_helper: "Пиковата мощност на инсталацията (Wp), показана с текущата мощност",
    ed_energy: "Енергия днес",
    ed_energy_helper: "Дневен сензор за енергия на инсталацията (kWh)",
    ed_threshold: "Праг за слаб панел",
    ed_threshold_helper: "Панел под този дял от медианата на своя стринг се отбелязва (%)",
    ed_show_alerts: "Предупреждения",
    ed_show_tiles: "Плочки",
    ed_show_subtitle: "Показване на подзаглавие",
    ed_illustration: "Илюстрирано заглавие",
    ed_illustration_theme: "Тема на заглавието",
    ed_theme_auto: "Автоматично (следва темата)",
    ed_theme_day: "Ден",
    ed_theme_night: "Нощ",
    ed_animations: "Анимации",
    ed_panels: "Панели (YAML)",
    ed_panels_helper: "Списък със сензори за мощност, всеки с незадължително име и стринг; празно: намерени автоматично",
    ed_title_helper: "Празно: Слънчев покрив",
  },
  ru: {
    title: "Солнечная крыша",
    st_ok: "Всё в порядке",
    st_alert: "{n} проверить",
    st_night: "Ночь",
    st_none: "Нет панелей",
    sub_now: "{p} сейчас · панели: {n}",
    panels_group: "Панели",
    low_msg: "{p} на {n} от соседей с {t}",
    shade: "тень?",
    silent_msg: "{p} молчит с {t}",
    night_msg: "Панели спят до рассвета",
    t_now: "Сейчас",
    t_today: "Сегодня",
    t_check: "Проверить",
    t_panels: "Панели",
    of_peak: "из {v}",
    t_none: "Нет",
    low: "слабая",
    silent: "нет данных",
    no_panels: "Панели не найдены: перечислите их датчики мощности в panels",
    ed_peak_power: "Пиковая мощность",
    ed_peak_power_helper: "Пиковая мощность установки (Вт пик), показывается рядом с текущей мощностью",
    ed_energy: "Энергия сегодня",
    ed_energy_helper: "Суточный датчик энергии установки (кВт·ч)",
    ed_threshold: "Порог слабой панели",
    ed_threshold_helper: "Панель ниже этой доли медианы своей цепочки отмечается (%)",
    ed_show_alerts: "Предупреждения",
    ed_show_tiles: "Плитки",
    ed_show_subtitle: "Показывать подзаголовок",
    ed_illustration: "Иллюстрированный заголовок",
    ed_illustration_theme: "Тема заголовка",
    ed_theme_auto: "Автоматически (по теме)",
    ed_theme_day: "День",
    ed_theme_night: "Ночь",
    ed_animations: "Анимации",
    ed_panels: "Панели (YAML)",
    ed_panels_helper: "Список датчиков мощности, каждый с необязательным именем и цепочкой; пусто: найдены автоматически",
    ed_title_helper: "Пусто: Солнечная крыша",
  },
  uk: {
    title: "Сонячний дах",
    st_ok: "Усе гаразд",
    st_alert: "{n} перевірити",
    st_night: "Ніч",
    st_none: "Немає панелей",
    sub_now: "{p} зараз · панелі: {n}",
    panels_group: "Панелі",
    low_msg: "{p} на {n} від сусідів з {t}",
    shade: "тінь?",
    silent_msg: "{p} мовчить з {t}",
    night_msg: "Панелі сплять до світанку",
    t_now: "Зараз",
    t_today: "Сьогодні",
    t_check: "Перевірити",
    t_panels: "Панелі",
    of_peak: "з {v}",
    t_none: "Немає",
    low: "слабка",
    silent: "немає даних",
    no_panels: "Панелі не знайдено: перелічіть їхні датчики потужності в panels",
    ed_peak_power: "Пікова потужність",
    ed_peak_power_helper: "Пікова потужність установки (Вт пік), показується поруч із поточною потужністю",
    ed_energy: "Енергія сьогодні",
    ed_energy_helper: "Добовий датчик енергії установки (кВт·год)",
    ed_threshold: "Поріг слабкої панелі",
    ed_threshold_helper: "Панель нижче цієї частки медіани свого ланцюжка позначається (%)",
    ed_show_alerts: "Попередження",
    ed_show_tiles: "Плитки",
    ed_show_subtitle: "Показувати підзаголовок",
    ed_illustration: "Ілюстрований заголовок",
    ed_illustration_theme: "Тема заголовка",
    ed_theme_auto: "Автоматично (за темою)",
    ed_theme_day: "День",
    ed_theme_night: "Ніч",
    ed_animations: "Анімації",
    ed_panels: "Панелі (YAML)",
    ed_panels_helper: "Список датчиків потужності, кожен з необов'язковою назвою та ланцюжком; порожньо: знайдено автоматично",
    ed_title_helper: "Порожньо: Сонячний дах",
  },
  hu: {
    title: "Napelemes tető",
    st_ok: "Minden rendben",
    st_alert: "{n} ellenőrizendő",
    st_night: "Éjszaka",
    st_none: "Nincs panel",
    sub_now: "{p} most · panelek: {n}",
    panels_group: "Panelek",
    low_msg: "{p} a szomszédai {n}-án {t} óta",
    shade: "árnyék?",
    silent_msg: "{p} néma {t} óta",
    night_msg: "A panelek napfelkeltéig alszanak",
    t_now: "Most",
    t_today: "Ma",
    t_check: "Ellenőrizendő",
    t_panels: "Panelek",
    of_peak: "/ {v}",
    t_none: "Nincs",
    low: "gyenge",
    silent: "nincs adat",
    no_panels: "Nem található panel: sorold fel a teljesítményérzékelőiket a panels alatt",
    ed_peak_power: "Csúcsteljesítmény",
    ed_peak_power_helper: "A rendszer csúcsteljesítménye (Wp), a pillanatnyi teljesítmény mellett",
    ed_energy: "Mai energia",
    ed_energy_helper: "A rendszer napi energiaérzékelője (kWh)",
    ed_threshold: "Gyenge panel küszöbe",
    ed_threshold_helper: "A stringje mediánjának e hányada alatti panel jelölve lesz (%)",
    ed_show_alerts: "Figyelmeztetések",
    ed_show_tiles: "Csempék",
    ed_show_subtitle: "Alcím megjelenítése",
    ed_illustration: "Illusztrált fejléc",
    ed_illustration_theme: "Fejléc témája",
    ed_theme_auto: "Automatikus (követi a témát)",
    ed_theme_day: "Nappal",
    ed_theme_night: "Éjszaka",
    ed_animations: "Animációk",
    ed_panels: "Panelek (YAML)",
    ed_panels_helper: "Teljesítményérzékelők listája, mindegyik opcionális névvel és stringgel; üres: automatikusan megtalálva",
    ed_title_helper: "Üres: Napelemes tető",
  },
  sk: {
    title: "Solárna strecha",
    st_ok: "Všetko v poriadku",
    st_alert: "{n} na kontrolu",
    st_night: "Noc",
    st_none: "Žiadne panely",
    sub_now: "{p} teraz · panely: {n}",
    panels_group: "Panely",
    low_msg: "{p} na {n} susedov od {t}",
    shade: "tieň?",
    silent_msg: "{p} mlčí od {t}",
    night_msg: "Panely spia do východu slnka",
    t_now: "Teraz",
    t_today: "Dnes",
    t_check: "Kontrola",
    t_panels: "Panely",
    of_peak: "z {v}",
    t_none: "Žiadne",
    low: "slabý",
    silent: "žiadne údaje",
    no_panels: "Nenašli sa žiadne panely: uveďte ich senzory výkonu pod panels",
    ed_peak_power: "Špičkový výkon",
    ed_peak_power_helper: "Špičkový výkon inštalácie (Wp), zobrazený pri aktuálnom výkone",
    ed_energy: "Energia dnes",
    ed_energy_helper: "Denný senzor energie inštalácie (kWh)",
    ed_threshold: "Prah slabého panela",
    ed_threshold_helper: "Panel pod týmto podielom mediánu svojho stringu sa označí (%)",
    ed_show_alerts: "Upozornenia",
    ed_show_tiles: "Dlaždice",
    ed_show_subtitle: "Zobraziť podnadpis",
    ed_illustration: "Ilustrovaná hlavička",
    ed_illustration_theme: "Téma hlavičky",
    ed_theme_auto: "Automaticky (podľa témy)",
    ed_theme_day: "Deň",
    ed_theme_night: "Noc",
    ed_animations: "Animácie",
    ed_panels: "Panely (YAML)",
    ed_panels_helper: "Zoznam senzorov výkonu, každý s voliteľným názvom a stringom; prázdne: nájdené automaticky",
    ed_title_helper: "Prázdne: Solárna strecha",
  },
  cs: {
    title: "Solární střecha",
    st_ok: "Vše v pořádku",
    st_alert: "{n} ke kontrole",
    st_night: "Noc",
    st_none: "Žádné panely",
    sub_now: "{p} teď · panely: {n}",
    panels_group: "Panely",
    low_msg: "{p} na {n} sousedů od {t}",
    shade: "stín?",
    silent_msg: "{p} mlčí od {t}",
    night_msg: "Panely spí do východu slunce",
    t_now: "Teď",
    t_today: "Dnes",
    t_check: "Ke kontrole",
    t_panels: "Panely",
    of_peak: "z {v}",
    t_none: "Žádné",
    low: "slabý",
    silent: "žádná data",
    no_panels: "Nebyly nalezeny žádné panely: uveďte jejich senzory výkonu pod panels",
    ed_peak_power: "Špičkový výkon",
    ed_peak_power_helper: "Špičkový výkon instalace (Wp), zobrazený u aktuálního výkonu",
    ed_energy: "Energie dnes",
    ed_energy_helper: "Denní senzor energie instalace (kWh)",
    ed_threshold: "Práh slabého panelu",
    ed_threshold_helper: "Panel pod tímto podílem mediánu svého stringu je označen (%)",
    ed_show_alerts: "Upozornění",
    ed_show_tiles: "Dlaždice",
    ed_show_subtitle: "Zobrazit podtitul",
    ed_illustration: "Ilustrovaná hlavička",
    ed_illustration_theme: "Motiv hlavičky",
    ed_theme_auto: "Automaticky (podle motivu)",
    ed_theme_day: "Den",
    ed_theme_night: "Noc",
    ed_animations: "Animace",
    ed_panels: "Panely (YAML)",
    ed_panels_helper: "Seznam senzorů výkonu, každý s volitelným názvem a stringem; prázdné: nalezeny automaticky",
    ed_title_helper: "Prázdné: Solární střecha",
  },
  sl: {
    title: "Sončna streha",
    st_ok: "Vse v redu",
    st_alert: "{n} za preverjanje",
    st_night: "Noč",
    st_none: "Ni panelov",
    sub_now: "{p} zdaj · paneli: {n}",
    panels_group: "Paneli",
    low_msg: "{p} pri {n} sosedov od {t}",
    shade: "senca?",
    silent_msg: "{p} tiho od {t}",
    night_msg: "Paneli spijo do sončnega vzhoda",
    t_now: "Zdaj",
    t_today: "Danes",
    t_check: "Preveri",
    t_panels: "Paneli",
    of_peak: "od {v}",
    t_none: "Nobeden",
    low: "šibek",
    silent: "ni podatkov",
    no_panels: "Ni najdenih panelov: navedite njihove senzorje moči pod panels",
    ed_peak_power: "Konična moč",
    ed_peak_power_helper: "Konična moč naprave (Wp), prikazana ob trenutni moči",
    ed_energy: "Energija danes",
    ed_energy_helper: "Dnevni senzor energije naprave (kWh)",
    ed_threshold: "Prag šibkega panela",
    ed_threshold_helper: "Panel pod tem deležem mediane svojega niza je označen (%)",
    ed_show_alerts: "Opozorila",
    ed_show_tiles: "Ploščice",
    ed_show_subtitle: "Prikaži podnaslov",
    ed_illustration: "Ilustrirana glava",
    ed_illustration_theme: "Tema glave",
    ed_theme_auto: "Samodejno (sledi temi)",
    ed_theme_day: "Dan",
    ed_theme_night: "Noč",
    ed_animations: "Animacije",
    ed_panels: "Paneli (YAML)",
    ed_panels_helper: "Seznam senzorjev moči, vsak z neobveznim imenom in nizom; prazno: najdeni samodejno",
    ed_title_helper: "Prazno: Sončna streha",
  },
  lv: {
    title: "Saules jumts",
    st_ok: "Viss kārtībā",
    st_alert: "{n} jāpārbauda",
    st_night: "Nakts",
    st_none: "Nav paneļu",
    sub_now: "{p} tagad · paneļi: {n}",
    panels_group: "Paneļi",
    low_msg: "{p} ir {n} no kaimiņiem kopš {t}",
    shade: "ēna?",
    silent_msg: "{p} kluss kopš {t}",
    night_msg: "Paneļi guļ līdz saullēktam",
    t_now: "Tagad",
    t_today: "Šodien",
    t_check: "Pārbaudīt",
    t_panels: "Paneļi",
    of_peak: "no {v}",
    t_none: "Nav",
    low: "vājš",
    silent: "nav datu",
    no_panels: "Paneļi nav atrasti: norādiet to jaudas sensorus zem panels",
    ed_peak_power: "Maksimālā jauda",
    ed_peak_power_helper: "Iekārtas maksimālā jauda (Wp), parādīta pie pašreizējās jaudas",
    ed_energy: "Enerģija šodien",
    ed_energy_helper: "Iekārtas dienas enerģijas sensors (kWh)",
    ed_threshold: "Vāja paneļa slieksnis",
    ed_threshold_helper: "Panelis zem šīs savas virknes mediānas daļas tiek atzīmēts (%)",
    ed_show_alerts: "Brīdinājumi",
    ed_show_tiles: "Flīzes",
    ed_show_subtitle: "Rādīt apakšvirsrakstu",
    ed_illustration: "Ilustrēta galvene",
    ed_illustration_theme: "Galvenes motīvs",
    ed_theme_auto: "Automātiski (pēc motīva)",
    ed_theme_day: "Diena",
    ed_theme_night: "Nakts",
    ed_animations: "Animācijas",
    ed_panels: "Paneļi (YAML)",
    ed_panels_helper: "Jaudas sensoru saraksts, katram neobligāts nosaukums un virkne; tukšs: atrasti automātiski",
    ed_title_helper: "Tukšs: Saules jumts",
  },
  el: {
    title: "Ηλιακή στέγη",
    st_ok: "Όλα καλά",
    st_alert: "{n} για έλεγχο",
    st_night: "Νύχτα",
    st_none: "Κανένα πάνελ",
    sub_now: "{p} τώρα · πάνελ: {n}",
    panels_group: "Πάνελ",
    low_msg: "{p} στο {n} των γειτόνων από {t}",
    shade: "σκιά;",
    silent_msg: "{p} σιωπηλό από {t}",
    night_msg: "Τα πάνελ κοιμούνται μέχρι την ανατολή",
    t_now: "Τώρα",
    t_today: "Σήμερα",
    t_check: "Έλεγχος",
    t_panels: "Πάνελ",
    of_peak: "από {v}",
    t_none: "Κανένα",
    low: "χαμηλό",
    silent: "χωρίς δεδομένα",
    no_panels: "Δεν βρέθηκαν πάνελ: απαριθμήστε τους αισθητήρες ισχύος τους στο panels",
    ed_peak_power: "Ισχύς αιχμής",
    ed_peak_power_helper: "Η ισχύς αιχμής της εγκατάστασης (Wp), δίπλα στην τρέχουσα ισχύ",
    ed_energy: "Ενέργεια σήμερα",
    ed_energy_helper: "Ημερήσιος αισθητήρας ενέργειας της εγκατάστασης (kWh)",
    ed_threshold: "Όριο χαμηλού πάνελ",
    ed_threshold_helper: "Ένα πάνελ κάτω από αυτό το μερίδιο της διάμεσης τιμής της σειράς του επισημαίνεται (%)",
    ed_show_alerts: "Ειδοποιήσεις",
    ed_show_tiles: "Πλακίδια",
    ed_show_subtitle: "Εμφάνιση υπότιτλου",
    ed_illustration: "Εικονογραφημένη κεφαλίδα",
    ed_illustration_theme: "Θέμα κεφαλίδας",
    ed_theme_auto: "Αυτόματο (ακολουθεί το θέμα)",
    ed_theme_day: "Ημέρα",
    ed_theme_night: "Νύχτα",
    ed_animations: "Κινούμενα σχέδια",
    ed_panels: "Πάνελ (YAML)",
    ed_panels_helper: "Λίστα αισθητήρων ισχύος, ο καθένας με προαιρετικό όνομα και σειρά· κενό: βρίσκονται αυτόματα",
    ed_title_helper: "Κενό: Ηλιακή στέγη",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const rcLang = (i18n, hass, config) => {
  // The full tag when the card has it (sr-Latn), else its base language (fr-FR → fr, pt-BR → pt), else English.
  const l = config?.language || hass?.locale?.language || hass?.language || "en";
  const base = l.split("-")[0];
  return i18n[l] ? l : i18n[base] ? base : "en";
};

const rcT = (i18n, lang, key, vars = {}) => {
  const s = i18n[lang]?.[key] ?? RC_I18N[lang]?.[key] ?? i18n.en[key] ?? RC_I18N.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
};

const rcEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const rcMoreInfo = (node, entityId) => {
  const ev = new Event("hass-more-info", { bubbles: true, composed: true });
  ev.detail = { entityId };
  node.dispatchEvent(ev);
};

const rcNavigate = (path) => {
  history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
};

// Wires a card header to its `navigation_path`: click, and Enter on the header itself.
const rcBindNav = (head, path) => {
  head.addEventListener("click", () => rcNavigate(path));
  head.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target === head) rcNavigate(path);
  });
};

// HA's callService already shows a toast when the call fails, then rejects: the rejection is only swallowed here
// so that it does not end up as "Uncaught (in promise)".
const rcCall = (hass, domain, service, data) => Promise.resolve(hass.callService(domain, service, data)).catch(() => {});

// A click inside a dialog (more-info opened from the card, say) is not a click outside the card.
const rcInDialog = (ev) => ev.composedPath().some((n) => ["ha-more-info-dialog", "ha-dialog", "dialog"].includes(n.localName));

// `fn()`, computed again only when one of `deps` is no longer the same object (or value) as last time.
const rcMemo = (store, key, deps, fn) => {
  const hit = store[key];
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.value;
  const value = fn();
  store[key] = { deps, value };
  return value;
};

// ── Base card ────────────────────────────────────────────────────────────────
class RcCard extends HTMLElement {
  static getStubConfig(hass) {
    const areas = Object.keys(hass?.areas ?? {});
    return { area: areas[0] ?? "" };
  }

  // Subclasses set: static i18n, static defaults, static tag, static styles.
  static getConfigElement() {
    // biome-ignore lint/complexity/noThisInStatic: each subclass opens its own editor.
    return document.createElement(`${this.tag}-editor`);
  }

  setConfig(config) {
    if (this.constructor.needsArea && !config.area && !config.entities?.length && !config.include?.length) {
      throw new Error(rcT(this.constructor.i18n, rcLang(this.constructor.i18n, this._hass, config), "err_config"));
    }
    this._config = { ...this.constructor.defaults, ...config };
    // show_title: the header's title, hidden by the stylesheet
    this.toggleAttribute?.("hide-title", config.show_title === false);
    if (!this.shadowRoot) this._attach();
    this._sig = null;
    this._render();
  }

  // The shadow root, and no rewrite of the card between a press anywhere in it and the end of the click: Home
  // Assistant updates the card several times a second, and a rewrite under the pointer replaces the element pressed,
  // so that the click lands on the card itself and does nothing (the tiles already hold it, see _bindPress; this
  // covers the rest: header button, detail button, rows, popup). The pending update is rendered once released.
  _attach() {
    const root = this.attachShadow({ mode: "open" });
    this._onPressEnd = () => {
      window.removeEventListener("pointerup", this._onPressEnd, true);
      window.removeEventListener("pointercancel", this._onPressEnd, true);
      // After the click, which comes in the same task as the release.
      setTimeout(() => {
        if (this._pressing) this._released();
      }, 0);
    };
    root.addEventListener("pointerdown", (ev) => {
      this._byPointer = true;
      if (ev.button !== 0) return;
      this._pressing = true;
      window.addEventListener("pointerup", this._onPressEnd, true);
      window.addEventListener("pointercancel", this._onPressEnd, true);
    });
    // The focus is kept across rewrites for the keyboard only (no focus ring after a mouse click or a tap).
    root.addEventListener("keydown", () => {
      this._byPointer = false;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    window.removeEventListener("pointerup", this._onPressEnd, true);
    window.removeEventListener("pointercancel", this._onPressEnd, true);
    // A press cut short by the detach never gets its release: rendered now, and the next updates too.
    if (this._pressing) this._released();
  }

  set hass(hass) {
    this._hass = hass;
    // No re-render during a drag or a press: it would replace the tile under the finger.
    if (this._dragging || this._pressing) this._deferred = true;
    else this._render();
  }

  // The tiles actually shown (`only_on` / `only_alerts` applied), nothing when the card is hidden.
  getCardSize() {
    if (this.style.display === "none") return 0;
    const n = this._shown ?? this._items?.length ?? 0;
    if (!n || !this._config) return 1;
    // A row of large tiles (`layout: tiles`) is about one and a half rows of compact ones.
    const rows = Math.ceil(n / this._cols());
    return 1 + (this._tiles() ? Math.ceil(rows * 1.5) : rows);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  _lang() {
    return rcLang(this.constructor.i18n, this._hass, this._config);
  }

  _t(key, vars) {
    return rcT(this.constructor.i18n, this._lang(), key, vars);
  }

  _areaName() {
    const c = this._config;
    return c.area ? (this._hass.areas?.[c.area]?.name ?? c.area) : "";
  }

  // Re-render only when something visible changed.
  _changed(parts) {
    const sig = JSON.stringify([this._config, this._lang(), parts]);
    if (sig === this._sig) return false;
    this._sig = sig;
    return true;
  }

  // Subclasses implement `_collect()` (the tiles) and `_draw(items)`.
  _render() {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    this._items = this._collect();
    this._draw(this._items);
  }

  _cols() {
    return Math.min(4, Math.max(1, Number(this._config.columns) || 2));
  }

  // `layout: tiles`: one large tile per entity, the size of Home Assistant's Tile card (easier to tap on a phone).
  _tiles() {
    return this._config?.layout === "tiles";
  }

  _paint(level, head, tiles, extraClass = "") {
    // The tile or control with the keyboard focus keeps it through the redraw (a toggle, a step or a two-tap
    // confirmation from the keyboard): tiles by their data-id, controls by their data-k.
    const active = this._byPointer ? null : this.shadowRoot.activeElement;
    const focused = active?.dataset?.id;
    const focusKey = active?.dataset?.k;
    this.shadowRoot.innerHTML = `
      <style>${RC_BASE_STYLES}${this.constructor.styles}</style>
      <ha-card class="lvl-${level}${extraClass}${this._tiles() ? " layout-tiles" : ""}">
        ${head}
        ${tiles ? `<div class="grid" style="--cols:${this._cols()}">${tiles}</div>` : ""}
        ${this._afterGrid()}
      </ha-card>`;
    const root = this.shadowRoot;
    root.querySelector(".pill.action")?.addEventListener("click", (ev) => this._allOff(ev));
    if (this._config.navigation_path) rcBindNav(root.querySelector(".head"), this._config.navigation_path);
    for (const el of root.querySelectorAll(".tile")) {
      this._bindTile(el, (this._items || []).find((i) => i.id === el.dataset.id));
      if (focused && el.dataset.id === focused) el.focus({ preventScroll: true });
    }
    this._bindAfter(root);
    if (focusKey) root.querySelector(`[data-k="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  // What a card adds under its tiles (the Lights card's scenes), and its event wiring.
  _afterGrid() {
    return "";
  }

  _bindAfter() {}

  // The "turn everything off" button of the header (full card) or of the status (mini card).
  _allOff(ev) {
    ev.stopPropagation();
    const ids = (this._items || []).filter((i) => i.on).map((i) => i.id);
    if (!ids.length) return;
    // A host card may ask first (the Overview confirms before turning plugs off); otherwise off at once.
    if (this._confirmOff) this._confirmOff(ids);
    else rcCall(this._hass, "homeassistant", "turn_off", { entity_id: ids });
  }

  // Tap, hold for more-info, and an optional horizontal drag ({ move(x), end(x), step(delta), flush() }). From the
  // keyboard: Enter / Space tap, Shift+Enter or the context-menu key open the details, ←/→ step the drag by ∓/±10
  // (a held key at most every RC_REPEAT_MS), and releasing the arrow calls `flush`.
  _bindPress(el, { onTap, onHold, drag }) {
    let start = null;
    let mode = null; // null | "hold" | "drag"
    let timer = null;
    let lastStep = 0;
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      start = { x: ev.clientX, y: ev.clientY };
      mode = null;
      this._pressing = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // The card may have been detached mid-press (nothing else clears this timer): no hold on a dead node.
        if (mode || !this.isConnected) return;
        mode = "hold";
        // The press is settled (no tap): the details may open over the tile, so its pointerup may never come.
        this._released();
        onHold();
      }, RC_HOLD_MS);
    });
    el.addEventListener("pointermove", (ev) => {
      if (!start || mode === "hold") return;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!mode && drag && Math.abs(dx) > RC_MOVE_PX && Math.abs(dx) > Math.abs(dy)) {
        mode = "drag";
        clearTimeout(timer);
        this._dragging = true;
        el.setPointerCapture(ev.pointerId);
        el.classList.add("dragging");
      } else if (!mode && (Math.abs(dx) > RC_MOVE_PX || Math.abs(dy) > RC_MOVE_PX)) {
        clearTimeout(timer); // scrolling, or dragging what cannot be dragged: not a tap
        start = null;
        this._released();
      }
      if (mode === "drag") drag.move(ev.clientX);
    });
    const end = (ev, cancelled) => {
      clearTimeout(timer);
      if (!start) return;
      const wasDrag = mode === "drag";
      if (wasDrag) {
        this._dragging = false;
        el.classList.remove("dragging");
        if (!cancelled) drag.end(ev.clientX);
        this._sig = null;
      } else if (!mode && !cancelled) {
        onTap();
      }
      start = null;
      mode = null;
      // After a drag, the next update redraws (the bar keeps the new level until the light reports it).
      this._released(!wasDrag);
    };
    // The mouse leaving the tile mid-press (no capture outside a drag) cancels it: neither a tap nor a hold.
    el.addEventListener("pointerleave", () => {
      if (!start || mode) return;
      clearTimeout(timer);
      start = null;
      this._released();
    });
    el.addEventListener("pointerup", (ev) => end(ev, false));
    el.addEventListener("pointercancel", (ev) => end(ev, true));
    el.addEventListener("contextmenu", (ev) => ev.preventDefault());
    el.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" && ev.shiftKey) || ev.key === "ContextMenu") {
        ev.preventDefault();
        if (!ev.repeat) onHold();
      } else if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        if (!ev.repeat) onTap();
      } else if (drag?.step && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
        ev.preventDefault();
        if (ev.repeat && ev.timeStamp - lastStep < RC_REPEAT_MS) return;
        lastStep = ev.timeStamp;
        drag.step(ev.key === "ArrowRight" ? 10 : -10);
      }
    });
    // The arrow released: the stepped level goes out now rather than after the pause.
    el.addEventListener("keyup", (ev) => {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") drag?.flush?.();
    });
  }

  // End of a press: renders now what an update brought during it.
  _released(flush = true) {
    this._pressing = false;
    if (!this._deferred || this._dragging) return;
    this._deferred = false;
    if (flush) this._render();
  }

  // Default tile: tap toggles, hold opens the details.
  _bindTile(el, item) {
    this._bindPress(el, {
      onTap: () => !item?.unavailable && rcCall(this._hass, "homeassistant", "toggle", { entity_id: el.dataset.id }),
      onHold: () => rcMoreInfo(this, el.dataset.id),
    });
  }
}

// ── Mini cards ───────────────────────────────────────────────────────────────
// A mini card shows what its full card (`Base`) shows on two lines: the room badge, title and status, then one chip
// per entity. Its zoom button (top right, `zoom: false` removes it) switches it to the full card and back; a click
// anywhere else brings it back too.
// The subclass implements `_drawMini(items)`, which builds the chips and calls `_paintMini`.
// Zoomed in, everything is shown (`only_alerts` and `hide_when_clear` only apply to the compact view). With
// `alertsOnly`, the compact view always shows only what needs a look (no `only_alerts` option then): quiet entities
// show once zoomed in.
const rcMini = (Base, tag, styles, { alertsOnly = false } = {}) =>
  class extends Base {
    static tag = tag;
    static defaults = (({ only_alerts, ...rest }) => ({ ...rest, ...(alertsOnly ? {} : { only_alerts }), zoom: true }))(
      Base.defaults,
    );
    static styles = `${Base.styles}${RC_MINI_STYLES}${styles}`;

    constructor() {
      super();
      // A click anywhere else brings the card back to its compact view.
      this._onUnzoom = (ev) => {
        if (rcOutside(this, ev)) rcUnzoom(this);
      };
    }

    connectedCallback() {
      super.connectedCallback?.();
      this._unzoom ??= watchOutside(this, this._onUnzoom);
      this._unzoom.on();
    }

    disconnectedCallback() {
      super.disconnectedCallback?.();
      this._unzoom?.off();
      // Left (another dashboard view, a conditional card hidden): back to the compact view.
      rcUnzoom(this);
    }

    getCardSize() {
      if (this._zoomed) return super.getCardSize();
      return this.style.display === "none" ? 0 : 1;
    }

    getGridOptions() {
      return { columns: 12, min_columns: 6, rows: "auto" };
    }

    _draw(items) {
      const config = this._config;
      // The base card's own filter does the work: off zoomed in, always on in an `alertsOnly` compact view.
      if (this._zoomed) this._config = { ...config, only_alerts: false, hide_when_clear: false };
      else if (alertsOnly) this._config = { ...config, only_alerts: true };
      try {
        if (this._zoomed) super._draw(items);
        else this._drawMini(items);
      } finally {
        this._config = config;
      }
      this._addZoom();
    }

    _paintMini({ level, icon, status, chips, cls = "", allOff = false }) {
      const c = this._config;
      const nav = c.navigation_path;
      // With `allOff` the status is the "turn everything off" button, like the full card's pill.
      const st = allOff
        ? `<button class="st action" title="${rcEsc(this._t("turn_all_off"))}"><ha-icon icon="mdi:power"></ha-icon><span class="pt">${rcEsc(status)}</span></button>`
        : `<span class="st" title="${rcEsc(status)}"><span class="pt">${rcEsc(status)}</span></span>`;
      this.shadowRoot.innerHTML = `
        <style>${RC_BASE_STYLES}${this.constructor.styles}</style>
        <ha-card class="lvl-${level}${cls}">
          <div class="mini">
            <div class="badge" title="${rcEsc(status)}"><ha-icon icon="${rcEsc(icon)}"></ha-icon></div>
            <div class="body">
              <div class="head${nav ? " nav" : ""}"${nav ? ' role="link" tabindex="0"' : ""}>
                <div class="title">${rcEsc(c.title || this._areaName() || this._t("title"))}</div>
                ${st}
              </div>
              <div class="rs">${chips}</div>
            </div>
          </div>
        </ha-card>`;
      const root = this.shadowRoot;
      if (nav) rcBindNav(root.querySelector(".head"), nav);
      root.querySelector(".st.action")?.addEventListener("click", (ev) => this._allOff(ev));
      for (const el of root.querySelectorAll(".r")) el.addEventListener("click", () => rcMoreInfo(this, el.dataset.id));
    }

    // Zoom button at the end of the header, top right in both views, added once per render.
    // Its click is the overviews' (rcZoomClick): stop the tap on the title (navigation_path), toggle, keep the
    // keyboard focus (Enter / Space: no click count) on the button that replaced this one.
    _addZoom() {
      const head = this._config.zoom && this.shadowRoot.querySelector(".head");
      if (!head || head.querySelector(".zoom")) return;
      const button = document.createElement("button");
      button.className = "zoom";
      button.title = this._t(this._zoomed ? "zoom_out" : "zoom_in");
      button.innerHTML = `<ha-icon icon="${rcZoomIcon(this)}"></ha-icon>`;
      button.addEventListener("click", (ev) => rcZoomClick(this, ev));
      head.appendChild(button);
    }
  };

const rcBooleans = (...names) => names.map((name) => ({ name, selector: { boolean: {} } }));

const rcAdvanced = (i18n, lang, ...names) => [
  {
    name: "advanced",
    type: "expandable",
    flatten: true,
    schema: names.map((name) =>
      name === "language"
        ? {
            name,
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "", label: rcT(i18n, lang, "ed_language_auto") },
                  { value: "en", label: "English" },
                  { value: "fr", label: "Français" },
                  { value: "de", label: "Deutsch" },
                  { value: "es", label: "Español" },
                  { value: "sr", label: "Српски" },
                  { value: "sr-Latn", label: "Srpski (latinica)" },
                  { value: "it", label: "Italiano" },
                  { value: "nl", label: "Nederlands" },
                  { value: "pt", label: "Português (Portugal)" },
                  { value: "pl", label: "Polski" },
                  { value: "ro", label: "Română" },
                  { value: "da", label: "Dansk" },
                  { value: "sv", label: "Svenska" },
                  { value: "bg", label: "Български" },
                  { value: "ru", label: "Русский" },
                  { value: "uk", label: "Українська" },
                  { value: "hu", label: "Magyar" },
                  { value: "sk", label: "Slovenčina" },
                  { value: "cs", label: "Čeština" },
                  { value: "sl", label: "Slovenščina" },
                  { value: "lv", label: "Latviešu" },
                  { value: "el", label: "Ελληνικά" },
                ],
              },
            },
          }
        : { name, selector: { object: {} } },
    ),
  },
];
// `schema(lang, hass, config)` lists the fields; options left at the card's default are not written to the YAML
// (list defaults such as `exclude: []` are not shown in the form: an empty list is never written anyway).
// `autos` maps an option to its default worked out from the config (`(hass, config) => value`): shown in the form
// while unset, and kept out of the YAML when left at it.
// Entity lists the form edits with an entity picker (ids only): an item written `{ entity, name, icon }` in YAML shows as its entity,
// and gets its name and icon back when the form changes the list (ha-room-card#77).
const RC_ENTITY_LISTS = ["include"];
const rcListIds = (list) => (Array.isArray(list) ? list.map((e) => (typeof e === "string" ? e : e?.entity)).filter(Boolean) : list);
const rcListKeep = (ids, before) =>
  Array.isArray(ids) ? ids.map((id) => (Array.isArray(before) ? before.find((e) => typeof e === "object" && e?.entity === id) : undefined) ?? id) : ids;

const rcEditor = ({ card, helpers, schema, autos = {} }) => {
  const i18n = card.i18n;
  const defaults = { show_title: true, ...Object.fromEntries(Object.entries(card.defaults).filter(([, v]) => !Array.isArray(v))) };
  return class extends HTMLElement {
    setConfig(config) {
      this._config = config;
      this._update();
    }

    set hass(hass) {
      this._hass = hass;
      this._update();
    }

    _update() {
      if (!this._hass || !this._config) return;
      const lang = rcLang(i18n, this._hass, this._config);
      // Read by the label and helper callbacks, set once on the form: a language change must reach them too.
      this._lang = lang;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) => rcT(i18n, this._lang, `ed_${s.name}`);
        this._form.computeHelper = (s) =>
          helpers.includes(s.name) ? rcT(i18n, this._lang, `ed_${s.name}_helper`) : undefined;
        this._form.addEventListener("value-changed", (ev) => {
          const config = { ...ev.detail.value };
          for (const k of RC_ENTITY_LISTS) if (k in config) config[k] = rcListKeep(config[k], this._config[k]);
          for (const k of Object.keys(config)) {
            const v = config[k];
            if (v === "" || v == null || (Array.isArray(v) && !v.length) || defaults[k] === v) delete config[k];
          }
          for (const [k, auto] of Object.entries(autos)) {
            const untouched = this._config[k] === undefined && config[k] === auto(this._hass, this._config);
            if (untouched || config[k] === auto(this._hass, config)) delete config[k];
          }
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      this._form.hass = this._hass;
      // A new data or schema object re-renders the whole form, and the schema runs the card's discovery:
      // both only change with the config, the language or the registries.
      const memo = (this._memo ||= {});
      const h = this._hass;
      this._form.data = rcMemo(memo, "data", [this._config, h.areas], () => {
        const data = { ...defaults, ...this._config };
        for (const k of RC_ENTITY_LISTS) if (k in data) data[k] = rcListIds(data[k]);
        for (const [k, auto] of Object.entries(autos)) data[k] ??= auto(h, this._config);
        return data;
      });
      this._form.schema = rcMemo(memo, "schema", [lang, this._config, h.entities, h.devices, h.areas], () =>
        schema(lang, h, this._config),
      );
    }
  };
};

const rcRegister = (card, editor, name, description) => {
  if (customElements.get(card.tag)) return;
  pickerDefine(card.tag, card);
  pickerDefine(`${card.tag}-editor`, editor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: card.tag,
    name,
    description,
    preview: true,
    documentationURL: "https://github.com/juju35/ha-solar-roof-card",
  });
};

if (!customElements.get("solar-roof-card")) {
  console.info(`%c HA-SOLAR-ROOF-CARD %c v${RC_VERSION} `, "background:#1c7ed6;color:#fff;font-weight:700", "");
}

// ── Common styles ────────────────────────────────────────────────────────────
const RC_BASE_STYLES = `
  :host {
    --rc-ok: var(--success-color, #43a047);
    --rc-warn: var(--warning-color, #ffa600);
    --rc-alert: var(--error-color, #db4437);
    --rc-info: var(--info-color, #039be5);
    --rc-light: var(--state-light-active-color, #ffb300);
    --rc-plug: var(--state-switch-on-color, var(--primary-color, #03a9f4));
    --rc-idle: var(--secondary-text-color, #9e9e9e);
    --rc-na: var(--disabled-color, #9e9e9e);
    display: block;
    min-width: 0;
  }
  /* The card answers its own width (container queries). That containment drops its content from its natural width: in
     a wrapper sized by its content (inline-block, a grid's auto column, a flex row: layout-card, button-card…) it would
     shrink to its padding. The empty grid below (no height) gives the host a natural width of 344 px there, as a
     preferred width only: its column is minmax(0, …), so the card still shrinks to its column in a grid card, a
     horizontal stack or a 1fr column, even wrapped in a <div> (hui-card in layout-card). contain-intrinsic-inline-size
     or a min-width in px would be a minimum there, and the card would overflow. */
  :host::before { content: ""; display: grid; grid-template-columns: minmax(0, 344px); height: 0; }
  ha-card { padding: 12px; overflow: hidden; container-type: inline-size; }
  ha-card.lvl-alert { box-shadow: 0 0 0 1px color-mix(in srgb, var(--rc-alert) 45%, transparent), var(--ha-card-box-shadow, none); }

  .head { display: flex; align-items: center; gap: 10px; }
  .head.nav { cursor: pointer; }
  .head.nav:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; border-radius: 4px; }
  .badge { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
           background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c); }
  .badge ha-icon { --mdc-icon-size: 24px; }
  .lvl-alert .badge { animation: rc-pulse 1.6s ease-in-out infinite; }
  /* Narrow header: the title keeps a few letters (never 0 px), the status pill shrinks and ellipsises, the icon buttons
     (zoom, power) never shrink; under 200 px the pill is only its coloured dot, its text kept for screen readers. */
  .title { flex: 1 1 0; min-width: 5ch; font-size: 16px; font-weight: 500; color: var(--primary-text-color);
           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
           /* show_title: false keeps the title's room (the pill and buttons stay in place) */
  :host([hide-title]) .head > .title { visibility: hidden; }
  .pill { all: unset; flex: 0 1 auto; min-width: 0; box-sizing: border-box; position: relative;
          display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 500;
          padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--c) 14%, transparent);
          /* Coloured text is half the accent, half the text colour: 4.5:1 on its tint in light and dark themes, where
             the bare accent (amber above all) is not. */
          color: color-mix(in srgb, var(--c) 50%, var(--primary-text-color, #212121)); }
  .pt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill ha-icon { flex: none; }
  /* A card this narrow (6 columns of the Sections view on a phone): the title is at its few letters already, so the
     status pill goes to a line of its own under it, where its whole label fits, rather than end with "…". */
  @container (max-width: 260px) {
    .head { flex-wrap: wrap; row-gap: 4px; }
    .head::after { content: ""; order: 1; flex: 1 0 100%; }
    .head > .pill { order: 2; margin-left: 50px; max-width: calc(100% - 50px); }
  }
  @container (max-width: 200px) {
    /* Under 200 px the pill is only its dot again: back on the title's line. */
    .head { flex-wrap: nowrap; }
    .head::after { content: none; }
    .head > .pill { order: 0; margin-left: 0; max-width: none; }
    .head > .pill .pt, .st .pt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    .head > .pill:not(.action), .st { flex: none; padding: 0; width: 18px; height: 18px; justify-content: center; background: none; }
    .head > .pill:not(.action)::before, .st::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    .head > .pill.action { padding: 1px 4px; }
    /* A full card this narrow (6 columns of the Sections view on a phone): a smaller badge, no side chip in the header. */
    .head { gap: 6px; }
    .head > .badge { width: 32px; height: 32px; }
    .head > .badge ha-icon { --mdc-icon-size: 20px; }
    .head > .chip { display: none; }
  }
  .pill.action { cursor: pointer; }
  .pill.action:hover { background: color-mix(in srgb, var(--c) 24%, transparent); }
  .pill.action:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .pill ha-icon { --mdc-icon-size: 12px; margin-left: -2px; }

  .grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
  .tile { all: unset; position: relative; overflow: hidden; box-sizing: border-box; cursor: pointer; min-width: 0;
          display: flex; align-items: center; gap: 8px; padding: 5px 8px 5px 5px; border-radius: 10px;
          touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
          background: color-mix(in srgb, var(--t) 9%, var(--secondary-background-color, transparent));
          border: 1px solid color-mix(in srgb, var(--t) 22%, transparent); transition: background .2s, border-color .2s; }
  .tile.off, .tile.na { background: var(--secondary-background-color, transparent); border-color: transparent; }
  .tile.na { --t: var(--rc-na); opacity: .7; }
  .tile:hover { background: color-mix(in srgb, var(--t) 15%, var(--secondary-background-color, transparent)); }
  .tile:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .ic, .txt { position: relative; }
  .ic { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
        color: var(--t); background: color-mix(in srgb, var(--t) 20%, transparent); }
  .ic ha-icon { --mdc-icon-size: 16px; }
  .txt { display: flex; flex-direction: column; min-width: 0; }
  .name { font-size: 13px; font-weight: 500; line-height: 1.2; color: var(--primary-text-color);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* A reading is never cut: on a narrow tile it goes on to a second line (the name, a label, keeps its ellipsis). */
  .state { font-size: 11px; line-height: 1.2; color: var(--secondary-text-color); overflow-wrap: break-word; }
  /* A card this narrow (a phone, 6 columns of the Sections view): one tile per row, whatever the columns option. */
  @container (max-width: 260px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  /* layout: tiles — the size of Home Assistant's Tile card — 56 px high, a 40 px icon, the name over the state. */
  .layout-tiles .grid { gap: 8px; }
  .layout-tiles .tile { min-height: 56px; gap: 10px; padding: 8px 10px 8px 8px; border-radius: 12px; }
  .layout-tiles .ic { width: 40px; height: 40px; }
  .layout-tiles .ic ha-icon { --mdc-icon-size: 24px; }
  .layout-tiles .txt { gap: 2px; }
  .layout-tiles .name { font-size: 14px; line-height: 1.25; }
  .layout-tiles .state { font-size: 12px; line-height: 1.25; }

  @keyframes rc-blink { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
  @keyframes rc-pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 45%, transparent) }
                        50% { box-shadow: 0 0 0 7px transparent } }
  @media (prefers-reduced-motion: reduce) { .tile, .lvl-alert .badge { animation: none; transition: none; } }
`;

// Mini cards: layout, chips and zoom button. A chip is plain (icon and text) until it needs a look: then a tinted pill.
// The zoom / detail button of the mini cards and the overviews.
const RC_ZOOM_STYLES = `
  /* 40 px to tap, laid out as the 24 px it looks (the negative margins). */
  .zoom { all: unset; flex: none; cursor: pointer; width: 40px; height: 40px; margin: -12px -12px -12px -8px; border-radius: 50%;
          display: grid; place-items: center; color: var(--secondary-text-color); }
  .zoom ha-icon { --mdc-icon-size: 16px; }
  .zoom:hover { background: color-mix(in srgb, var(--rc-idle) 16%, transparent); color: var(--primary-text-color); }
  .zoom:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

const RC_MINI_STYLES = `${RC_ZOOM_STYLES}
  /* The badge sits 12px from the card's top-left corner, like the other ha-* cards, beside the title and the readings. */
  ha-card:has(.mini) { padding: 12px; }
  .mini { display: flex; align-items: flex-start; gap: 10px; }
  /* The badge keeps the full card's size (40 px, icon 24 px): the body is at least as tall, a lone title line centred
     beside it. */
  .body { flex: 1; min-width: 0; min-height: 40px; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .mini .head { gap: 8px; }
  .mini .title { line-height: 1.25; }
  .st { flex: 0 1 auto; min-width: 0; position: relative; display: inline-flex; align-items: center;
        margin-left: auto; font-size: 11px; font-weight: 500; color: var(--c); }
  .rs { display: flex; flex-wrap: wrap; gap: 2px 4px; margin-left: -4px; }
  .rs:empty { display: none; }
  /* A chip never runs past the card: a long name ends with an ellipsis. */
  .r { all: unset; cursor: pointer; display: inline-flex; align-items: baseline; gap: 1px; padding: 0 5px 0 4px;
       box-sizing: border-box; min-width: 0; max-width: 100%; overflow: hidden;
       border-radius: 999px; font-size: 12px; font-weight: 500; line-height: 24px; white-space: nowrap; --t: var(--rc-ok);
       color: var(--primary-text-color); }
  .r ha-icon { --mdc-icon-size: 13px; flex: none; color: var(--t); align-self: center; margin-right: 2px; }
  .r > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .r.pill { color: color-mix(in srgb, var(--t) 50%, var(--primary-text-color, #212121)); background: color-mix(in srgb, var(--t) 14%, transparent); }
  .r:hover { background: color-mix(in srgb, var(--t) 20%, var(--secondary-background-color, transparent)); }
  .r:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
`;
