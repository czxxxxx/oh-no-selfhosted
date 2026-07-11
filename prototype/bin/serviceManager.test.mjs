import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function serviceFixture(platform) {
  const root = mkdtempSync(join(tmpdir(), `oh-no-service-${platform}-`));
  const homeDir = join(root, "home");
  const packageRoot = join(root, "package");

  mkdirSync(join(packageRoot, "dist"), { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(join(packageRoot, "dist", "index.html"), "<!doctype html>");
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ version: "0.1.2" }));

  return {
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    homeDir,
    packageRoot,
    root,
  };
}

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

  test("setup configures Linux auto-start while start, stop, and restart stay in the background", async () => {
    const fixture = serviceFixture("linux");
    const calls = [];
    const output = [];
    const runCommand = (command, args, options) => {
      calls.push({ args, command, options });
      return { status: 0 };
    };
    const common = {
      env: {},
      homeDir: fixture.homeDir,
      nodePath: "/usr/bin/node",
      packageRoot: fixture.packageRoot,
      platform: "linux",
      runCommand,
      stdout: { write: (message) => output.push(message) },
    };

    try {
      expect(await cliMain({ ...common, argv: ["setup"] })).toBe(0);
      const unitPath = join(fixture.homeDir, ".config", "systemd", "user", "oh-no-selfhosted.service");
      expect(existsSync(unitPath)).toBe(true);
      expect(readFileSync(unitPath, "utf8")).toContain("WantedBy=default.target");
      expect(calls).toEqual([
        { args: ["--user", "daemon-reload"], command: "systemctl", options: undefined },
        { args: ["--user", "enable", "oh-no-selfhosted.service"], command: "systemctl", options: undefined },
      ]);
      expect(calls.flatMap(({ args }) => args)).not.toContain("--now");
      expect(output.join("")).toContain("Run \"oh-no-selfhosted start\" to start it now");

      expect(await cliMain({ ...common, argv: ["start"] })).toBe(0);
      expect(await cliMain({ ...common, argv: ["stop"] })).toBe(0);
      expect(await cliMain({ ...common, argv: ["restart"] })).toBe(0);
      expect(calls.slice(2)).toEqual([
        { args: ["--user", "start", "oh-no-selfhosted.service"], command: "systemctl", options: undefined },
        { args: ["--user", "stop", "oh-no-selfhosted.service"], command: "systemctl", options: undefined },
        { args: ["--user", "restart", "oh-no-selfhosted.service"], command: "systemctl", options: undefined },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  test("setup configures macOS auto-start while start, stop, and restart stay in the background", async () => {
    const fixture = serviceFixture("darwin");
    const calls = [];
    const output = [];
    const runCommand = (command, args, options) => {
      calls.push({ args, command, options });
      return { status: 0 };
    };
    const common = {
      env: {},
      homeDir: fixture.homeDir,
      nodePath: "/usr/local/bin/node",
      packageRoot: fixture.packageRoot,
      platform: "darwin",
      runCommand,
      stdout: { write: (message) => output.push(message) },
    };
    const domain = `gui/${process.getuid?.() ?? ""}`;
    const plistPath = join(fixture.homeDir, "Library", "LaunchAgents", `${DEFAULT_LABEL}.plist`);

    try {
      expect(await cliMain({ ...common, argv: ["setup"] })).toBe(0);
      expect(existsSync(plistPath)).toBe(true);
      expect(calls).toEqual([
        {
          args: ["enable", `${domain}/${DEFAULT_LABEL}`],
          command: "launchctl",
          options: { allowFailure: true, stdio: "pipe" },
        },
      ]);

      expect(await cliMain({ ...common, argv: ["start"] })).toBe(0);
      expect(calls.slice(1)).toEqual([
        {
          args: ["bootstrap", domain, plistPath],
          command: "launchctl",
          options: { allowFailure: true, stdio: "pipe" },
        },
        {
          args: ["kickstart", "-k", `${domain}/${DEFAULT_LABEL}`],
          command: "launchctl",
          options: undefined,
        },
      ]);

      expect(await cliMain({ ...common, argv: ["stop"] })).toBe(0);
      expect(await cliMain({ ...common, argv: ["restart"] })).toBe(0);
      expect(calls.slice(3)).toEqual([
        {
          args: ["bootout", domain, plistPath],
          command: "launchctl",
          options: { allowFailure: true, stdio: "pipe" },
        },
        {
          args: ["bootout", domain, plistPath],
          command: "launchctl",
          options: { allowFailure: true, stdio: "pipe" },
        },
        {
          args: ["bootstrap", domain, plistPath],
          command: "launchctl",
          options: undefined,
        },
        {
          args: ["kickstart", "-k", `${domain}/${DEFAULT_LABEL}`],
          command: "launchctl",
          options: { allowFailure: true, stdio: "pipe" },
        },
      ]);
    } finally {
      fixture.cleanup();
    }
  });

  test("start requires setup and never falls back to a foreground process", async () => {
    const fixture = serviceFixture("linux");
    const errors = [];
    const calls = [];

    try {
      const result = await cliMain({
        argv: ["start"],
        env: {},
        homeDir: fixture.homeDir,
        packageRoot: fixture.packageRoot,
        platform: "linux",
        runCommand: (...args) => calls.push(args),
        stderr: { write: (message) => errors.push(message) },
      });

      expect(result).toBe(1);
      expect(calls).toEqual([]);
      expect(errors.join("")).toContain('Run "oh-no-selfhosted setup" first');
    } finally {
      fixture.cleanup();
    }
  });

  test("updates the global npm package and restarts a running managed service", () => {
    const fixture = serviceFixture("linux");
    const calls = [];
    const output = [];
    const versions = ["0.1.1", "0.1.2"];
    const config = resolveServiceConfig({
      env: {},
      homeDir: fixture.homeDir,
      packageRoot: fixture.packageRoot,
      platform: "linux",
    });
    const unitPath = join(fixture.homeDir, ".config", "systemd", "user", "oh-no-selfhosted.service");
    mkdirSync(join(fixture.homeDir, ".config", "systemd", "user"), { recursive: true });
    writeFileSync(unitPath, "[Service]\n");

    try {
      const result = updatePackage(config, {
        readVersion: () => versions.shift(),
        runCommand(command, args, options) {
          calls.push({ args, command, options });
          return { status: 0 };
        },
        stdout: { write: (message) => output.push(message) },
      });

      expect(result).toEqual({
        currentVersion: "0.1.2",
        previousVersion: "0.1.1",
        restarted: true,
      });
      expect(calls).toEqual([
        {
          args: ["--user", "status", "oh-no-selfhosted.service", "--no-pager"],
          command: "systemctl",
          options: { allowFailure: true, stdio: "pipe" },
        },
        {
          args: ["install", "--global", "oh-no-selfhosted@latest"],
          command: "npm",
          options: undefined,
        },
        {
          args: ["--user", "restart", "oh-no-selfhosted.service"],
          command: "systemctl",
          options: undefined,
        },
      ]);
      expect(output.join("")).toContain("Updated oh-no-selfhosted from 0.1.1 to 0.1.2.");
    } finally {
      fixture.cleanup();
    }
  });

  test("updates without starting a stopped managed service", () => {
    const calls = [];
    const output = [];
    const versions = ["0.1.1", "0.1.2"];

    const result = updatePackage({
      homeDir: "/home/alice",
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
    const versions = ["0.1.2", "0.1.2"];

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
    expect(output.join("")).toContain("already up to date at 0.1.2");
    expect(output.join("")).toContain("--no-restart");

    const help = [];
    await cliMain({ argv: ["--help"], stdout: { write: (message) => help.push(message) } });
    expect(help.join("")).toContain("oh-no-selfhosted update [--no-restart] [--label NAME]");
    expect(help.join("")).toContain("oh-no-selfhosted setup");
    expect(help.join("")).toContain("oh-no-selfhosted stop");
    expect(help.join("")).toContain("oh-no-selfhosted remove");
    expect(help.join("")).not.toContain("oh-no-selfhosted install");
    expect(help.join("")).not.toContain("oh-no-selfhosted uninstall");
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
