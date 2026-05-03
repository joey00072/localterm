import { describe, expect, it } from "vitest";
import { getFriendlyUrl } from "./constants.js";

describe("getFriendlyUrl", () => {
  it("omits the port when it is 80 (HTTP default)", () => {
    expect(getFriendlyUrl(80)).toBe("http://localterm.localhost");
  });

  it("includes the port when it is anything else", () => {
    expect(getFriendlyUrl(3417)).toBe("http://localterm.localhost:3417");
  });

  it("appends the path segment when provided", () => {
    expect(getFriendlyUrl(80, "alpha-otter-2k4r")).toBe(
      "http://localterm.localhost/alpha-otter-2k4r",
    );
    expect(getFriendlyUrl(3417, "alpha-otter-2k4r")).toBe(
      "http://localterm.localhost:3417/alpha-otter-2k4r",
    );
  });

  it("percent-encodes path segments that contain URL-significant characters", () => {
    expect(getFriendlyUrl(80, "weird?name#here")).toBe(
      "http://localterm.localhost/weird%3Fname%23here",
    );
  });
});
