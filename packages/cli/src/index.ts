import { DEFAULT_HOST, DEFAULT_PORT } from "localterm-server";
import { Command } from "commander";
import { runRestart } from "./commands/restart.js";
import { runServiceInstall } from "./commands/service.js";
import { runStart } from "./commands/start.js";
import { runStatus } from "./commands/status.js";
import { runStop } from "./commands/stop.js";
import { runUrl } from "./commands/url.js";
import { parsePortOption } from "./utils/parse-port-option.js";
import { readPackageVersion } from "./utils/read-package-version.js";

const initialPort = parsePortOption(process.env.PORT ?? String(DEFAULT_PORT));

const program = new Command();
program
  .name("localterm")
  .description("local browser-based terminal hub")
  .version(readPackageVersion());

program
  .command("start")
  .description("start the localterm server (daemonizes by default)")
  .option("-p, --port <port>", "port to bind", parsePortOption, initialPort)
  .option("-H, --host <host>", "host to bind", DEFAULT_HOST)
  .option("--allow-tailscale", "allow access from Tailscale IPs and MagicDNS names", false)
  .option("--no-open", "do not open browser on start")
  .option("-F, --foreground", "stay attached to this terminal (do not daemonize)", false)
  .action(
    async (options: {
      port: number;
      host: string;
      allowTailscale: boolean;
      open: boolean;
      foreground: boolean;
    }) => {
      await runStart({
        port: options.port,
        host: options.host,
        allowTailscale: options.allowTailscale,
        open: options.open,
        foreground: options.foreground,
      });
    },
  );

program
  .command("stop")
  .description("stop the localterm server")
  .action(async () => {
    await runStop();
  });

program
  .command("status")
  .description("show server status")
  .action(async () => {
    await runStatus();
  });

program
  .command("url")
  .description("print the URL for the running localterm server")
  .action(async () => {
    await runUrl();
  });

program
  .command("restart")
  .description("restart the localterm server")
  .option("-p, --port <port>", "port to bind", parsePortOption, initialPort)
  .option("-H, --host <host>", "host to bind", DEFAULT_HOST)
  .option("--allow-tailscale", "allow access from Tailscale IPs and MagicDNS names", false)
  .option("--no-open", "do not open browser on start")
  .action(
    async (options: { port: number; host: string; allowTailscale: boolean; open: boolean }) => {
      await runRestart({
        port: options.port,
        host: options.host,
        allowTailscale: options.allowTailscale,
        open: options.open,
      });
    },
  );

const service = program.command("service").description("manage the localterm user service");

service
  .command("install")
  .description("install and start localterm as a user systemd service")
  .option("-p, --port <port>", "port to bind", parsePortOption, initialPort)
  .option("-H, --host <host>", "host to bind", DEFAULT_HOST)
  .option("--allow-tailscale", "allow access from Tailscale IPs and MagicDNS names", false)
  .option("--tailscale", "bind to this machine's Tailscale IPv4 and allow tailnet access", false)
  .option("--no-linger", "do not enable user lingering for boot-before-login startup")
  .option("--no-start", "install and enable the service without starting it now")
  .action(
    async (options: {
      port: number;
      host: string;
      allowTailscale: boolean;
      tailscale: boolean;
      linger: boolean;
      start: boolean;
    }) => {
      await runServiceInstall({
        port: options.port,
        host: options.host,
        allowTailscale: options.allowTailscale,
        tailscale: options.tailscale,
        linger: options.linger,
        start: options.start,
      });
    },
  );

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
