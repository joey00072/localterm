import { openSync } from "node:fs";
import { isAllowedHost } from "localterm-server";
import kleur from "kleur";
import {
  DAEMON_PROBE_INTERVAL_MS,
  DAEMON_PROBE_MAX_WAIT_MS,
  getFriendlyUrl,
} from "../constants.js";
import { cliError, exitCodeForCliError } from "../errors.js";
import { ensureLogFile, isAlive, readPort } from "../state.js";
import { buildDaemonStartArgs } from "../utils/build-daemon-args.js";
import { getTailscaleDnsName } from "../utils/get-tailscale-dns-name.js";
import { pollForDaemonReady } from "../utils/poll-for-daemon-ready.js";
import { reportCliError } from "../utils/report-cli-error.js";
import { sleep } from "../utils/sleep.js";
import { spawnDaemon } from "../utils/spawn-daemon.js";
import { runStop } from "./stop.js";

export interface RestartOptions {
  port: number;
  host: string;
  allowTailscale: boolean;
  open: boolean;
}

export const runRestart = async (options: RestartOptions): Promise<void> => {
  if (!isAllowedHost(options.host, { allowTailscale: options.allowTailscale })) {
    const error = cliError.invalidHost(options.host);
    reportCliError(error);
    process.exit(exitCodeForCliError(error));
  }
  await runStop();
  const portBeforeSpawn = readPort();
  const logPath = ensureLogFile();
  const logFd = openSync(logPath, "a");
  const { pid: childPid } = spawnDaemon({
    args: buildDaemonStartArgs(options),
    logFd,
  });

  if (childPid === undefined) {
    const error = cliError.daemonSpawnFailed(process.execPath, logPath);
    reportCliError(error);
    process.exit(exitCodeForCliError(error));
  }

  const result = await pollForDaemonReady({
    childPid,
    initialPort: portBeforeSpawn,
    intervalMs: DAEMON_PROBE_INTERVAL_MS,
    maxWaitMs: DAEMON_PROBE_MAX_WAIT_MS,
    logPath,
    isAlive,
    readPort,
    sleep,
  });

  if (result.ok) {
    const displayHost = options.allowTailscale
      ? (getTailscaleDnsName() ?? options.host)
      : undefined;
    console.log(
      kleur.green(`✔ restarted (pid ${childPid}, port ${result.port}, logs: ${logPath})`),
    );
    console.log(`  url: ${kleur.cyan(getFriendlyUrl(result.port, displayHost))}`);
    return;
  }

  reportCliError(result.error);
  process.exit(exitCodeForCliError(result.error));
};
