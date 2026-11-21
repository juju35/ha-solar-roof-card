# ha-solar-roof-card

[![Marketplace](https://img.shields.io/badge/Marketplace-Custom-41BDF5.svg)](https://www.home-assistant.io/integrations/marketplace/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/juju35/ha-solar-roof-card/blob/main/LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/julienstep9)

<p align="center"><img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/icon.svg" alt="Solar Roof Card" width="120"></p>

<p align="center">
  <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/enphase-envoy.png" alt="Enphase Envoy" height="24">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/hoymiles-wifi.png" alt="Hoymiles" height="24">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/apsystems-ecu-reader.png" alt="APsystems ECU Reader" height="24">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/huawei-solar.png" alt="Huawei Solar" height="36">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/solaredgeoptimizers.png" alt="SolarEdge Optimizers" height="24">&nbsp;&nbsp;
  <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/foxess-modbus.png" alt="Fox ESS Modbus" height="24">
</p>

A Lovelace card that draws **your roof panel by panel**: each micro-inverter, optimiser or string is coloured by its production, so a shaded or failing panel stands out at a glance.

> [!NOTE]
> This card is being designed: there is no release yet. Watch the repository to know when the first version is out.

| Card | Type | What it shows |
|---|---|---|
| Solar roof | `custom:solar-roof-card` | Your roof drawn panel by panel, each one coloured by its production, with its power and today's energy. |
| Solar roof mini | `custom:solar-roof-mini-card` | The panels as a heat strip and the weakest one, with a zoom to the full card. |

## Supported integrations

The card reads the power of each micro-inverter, optimiser or string these integrations expose:

| | Integration | What the cards show |
|:---:|---|---|
| <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/enphase-envoy.png" alt="Enphase Envoy" height="16"> | [Enphase Envoy](https://www.home-assistant.io/integrations/enphase_envoy/) (built in) | Power of each IQ micro-inverter |
|  | [OpenDTU / AhoyDTU](https://github.com/tbnobody/OpenDTU) (MQTT) | Hoymiles micro-inverters through MQTT discovery, power of each inverter and input |
| <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/hoymiles-wifi.png" alt="Hoymiles" height="16"> | [Hoymiles](https://github.com/suaveolent/ha-hoymiles-wifi) (Marketplace) | Hoymiles HMS micro-inverters through their DTU, power of each input |
| <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/apsystems-ecu-reader.png" alt="APsystems ECU Reader" height="16"> | [APsystems ECU Reader](https://github.com/HAEdwin/homeassistant-apsystems_ecu_reader) (Marketplace) | Power of each inverter channel |
| <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/huawei-solar.png" alt="Huawei Solar" height="24"> | [Huawei Solar](https://github.com/wlcrs/huawei_solar) (Marketplace) | Huawei SUN2000 optimisers |
| <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/solaredgeoptimizers.png" alt="SolarEdge Optimizers" height="16"> | [SolarEdge Optimizers](https://github.com/ProudElm/solaredgeoptimizers) (Marketplace) | Power of each SolarEdge optimiser |
| <img src="https://raw.githubusercontent.com/juju35/ha-solar-roof-card/main/images/foxess-modbus.png" alt="Fox ESS Modbus" height="16"> | [Fox ESS Modbus](https://github.com/nathanmarlor/foxess_modbus) (Marketplace) | Power of each PV string |

## Installation

### Via the Marketplace (recommended)

Click the button below to add the repository directly:

[![Add to the Marketplace](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=juju35&repository=ha-solar-roof-card&category=plugin)

Or manually:

1. Open **Settings → Marketplace → Add from link** (top right; this needs a GitHub account connected)
2. Add `https://github.com/juju35/ha-solar-roof-card` — Type: **Dashboard**
3. Open **Solar Roof Card** and click **Install**
4. Clear your browser cache and refresh

The Marketplace registers the dashboard resource for you.

### Manual

1. Download `ha-solar-roof-card.js` and the `ha-solar-roof-card.i18n.*.js` translation files from the [latest release](https://github.com/juju35/ha-solar-roof-card/releases/latest)
2. Copy them all to `/config/www/` (without the translation files, the cards show in English)
3. Go to **Settings → Dashboards → Resources** → Add resource:
   - URL: `/local/ha-solar-roof-card.js`
   - Type: **JavaScript Module**
4. Clear your browser cache and refresh

## License

[MIT](https://github.com/juju35/ha-solar-roof-card/blob/main/LICENSE)

## Support

If you find this project useful, you can support its development:

<a href="https://buymeacoffee.com/julienstep9"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="50"></a>
