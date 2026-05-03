import { existsSync } from "node:fs";

const COMMON_HOME_PREFIXES = ["/Users", "/home"];

export interface PrivilegeContext {
  isElevated: boolean;
  invokerUid: number | null;
  invokerGid: number | null;
  invokerUser: string | null;
  invokerHomeDirectory: string | null;
}

const isProcessElevated = (): boolean =>
  typeof process.geteuid === "function" && process.geteuid() === 0;

const findInvokerHomeDirectory = (username: string): string | null => {
  for (const prefix of COMMON_HOME_PREFIXES) {
    const candidate = `${prefix}/${username}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

const parseInvokerId = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const detectPrivilegeContext = (): PrivilegeContext => {
  if (!isProcessElevated()) {
    return {
      isElevated: false,
      invokerUid: null,
      invokerGid: null,
      invokerUser: null,
      invokerHomeDirectory: null,
    };
  }
  const invokerUser = process.env.SUDO_USER ?? null;
  return {
    isElevated: true,
    invokerUid: parseInvokerId(process.env.SUDO_UID),
    invokerGid: parseInvokerId(process.env.SUDO_GID),
    invokerUser,
    invokerHomeDirectory: invokerUser ? findInvokerHomeDirectory(invokerUser) : null,
  };
};

export const rebaseEnvToInvoker = (context: PrivilegeContext): void => {
  if (!context.isElevated) return;
  if (!context.invokerUser || context.invokerUser === "root") return;
  if (!context.invokerHomeDirectory) {
    console.warn(
      `localterm: cannot find a home directory for SUDO_USER='${context.invokerUser}' under /Users or /home. ` +
        `state will be written to ${process.env.HOME ?? "root's home"} and may be invisible to non-sudo commands.`,
    );
    return;
  }
  process.env.HOME = context.invokerHomeDirectory;
  process.env.USER = context.invokerUser;
  process.env.LOGNAME = context.invokerUser;
};

export const assertCanDropPrivileges = (context: PrivilegeContext): void => {
  if (!context.isElevated) return;
  if (context.invokerUid === null || context.invokerGid === null) {
    throw new Error(
      "running as root without SUDO_UID/SUDO_GID — refusing to start (would spawn root shells). " +
        "use 'sudo localterm start' rather than running localterm as root directly.",
    );
  }
};

export const dropPrivilegesIfElevated = (context: PrivilegeContext): void => {
  if (!context.isElevated) return;
  if (context.invokerUid === null || context.invokerGid === null) {
    throw new Error("dropPrivilegesIfElevated called without invoker uid/gid");
  }
  if (typeof process.setgroups === "function") {
    try {
      process.setgroups([context.invokerGid]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `localterm: setgroups failed (${message}); supplementary groups stay at root's. continuing with primary gid drop.`,
      );
    }
  }
  if (typeof process.setgid === "function") process.setgid(context.invokerGid);
  if (typeof process.setuid === "function") process.setuid(context.invokerUid);
};
