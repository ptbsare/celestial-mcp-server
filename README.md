# CelestialMCP

A Model Context Protocol (MCP) server designed for AI assistants like Claude. It provides tools to access astronomical data, such as celestial object positions, rise/set times, visibility, and catalog information.

## Quick Start (npx)

The fastest way to use CelestialMCP — no clone, no install, no build:

```bash
npx https://github.com/ptbsare/celestial-mcp-server
```

That's it. The server starts immediately with sample astronomical data and automatically downloads full catalogs in the background (~38MB). Once downloaded (within ~30 seconds), the full catalogs are hot-loaded — no restart needed.

### First launch

On first run, npx clones the repo and builds the project. This takes about 1-2 minutes. Subsequent launches use the cache and start instantly.

## Using with Claude Desktop

Add the following to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "CelestialMCP": {
      "command": "npx",
      "args": ["-y", "https://github.com/ptbsare/celestial-mcp-server"]
    }
  }
}
```

## Overview

CelestialMCP is built with the mcp-framework and leverages the astronomy-engine library to provide accurate astronomical calculations.

### Features

- **Real-time Celestial Data**: Access current astronomical data for a variety of objects.
- **Comprehensive Object Details**: Retrieve equatorial and horizontal (altitude/azimuth) coordinates, visibility status, rise/transit/set times.
- **Specialized Data**: For relevant objects, get distance (solar system objects), phase illumination (Moon and planets), and upcoming lunar phases (Moon).
- **Extensive Catalogs**: Utilizes local catalogs for:
    - Solar system objects (Sun, Moon, planets).
    - Stars (e.g., from HYG database, ~120,000 stars).
    - Deep Sky Objects (DSOs) including Messier, NGC, and IC objects (~14,000 objects).
- **Configurable Observer**: All calculations are based on a pre-configured observer location (default: Vancouver, Canada) and the current system time.
- **Automatic Catalog Download**: Downloads full catalogs on first launch and hot-reloads them — no restart required.

### Tools

The server provides four tools for the AI to use:

1. **`getCelestialDetails`**: Retrieves detailed astronomical information for a specific celestial object.
2. **`listCelestialObjects`**: Lists available celestial objects known to the system, filterable by category.
3. **`getStarHoppingPath`**: Calculates a star hopping path from a bright start star to a target celestial object.
4. **`getEphemerisStream`**: Generates a time series of altitude/azimuth for selected objects over a period at a fixed cadence.

## Development Setup

### Prerequisites
- Node.js (version >=18.19.0)
- npm

### Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ptbsare/celestial-mcp-server
   cd celestial-mcp-server
   ```

2. **Install dependencies and build:**
   ```bash
   npm install
   ```

