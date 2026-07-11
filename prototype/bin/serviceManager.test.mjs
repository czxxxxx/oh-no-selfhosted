import { describe, expect, test } from "vitest";
import {
  DEFAULT_LABEL,
  buildServerArgs,
  cliMain,
  defaultDataDir,
  defaultLogDir,
  removePackage,
  renderLaunchAgentPlist,
  renderSystemdUnit,
  resolveServiceConfig,
  updatePackage,
} from "./serviceManager.mjs";

describe("oh-no-selfhosted service manager", () => {
  test("resolves default production service config for an installed npm package", () => {
    const config = resolveServiceConfig({
      argv: [],
      env: {},
      homeDir: "/Users/alice",
      nodePath: "/usr/local/bin/node",
      packageRoot: "/usr/local/lib/node_modules/oh-no-selfhosted",
      platform: "darwin",
    });

    expect(config).toMatchObject({
      dataDir: "/Users/alice/Library/Application Support/oh-no-selfhosted",
      host: "127.0.0.1",
      label: DEFAULT_LABEL,
      logDir: "/Users/alice/Library/Logs/oh-no-selfhosted",
      nodePath: "/usr/local/bin/node",
      packageRoot: "/usr/local/lib/node_modules/oh-no-selfhosted",
      port: "8787",
      serverEntry: "/usr/local/lib/node_modules/oh-no-selfhosted/server/index.mjs",
    });
  });

  test("lets command-line options override host, port, label, data directory, and log directory", () => {
    const config = resolveServiceConfig({
      argv: [
        "--host",
        "127.0.0.1",
        "--port=9000",
        "--label",
        "dev.local.oh-no-selfhosted",
        "--data-dir",
        "/tmp/oh-no-data",
        "--log-dir=/tmp/oh-no-logs",
      ],
      env: {},
      homeDir: "/Users/alice",
      nodePath: "/usr/local/bin/node",
      packageRoot: "/pkg",
      platform: "darwin",
    });

    expect(config).toMatchObject({
      dataDir: "/tmp/oh-no-data",
      host: "127.0.0.1",
      label: "dev.local.oh-no-selfhosted",
      logDir: "/tmp/oh-no-logs",
      port: "9000",
    });
  });

  test("uses platform-specific data and log directories", () => {
    expect(defaultDataDir({ homeDir: "/home/alice", platform: "linux" })).toBe(
      "/home/alice/.local/share/oh-no-selfhosted",
    );
    expect(defaultLogDir({ homeDir: "/home/alice", platform: "linux" })).toBe(
      "/home/alice/.local/state/oh-no-selfhosted/logs",
    );
    expect(defaultDataDir({ homeDir: "C:\\Users\\Alice", platform: "win32" })).toBe(
      "C:\\Users\\Alice\\AppData\\Roaming\\oh-no-selfhosted",
    );
  });

  test("builds node server arguments for the production static server", () => {
    const args = buildServerArgs({
      dataDir: "/var/lib/oh-no-selfhosted",
      host: "0.0.0.0",
      nodePath: "/opt/node/bin/node",
      port: "8787",
      serverEntry: "/pkg/server/index.mjs",
    });

    expect(args).toEqual([
      "/opt/node/bin/node",
      "--no-warnings=ExperimentalWarning",
      "/pkg/server/index.mjs",
      "--host",
      "0.0.0.0",
      "--port",
      "8787",
      "--data-dir",
      "/var/lib/oh-no-selfhosted",
    ]);
  });

  test("renders a macOS LaunchAgent that runs the packaged production server", () => {
    const config = resolveServiceConfig({
      argv: [],
      env: {},
      homeDir: "/Users/alice",
      nodePath: "/usr/local/bin/node",
      packageRoot: "/pkg",
      platform: "darwin",
    });

    const plist = renderLaunchAgentPlist(config);

    expect(plist).toContain("<string>com.oh-no-selfhosted</string>");
    expect(plist).toContain("<string>/usr/local/bin/node</string>");
    expect(plist).toContain("<string>/pkg/server/index.mjs</string>");
    expect(plist).toContain("<string>/Users/alice/Library/Application Support/oh-no-selfhosted</string>");
    expect(plist).toContain("<key>NODE_ENV</key>");
    expect(plist).toContain("<string>production</string>");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain("<true/>");
  });

  test("renders a Linux user systemd service that runs the packaged production server", () => {
    const config = resolveServiceConfig({
      argv: ["--port", "9000"],
      env: {},
      homeDir: "/home/alice",
      nodePath: "/usr/bin/node",
      packageRoot: "/pkg",
      platform: "linux",
    });

    const unit = renderSystemdUnit(config);

    expect(unit).toContain("Description=Oh No Selfhosted");
    expect(unit).toContain("Environment=NODE_ENV=production");
    expect(unit).toContain("Environment=DATA_DIR=/home/alice/.local/share/oh-no-selfhosted");
    expect(unit).toContain("UMask=0077");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(unit).toContain("ProtectSystem=strict");
    expect(unit).toContain("ReadWritePaths=/home/alice/.local/share/oh-no-selfhosted");
    expect(unit).toContain("ExecStart=/usr/bin/node --no-warnings=ExperimentalWarning /pkg/server/index.mjs --host 127.0.0.1 --port 9000 --data-dir /home/alice/.local/share/oh-no-selfhosted");
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("WantedBy=default.target");
  });

  test("updates the global npm package and restarts a running managed service", () => {
    const calls = [];
    const output = [];
    const versions = ["0.1.0", "0.1.1"];
    const config = {
      label: DEFAULT_LABEL,
      packageRoot: "/usr/local/lib/node_modules/oh-no-selfhosted",
      platform: "darwin",
    };

    const result = updatePackage(config, {
      readVersion: () => versions.shift(),
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        return { status: 0 };
      },
      stdout: { write: (message) => output.push(message) },
    });

    expect(result).toEqual({
      currentVersion: "0.1.1",
      previousVersion: "0.1.0",
      restarted: true,
    });
    expect(calls).toEqual([
      {
        args: ["print", `gui/${process.getuid?.() ?? ""}/${DEFAULT_LABEL}`],
        command: "launchctl",
        options: { allowFailure: true, stdio: "pipe" },
      },
      {
        args: ["install", "--global", "oh-no-selfhosted@latest"],
        command: "npm",
        options: undefined,
      },
      {
        args: ["kickstart", "-k", `gui/${process.getuid?.() ?? ""}/${DEFAULT_LABEL}`],
        command: "launchctl",
        options: undefined,
      },
    ]);
    expect(output.join("")).toContain("Updated oh-no-selfhosted from 0.1.0 to 0.1.1.");
    expect(output.join("")).toContain(`Restarted ${DEFAULT_LABEL}.`);
  });

  test("updates without starting a stopped managed service", () => {
    const calls = [];
    const output = [];
    const versions = ["0.1.0", "0.1.1"];

    const result = updatePackage({
      label: DEFAULT_LABEL,
      packageRoot: "/usr/lib/node_modules/oh-no-selfhosted",
      platform: "linux",
    }, {
      readVersion: () => versions.shift(),
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        return { status: command === "systemctl" ? 3 : 0 };
      },
      stdout: { write: (message) => output.push(message) },
    });

    expect(result.restarted).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      args: ["--user", "status", "oh-no-selfhosted.service", "--no-pager"],
      command: "systemctl",
    });
    expect(calls[1]).toMatchObject({
      args: ["install", "--global", "oh-no-selfhosted@latest"],
      command: "npm",
    });
    expect(output.join("")).toContain("without starting one");
  });

  test("supports package-only updates and documents the update command", async () => {
    const calls = [];
    const output = [];
    const versions = ["0.1.1", "0.1.1"];

    const exitCode = await cliMain({
      argv: ["update", "--no-restart"],
      env: {},
      homeDir: "/Users/alice",
      packageRoot: "/usr/local/lib/node_modules/oh-no-selfhosted",
      platform: "darwin",
      readVersion: () => versions.shift(),
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        return { status: 0 };
      },
      stdout: { write: (message) => output.push(message) },
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      {
        args: ["install", "--global", "oh-no-selfhosted@latest"],
        command: "npm",
        options: undefined,
      },
    ]);
    expect(output.join("")).toContain("already up to date at 0.1.1");
    expect(output.join("")).toContain("--no-restart");

    const help = [];
    await cliMain({ argv: ["--help"], stdout: { write: (message) => help.push(message) } });
    expect(help.join("")).toContain("oh-no-selfhosted update [--no-restart] [--label NAME]");
    expect(help.join("")).toContain("oh-no-selfhosted setup");
    expect(help.join("")).toContain("oh-no-selfhosted remove");
  });

  test("removes the managed service and global package while keeping user data", () => {
    const calls = [];
    const output = [];
    const config = {
      label: DEFAULT_LABEL,
      packageRoot: "/usr/lib/node_modules/oh-no-selfhosted",
      platform: "linux",
    };

    removePackage(config, {
      removeService(serviceConfig, runCommand) {
        calls.push({ command: "remove-service", serviceConfig });
        expect(runCommand).toBeTypeOf("function");
      },
      runCommand(command, args, options) {
        calls.push({ args, command, options });
        return { status: 0 };
      },
      stdout: { write: (message) => output.push(message) },
    });

    expect(calls).toEqual([
      { command: "remove-service", serviceConfig: config },
      {
        args: ["uninstall", "--global", "oh-no-selfhosted"],
        command: "npm",
        options: undefined,
      },
    ]);
    expect(output.join("")).toContain("user data was not removed");
  });
});
