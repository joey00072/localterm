import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertCanDropPrivileges,
  detectPrivilegeContext,
  dropPrivilegesIfElevated,
  rebaseEnvToInvoker,
} from "./privilege.js";

const originalEnv = { ...process.env };
const originalGeteuid = process.geteuid;
const originalSetuid = process.setuid;
const originalSetgid = process.setgid;
const originalSetgroups = process.setgroups;

const mockEffectiveUid = (uid: number | null) => {
  if (uid === null) {
    Object.defineProperty(process, "geteuid", { value: undefined, configurable: true });
    return;
  }
  Object.defineProperty(process, "geteuid", { value: () => uid, configurable: true });
};

const stubProcessFunction = (name: "setuid" | "setgid" | "setgroups", fn: () => void) => {
  Object.defineProperty(process, name, { value: fn, configurable: true });
};

const restoreProcessFunctions = () => {
  Object.defineProperty(process, "setuid", { value: originalSetuid, configurable: true });
  Object.defineProperty(process, "setgid", { value: originalSetgid, configurable: true });
  Object.defineProperty(process, "setgroups", { value: originalSetgroups, configurable: true });
};

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
  Object.defineProperty(process, "geteuid", { value: originalGeteuid, configurable: true });
  restoreProcessFunctions();
  vi.restoreAllMocks();
});

describe("detectPrivilegeContext", () => {
  it("reports non-elevated when geteuid() != 0", () => {
    mockEffectiveUid(1000);
    const context = detectPrivilegeContext();
    expect(context.isElevated).toBe(false);
    expect(context.invokerUid).toBeNull();
    expect(context.invokerGid).toBeNull();
  });

  it("reports non-elevated when geteuid is unavailable (windows)", () => {
    mockEffectiveUid(null);
    const context = detectPrivilegeContext();
    expect(context.isElevated).toBe(false);
  });

  it("reports elevated and parses SUDO_UID/SUDO_GID/SUDO_USER when root", () => {
    mockEffectiveUid(0);
    process.env.SUDO_UID = "501";
    process.env.SUDO_GID = "20";
    process.env.SUDO_USER = "alice";
    const context = detectPrivilegeContext();
    expect(context.isElevated).toBe(true);
    expect(context.invokerUid).toBe(501);
    expect(context.invokerGid).toBe(20);
    expect(context.invokerUser).toBe("alice");
  });

  it("rejects malformed SUDO_UID values", () => {
    mockEffectiveUid(0);
    process.env.SUDO_UID = "not-a-number";
    process.env.SUDO_GID = "20";
    const context = detectPrivilegeContext();
    expect(context.invokerUid).toBeNull();
  });
});

describe("assertCanDropPrivileges", () => {
  it("is a no-op when not elevated", () => {
    expect(() =>
      assertCanDropPrivileges({
        isElevated: false,
        invokerUid: null,
        invokerGid: null,
        invokerUser: null,
        invokerHomeDirectory: null,
      }),
    ).not.toThrow();
  });

  it("throws when elevated but SUDO_UID/SUDO_GID are missing", () => {
    expect(() =>
      assertCanDropPrivileges({
        isElevated: true,
        invokerUid: null,
        invokerGid: null,
        invokerUser: "root",
        invokerHomeDirectory: null,
      }),
    ).toThrow(/SUDO_UID/);
  });

  it("passes when elevated and SUDO_UID/SUDO_GID are present", () => {
    expect(() =>
      assertCanDropPrivileges({
        isElevated: true,
        invokerUid: 501,
        invokerGid: 20,
        invokerUser: "alice",
        invokerHomeDirectory: "/Users/alice",
      }),
    ).not.toThrow();
  });
});

