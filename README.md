# Homebridge ComEd / Opower

A Homebridge plugin that retrieves residential electricity consumption data from ComEd through the Opower API and exposes usage information to Homebridge and Apple HomeKit.

The plugin uses ComEd’s existing smart‑meter data and does **not** require:

- A CT‑based electrical monitor  
- Home Assistant  
- Docker  
- Additional hardware  

It retrieves whole‑home electricity consumption directly from ComEd/Exelon’s Opower service.

---

## Overview

The plugin provides ComEd historical electricity usage through HomeKit using a **PowerManagement** service with **custom kWh/kW characteristics**. It retrieves 30‑minute interval usage, calculates daily totals, and exposes the values to Apple Home in a way that preserves correct units and meaning.

Current capabilities include:

- ComEd authentication  
- Exelon MFA (email or phone)  
- Saved Opower login data  
- ComEd account discovery  
- 30‑minute electricity consumption  
- Latest interval consumption (kWh)  
- Average power calculation (kW)  
- Today’s total consumption  
- Yesterday’s total consumption  
- Configurable polling interval  
- Python helper integration  
- Homebridge 2.x support  
- HomeKit PowerManagement service  
- Custom numeric characteristics  
- Accessory Information metadata  
- Child bridge support  
- Homebridge UI configuration schema  

---

## How It Works

```
                         ComEd
                           │
                           ▼
                     ComEd / Opower
                           │
                           ▼
                     Python opower
                           │
                           ▼
                  opower_helper.py
                           │
                       JSON data
                           │
                           ▼
                  Homebridge Plugin
                       Node.js
                           │
                           ▼
                  HomeKit Services
                           │
                           ▼
                    Apple Home App
```

Home Assistant and Docker are **not required**.

---

## HomeKit Integration

The plugin uses the **HomeKit PowerManagement service** and defines **custom numeric characteristics** for electricity measurements.

### Accessory Information

| Property | Value |
|----------|--------|
| Manufacturer | ComEd |
| Model | Smart Meter |
| Serial Number | ComEd‑Energy |
| Firmware Revision | 1.0 |

### Energy Measurements (Custom Characteristics)

| Measurement | Unit | Description |
|-------------|-------|-------------|
| **Latest Consumption** | kWh | Most recent ComEd interval consumption |
| **Average Power** | kW | Average power during the most recent interval |
| **Today** | kWh | Total consumption for the current ComEd day |
| **Yesterday** | kWh | Total consumption for the previous ComEd day |

Example:

```
Latest Consumption: 0.6725 kWh
Average Power:      1.345 kW
Today:              0.672 kWh
Yesterday:          56.645 kWh
```

### HomeKit Display Considerations

Apple Home does not provide a native electricity‑consumption tile for third‑party accessories.

To preserve correct units:

- The plugin **does not** use TemperatureSensor services  
- The plugin **does not** convert values to °F or °C  
- The plugin uses **PowerManagement** with **custom kWh/kW characteristics**

Apple Home may display custom characteristics differently depending on the iOS version, but the underlying units remain correct.

---

## Data Resolution

ComEd usage is retrieved using historical **HALF_HOUR** data.

Example interval:

```
Start:       2026‑08‑30 00:00
End:         2026‑08‑30 00:30
Consumption: 0.6625 kWh
```

### Average Power Calculation

```
kW = kWh / interval_hours
```

For a 30‑minute interval:

```
0.6625 kWh / 0.5 hours = 1.325 kW
```

If ComEd provides valid timestamps, the plugin calculates the interval duration dynamically.  
If timestamps are missing, the plugin defaults to 30 minutes.

### Daily Totals

Daily consumption is calculated by summing all readings for each calendar day:

```
Today:      0.672 kWh
Yesterday: 56.645 kWh
```

---

## Authentication & MFA

Authentication uses the ComEd/Exelon Opower flow:

```
ComEd Username
ComEd Password
Exelon MFA Challenge
Email or Phone
Security Code
Opower Session
Historical Usage
```

After successful MFA, login data may be saved:

```
/var/lib/homebridge/comed-login.json
```

This file is **sensitive** and must never be committed to GitHub.

---

## Python / Opower

The plugin uses:

```
opower 0.20.0
```

Opower handles:

- Authentication  
- MFA  
- Session management  
- Account discovery  
- Historical usage retrieval  
- HALF_HOUR resolution  

The plugin runs Opower inside a dedicated Python virtual environment.

---

## Production Environment

| Component | Specification |
|----------|---------------|
| Device | Raspberry Pi 5 |
| OS | Debian GNU/Linux 12 |
| Architecture | ARM64 |
| Homebridge | 2.4.0 |
| HAP | 2.2.2 |
| Homebridge UI | 5.28+ |
| Node.js | 24.x |
| Python | 3.11.2 |

Homebridge working directory:

```
/var/lib/homebridge
```

Homebridge service:

```
/lib/systemd/system/homebridge.service
```

Runs as the `homebridge` user.

---

## Dedicated Python Virtual Environment

Opower is installed in:

```
/opt/homebridge-comed-opower-venv
```

Python executable:

```
/opt/homebridge-comed-opower-venv/bin/python
```

Verification:

```
/opt/homebridge-comed-opower-venv/bin/python --version
/opt/homebridge-comed-opower-venv/bin/python -c "import opower; print(opower.__file__)"
/opt/homebridge-comed-opower-venv/bin/pip show opower
```

The system Python installation is **not modified**.

---

## Python Helper

The plugin invokes:

```
opower_helper.py
```

Responsibilities:

