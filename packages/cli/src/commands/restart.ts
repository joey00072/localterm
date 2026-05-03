import { spawn } from "node:child_process";
import { chownSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import kleur from "kleur";
import { RESTART_PROBE_INTERVAL_MS, RESTART_PROBE_MAX_WAIT_MS } from "../constants.js";
import { detectPrivilegeContext } from "../privilege.js";
import { ensureLogFile, isAlive, readPort } from "../state.js";
import { runStop } from "./stop.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(moduleDir, "../index.js");

export interface RestartOptions {
  port: number;
  host: string;
  open: boolean;
}

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

export const runRestart = async (options: RestartOptions): Promise<void> => {
  await runStop();
  const logPath = ensureLogFile();
  const privilegeContext = detectPrivilegeContext();
  if (
    privilegeContext.isElevated &&
    privilegeContext.invokerUid !== null &&
    privilegeContext.invokerGid !== null
  ) {
    try {
      chownSync(logPath, privilegeContext.invokerUid, privilegeContext.invokerGid);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(kleur.yellow(`could not chown log file to invoker: ${message}`));
    }
  }
  const logFd = openSync(logPath, "a");
  const args = [cliEntry, "start", "--port", String(options.port), "--host", options.host];
  if (!options.open) args.push("--no-open");
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: process.env,
  });
  child.unref();

  const childPid = child.pid;
  if (childPid === undefined) {
    console.log(kleur.red(`✗ failed to spawn child process. tail logs: ${logPath}`));
    process.exit(1);
  }

  let waited = 0;
  while (waited < RESTART_PROBE_MAX_WAIT_MS) {
    await sleep(RESTART_PROBE_INTERVAL_MS);
    waited += RESTART_PROBE_INTERVAL_MS;
    if (!isAlive(childPid)) {
      console.log(kleur.red(`✗ daemon died during startup. tail logs: ${kleur.dim(logPath)}`));
      process.exit(1);
    }
    if (readPort() !== null) {
      console.log(kleur.green(`✔ restarted (pid ${childPid}, logs: ${logPath})`));
      return;
    }
  }

  console.log(
    kleur.yellow(
      `restart spawned (pid ${childPid}) but didn't write a port file within ${RESTART_PROBE_MAX_WAIT_MS}ms. tail logs: ${kleur.dim(logPath)}`,
    ),
  );
};
