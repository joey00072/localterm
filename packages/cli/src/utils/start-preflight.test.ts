import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as state from "../state.js";
import { runStartPreflight } from "./start-preflight.js";

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
  it("returns ok when no daemon state is present and host is loopback", () => {
    expect(runStartPreflight("127.0.0.1")).toEqual({ kind: "ok" });
  });

  it("rejects non-loopback hosts", () => {
    expect(runStartPreflight("0.0.0.0")).toEqual({ kind: "invalid-host", host: "0.0.0.0" });
    expect(runStartPreflight("192.168.1.5")).toEqual({
      kind: "invalid-host",
      host: "192.168.1.5",
    });
  });

  it("accepts *.localhost as loopback", () => {
    expect(runStartPreflight("api.myapp.localhost")).toEqual({ kind: "ok" });
  });

  it("reports already-running when a live daemon's pid + port file are both present", () => {
    vi.spyOn(state, "readPid").mockReturnValue(12345);
    vi.spyOn(state, "isAlive").mockReturnValue(true);
    vi.spyOn(state, "readPort").mockReturnValue(3417);
    expect(runStartPreflight("127.0.0.1")).toEqual({
      kind: "already-running",
      pid: 12345,
      port: 3417,
    });
  });

  it("reports stale-port-file when the daemon is alive but the port file is missing", () => {
    vi.spyOn(state, "readPid").mockReturnValue(12345);
    vi.spyOn(state, "isAlive").mockReturnValue(true);
    vi.spyOn(state, "readPort").mockReturnValue(null);
    expect(runStartPreflight("127.0.0.1")).toEqual({ kind: "stale-port-file", pid: 12345 });
  });

  it("clears the pid and returns ok when the recorded pid is dead", () => {
    const clearSpy = vi.spyOn(state, "clearPid");
    vi.spyOn(state, "readPid").mockReturnValue(12345);
    vi.spyOn(state, "isAlive").mockReturnValue(false);
    expect(runStartPreflight("127.0.0.1")).toEqual({ kind: "ok" });
    expect(clearSpy).toHaveBeenCalledOnce();
  });
});
