import { existsSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, DEFAULT_HOST, DEFAULT_PORT } from "localterm-server";
import kleur from "kleur";
import open from "open";
import {
  DAEMON_CHILD_ENV_FLAG,
  DAEMON_PROBE_INTERVAL_MS,
  DAEMON_PROBE_MAX_WAIT_MS,
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE_ERROR,
  FORCE_EXIT_TIMEOUT_MS,
  getFriendlyUrl,
  STOP_COMMAND,
} from "../constants.js";
import { clearPid, ensureLogFile, isAlive, readPort, writePid } from "../state.js";
import { buildDaemonStartArgs } from "../utils/build-daemon-args.js";
import { pollForDaemonReady } from "../utils/poll-for-daemon-ready.js";
import { sleep } from "../utils/sleep.js";
import { spawnDaemon } from "../utils/spawn-daemon.js";
import { reportStartPreflight, runStartPreflight } from "../utils/start-preflight.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const resolveStaticRoot = (): string | null => {
  const candidates = [
    path.resolve(moduleDir, "../../../../apps/web/dist"),
    path.resolve(moduleDir, "../../web"),
    path.resolve(moduleDir, "../web"),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "index.html"))) return candidate;
  }
  return null;
};

export interface StartOptions {
  port: number;
  host: string;
  open: boolean;
  foreground: boolean;
}

const isRunningAsDaemonChild = (): boolean => process.env[DAEMON_CHILD_ENV_FLAG] === "1";

export const runStart = async (options: StartOptions): Promise<void> => {
  if (options.foreground || isRunningAsDaemonChild()) {
    await runStartInForeground(options);
    return;
  }
  await runStartAsDaemon(options);
};

const runStartAsDaemon = async (options: StartOptions): Promise<void> => {
  const preflight = runStartPreflight(options.host);
  if (preflight.kind !== "ok") {
    reportStartPreflight(preflight);
    process.exit(preflight.kind === "invalid-host" ? EXIT_USAGE_ERROR : EXIT_OK);
  }

  const portBeforeSpawn = readPort();
  const logPath = ensureLogFile();
  const logFd = openSync(logPath, "a");
  const { pid: childPid } = spawnDaemon({
    args: buildDaemonStartArgs(options),
    logFd,
  });

  if (childPid === undefined) {
    console.log(
      kleur.red(
        `✗ failed to spawn ${process.execPath} — check that node is on PATH (logs: ${logPath}).`,
      ),
    );
    process.exit(EXIT_FAILURE);
  }

  const result = await pollForDaemonReady({
    childPid,
    initialPort: portBeforeSpawn,
    intervalMs: DAEMON_PROBE_INTERVAL_MS,
    maxWaitMs: DAEMON_PROBE_MAX_WAIT_MS,
    isAlive,
    readPort,
    sleep,
  });

  if (result.outcome === "died") {
    console.log(kleur.red(`✗ daemon died during startup. tail logs: ${kleur.dim(logPath)}`));
    process.exit(EXIT_FAILURE);
  }
  if (result.outcome === "timeout") {
    if (isAlive(childPid)) {
      const finalPort = readPort();
      if (finalPort !== null && finalPort !== portBeforeSpawn) {
        printDaemonStartedBanner(finalPort);
        if (options.open) await openInBrowser(getFriendlyUrl(finalPort));
        return;
      }
    }
    console.log(
      kleur.yellow(
        `daemon spawned (pid ${childPid}) but didn't bind a port within ${DAEMON_PROBE_MAX_WAIT_MS}ms. tail logs: ${kleur.dim(logPath)}`,
      ),
    );
    process.exit(EXIT_FAILURE);
  }

  const namedUrl = getFriendlyUrl(result.port ?? options.port);
  printDaemonStartedBanner(result.port ?? options.port);
  if (options.open) await openInBrowser(namedUrl);
};

const printDaemonStartedBanner = (port: number): void => {
  console.log(`${kleur.green("✔")} running at ${kleur.cyan(getFriendlyUrl(port))}`);
  console.log(`  stop with ${kleur.bold(STOP_COMMAND)}`);
};

const openInBrowser = async (url: string): Promise<void> => {
  try {
    await open(url);
  } catch {
    /* headless environments (CI, ssh) have no browser to open; not fatal */
  }
};

const runStartInForeground = async (options: StartOptions): Promise<void> => {
  const preflight = runStartPreflight(options.host);
  if (preflight.kind !== "ok") {
    reportStartPreflight(preflight);
    process.exit(preflight.kind === "invalid-host" ? EXIT_USAGE_ERROR : EXIT_OK);
  }

  const staticRoot = resolveStaticRoot();
  if (!staticRoot) {
    console.log(
      kleur.yellow(
        "warning: web bundle not found. run 'pnpm build' first or only the API will be served.",
      ),
    );
  }

  let server: Awaited<ReturnType<typeof createServer>>;
  try {
    server = await createServer({
      port: options.port,
      host: options.host,
      staticRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(kleur.red(`failed to start: ${message}`));
    process.exit(EXIT_FAILURE);
  }

  writePid(process.pid, server.port);

  const namedUrl = getFriendlyUrl(server.port);
  if (isRunningAsDaemonChild()) {
    console.log(`${kleur.green("✔")} daemon listening on ${namedUrl} (pid ${process.pid})`);
  } else {
    console.log(`${kleur.green("✔")} running at ${kleur.cyan(namedUrl)}`);
    console.log(`  press ${kleur.bold("Ctrl+C")} to stop`);
  }

  if (options.open && !isRunningAsDaemonChild()) await openInBrowser(namedUrl);

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      console.log(kleur.red("force exit"));
      clearPid();
      process.exit(EXIT_FAILURE);
    }
    shuttingDown = true;
    console.log(`\n${kleur.dim(`received ${signal}, shutting down…`)}`);
    const forceExit = setTimeout(() => {
      console.log(kleur.red("forcing exit (server.stop took too long)"));
      clearPid();
      process.exit(EXIT_FAILURE);
    }, FORCE_EXIT_TIMEOUT_MS);
    forceExit.unref();
    try {
      await server.stop();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(kleur.red(`stop error: ${message}`));
    } finally {
      clearTimeout(forceExit);
      clearPid();
      process.exit(EXIT_OK);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGHUP", () => void shutdown("SIGHUP"));
};

export const startDefaults: StartOptions = {
  port: DEFAULT_PORT,
  host: DEFAULT_HOST,
  open: true,
  foreground: false,
};
