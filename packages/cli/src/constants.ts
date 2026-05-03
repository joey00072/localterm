export const FORCE_EXIT_TIMEOUT_MS = 3000;
export const STOP_POLL_INTERVAL_MS = 100;
export const STOP_MAX_WAIT_MS = 5000;
export const RESTART_PROBE_INTERVAL_MS = 100;
export const RESTART_PROBE_MAX_WAIT_MS = 2000;

export const FRIENDLY_HOSTNAME = "localterm.localhost";
export const HTTP_DEFAULT_PORT = 80;
export const PRIVILEGED_PORT_CEILING = 1024;

export const getFriendlyUrl = (port: number, pathSegment = ""): string => {
  const portPart = port === HTTP_DEFAULT_PORT ? "" : `:${port}`;
  const segment = pathSegment ? `/${encodeURIComponent(pathSegment)}` : "";
  return `http://${FRIENDLY_HOSTNAME}${portPart}${segment}`;
};
