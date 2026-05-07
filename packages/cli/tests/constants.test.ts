import { describe, expect, it } from "vite-plus/test";
import { getFriendlyUrl } from "../src/constants.js";

describe("getFriendlyUrl", () => {
  it("formats the named-host URL with the bound port", () => {
    expect(getFriendlyUrl(3417)).toBe("http://localterm.localhost:3417");
  });

  it("formats explicit IPv4 and IPv6 hosts", () => {
    expect(getFriendlyUrl(3417, "100.64.0.1")).toBe("http://100.64.0.1:3417");
    expect(getFriendlyUrl(3417, "fd7a:115c:a1e0::1")).toBe("http://[fd7a:115c:a1e0::1]:3417");
  });
});
