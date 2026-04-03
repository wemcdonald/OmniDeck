// plugins/weather/hub.ts
// Powered by Open-Meteo (https://open-meteo.com/) — no API key required.

import { z } from "zod";
import { createCanvas } from "@napi-rs/canvas";
import { field, type OmniDeckPlugin, type PluginContext } from "@omnideck/plugin-schema";

// ── WMO weather code → label + Material Symbol icon ──────────────────────

const WMO: Record<number, { label: string; icon: string; night?: string }> = {
  0:  { label: "Clear",          icon: "ms:wb-sunny",         night: "ms:bedtime" },
  1:  { label: "Mostly Clear",   icon: "ms:partly-cloudy-day", night: "ms:nights-stay" },
  2:  { label: "Partly Cloudy",  icon: "ms:partly-cloudy-day" },
  3:  { label: "Overcast",       icon: "ms:cloud" },
  45: { label: "Fog",            icon: "ms:foggy" },
  48: { label: "Icy Fog",        icon: "ms:foggy" },
  51: { label: "Light Drizzle",  icon: "ms:rainy" },
  53: { label: "Drizzle",        icon: "ms:rainy" },
  55: { label: "Heavy Drizzle",  icon: "ms:rainy" },
  61: { label: "Light Rain",     icon: "ms:rainy" },
  63: { label: "Rain",           icon: "ms:rainy" },
  65: { label: "Heavy Rain",     icon: "ms:rainy" },
  71: { label: "Light Snow",     icon: "ms:weather-snowy" },
  73: { label: "Snow",           icon: "ms:weather-snowy" },
  75: { label: "Heavy Snow",     icon: "ms:weather-snowy" },
  77: { label: "Snow Grains",    icon: "ms:weather-snowy" },
  80: { label: "Rain Showers",   icon: "ms:rainy" },
  81: { label: "Rain Showers",   icon: "ms:rainy" },
  82: { label: "Violent Rain",   icon: "ms:rainy" },
  85: { label: "Snow Showers",   icon: "ms:weather-snowy" },
  86: { label: "Snow Showers",   icon: "ms:weather-snowy" },
  95: { label: "Thunderstorm",   icon: "ms:thunderstorm" },
  96: { label: "Thunderstorm",   icon: "ms:thunderstorm" },
  99: { label: "Thunderstorm",   icon: "ms:thunderstorm" },
};

function wmoInfo(code: number) {
  return WMO[code] ?? { label: "Unknown", icon: "ms:cloud" };
}

// WMO emoji for rendering on canvas
const WMO_EMOJI: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "❄️", 75: "❄️", 77: "❄️",
  80: "🌦️", 81: "🌧️", 82: "⛈️",
  85: "🌨️", 86: "❄️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

function wmoEmoji(code: number): string {
  return WMO_EMOJI[code] ?? "🌡️";
}

// ── API types ─────────────────────────────────────────────────────────────

interface GeoResult {
  latitude: number;
  longitude: number;
  name: string;
  timezone: string;
}

interface WeatherData {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
  timezone: string;
  fetchedAt: number;
  locationName: string;
}

// ── Caches ────────────────────────────────────────────────────────────────

const geoCache = new Map<string, GeoResult>();
const weatherCache = new Map<string, WeatherData>();

const GEO_TTL = 24 * 60 * 60 * 1000;     // 24h
const WEATHER_TTL = 10 * 60 * 1000;       // 10 min

