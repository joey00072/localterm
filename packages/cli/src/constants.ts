export const FORCE_EXIT_TIMEOUT_MS = 3000;
export const STOP_POLL_INTERVAL_MS = 100;
export const STOP_MAX_WAIT_MS = 5000;
export const DAEMON_PROBE_INTERVAL_MS = 100;
export const DAEMON_PROBE_MAX_WAIT_MS = 5000;

export const FRIENDLY_HOSTNAME = "localterm.localhost";
export const STOP_COMMAND = "npx localterm@latest stop";
export const DAEMON_CHILD_ENV_FLAG = "LOCALTERM_DAEMON_CHILD";

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE_ERROR = 2;

export const getFriendlyUrl = (port: number, pathSegment = ""): string => {
  const segment = pathSegment ? `/${encodeURIComponent(pathSegment)}` : "";
  return `http://${FRIENDLY_HOSTNAME}:${port}${segment}`;
};
