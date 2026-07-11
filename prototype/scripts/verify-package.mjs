import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed\n${output}`);
  }

  return result;
}

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitFor(url, timeoutMs = 15_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // The packaged server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "oh-no-package-check-"));
let serverProcess;

try {
  run("npm", ["run", "build"]);
  const packResult = run("npm", [
    "pack",
    "--ignore-scripts",
    "--json",
    "--silent",
    "--pack-destination",
    temporaryRoot,
  ]);
  const packPayload = JSON.parse(packResult.stdout);
  const packEntries = Array.isArray(packPayload)
    ? packPayload
    : Object.values(packPayload);
  const [{ filename } = {}] = packEntries;

  if (!filename) {
    throw new Error("npm pack did not return a package filename");
  }
  const tarballPath = join(temporaryRoot, filename);
  const installRoot = join(temporaryRoot, "install");

  run("npm", [
    "install",
    "--global",
    "--prefix",
    installRoot,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    tarballPath,
  ]);

  const packageRoot = process.platform === "win32"
    ? join(installRoot, "node_modules", "oh-no-selfhosted")
    : join(installRoot, "lib", "node_modules", "oh-no-selfhosted");
  const cliPath = process.platform === "win32"
    ? join(installRoot, "oh-no-selfhosted.cmd")
    : join(installRoot, "bin", "oh-no-selfhosted");
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const license = await readFile(join(packageRoot, "LICENSE"), "utf8");
  const cliHelp = run(cliPath, ["--help"]).stdout;
  const port = await availablePort();

  if (packageJson.license !== "Apache-2.0" || !license.includes("Apache License")) {
    throw new Error("Packaged artifact does not include the declared Apache-2.0 license");
  }

  if (!cliHelp.includes("oh-no-selfhosted update")) {
    throw new Error("Global package install did not expose the update command");
  }

  if (
    !cliHelp.includes("oh-no-selfhosted setup") ||
    !cliHelp.includes("oh-no-selfhosted start") ||
    !cliHelp.includes("oh-no-selfhosted stop") ||
    !cliHelp.includes("oh-no-selfhosted remove")
  ) {
    throw new Error("Global package install did not expose the background service lifecycle commands");
  }

  if (cliHelp.includes("oh-no-selfhosted install") || cliHelp.includes("oh-no-selfhosted uninstall")) {
    throw new Error("Global package install still exposes removed legacy lifecycle commands");
  }

  serverProcess = spawn(
    process.execPath,
    [
      join(packageRoot, "server", "index.mjs"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--data-dir",
      join(temporaryRoot, "data"),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let serverOutput = "";
  serverProcess.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });
  serverProcess.stderr.on("data", (chunk) => {
    serverOutput += chunk;
  });

  const apiResponse = await waitFor(`http://127.0.0.1:${port}/api/services`).catch((error) => {
    throw new Error(`${error.message}\n${serverOutput}`);
  });
  const rootResponse = await waitFor(`http://127.0.0.1:${port}/`);
  const crossOriginResponse = await fetch(`http://127.0.0.1:${port}/api/services`, {
    headers: { origin: "https://untrusted.example" },
  });
  const payload = await apiResponse.json();

  if (!Array.isArray(payload.services)) {
    throw new Error("Packaged API returned an invalid services payload");
  }

  if (!(await rootResponse.text()).includes("<div id=\"root\"></div>")) {
    throw new Error("Packaged frontend did not return the application shell");
  }

  if (crossOriginResponse.status !== 403) {
    throw new Error("Packaged API did not reject a cross-origin request");
  }

  if (
    rootResponse.headers.get("x-content-type-options") !== "nosniff" ||
    rootResponse.headers.get("x-frame-options") !== "DENY" ||
    !rootResponse.headers.get("content-security-policy")?.includes("frame-ancestors 'none'")
  ) {
    throw new Error("Packaged frontend did not return the expected security headers");
  }

  console.log(`Verified ${packageJson.name}@${packageJson.version} from ${filename}`);
} finally {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }
  await rm(temporaryRoot, { force: true, recursive: true });
}
