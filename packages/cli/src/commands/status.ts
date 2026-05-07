import kleur from "kleur";
import { healthSchema } from "localterm-server";
import { getFriendlyUrl } from "../constants.js";
import { cliError } from "../errors.js";
import { isAlive, readHost, readPid, readPort, readUrl } from "../state.js";
import { reportCliError } from "../utils/report-cli-error.js";

export const runStatus = async (): Promise<void> => {
  const pid = readPid();
  const port = readPort();

  if (!pid || !port) {
    console.log(kleur.dim("localterm is not running."));
    return;
  }
  if (!isAlive(pid)) {
    console.log(kleur.yellow(`pid ${pid} is gone (stale state). run 'localterm start'.`));
    return;
  }

  try {
    const host = readHost() ?? "127.0.0.1";
    const displayUrl = readUrl() ?? getFriendlyUrl(port);
    const rawUrl = getFriendlyUrl(port, host);
    const response = await fetch(`${rawUrl}/api/health`);
    if (!response.ok) throw new Error(`health check failed: ${response.status}`);
    const health = healthSchema.parse(await response.json());
    console.log(kleur.green("● running"));
    console.log(`  pid:      ${pid}`);
    console.log(`  port:     ${port}`);
    console.log(`  url:      ${kleur.cyan(displayUrl)}`);
    console.log(`  raw:      ${kleur.dim(rawUrl)}`);
    console.log(`  sessions: ${health.sessions}`);
  } catch (error) {
    reportCliError(
      cliError.healthCheckFailed(
        pid,
        port,
        error instanceof Error ? error : new Error(String(error)),
      ),
    );
  }
};