async function geocode(location: string): Promise<GeoResult | null> {
  const key = location.toLowerCase().trim();

  // lat,lon format
  const latlon = key.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (latlon) {
    return { latitude: parseFloat(latlon[1]), longitude: parseFloat(latlon[2]), name: location, timezone: "auto" };
  }

  const cached = geoCache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&format=json`);
    if (!res.ok) throw new Error(`Geocoding API error: ${res.status} ${res.statusText}`);
    const data = await res.json() as { results?: Array<{ latitude: number; longitude: number; name: string; country_code: string; timezone: string }> };
    if (!data.results?.length) return null;
    const r = data.results[0];
    const result: GeoResult = { latitude: r.latitude, longitude: r.longitude, name: `${r.name}, ${r.country_code}`, timezone: r.timezone };
    geoCache.set(key, result);
    setTimeout(() => geoCache.delete(key), GEO_TTL);
    return result;
  } catch {
    return null;
  }
}

async function fetchWeather(geo: GeoResult, units: "celsius" | "fahrenheit"): Promise<WeatherData | null> {
  const key = `${geo.latitude},${geo.longitude},${units}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < WEATHER_TTL) return cached;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
    `&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&timezone=${encodeURIComponent(geo.timezone === "auto" ? "auto" : geo.timezone)}` +
    `&forecast_days=7&temperature_unit=${units}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather API error: ${res.status} ${res.statusText}`);
  }
  const raw = await res.json() as Omit<WeatherData, "fetchedAt" | "locationName">;
  const data: WeatherData = { ...raw, fetchedAt: Date.now(), locationName: geo.name };
  weatherCache.set(key, data);
  return data;
}

function round(n: number): number { return Math.round(n); }

function formatTemp(t: number, units: "celsius" | "fahrenheit"): string {
  return `${round(t)}°${units === "fahrenheit" ? "F" : "C"}`;
}

function shortDayName(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

// ── Canvas renderers ──────────────────────────────────────────────────────

function renderCurrent(size: number, data: WeatherData, units: "celsius" | "fahrenheit"): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, size, size);

  const c = data.current;
  const emoji = wmoEmoji(c.weather_code);

  // Weather emoji (top area)
  const emojiFontSize = Math.round(size * 0.38);
  ctx.font = `${emojiFontSize}px NotoColorEmoji, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(emoji, size / 2, size * 0.04);

  // Temperature (bottom area)
  const tempStr = formatTemp(c.temperature_2m, units);
  const tempFontSize = Math.round(size * 0.26);
  ctx.font = `bold ${tempFontSize}px sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "bottom";
  ctx.fillText(tempStr, size / 2, size - size * 0.04);

  return canvas.toBuffer("image/png");
}

