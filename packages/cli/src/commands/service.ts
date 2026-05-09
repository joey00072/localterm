import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isAllowedHost } from "localterm-server";
import kleur from "kleur";
import {
  EXIT_FAILURE,
  EXIT_USAGE_ERROR,
  SERVICE_POLL_INTERVAL_MS,
  SERVICE_POLL_MAX_WAIT_MS,
  SYSTEMD_SERVICE_NAME,
} from "../constants.js";
import { getSystemdUserDirectory } from "../paths.js";
import { isAlive, readPid } from "../state.js";
import {
  buildSystemdServiceUnit,
  getSystemdServiceFileName,
} from "../utils/build-systemd-service-unit.js";
import { cliEntry } from "../utils/cli-entry.js";
import { getLocaltermDisplayUrl } from "../utils/get-localterm-display-url.js";
import { getTailscaleIp } from "../utils/get-tailscale-ip.js";
import { sleep } from "../utils/sleep.js";
import { runStop } from "./stop.js";

export interface ServiceInstallOptions {
  port: number;
  host: string;
  allowTailscale: boolean;
  tailscale: boolean;
  linger: boolean;
  start: boolean;
}

interface ResolvedServiceInstallOptions {
  port: number;
  host: string;
  allowTailscale: boolean;
  linger: boolean;
  start: boolean;
}

const runSystemctlUser = (args: string[]): void => {
  execFileSync("systemctl", ["--user", ...args], { stdio: "inherit" });
};

const runLoginctl = (args: string[]): void => {
  execFileSync("loginctl", args, { stdio: "inherit" });
};

const resolveServiceInstallOptions = (
  options: ServiceInstallOptions,
): ResolvedServiceInstallOptions => {
  if (!options.tailscale) {
    return {
      port: options.port,
      host: options.host,
      allowTailscale: options.allowTailscale,
      linger: options.linger,
      start: options.start,
    };
  }

  const tailscaleIp = getTailscaleIp();
  if (!tailscaleIp) {
    console.error(kleur.red("could not read Tailscale IPv4. is tailscale running?"));
    process.exit(EXIT_FAILURE);
  }

  return {
    port: options.port,
    host: tailscaleIp,
    allowTailscale: true,
    linger: options.linger,
    start: options.start,
  };
};

const stopDetachedDaemonIfRunning = async (): Promise<void> => {
  const pid = readPid();
  if (!pid || !isAlive(pid)) return;
  await runStop();
};

const enableLinger = (): void => {
  try {
    runLoginctl(["enable-linger", os.userInfo().username]);
  } catch {
    console.log(
      kleur.yellow(
        "warning: could not enable lingering. service will auto-start after login, but may not start before login.",
      ),
    );
  }
};

const waitForServiceUrl = async (
  options: ResolvedServiceInstallOptions,
): Promise<string | null> => {
  const url = getLocaltermDisplayUrl({
    port: options.port,
    host: options.host,
    allowTailscale: options.allowTailscale,
  });
  const rawUrl = `http://${options.host}:${options.port}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < SERVICE_POLL_MAX_WAIT_MS) {
    try {
      const response = await fetch(`${rawUrl}/api/health`);
      if (response.ok) return url;
    } catch {}
    await sleep(SERVICE_POLL_INTERVAL_MS);
  }
  return null;
};

export const runServiceInstall = async (options: ServiceInstallOptions): Promise<void> => {
  if (process.platform !== "linux") {
    console.error(kleur.red("localterm service install currently supports Linux systemd only."));
    process.exit(EXIT_USAGE_ERROR);
  }

  const resolvedOptions = resolveServiceInstallOptions(options);
  if (!isAllowedHost(resolvedOptions.host, { allowTailscale: resolvedOptions.allowTailscale })) {
    console.error(
      kleur.red(
        `refusing to bind '${resolvedOptions.host}'. use --tailscale or --allow-tailscale for tailnet access.`,
      ),
    );
    process.exit(EXIT_USAGE_ERROR);
  }

  const systemdUserDirectory = getSystemdUserDirectory();
  mkdirSync(systemdUserDirectory, { recursive: true });
  const unitPath = path.join(systemdUserDirectory, getSystemdServiceFileName());
  writeFileSync(
    unitPath,
    buildSystemdServiceUnit({
      nodePath: process.execPath,
      cliEntry,
      port: resolvedOptions.port,
      host: resolvedOptions.host,
      allowTailscale: resolvedOptions.allowTailscale,
    }),
    "utf8",
  );

  runSystemctlUser(["daemon-reload"]);
  runSystemctlUser(["enable", SYSTEMD_SERVICE_NAME]);
  if (resolvedOptions.linger) enableLinger();

  console.log(`${kleur.green("✔")} installed ${unitPath}`);

  if (!resolvedOptions.start) {
    console.log(`  start with ${kleur.bold(`systemctl --user start ${SYSTEMD_SERVICE_NAME}`)}`);
    return;
  }

  await stopDetachedDaemonIfRunning();
  runSystemctlUser(["restart", SYSTEMD_SERVICE_NAME]);

  const url = await waitForServiceUrl(resolvedOptions);
  if (!url) {
    console.log(kleur.yellow(`service started, but health check did not pass yet.`));
    console.log(`  logs: ${kleur.bold(`journalctl --user -u ${SYSTEMD_SERVICE_NAME} -f`)}`);
    return;
  }

  console.log(`${kleur.green("✔")} running at ${kleur.cyan(url)}`);
  console.log(`  logs: ${kleur.bold(`journalctl --user -u ${SYSTEMD_SERVICE_NAME} -f`)}`);
};
