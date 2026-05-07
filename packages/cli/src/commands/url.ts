import kleur from "kleur";
import { getFriendlyUrl } from "../constants.js";
import { isAlive, readHost, readPid, readPort, readUrl } from "../state.js";

export const runUrl = async (): Promise<void> => {
  const pid = readPid();
  const port = readPort();

  if (!pid || !port || !isAlive(pid)) {
    console.log(kleur.dim("localterm is not running."));
    return;
  }

  console.log(readUrl() ?? getFriendlyUrl(port, readHost() ?? undefined));
};
