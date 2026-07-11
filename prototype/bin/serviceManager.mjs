import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_LABEL = "com.oh-no-selfhosted";
export const PACKAGE_NAME = "oh-no-selfhosted";

const DARWIN_DOMAIN = () => `gui/${process.getuid?.() ?? ""}`;

function packageRootFromImportMeta() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function platformJoin(platform, ...parts) {
  if (platform === "win32") {
    return parts.filter(Boolean).join("\\");
  }

  return parts.filter(Boolean).join("/");
}

function readOption(argv, name, fallback) {
  const prefix = `--${name}=`;
  const inline = argv.find((argument) => argument.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = argv.indexOf(`--${name}`);

  if (index !== -1) {
    return argv[index + 1] || fallback;
  }

  return fallback;
}

function flagEnabled(argv, name) {
  return argv.includes(`--${name}`);
}

export function defaultDataDir({ env = {}, homeDir = homedir(), platform = process.platform } = {}) {
  if (env.OH_NO_SELFHOSTED_DATA_DIR) {
    return env.OH_NO_SELFHOSTED_DATA_DIR;
  }

  if (env.DATA_DIR) {
    return env.DATA_DIR;
  }

  if (platform === "darwin") {
    return platformJoin(platform, homeDir, "Library", "Application Support", PACKAGE_NAME);
  }

  if (platform === "win32") {
    return platformJoin(platform, env.APPDATA || platformJoin(platform, homeDir, "AppData", "Roaming"), PACKAGE_NAME);
  }

  return platformJoin(platform, env.XDG_DATA_HOME || platformJoin(platform, homeDir, ".local", "share"), PACKAGE_NAME);
}

export function defaultLogDir({ env = {}, homeDir = homedir(), platform = process.platform } = {}) {
  if (env.OH_NO_SELFHOSTED_LOG_DIR) {
    return env.OH_NO_SELFHOSTED_LOG_DIR;
  }

  if (platform === "darwin") {
    return platformJoin(platform, homeDir, "Library", "Logs", PACKAGE_NAME);
  }

  if (platform === "win32") {
    return platformJoin(platform, env.LOCALAPPDATA || platformJoin(platform, homeDir, "AppData", "Local"), PACKAGE_NAME, "logs");
  }

  return platformJoin(platform, env.XDG_STATE_HOME || platformJoin(platform, homeDir, ".local", "state"), PACKAGE_NAME, "logs");
}

export function resolveServiceConfig({
  argv = [],
  env = process.env,
  homeDir = homedir(),
  nodePath = process.execPath,
  packageRoot = packageRootFromImportMeta(),
  platform = process.platform,
} = {}) {
  const host = readOption(argv, "host", env.HOST || "127.0.0.1");
  const port = String(readOption(argv, "port", env.PORT || "8787"));
  const allowUnsafePlugins = flagEnabled(argv, "allow-unsafe-plugins") || env.ALLOW_UNSAFE_PLUGINS === "true";
  const label = readOption(argv, "label", env.OH_NO_SELFHOSTED_LABEL || DEFAULT_LABEL);
  const dataDir = resolve(readOption(argv, "data-dir", defaultDataDir({ env, homeDir, platform })));
  const logDir = resolve(readOption(argv, "log-dir", defaultLogDir({ env, homeDir, platform })));

  return {
    allowUnsafePlugins,
    dataDir,
    host,
    label,
    logDir,
    nodePath,
    packageRoot: resolve(packageRoot),
    platform,
    port,
    serverEntry: join(resolve(packageRoot), "server", "index.mjs"),
  };
}

export function buildServerArgs(config) {
  const args = [
    config.nodePath,
    "--no-warnings=ExperimentalWarning",
    config.serverEntry,
    "--host",
    config.host,
    "--port",
    String(config.port),
    "--data-dir",
    config.dataDir,
  ];

  if (config.allowUnsafePlugins) {
    args.push("--allow-unsafe-plugins", "true");
  }

  return args;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plistString(value) {
  return `    <string>${xmlEscape(value)}</string>`;
}

export function renderLaunchAgentPlist(config) {
  const serverArgs = buildServerArgs(config);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(config.label)}</string>

  <key>ProgramArguments</key>
  <array>
${serverArgs.map(plistString).join("\n")}
  </array>

  <key>WorkingDirectory</key>
  <string>${xmlEscape(config.packageRoot)}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>DATA_DIR</key>
    <string>${xmlEscape(config.dataDir)}</string>
    <key>SERVE_STATIC</key>
    <string>true</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${xmlEscape(join(config.logDir, "server.out.log"))}</string>

  <key>StandardErrorPath</key>
  <string>${xmlEscape(join(config.logDir, "server.err.log"))}</string>
</dict>
</plist>
`;
}

function systemdValue(value) {
  const text = String(value);

  if (/[\s"'\\]/.test(text)) {
    return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }

  return text;
}

export function renderSystemdUnit(config) {
  const execStart = buildServerArgs(config).map(systemdValue).join(" ");

  return `[Unit]
Description=Oh No Selfhosted
After=network-online.target

[Service]
Type=simple
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
WorkingDirectory=${systemdValue(config.packageRoot)}
Environment=NODE_ENV=production
Environment=DATA_DIR=${systemdValue(config.dataDir)}
Environment=SERVE_STATIC=true
ReadWritePaths=${systemdValue(config.dataDir)}
ExecStart=${execStart}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function run(command, args, { allowFailure = false, stdio = "inherit" } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio,
  });

  if (result.error && !allowFailure) {
    throw result.error;
  }

  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }

  return result;
}

