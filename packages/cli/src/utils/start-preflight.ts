import kleur from "kleur";
import { isLoopbackHost } from "localterm-server";
import { getFriendlyUrl, STOP_COMMAND } from "../constants.js";
import { clearPid, isAlive, readPid, readPort } from "../state.js";

export type StartPreflightOutcome =
  | { kind: "ok" }
  | { kind: "invalid-host"; host: string }
  | { kind: "stale-port-file"; pid: number }
  | { kind: "already-running"; pid: number; port: number };

export const runStartPreflight = (host: string): StartPreflightOutcome => {
  if (!isLoopbackHost(host)) {
    return { kind: "invalid-host", host };
  }
  const existingPid = readPid();
  if (existingPid && isAlive(existingPid)) {
    const existingPort = readPort();
    if (existingPort === null) {
      return { kind: "stale-port-file", pid: existingPid };
    }
    return { kind: "already-running", pid: existingPid, port: existingPort };
  }
  if (existingPid) clearPid();
  return { kind: "ok" };
};

export const reportStartPreflight = (outcome: StartPreflightOutcome): void => {
  if (outcome.kind === "invalid-host") {
    console.log(
      kleur.red(
        `refusing to bind '${outcome.host}'. localterm only accepts loopback hosts (127.0.0.1, localhost, *.localhost, ::1).`,
      ),
    );
    return;
  }
  if (outcome.kind === "stale-port-file") {
    console.log(
      kleur.yellow(
        `localterm pid ${outcome.pid} is alive but the port file is missing. run ${kleur.bold("localterm stop")} and try again.`,
      ),
    );
    return;
  }
  if (outcome.kind === "already-running") {
    console.log(
      kleur.yellow(`localterm is already running (pid ${outcome.pid}, port ${outcome.port}).`),
    );
    console.log(
      `Open ${kleur.cyan(getFriendlyUrl(outcome.port))} or run ${kleur.bold(STOP_COMMAND)}.`,
    );
  }
};
