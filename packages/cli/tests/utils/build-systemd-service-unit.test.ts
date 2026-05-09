import { describe, expect, it } from "vite-plus/test";
import { buildSystemdServiceUnit } from "../../src/utils/build-systemd-service-unit.js";

describe("buildSystemdServiceUnit", () => {
  it("builds a foreground localterm service", () => {
    const unit = buildSystemdServiceUnit({
      nodePath: "/usr/bin/node",
      cliEntry: "/repo/packages/cli/dist/index.js",
      port: 3417,
      host: "127.0.0.1",
      allowTailscale: false,
    });

    expect(unit).toContain("[Service]");
    expect(unit).toContain(
      "ExecStart=/usr/bin/node /repo/packages/cli/dist/index.js start --port 3417 --host 127.0.0.1 --no-open --foreground",
    );
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("WantedBy=default.target");
  });

  it("includes Tailscale access when enabled", () => {
    const unit = buildSystemdServiceUnit({
      nodePath: "/usr/bin/node",
      cliEntry: "/repo/packages/cli/dist/index.js",
      port: 3417,
      host: "100.104.149.87",
      allowTailscale: true,
    });

    expect(unit).toContain("--host 100.104.149.87 --allow-tailscale --no-open --foreground");
  });

  it("quotes executable paths with spaces", () => {
    const unit = buildSystemdServiceUnit({
      nodePath: "/opt/node bin/node",
      cliEntry: "/repo path/packages/cli/dist/index.js",
      port: 3417,
      host: "127.0.0.1",
      allowTailscale: false,
    });

    expect(unit).toContain(
      'ExecStart="/opt/node bin/node" "/repo path/packages/cli/dist/index.js"',
    );
  });
});
