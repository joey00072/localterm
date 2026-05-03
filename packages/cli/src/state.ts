import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { getLogFile, getPidFile, getPortFile, getStateDirectory } from "./paths.js";

export const ensureStateDirectory = (): void => {
  const stateDirectory = getStateDirectory();
  if (!existsSync(stateDirectory)) {
    mkdirSync(stateDirectory, { recursive: true });
  }
};

export const ensureLogFile = (): string => {
  ensureStateDirectory();
  const logFile = getLogFile();
  if (!existsSync(logFile)) {
    writeFileSync(logFile, "", "utf8");
  }
  return logFile;
};

export const writePid = (pid: number, port: number): void => {
  ensureStateDirectory();
  writeFileSync(getPidFile(), String(pid), "utf8");
  writeFileSync(getPortFile(), String(port), "utf8");
};

export const clearPid = (): void => {
  for (const file of [getPidFile(), getPortFile()]) {
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch {
      /* file may have been removed by another process between existsSync and unlink */
    }
  }
};

export const readPid = (): number | null => {
  const pidFile = getPidFile();
  if (!existsSync(pidFile)) return null;
  const raw = readFileSync(pidFile, "utf8").trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const readPort = (): number | null => {
  const portFile = getPortFile();
  if (!existsSync(portFile)) return null;
  const raw = readFileSync(portFile, "utf8").trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
