export interface DaemonStartArgsInput {
  port: number;
  host: string;
  open: boolean;
  allowTailscale?: boolean;
}

export const buildDaemonStartArgs = (input: DaemonStartArgsInput): string[] => {
  const args = ["start", "--port", String(input.port), "--host", input.host];
  if (input.allowTailscale) args.push("--allow-tailscale");
  if (!input.open) args.push("--no-open");
  return args;
};
