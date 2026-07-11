import { readWeatherSnapshot } from "./weather.mjs";

export async function readState(config, context) {
  return readWeatherSnapshot({
    config,
    fetchImpl: context.fetch,
  });
}
