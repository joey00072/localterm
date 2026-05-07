import { getFriendlyUrl } from "../constants.js";
import { getTailscaleDnsName } from "./get-tailscale-dns-name.js";

export interface LocaltermDisplayUrlOptions {
  port: number;
  host: string;
  allowTailscale: boolean;
}

export const getLocaltermDisplayUrl = (options: LocaltermDisplayUrlOptions): string => {
  if (!options.allowTailscale) return getFriendlyUrl(options.port);
  return getFriendlyUrl(options.port, getTailscaleDnsName() ?? options.host);
};
