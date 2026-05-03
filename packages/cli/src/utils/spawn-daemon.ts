import { spawn } from "node:child_process";
import { DAEMON_CHILD_ENV_FLAG } from "../constants.js";
import { cliEntry } from "./cli-entry.js";

export interface SpawnDaemonInput {
  args: string[];
  logFd: number;
}

export interface SpawnedDaemonHandle {
  pid: number | undefined;
}

export const spawnDaemon = (input: SpawnDaemonInput): SpawnedDaemonHandle => {
  const child = spawn(process.execPath, [cliEntry, ...input.args], {
    detached: true,
    stdio: ["ignore", input.logFd, input.logFd],
    env: { ...process.env, [DAEMON_CHILD_ENV_FLAG]: "1" },
  });
  child.unref();
  return { pid: child.pid };
};
