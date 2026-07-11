import { describe, expect, test } from "vitest";
import { normalizeWeatherSnapshot, readWeatherSnapshot } from "./weather.mjs";

describe("Weather integration", () => {
  test("normalizes Open-Meteo current and daily weather data", () => {
    expect(
      normalizeWeatherSnapshot({
        forecast: {
          current: {
            apparent_temperature: 30.9,
            is_day: 0,
            relative_humidity_2m: 84,
            temperature_2m: 26.7,
            time: "2026-07-05T22:30",
            weather_code: 3,
            wind_speed_10m: 11.1,
          },
          current_units: {
            apparent_temperature: "°C",
            relative_humidity_2m: "%",
            temperature_2m: "°C",
            wind_speed_10m: "km/h",
          },
          daily: {
            temperature_2m_max: [30.2],
            temperature_2m_min: [24.2],
          },
          timezone: "Asia/Shanghai",
        },
        location: {
          admin1: "Shanghai Municipality",
          country: "China",
          latitude: 31.22222,
          longitude: 121.45806,
          name: "Shanghai",
          timezone: "Asia/Shanghai",
        },
      }),
    ).toMatchObject({
      available: true,
      condition: "Overcast",
      high: 30.2,
      humidity: 84,
      isDay: false,
      location: {
        country: "China",
        label: "Shanghai, Shanghai Municipality, China",
        latitude: 31.22222,
        longitude: 121.45806,
        name: "Shanghai",
      },
      low: 24.2,
      source: "open-meteo",
      temperature: 26.7,
      units: {
        temperature: "°C",
        windSpeed: "km/h",
      },
      windSpeed: 11.1,
    });
  });

  test("geocodes a configured location and fetches current weather", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));

      if (String(url).startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        return Response.json({
          results: [
            {
              admin1: "Shanghai Municipality",
              country: "China",
              latitude: 31.22222,
              longitude: 121.45806,
              name: "Shanghai",
              timezone: "Asia/Shanghai",
            },
          ],
        });
      }

      return Response.json({
        current: {
          apparent_temperature: 30.9,
          is_day: 0,
          relative_humidity_2m: 84,
          temperature_2m: 26.7,
          time: "2026-07-05T22:30",
          weather_code: 3,
          wind_speed_10m: 11.1,
        },
        current_units: {
          apparent_temperature: "°C",
          relative_humidity_2m: "%",
          temperature_2m: "°C",
          wind_speed_10m: "km/h",
        },
        daily: {
          temperature_2m_max: [30.2],
          temperature_2m_min: [24.2],
        },
        timezone: "Asia/Shanghai",
      });
    };

    const snapshot = await readWeatherSnapshot({ config: { location: "Shanghai" }, fetchImpl });

    expect(calls[0]).toContain("name=Shanghai");
    expect(calls[1]).toContain("latitude=31.22222");
    expect(calls[1]).toContain("current=temperature_2m%2Crelative_humidity_2m");
    expect(snapshot).toMatchObject({
      available: true,
      condition: "Overcast",
      location: { label: "Shanghai, Shanghai Municipality, China" },
      temperature: 26.7,
    });
  });

  test("caches successful weather snapshots for one hour by location", async () => {
    const calls = [];
    let forecastCount = 0;
    const fetchImpl = async (url) => {
      const requestUrl = String(url);
      calls.push(requestUrl);

      if (requestUrl.startsWith("https://geocoding-api.open-meteo.com/v1/search")) {
        const name = new URL(requestUrl).searchParams.get("name") || "Configured location";

        return Response.json({
          results: [
            {
              admin1: name === "Beijing" ? "Beijing Municipality" : "Shanghai Municipality",
              country: "China",
              latitude: name === "Beijing" ? 39.9042 : 31.22222,
              longitude: name === "Beijing" ? 116.4074 : 121.45806,
              name,
              timezone: "Asia/Shanghai",
            },
          ],
        });
      }

      forecastCount += 1;

      return Response.json({
        current: {
          apparent_temperature: 30.9,
          is_day: 1,
          relative_humidity_2m: 84,
          temperature_2m: 20 + forecastCount,
          time: "2026-07-05T22:30",
          weather_code: 3,
          wind_speed_10m: 11.1,
        },
        current_units: {
          apparent_temperature: "°C",
          relative_humidity_2m: "%",
          temperature_2m: "°C",
          wind_speed_10m: "km/h",
        },
        daily: {
          temperature_2m_max: [30.2],
          temperature_2m_min: [24.2],
        },
        timezone: "Asia/Shanghai",
      });
    };

    const first = await readWeatherSnapshot({
      config: { location: "Shanghai" },
      fetchImpl,
      now: new Date("2026-07-05T00:00:00.000Z"),
    });
    const cached = await readWeatherSnapshot({
      config: { location: " shanghai " },
      fetchImpl,
      now: new Date("2026-07-05T00:59:59.000Z"),
    });
    const differentLocation = await readWeatherSnapshot({
      config: { location: "Beijing" },
      fetchImpl,
      now: new Date("2026-07-05T00:30:00.000Z"),
    });
    const refreshed = await readWeatherSnapshot({
      config: { location: "Shanghai" },
      fetchImpl,
      now: new Date("2026-07-05T01:00:01.000Z"),
    });

    expect(first.temperature).toBe(21);
    expect(cached.temperature).toBe(21);
    expect(differentLocation.temperature).toBe(22);
    expect(refreshed.temperature).toBe(23);
    expect(calls).toHaveLength(6);
  });

  test("returns a missing state when no location is configured", async () => {
    await expect(readWeatherSnapshot({ config: {}, fetchImpl: async () => Response.json({}) })).resolves.toMatchObject({
      available: false,
      errorMessage: "Set a weather location first.",
      source: "open-meteo",
    });
  });
});