function serviceFileName(config) {
  if (config.label === DEFAULT_LABEL) {
    return PACKAGE_NAME;
  }

  return basename(config.label).replace(/[^a-zA-Z0-9_.-]/g, "-");
}

function darwinPlistPath(config) {
  return join(homedir(), "Library", "LaunchAgents", `${config.label}.plist`);
}

function linuxUnitName(config) {
  return `${serviceFileName(config)}.service`;
}

function linuxUnitPath(config) {
  return join(homedir(), ".config", "systemd", "user", linuxUnitName(config));
}

function assertPackagedAssets(config) {
  const indexPath = join(config.packageRoot, "dist", "index.html");

  if (!existsSync(indexPath)) {
    throw new Error(
      `Missing production assets at ${indexPath}. Run "npm run build" before packing or installing this package.`,
    );
  }
}

function ensurePrivateDirectory(path, platform = process.platform) {
  mkdirSync(path, { mode: 0o700, recursive: true });
  if (platform !== "win32") {
    chmodSync(path, 0o700);
  }
}

function installDarwin(config) {
  assertPackagedAssets(config);
  mkdirSync(dirname(darwinPlistPath(config)), { recursive: true });
  ensurePrivateDirectory(config.dataDir, config.platform);
  ensurePrivateDirectory(config.logDir, config.platform);
  writeFileSync(darwinPlistPath(config), renderLaunchAgentPlist(config));

  const domain = DARWIN_DOMAIN();
  run("launchctl", ["bootout", domain, darwinPlistPath(config)], { allowFailure: true, stdio: "pipe" });
  run("launchctl", ["enable", `${domain}/${config.label}`], { allowFailure: true, stdio: "pipe" });
  run("launchctl", ["bootstrap", domain, darwinPlistPath(config)]);
  run("launchctl", ["kickstart", "-k", `${domain}/${config.label}`], { allowFailure: true, stdio: "pipe" });
}

function uninstallDarwin(config) {
  const domain = DARWIN_DOMAIN();

  run("launchctl", ["bootout", domain, darwinPlistPath(config)], { allowFailure: true, stdio: "pipe" });
  run("launchctl", ["disable", `${domain}/${config.label}`], { allowFailure: true, stdio: "pipe" });
  rmSync(darwinPlistPath(config), { force: true });
}