- Credentials  
- Authentication  
- MFA  
- Saved login data  
- Account discovery  
- Historical usage  
- JSON output  
- Error handling  

Environment variables:

```
OPOWER_USERNAME
OPOWER_PASSWORD
```

Example execution:

```
/opt/homebridge-comed-opower-venv/bin/python \
  /opt/homebridge/lib/node_modules/homebridge-comed-opower/opower_helper.py \
  --login-file /var/lib/homebridge/comed-login.json \
  --days 2
```

Example JSON:

```json
{
  "ok": true,
  "utility": "comed",
  "readings": [
    {
      "start": "2026-08-30 00:00:00-05:00",
      "end": "2026-08-30 00:30:00-05:00",
      "kwh": 0.6625
    }
  ]
}
```

---

## Configuration

The plugin includes:

- `config.schema.json`  
- `config.example.json`  

### Example Configuration

```json
{
  "accessories": [
    {
      "accessory": "ComEd Energy",
      "name": "ComEd Energy",
      "username": "YOUR_COMED_USERNAME",
      "password": "YOUR_COMED_PASSWORD",
      "pollInterval": 30,
      "python": "/opt/homebridge-comed-opower-venv/bin/python",
      "loginFile": "/var/lib/homebridge/comed-login.json",
      "days": 2
    }
  ]
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `name` | ComEd Energy | Accessory name |
| `username` | — | ComEd username/email |
| `password` | — | ComEd password |
| `pollInterval` | 30 | Poll interval in minutes |
| `python` | /opt/homebridge-comed-opower-venv/bin/python | Python executable |
| `loginFile` | /var/lib/homebridge/comed-login.json | Saved Opower login file |
| `days` | 2 | Number of historical days retrieved |

---

## Homebridge Plugin Registration

Package:

```
homebridge-comed-opower
```

Accessory identifier:

```
homebridge-comed-opower.ComEd Energy
```

Configuration uses:

```
"accessory": "ComEd Energy"
```

---

## Child Bridge Support

The plugin supports running as a Homebridge child bridge:

```
Homebridge
   ├── Main Bridge
   ├── ComEd Energy Child Bridge
   └── Other Child Bridges
```

If HomeKit caches old services:

1. Remove the ComEd child bridge from Apple Home  
2. Restart Homebridge  
3. Re‑add the accessory  

---

## Installation

Install from GitHub:

```
cd /var/lib/homebridge
npm install --save github:carcani/homebridge-comed-opower
```

Verify:

```
npm list --depth=0 | grep homebridge-comed-opower
```

Git‑based installs may show a commit hash — this is normal.

---

## Debugging

Start Homebridge in debug mode:

```
homebridge -D
```

Expected messages:

```
Loaded plugin: homebridge-comed-opower
Registering accessory 'homebridge-comed-opower.ComEd Energy'
[ComEd Energy] Retrieving ComEd usage data...
```

After retrieval:

```
[ComEd Energy] ComEd latest usage: 0.6725 kWh
[ComEd Energy] ComEd average power: 1.345 kW
[ComEd Energy] ComEd today: 0.672 kWh
[ComEd Energy] ComEd yesterday: 56.645 kWh
```

Systemd commands:

```
sudo systemctl status homebridge
sudo systemctl restart homebridge
sudo journalctl -u homebridge -f
```

---

## Data Limitations

ComEd/Opower data is **not real‑time**.

Suitable for:

- Historical usage  
- 30‑minute consumption  
- Daily totals  
- Dashboards  
- Long‑term analysis  

Not suitable for:

- Instantaneous safety monitoring  
- Real‑time load shedding  
- Circuit‑level monitoring  
- Fault detection  

---

## Security

Never commit:

- Username  
- Password  
- MFA codes  
- `comed-login.json`  
- Cookies  
- Tokens  

Sensitive file:

```
/var/lib/homebridge/comed-login.json
```

Recommended `.gitignore`:

```
node_modules/
venv/
__pycache__/
*.pyc
comed.csv
comed-history.csv
comed-login.json
.env
.env.*
*.log
*.csv
*.tgz
npm-debug.log*
```

---

## Repository Structure

```
homebridge-comed-opower/
├── package.json
├── package-lock.json
├── index.js
├── opower_helper.py
├── config.schema.json
├── config.example.json
├── README.md
├── LICENSE
└── .gitignore
```

Local‑only files:

- `node_modules/`  
- `venv/`  
- `comed-login.json`  
- CSV files  
- `.log` files  
- `.tgz` packages  

Production virtual environment:

```
/opt/homebridge-comed-opower-venv/
```

---

## Future Enhancements

- Electricity cost calculation  
- Billing‑period usage  
- Monthly usage  
- Additional statistics  
- Improved MFA expiration handling  
- Authentication recovery  
- Last successful update status  
- ComEd meter information  
- Historical usage graphs  
- Improved HomeKit presentation  
- Native energy tiles if Apple exposes a suitable API  
- npm publication  
- Homebridge plugin discovery  

---

## License

MIT

---

## Status Summary

The complete data pipeline is operational:

```
ComEd
  ↓
Exelon MFA
  ↓
Opower
  ↓
HALF_HOUR consumption
  ↓
Python helper
  ↓
JSON
  ↓
Homebridge
  ↓
HomeKit
  ↓
Apple Home
```

Example:

```
Latest interval: 0.6725 kWh
Average power:   1.345 kW
Today:           0.672 kWh
Yesterday:       56.645 kWh
```

No Docker, Home Assistant, CT clamp, or additional hardware is required.

---
