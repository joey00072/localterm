import { describe, expect, it } from "vitest";
import { buildDaemonStartArgs } from "./build-daemon-args.js";

describe("buildDaemonStartArgs", () => {
  it("includes the start subcommand, port, and host", () => {
    expect(buildDaemonStartArgs({ port: 3417, host: "127.0.0.1", open: true })).toEqual([
      "start",
      "--port",
      "3417",
      "--host",
      "127.0.0.1",
    ]);
  });

  it("appends --no-open when the user opted out of opening the browser", () => {
    expect(buildDaemonStartArgs({ port: 8080, host: "localhost", open: false })).toEqual([
      "start",
      "--port",
      "8080",
      "--host",
      "localhost",
      "--no-open",
    ]);
  });

  it("renders non-default ports as strings", () => {
    expect(buildDaemonStartArgs({ port: 0, host: "127.0.0.1", open: true })).toContain("0");
  });
});
