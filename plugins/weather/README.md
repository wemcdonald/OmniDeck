# Weather

Real-time weather conditions and multi-day forecast for any location on Earth. Powered by [Open-Meteo](https://open-meteo.com/) — no API key required.

## Features

### State Providers

- **Current Weather** — Temperature, conditions, feels like, humidity (`{{temp}}`, `{{feels_like}}`, `{{condition}}`, `{{humidity}}`)
- **Weather Forecast** — Daily forecast for a configurable day offset (`{{day}}`, `{{hi}}`, `{{lo}}`, `{{condition}}`)

### Presets

- **Current Weather** — Current conditions with temperature label
- **Tomorrow's Forecast** — Tomorrow's icon, high and low

## Usage

```yaml
- pos: [0, 0]
  preset: weather.current
  params:
    location: "San Francisco"
    units: fahrenheit

- pos: [1, 0]
  preset: weather.tomorrow
  params:
    location: "San Francisco"
    units: fahrenheit

# Manual forecast days
- pos: [2, 0]
  state:
    provider: weather.forecast
    params:
      location: "Tokyo"
      units: celsius
      day: 2  # 0=today, 1=tomorrow, 2=day after, etc.
```

## Location formats

- City name: `San Francisco`, `Tokyo`, `London`
- City + country: `Paris, FR`
- Postal code: `94102`, `SW1A 1AA`
- Coordinates: `37.77,-122.42`

## License

MIT
