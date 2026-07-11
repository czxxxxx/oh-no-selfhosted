import { readCodexUsageSnapshot } from "../../codexUsage.mjs";

export async function readState(_config, context) {
  return readCodexUsageSnapshot({
    authPath: context.codexAuthPath,
    fetchImpl: context.fetch,
  });
}