describe("rebaseEnvToInvoker", () => {
  it("rewrites HOME/USER/LOGNAME when elevated with a real invoker home", () => {
    process.env.HOME = "/var/root";
    process.env.USER = "root";
    process.env.LOGNAME = "root";
    rebaseEnvToInvoker({
      isElevated: true,
      invokerUid: 501,
      invokerGid: 20,
      invokerUser: "alice",
      invokerHomeDirectory: "/Users/alice",
    });
    expect(process.env.HOME).toBe("/Users/alice");
    expect(process.env.USER).toBe("alice");
    expect(process.env.LOGNAME).toBe("alice");
  });

  it("leaves env alone when not elevated", () => {
    process.env.HOME = "/Users/alice";
    rebaseEnvToInvoker({
      isElevated: false,
      invokerUid: null,
      invokerGid: null,
      invokerUser: null,
      invokerHomeDirectory: null,
    });
    expect(process.env.HOME).toBe("/Users/alice");
  });

  it("leaves env alone but warns when invoker home cannot be discovered", () => {
    process.env.HOME = "/var/root";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    rebaseEnvToInvoker({
      isElevated: true,
      invokerUid: 501,
      invokerGid: 20,
      invokerUser: "alice",
      invokerHomeDirectory: null,
    });
    expect(process.env.HOME).toBe("/var/root");
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/cannot find a home directory/);
  });
});

describe("dropPrivilegesIfElevated", () => {
  const safeContext = {
    isElevated: true,
    invokerUid: 501,
    invokerGid: 20,
    invokerUser: "alice",
    invokerHomeDirectory: "/Users/alice",
  };

  it("is a no-op when not elevated", () => {
    const setuid = vi.fn();
    const setgid = vi.fn();
    stubProcessFunction("setuid", setuid);
    stubProcessFunction("setgid", setgid);
    dropPrivilegesIfElevated({
      isElevated: false,
      invokerUid: null,
      invokerGid: null,
      invokerUser: null,
      invokerHomeDirectory: null,
    });
    expect(setuid).not.toHaveBeenCalled();
    expect(setgid).not.toHaveBeenCalled();
  });

  it("throws when elevated without invoker uid/gid", () => {
    const setuid = vi.fn();
    stubProcessFunction("setuid", setuid);
    expect(() =>
      dropPrivilegesIfElevated({
        isElevated: true,
        invokerUid: null,
        invokerGid: null,
        invokerUser: "root",
        invokerHomeDirectory: null,
      }),
    ).toThrow(/without invoker uid\/gid/);
    expect(setuid).not.toHaveBeenCalled();
  });

  it("calls setgroups, then setgid, then setuid (in that exact order)", () => {
    const callOrder: string[] = [];
    stubProcessFunction("setgroups", () => {
      callOrder.push("setgroups");
    });
    stubProcessFunction("setgid", () => {
      callOrder.push("setgid");
    });
    stubProcessFunction("setuid", () => {
      callOrder.push("setuid");
    });
    dropPrivilegesIfElevated(safeContext);
    expect(callOrder).toEqual(["setgroups", "setgid", "setuid"]);
  });

  it("forwards the invoker uid/gid to setuid/setgid", () => {
    const setuid = vi.fn();
    const setgid = vi.fn();
    stubProcessFunction("setgroups", () => {});
    stubProcessFunction("setgid", setgid);
    stubProcessFunction("setuid", setuid);
    dropPrivilegesIfElevated(safeContext);
    expect(setgid).toHaveBeenCalledWith(20);
    expect(setuid).toHaveBeenCalledWith(501);
  });

  it("swallows setgroups failure but still drops setgid + setuid", () => {
    const setuid = vi.fn();
    const setgid = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubProcessFunction("setgroups", () => {
      throw new Error("ENOSYS");
    });
    stubProcessFunction("setgid", setgid);
    stubProcessFunction("setuid", setuid);
    expect(() => dropPrivilegesIfElevated(safeContext)).not.toThrow();
    expect(setgid).toHaveBeenCalledWith(20);
    expect(setuid).toHaveBeenCalledWith(501);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/setgroups failed/);
  });

  it("propagates setgid failure (does not swallow)", () => {
    stubProcessFunction("setgroups", () => {});
    stubProcessFunction("setgid", () => {
      throw new Error("EPERM");
    });
    stubProcessFunction("setuid", vi.fn());
    expect(() => dropPrivilegesIfElevated(safeContext)).toThrow(/EPERM/);
  });

  it("propagates setuid failure (does not swallow)", () => {
    stubProcessFunction("setgroups", () => {});
    stubProcessFunction("setgid", () => {});
    stubProcessFunction("setuid", () => {
      throw new Error("EPERM");
    });
    expect(() => dropPrivilegesIfElevated(safeContext)).toThrow(/EPERM/);
  });
});