function restartDarwin(config, runCommand = run) {
  runCommand("launchctl", ["kickstart", "-k", `${DARWIN_DOMAIN()}/${config.label}`]);
}

function statusDarwin(config, runCommand = run, stdio = "inherit") {
  return runCommand("launchctl", ["print", `${DARWIN_DOMAIN()}/${config.label}`], { allowFailure: true, stdio });
}

function installLinux(config) {
  assertPackagedAssets(config);
  mkdirSync(dirname(linuxUnitPath(config)), { recursive: true });
  ensurePrivateDirectory(config.dataDir, config.platform);
  ensurePrivateDirectory(config.logDir, config.platform);
  writeFileSync(linuxUnitPath(config), renderSystemdUnit(config));

  run("systemctl", ["--user", "daemon-reload"]);
  run("systemctl", ["--user", "enable", "--now", linuxUnitName(config)]);
}

function uninstallLinux(config) {
  run("systemctl", ["--user", "disable", "--now", linuxUnitName(config)], { allowFailure: true, stdio: "pipe" });
  rmSync(linuxUnitPath(config), { force: true });
  run("systemctl", ["--user", "daemon-reload"], { allowFailure: true, stdio: "pipe" });
}

function restartLinux(config, runCommand = run) {
  runCommand("systemctl", ["--user", "restart", linuxUnitName(config)]);
}

function statusLinux(config, runCommand = run, stdio = "inherit") {
  return runCommand("systemctl", ["--user", "status", linuxUnitName(config), "--no-pager"], { allowFailure: true, stdio });
}

function installService(config) {
  if (config.platform === "darwin") {
    installDarwin(config);
    return;
  }

  if (config.platform === "linux") {
    installLinux(config);
    return;
  }

  throw new Error(`Service install is not supported on ${config.platform}. Use "oh-no-selfhosted start" instead.`);
}

function uninstallService(config) {
  if (config.platform === "darwin") {
    uninstallDarwin(config);
    return;
  }

  if (config.platform === "linux") {
    uninstallLinux(config);
    return;
  }

  throw new Error(`Service uninstall is not supported on ${config.platform}.`);
}

function restartService(config, runCommand = run) {
  if (config.platform === "darwin") {
    restartDarwin(config, runCommand);
    return;
  }

  if (config.platform === "linux") {
    restartLinux(config, runCommand);
    return;
  }

  throw new Error(`Service restart is not supported on ${config.platform}.`);
}

function statusService(config, runCommand = run, stdio = "inherit") {
  if (config.platform === "darwin") {
    return statusDarwin(config, runCommand, stdio);
  }

  if (config.platform === "linux") {
    return statusLinux(config, runCommand, stdio);
  }

  throw new Error(`Service status is not supported on ${config.platform}.`);
}

export function readPackageVersion(packageRoot) {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  return String(packageJson.version);
}

export function updatePackage(config, {
  noRestart = false,
  readVersion = readPackageVersion,
  runCommand = run,
  stdout = process.stdout,
} = {}) {
  const previousVersion = readVersion(config.packageRoot);
  const canManageService = config.platform === "darwin" || config.platform === "linux";
  const serviceWasRunning = !noRestart && canManageService
    ? statusService(config, runCommand, "pipe").status === 0
    : false;
  const npmCommand = config.platform === "win32" ? "npm.cmd" : "npm";

  stdout.write(`Updating ${PACKAGE_NAME} from ${previousVersion} to latest...\n`);
  runCommand(npmCommand, ["install", "--global", `${PACKAGE_NAME}@latest`]);

  const currentVersion = readVersion(config.packageRoot);
  const versionMessage = currentVersion === previousVersion
    ? `${PACKAGE_NAME} is already up to date at ${currentVersion}.`
    : `Updated ${PACKAGE_NAME} from ${previousVersion} to ${currentVersion}.`;
  stdout.write(`${versionMessage}\n`);

  if (serviceWasRunning) {
    restartService(config, runCommand);
    stdout.write(`Restarted ${config.label}.\n`);
  } else if (noRestart) {
    stdout.write("Skipped service restart because --no-restart was provided.\n");
  } else if (canManageService) {
    stdout.write("No running managed service was detected; the package was updated without starting one.\n");
  } else {
    stdout.write("Restart the foreground process to use the updated package.\n");
  }

  return {
    currentVersion,
    previousVersion,
    restarted: serviceWasRunning,
  };
}

