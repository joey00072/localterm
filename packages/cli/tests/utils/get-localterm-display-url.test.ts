import { describe, expect, it, vi } from "vite-plus/test";
import { getLocaltermDisplayUrl } from "../../src/utils/get-localterm-display-url.js";
import { getTailscaleDnsName } from "../../src/utils/get-tailscale-dns-name.js";

vi.mock("../../src/utils/get-tailscale-dns-name.js", () => ({
  getTailscaleDnsName: vi.fn(),
}));

const mockedGetTailscaleDnsName = vi.mocked(getTailscaleDnsName);

describe("getLocaltermDisplayUrl", () => {
  it("uses the localhost URL when Tailscale access is disabled", () => {
    mockedGetTailscaleDnsName.mockReturnValue("workstation.tailnet.ts.net");
    expect(
      getLocaltermDisplayUrl({
        port: 3417,
        host: "100.64.0.1",
        allowTailscale: false,
      }),
    ).toBe("http://localterm.localhost:3417");
  });

  it("prefers the Tailscale MagicDNS URL over the bound IP", () => {
    mockedGetTailscaleDnsName.mockReturnValue("workstation.tailnet.ts.net");
    expect(
      getLocaltermDisplayUrl({
        port: 3417,
        host: "100.64.0.1",
        allowTailscale: true,
      }),
    ).toBe("http://workstation.tailnet.ts.net:3417");
  });

  it("falls back to the bound host when MagicDNS is unavailable", () => {
    mockedGetTailscaleDnsName.mockReturnValue(null);
    expect(
      getLocaltermDisplayUrl({
        port: 3417,
        host: "100.64.0.1",
        allowTailscale: true,
      }),
    ).toBe("http://100.64.0.1:3417");
  });
});
