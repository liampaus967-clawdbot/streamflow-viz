# Streamflow Visualization

Real-time stream flow visualization using National Water Model (NWM) data on the NHDPlus network.

## Features

- 🌊 **2.4M stream reaches** with live flow data
- 🎨 **Color-coded by flow rate** (green → red scale)
- 📊 **Line width by discharge** (bigger rivers = thicker lines)
- 🗺️ **Dynamic loading** based on map viewport

## Data Sources

- **Geometry:** NHDPlus flowlines (river_edges)
- **Flow Data:** National Water Model via `nwm_velocity` table
- **Update Frequency:** Hourly (from NWM short-range forecasts)

## Flow Categories

| Category | Flow (m³/s) | Color |
|----------|-------------|-------|
| Extreme | > 1000 | 🔴 Dark Red |
| Very High | 200-1000 | 🔴 Red |
| High | 50-200 | 🟠 Orange |
| Moderate | 10-50 | 🟡 Yellow |
| Low | 1-10 | 🟢 Lime |
| Very Low | < 1 | 🟢 Green |

## Setup

```bash
npm install
cp .env.example .env.local
# Add your Mapbox token and database URL
npm run dev
```

## Tech Stack

- Next.js 15
- React Map GL / Mapbox GL JS
- PostgreSQL + PostGIS
- National Water Model data
