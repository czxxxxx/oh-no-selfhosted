import { spawn } from "node:child_process";

const apiPort = process.env.API_PORT || "8787";
const apiTarget = `http://127.0.0.1:${apiPort}`;
const viteArgs = ["vite", ...process.argv.slice(2)];

if (!viteArgs.some((argument) => argument === "--host" || argument.startsWith("--host="))) {
  viteArgs.push("--host", process.env.HOST || "127.0.0.1");
}

const children = [
  spawn(
    process.execPath,
    [
      "--no-warnings=ExperimentalWarning",
      "server/index.mjs",
      "--serve-static",
      "false",
      "--host",
      "127.0.0.1",
      "--port",
      apiPort,
    ],
    { stdio: "inherit" },
  ),
  spawn("npx", viteArgs, {
    env: {
      ...process.env,
      VITE_API_TARGET: apiTarget,
    },
    stdio: "inherit",
  }),
];

let isShuttingDown = false;

function shutdown(code = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!isShuttingDown && code && code !== 0) {
      shutdown(code);
    }
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}
