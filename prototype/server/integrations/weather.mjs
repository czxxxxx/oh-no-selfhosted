const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const CURRENT_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "is_day",
  "weather_code",
  "wind_speed_10m",
];
const DAILY_VARIABLES = ["temperature_2m_max", "temperature_2m_min"];
const WEATHER_CACHE_TTL_MS = 60 * 60 * 1000;
const weatherSnapshotCache = new Map();
const fetchImplCacheIds = new WeakMap();
let nextFetchImplCacheId = 1;

const WEATHER_CODE_LABELS = new Map([
  [0, "Clear sky"],
  [1, "Mainly clear"],
  [2, "Partly cloudy"],
  [3, "Overcast"],
  [45, "Fog"],
  [48, "Depositing rime fog"],
  [51, "Light drizzle"],
  [53, "Moderate drizzle"],
  [55, "Dense drizzle"],
  [56, "Light freezing drizzle"],
  [57, "Dense freezing drizzle"],
  [61, "Slight rain"],
  [63, "Moderate rain"],
  [65, "Heavy rain"],
  [66, "Light freezing rain"],
  [67, "Heavy freezing rain"],
  [71, "Slight snow fall"],
  [73, "Moderate snow fall"],
  [75, "Heavy snow fall"],
  [77, "Snow grains"],
  [80, "Slight rain showers"],
  [81, "Moderate rain showers"],
  [82, "Violent rain showers"],
  [85, "Slight snow showers"],
  [86, "Heavy snow showers"],
  [95, "Thunderstorm"],
  [96, "Thunderstorm with slight hail"],
  [99, "Thunderstorm with heavy hail"],
]);

function finiteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function nowDate(now) {
  const date = now instanceof Date ? now : new Date(now);

  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function roundOne(value) {
  const number = finiteNumber(value);

  return number === null ? null : Math.round(number * 10) / 10;
}

function fetchImplCacheId(fetchImpl) {
  if ((typeof fetchImpl !== "function" && typeof fetchImpl !== "object") || fetchImpl === null) {
    return String(fetchImpl);
  }

  const existingId = fetchImplCacheIds.get(fetchImpl);

  if (existingId) {
    return existingId;
  }

  const nextId = nextFetchImplCacheId;
  nextFetchImplCacheId += 1;
  fetchImplCacheIds.set(fetchImpl, nextId);

  return nextId;
}

function normalizeCachePart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function weatherLocationCacheKey({ hasCoordinates, latitude, locationQuery, longitude }) {
  const normalizedLocation = normalizeCachePart(locationQuery);

  if (hasCoordinates) {
    return `coords:${latitude}:${longitude}:name:${normalizedLocation}`;
  }

  return `name:${normalizedLocation}`;
}

function weatherCacheKey({ fetchImpl, hasCoordinates, latitude, locationQuery, longitude }) {
  return `${weatherLocationCacheKey({ hasCoordinates, latitude, locationQuery, longitude })}:fetch:${fetchImplCacheId(fetchImpl)}`;
}

function cloneWeatherSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function cachedWeatherSnapshot(cacheKey, timestamp) {
  const cached = weatherSnapshotCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  const age = timestamp.getTime() - cached.cachedAt;

  if (age >= 0 && age < WEATHER_CACHE_TTL_MS) {
    return cloneWeatherSnapshot(cached.snapshot);
  }

  weatherSnapshotCache.delete(cacheKey);

  return null;
}

function cacheWeatherSnapshot(cacheKey, timestamp, snapshot) {
  weatherSnapshotCache.set(cacheKey, {
    cachedAt: timestamp.getTime(),
    snapshot: cloneWeatherSnapshot(snapshot),
  });

  return snapshot;
}

function weatherCodeLabel(code) {
  return WEATHER_CODE_LABELS.get(Number(code)) || "Unknown";
}

function dedupeLocationParts(parts) {
  const seen = new Set();

  return parts.filter((part) => {
    const normalized = String(part || "").trim();
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function locationLabel(location) {
  return dedupeLocationParts([location?.name, location?.admin1, location?.country]).join(", ");
}

function unavailable(errorMessage) {
  return {
    available: false,
    errorMessage,
    source: "open-meteo",
  };
}

async function readJson(response, errorMessage) {
  if (!response.ok) {
    throw new Error(errorMessage);
  }

  return response.json();
}

async function geocodeLocation(locationQuery, fetchImpl) {
  const params = new URLSearchParams({
    count: "1",
    format: "json",
    language: "en",
    name: locationQuery,
  });
  const payload = await readJson(await fetchImpl(`${GEOCODING_URL}?${params}`), "Unable to geocode weather location");
  const [location] = Array.isArray(payload?.results) ? payload.results : [];

  return location || null;
}

async function fetchForecast(location, fetchImpl) {
  const params = new URLSearchParams({
    current: CURRENT_VARIABLES.join(","),
    daily: DAILY_VARIABLES.join(","),
    forecast_days: "1",
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: "auto",
  });

  return readJson(await fetchImpl(`${FORECAST_URL}?${params}`), "Unable to fetch Open-Meteo forecast");
}

export function normalizeWeatherSnapshot({ forecast, location, now = new Date() }) {
  const current = forecast?.current || {};
  const currentUnits = forecast?.current_units || {};
  const daily = forecast?.daily || {};
  const normalizedLocation = {
    admin1: location?.admin1 || "",
    country: location?.country || "",
    label: locationLabel(location) || location?.name || "Configured location",
    latitude: finiteNumber(location?.latitude),
    longitude: finiteNumber(location?.longitude),
    name: location?.name || locationLabel(location) || "Configured location",
    timezone: forecast?.timezone || location?.timezone || "",
  };

  return {
    available: true,
    condition: weatherCodeLabel(current.weather_code),
    feelsLike: roundOne(current.apparent_temperature),
    high: roundOne(daily.temperature_2m_max?.[0]),
    humidity: roundOne(current.relative_humidity_2m),
    isDay: Number(current.is_day) === 1,
    location: normalizedLocation,
    low: roundOne(daily.temperature_2m_min?.[0]),
    observedAt: current.time || null,
    refreshedAt: nowDate(now).toISOString(),
    source: "open-meteo",
    temperature: roundOne(current.temperature_2m),
    timezone: forecast?.timezone || location?.timezone || "",
    units: {
      apparentTemperature: currentUnits.apparent_temperature || currentUnits.temperature_2m || "°C",
      humidity: currentUnits.relative_humidity_2m || "%",
      temperature: currentUnits.temperature_2m || "°C",
      windSpeed: currentUnits.wind_speed_10m || "km/h",
    },
    windSpeed: roundOne(current.wind_speed_10m),
  };
}

export async function readWeatherSnapshot({ config = {}, fetchImpl = fetch, now = new Date() } = {}) {
  const locationQuery = String(config.location || "").trim();
  const configuredLatitude = finiteNumber(config.latitude);
  const configuredLongitude = finiteNumber(config.longitude);
  const hasCoordinates = configuredLatitude !== null && configuredLongitude !== null;
  const timestamp = nowDate(now);

  if (!locationQuery && !hasCoordinates) {
    return unavailable("Set a weather location first.");
  }

  const cacheKey = weatherCacheKey({
    fetchImpl,
    hasCoordinates,
    latitude: configuredLatitude,
    locationQuery,
    longitude: configuredLongitude,
  });
  const cached = cachedWeatherSnapshot(cacheKey, timestamp);

  if (cached) {
    return cached;
  }

  try {
    const location = hasCoordinates
      ? {
          admin1: config.admin1 || "",
          country: config.country || "",
          latitude: configuredLatitude,
          longitude: configuredLongitude,
          name: locationQuery || config.name || "Configured location",
          timezone: config.timezone || "",
        }
      : await geocodeLocation(locationQuery, fetchImpl);

    if (!location) {
      return unavailable(`No weather location matched "${locationQuery}".`);
    }

    const forecast = await fetchForecast(location, fetchImpl);

    return cacheWeatherSnapshot(cacheKey, timestamp, normalizeWeatherSnapshot({ forecast, location, now: timestamp }));
  } catch (error) {
    return unavailable(error?.message || "Unable to read weather data.");
  }
}
