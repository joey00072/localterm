import { execFileSync } from "node:child_process";

const normalizeDnsName = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
};

export const getTailscaleDnsName = (): string | null => {
  try {
    const raw = execFileSync("tailscale", ["status", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const self = Reflect.get(parsed, "Self");
    if (!self || typeof self !== "object") return null;
    return normalizeDnsName(Reflect.get(self, "DNSName"));
  } catch {
    return null;
  }
};