function startForeground(config) {
  assertPackagedAssets(config);
  ensurePrivateDirectory(config.dataDir, config.platform);

  const [nodePath, ...nodeArgs] = buildServerArgs(config);
  const result = spawnSync(nodePath, nodeArgs, {
    env: {
      ...process.env,
      DATA_DIR: config.dataDir,
      NODE_ENV: "production",
      SERVE_STATIC: "true",
    },
    stdio: "inherit",
  });

  return result.status ?? 1;
}

function helpText() {
  return `Oh No Selfhosted

Usage:
  oh-no-selfhosted install [--host 127.0.0.1] [--port 8787] [--data-dir PATH] [--label NAME]
  oh-no-selfhosted status [--label NAME]
  oh-no-selfhosted restart [--label NAME]
  oh-no-selfhosted update [--no-restart] [--label NAME]
  oh-no-selfhosted uninstall [--label NAME]
  oh-no-selfhosted start [--host 127.0.0.1] [--port 8787] [--data-dir PATH]

Safety:
  External server plugins are disabled by default. Use --allow-unsafe-plugins only after reviewing the source.

Commands:
  install     Install and start a production service. Uses macOS LaunchAgent or Linux user systemd.
  status      Print service manager status.
  restart     Restart the installed service.
  update      Install the latest npm release and restart a running managed service.
  uninstall   Stop and remove the installed service definition. Data is kept.
  start       Run the production server in the foreground.

Local package flow:
  npm pack
  npm install -g ./oh-no-selfhosted-*.tgz
  oh-no-selfhosted install
`;
}

export async function cliMain({
  argv = process.argv.slice(2),
  env = process.env,
  homeDir = homedir(),
  nodePath = process.execPath,
  packageRoot = packageRootFromImportMeta(),
  platform = process.platform,
  readVersion = readPackageVersion,
  runCommand = run,
  stderr = process.stderr,
  stdout = process.stdout,
} = {}) {
  const [command = "help", ...optionArgs] = argv;

  if (command === "help" || command === "--help" || command === "-h" || flagEnabled(argv, "help")) {
    stdout.write(helpText());
    return 0;
  }

  const config = resolveServiceConfig({
    argv: optionArgs,
    env,
    homeDir,
    nodePath,
    packageRoot,
    platform,
  });

  try {
    if (command === "install") {
      installService(config);
      stdout.write(`Installed ${config.label} on ${config.host}:${config.port}\n`);
      return 0;
    }

    if (command === "uninstall") {
      uninstallService(config);
      stdout.write(`Uninstalled ${config.label}; data directories are not removed.\n`);
      return 0;
    }

    if (command === "restart") {
      restartService(config, runCommand);
      stdout.write(`Restarted ${config.label}\n`);
      return 0;
    }

    if (command === "update") {
      updatePackage(config, {
        noRestart: flagEnabled(optionArgs, "no-restart"),
        readVersion,
        runCommand,
        stdout,
      });
      return 0;
    }

    if (command === "status") {
      const result = statusService(config, runCommand);
      return result.status ?? 0;
    }

    if (command === "start") {
      return startForeground(config);
    }

    stderr.write(`Unknown command: ${command}\n\n${helpText()}`);
    return 1;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}