function renderForecastDay(size: number, data: WeatherData, dayIndex: number, units: "celsius" | "fahrenheit"): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, size, size);

  const d = data.daily;
  if (dayIndex >= d.time.length) return canvas.toBuffer("image/png");

  const dayName = shortDayName(d.time[dayIndex]);
  const emoji = wmoEmoji(d.weather_code[dayIndex]);
  const hi = formatTemp(d.temperature_2m_max[dayIndex], units);
  const lo = formatTemp(d.temperature_2m_min[dayIndex], units);

  const smallFont = Math.round(size * 0.17);
  const emojiFont = Math.round(size * 0.30);

  // Day name (top)
  ctx.font = `bold ${smallFont}px sans-serif`;
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(dayName, size / 2, size * 0.04);

  // Emoji (middle)
  ctx.font = `${emojiFont}px NotoColorEmoji, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size * 0.52);

  // High / Low (bottom)
  ctx.font = `bold ${smallFont}px sans-serif`;
  ctx.fillStyle = "#f97316";
  ctx.textBaseline = "bottom";
  ctx.fillText(`↑${hi}`, size * 0.3, size - size * 0.04);
  ctx.fillStyle = "#60a5fa";
  ctx.fillText(`↓${lo}`, size * 0.72, size - size * 0.04);

  return canvas.toBuffer("image/png");
}

// ── Schema ────────────────────────────────────────────────────────────────

const configSchema = z.object({
  location: field(z.string().optional(), { label: "Default Location", placeholder: "New York, Tokyo, 94102, 51.5,-0.12" }),
  metric: field(z.boolean().default(false), { label: "Use Celsius (metric)" }),
});

const currentParams = z.object({
  location: field(z.string().optional(), { label: "Location", placeholder: "Uses plugin default if blank" }),
  metric: field(z.boolean().optional(), { label: "Use Celsius (metric)" }),
});

const forecastParams = z.object({
  location: field(z.string().optional(), { label: "Location", placeholder: "Uses plugin default if blank" }),
  metric: field(z.boolean().optional(), { label: "Use Celsius (metric)" }),
  day: field(z.number().int().min(0).max(6).default(1), { label: "Day Offset (0=today)" }),
});

// ── Plugin ────────────────────────────────────────────────────────────────

export const weatherPlugin: OmniDeckPlugin = {
  id: "weather",
  name: "Weather",
  version: "1.0.0",
  icon: "ms:partly-cloudy-day",
  configSchema,

  async init(ctx: PluginContext) {
    const pluginConfig = configSchema.parse(ctx.config ?? {});

    // ── Error tracking for backoff ──────────────────────────────────────
    let consecutiveErrors = 0;
    const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 min cap

    function getBackoffMs(): number {
      if (consecutiveErrors === 0) return 0;
      return Math.min(30_000 * Math.pow(2, consecutiveErrors - 1), MAX_BACKOFF_MS);
    }

    async function safeGeocode(location: string): Promise<GeoResult | null> {
      try {
        const geo = await geocode(location);
        return geo;
      } catch (err) {
        consecutiveErrors++;
        ctx.setHealth({ status: "degraded", message: `Geocoding failed: ${String(err)}` });
        return null;
      }
    }

    async function safeFetchWeather(geo: GeoResult, units: "celsius" | "fahrenheit"): Promise<WeatherData | null> {
      const backoff = getBackoffMs();
      if (backoff > 0) return null; // still in backoff window

      try {
        const data = await fetchWeather(geo, units);
        if (consecutiveErrors > 0) {
          consecutiveErrors = 0;
          ctx.setHealth({ status: "ok" });
        }
        return data;
      } catch (err) {
        consecutiveErrors++;
        ctx.setHealth({ status: "degraded", message: `Weather fetch failed: ${String(err)}` });
        return null;
      }
    }

    // Refresh state every 10 minutes to pick up new weather data
    // Use ctx.setInterval so the interval is cleaned up on plugin reload
    ctx.setInterval(() => {
      ctx.state.set("weather", "tick", Date.now());
    }, 10 * 60 * 1000);

    // ── Current conditions ──────────────────────────────────────────────

    ctx.registerStateProvider({
      id: "current",
      name: "Current Weather",
      description: "Current temperature and conditions for a location",
      icon: "ms:partly-cloudy-day",
      providesIcon: true,
      paramsSchema: currentParams,
      templateVariables: [
        { key: "temp", label: "Temperature", example: "68°F" },
        { key: "feels_like", label: "Feels Like", example: "65°F" },
        { key: "condition", label: "Condition", example: "Partly Cloudy" },
        { key: "humidity", label: "Humidity", example: "72%" },
        { key: "location", label: "Location", example: "San Francisco, US" },
      ],
      resolve(params) {
        const raw = currentParams.parse(params);
        const metric = raw.metric ?? pluginConfig.metric;
        const p = {
          location: raw.location || pluginConfig.location || "",
          units: (metric ? "celsius" : "fahrenheit") as "celsius" | "fahrenheit",
        };
        if (!p.location) {
          return {
            state: { icon: "ms:partly-cloudy-day", iconColor: "#94a3b8", opacity: 0.3 },
            variables: { temp: "--", feels_like: "--", condition: "No location set", humidity: "--", location: "" },
          };
        }
        const cacheKey = `${p.location.toLowerCase()},${p.units}`;
        const cached = weatherCache.get(cacheKey) ?? [...weatherCache.values()].find(
          (w) => w.locationName.toLowerCase().includes(p.location.toLowerCase())
        );

        // Trigger async fetch (fire and forget — next render will have data)
        safeGeocode(p.location).then((geo) => {
          if (!geo) return;
          safeFetchWeather(geo, p.units).then((data) => {
            if (data) ctx.state.set("weather", `current:${p.location}`, Date.now());
          });
        });

        if (!cached) {
          return {
            state: { icon: "ms:partly-cloudy-day", iconColor: "#94a3b8", opacity: 0.5 },
            variables: { temp: "--", feels_like: "--", condition: "Loading...", humidity: "--", location: p.location },
          };
        }

        const size = 144;
        const icon = renderCurrent(size, cached, p.units);
        const c = cached.current;
        const info = wmoInfo(c.weather_code);
        const hi = formatTemp(cached.daily.temperature_2m_max[0], p.units);
        const lo = formatTemp(cached.daily.temperature_2m_min[0], p.units);

        return {
          state: { icon, iconFullBleed: true },
          variables: {
            temp: formatTemp(c.temperature_2m, p.units),
            feels_like: formatTemp(c.apparent_temperature, p.units),
            condition: info.label,
            humidity: `${Math.round(c.relative_humidity_2m)}%`,
            location: cached.locationName,
            hi, lo,
          },
        };
      },
    });

    // ── Forecast ────────────────────────────────────────────────────────

    ctx.registerStateProvider({
      id: "forecast",
      name: "Weather Forecast",
      description: "Daily forecast for a specific day offset",
      icon: "ms:calendar-today",
      providesIcon: true,
      paramsSchema: forecastParams,
      templateVariables: [
        { key: "day", label: "Day Name", example: "Wed" },
        { key: "hi", label: "High Temp", example: "72°F" },
        { key: "lo", label: "Low Temp", example: "58°F" },
        { key: "condition", label: "Condition", example: "Rainy" },
      ],
      resolve(params) {
        const raw = forecastParams.parse(params);
        const metric = raw.metric ?? pluginConfig.metric;
        const p = {
          location: raw.location || pluginConfig.location || "",
          units: (metric ? "celsius" : "fahrenheit") as "celsius" | "fahrenheit",
          day: raw.day,
        };
        if (!p.location) {
          return {
            state: { icon: "ms:calendar-today", iconColor: "#94a3b8", opacity: 0.3 },
            variables: { day: "--", hi: "--", lo: "--", condition: "No location set" },
          };
        }

        safeGeocode(p.location).then((geo) => {
          if (!geo) return;
          safeFetchWeather(geo, p.units).then((data) => {
            if (data) ctx.state.set("weather", `forecast:${p.location}:${p.day}`, Date.now());
          });
        });

        const cached = weatherCache.get(`${p.location.toLowerCase()},${p.units}`);
        if (!cached) {
          return {
            state: { icon: "ms:calendar-today", iconColor: "#94a3b8", opacity: 0.5 },
            variables: { day: "--", hi: "--", lo: "--", condition: "Loading..." },
          };
        }

        const d = cached.daily;
        const idx = Math.min(p.day, d.time.length - 1);
        const icon = renderForecastDay(144, cached, idx, p.units);
        const info = wmoInfo(d.weather_code[idx]);

        return {
          state: { icon, iconFullBleed: true },
          variables: {
            day: shortDayName(d.time[idx]),
            hi: formatTemp(d.temperature_2m_max[idx], p.units),
            lo: formatTemp(d.temperature_2m_min[idx], p.units),
            condition: info.label,
          },
        };
      },
    });

    // ── Presets ──────────────────────────────────────────────────────────

    ctx.registerPreset({
      id: "current",
      name: "Current Weather",
      description: "Current temperature and conditions",
      category: "Weather",
      icon: "ms:partly-cloudy-day",
      stateProvider: "current",
      defaults: { icon: "ms:partly-cloudy-day", label: "{{temp}}" },
    });

    ctx.registerPreset({
      id: "tomorrow",
      name: "Tomorrow's Forecast",
      description: "Tomorrow's high and low temperatures",
      category: "Weather",
      icon: "ms:calendar-today",
      stateProvider: "forecast",
      defaults: { icon: "ms:calendar-today" },
    });

    ctx.setHealth({ status: "ok" });
  },

  async destroy() {},
};
