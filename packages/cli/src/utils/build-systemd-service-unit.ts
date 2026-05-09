import { SYSTEMD_RESTART_DELAY_SEC, SYSTEMD_SERVICE_NAME } from "../constants.js";
import { quoteSystemdExecArg } from "./quote-systemd-exec-arg.js";

export interface SystemdServiceUnitInput {
  nodePath: string;
  cliEntry: string;
  port: number;
  host: string;
  allowTailscale: boolean;
}

export const buildSystemdServiceUnit = (input: SystemdServiceUnitInput): string => {
  const args = [
    input.nodePath,
    input.cliEntry,
    "start",
    "--port",
    String(input.port),
    "--host",
    input.host,
    "--no-open",
    "--foreground",
  ];
  if (input.allowTailscale) args.splice(args.length - 2, 0, "--allow-tailscale");
  const execStart = args.map(quoteSystemdExecArg).join(" ");

  return [
    "[Unit]",
    "Description=localterm browser terminal",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${execStart}`,
    "Restart=always",
    `RestartSec=${SYSTEMD_RESTART_DELAY_SEC}s`,
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
};

export const getSystemdServiceFileName = (): string => SYSTEMD_SERVICE_NAME;
