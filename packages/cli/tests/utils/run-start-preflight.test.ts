import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as state from "../../src/state.js";
import { runStartPreflight } from "../../src/utils/run-start-preflight.js";

beforeEach(() => {
  vi.spyOn(state, "readPid").mockReturnValue(null);
  vi.spyOn(state, "readPort").mockReturnValue(null);
  vi.spyOn(state, "isAlive").mockReturnValue(false);
  vi.spyOn(state, "clearPid").mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runStartPreflight", () => {
  it("returns null when no daemon state is present and host is loopback", () => {
    expect(runStartPreflight("127.0.0.1")).toBeNull();
  });

  it("rejects non-loopback hosts as an invalid-host CliError", () => {
    expect(runStartPreflight("0.0.0.0")).toEqual(
      expect.objectContaining({
        kind: "invalid-host",
        code: "E_LT_CLI_INVALID_HOST",
        severity: "error",
        host: "0.0.0.0",
      }),
    );
    expect(runStartPreflight("192.168.1.5")).toEqual(
      expect.objectContaining({ kind: "invalid-host", host: "192.168.1.5" }),
    );
  });

  it("accepts *.localhost as loopback", () => {
    expect(runStartPreflight("api.myapp.localhost")).toBeNull();
  });

  it("accepts Tailscale hosts only when explicitly allowed", () => {
    expect(runStartPreflight("100.64.0.1")).toEqual(
      expect.objectContaining({ kind: "invalid-host", host: "100.64.0.1" }),
    );
    expect(runStartPreflight("100.64.0.1", { allowTailscale: true })).toBeNull();
    expect(runStartPreflight("workstation.tailnet.ts.net", { allowTailscale: true })).toBeNull();
  });

  it("reports already-running when a live daemon's pid + port file are both present", () => {
    vi.spyOn(state, "readPid").mockReturnValue(12345);
    vi.spyOn(state, "isAlive").mockReturnValue(true);
    vi.spyOn(state, "readPort").mockReturnValue(3417);
    expect(runStartPreflight("127.0.0.1")).toEqual(
      expect.objectContaining({
        kind: "already-running",
        code: "E_LT_CLI_ALREADY_RUNNING",
        severity: "warning",
        pid: 12345,
        port: 3417,
      }),
    );
  });

  it("reports stale-port-file when the daemon is alive but the port file is missing", () => {
    vi.spyOn(state, "readPid").mockReturnValue(12345);
    vi.spyOn(state, "isAlive").mockReturnValue(true);
    vi.spyOn(state, "readPort").mockReturnValue(null);
    expect(runStartPreflight("127.0.0.1")).toEqual(
      expect.objectContaining({
        kind: "stale-port-file",
        code: "E_LT_CLI_STALE_PORT_FILE",
        severity: "warning",
        pid: 12345,
      }),
    );
  });

  it("clears the pid and returns null when the recorded pid is dead", () => {
    const clearSpy = vi.spyOn(state, "clearPid");
    vi.spyOn(state, "readPid").mockReturnValue(12345);
    vi.spyOn(state, "isAlive").mockReturnValue(false);
    expect(runStartPreflight("127.0.0.1")).toBeNull();
    expect(clearSpy).toHaveBeenCalledOnce();
  });
});
