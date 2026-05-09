import { execFileSync } from "node:child_process";

export const getTailscaleIp = (): string | null => {
  try {
    const raw = execFileSync("tailscale", ["ip", "-4"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return (
      raw
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? null
    );
  } catch {
    return null;
  }
};