3. **Download full astronomical catalogs (optional — server works with sample data):**
   ```bash
   npm run fetch-catalogs
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

### Catalog Data

The server ships with sample data and automatically downloads full catalogs on first launch:

- `hygdata_v41.csv`: The HYG star database (~120,000 stars, ~34MB).
- `ngc.csv`: The OpenNGC catalog (~14,000 deep sky objects, ~4MB).

These files are stored in the `data/` directory. The server starts instantly with bundled sample data and upgrades to full catalogs automatically when the download completes.

## Tool Usage

All astronomical calculations use the **pre-configured observer location** (see `src/config.ts`) and the **current system time**.

### 1. `getCelestialDetails`

Retrieves comprehensive astronomical data for a specific celestial object.

**Parameters:**
- `objectName` (string): Name or catalog identifier. Examples: `"Mars"`, `"Sirius"`, `"M31"`, `"NGC 7000"`, `"Orion Nebula"`, `"Moon"`, `"Sun"`
- `latitude`, `longitude`, `altitude`, `temperature`, `pressure` (optional): Override observer location.

**Example prompts:**
- "Get details for Jupiter from the configured location."
- "What are the current coordinates of the Moon?"
- "Tell me about the star Vega, including its rise and set times for today."
- "Is the Whirlpool Galaxy (M51) visible tonight?"

### 2. `listCelestialObjects`

Lists celestial objects known to the system, filterable by category.

**Parameters:**
- `category` (optional): `planets`, `stars`, `messier`, `ic`, `ngc`, `dso`, or `all` (default).
- `limit`, `offset` (optional): Pagination.
- `minMagnitude` (optional): Filter by brightness.
- `constellation` (optional): Filter by IAU constellation.

**Example prompts:**
- "List all available Messier objects."
- "What planets can I get information on?"
- "List all NGC objects in the catalog."

### 3. `getStarHoppingPath`

Calculates a star hopping path from a bright start star to a target object.

**Parameters:**
- `targetObjectName` (string): The object to find. Examples: `"M13"`, `"Andromeda Galaxy"`
- `fovDegrees` (number, positive): Field of View in degrees.
- `maxHopMagnitude` (optional, default: 8.0): Maximum stellar magnitude for hop stars.
- `initialSearchRadiusDegrees` (optional, default: 20.0): Search radius for starting star.
- `startStarMagnitudeThreshold` (optional, default: 3.5): Brightness threshold for starting star.
- `maxHops` (optional, default: 20): Maximum number of hops.
- `preferSameConstellation` (optional, default: false): Prefer stars in same constellation.

**Example prompts:**
- "Find a star hopping path to M13 with a 5 degree FOV."
- "Give me a star hop sequence to the Ring Nebula (M57) using binoculars with 6 degree FOV."

### 4. `getEphemerisStream`

Generates a time series of altitude/azimuth for multiple objects.

**Parameters:**
- `objects` (string[]): List of object names to track.
- `cadenceMinutes` (optional, default: 5): Sampling interval in minutes.
- `durationMinutes` (optional, default: 60): Total duration in minutes.
- `minAltitude` (optional, default: 0): Minimum altitude filter.
- `startTime` (optional): ISO start time (defaults to now).
- `latitude`, `longitude`, `altitude`, `temperature`, `pressure` (optional): Observer override.

**Example prompts:**
- "Track Mars and Jupiter's position every 10 minutes for the next 2 hours."
- "Show me the Moon's altitude/azimuth over the next hour at 5 minute intervals."

## Project Structure

```
celestial-mcp-server/
├── src/
│   ├── tools/                         # MCP Tools
│   │   ├── CelestialDetailsTool.ts
│   │   ├── ListCelestialObjectsTool.ts
│   │   ├── StarHoppingTool.ts
│   │   └── EphemerisStreamTool.ts
│   ├── utils/
│   │   ├── astronomy.ts               # Core astronomy calculations & catalog loading
│   │   └── logger.ts
│   ├── config.ts                      # Observer location configuration
│   └── index.ts                       # MCP Server entry point
├── scripts/
│   └── fetch-catalogs.js              # Manual catalog download script
├── data/
│   ├── sample_stars.csv               # Sample star data (bundled)
│   ├── sample_dso.csv                 # Sample DSO data (bundled)
│   ├── hygdata_v41.csv                # Full HYG database (auto-downloaded)
│   └── ngc.csv                        # Full OpenNGC catalog (auto-downloaded)
├── package.json
└── tsconfig.json
```

## Default Configuration

Observer location defaults to Vancouver, Canada. Edit `src/config.ts` to change:

```typescript
export const OBSERVER_CONFIG = {
  latitude: 49.2827,    // Observer latitude
  longitude: -123.1207, // Observer longitude
  altitude: 30,         // Observer altitude in meters
  temperature: 15,      // Default temperature in Celsius
  pressure: 1013.25     // Default pressure in hPa
};
```

## License

MIT

## Acknowledgements

- [astronomy-engine](https://github.com/cosinekitty/astronomy) for core astronomical calculations
- [mcp-framework](https://github.com/QuantGeekDev/mcp-framework) for the MCP server implementation
- [HYG Database](https://github.com/astronexus/HYG-Database) for star data
- [OpenNGC](https://github.com/mattiaverga/OpenNGC) for deep sky object data
