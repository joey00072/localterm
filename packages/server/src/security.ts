import type { Context, MiddlewareHandler } from "hono";
import {
  IPV4_OCTET_COUNT,
  IPV4_OCTET_MAX,
  LOOPBACK_HOSTS,
  TAILSCALE_DNS_SUFFIX,
  TAILSCALE_IPV4_FIRST_OCTET,
  TAILSCALE_IPV4_SECOND_OCTET_MAX,
  TAILSCALE_IPV4_SECOND_OCTET_MIN,
  TAILSCALE_IPV6_PREFIX,
} from "./constants.js";

export interface NetworkAccessOptions {
  allowTailscale?: boolean;
}

const stripPort = (hostHeader: string | undefined): string | null => {
  if (!hostHeader) return null;
  const trimmed = hostHeader.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end === -1 ? trimmed : trimmed.slice(0, end + 1);
  }
  const colon = trimmed.lastIndexOf(":");
  if (colon === -1) return trimmed;
  return trimmed.slice(0, colon);
};

const normalizeHostname = (hostname: string | null): string | null => {
  if (!hostname) return null;
  const trimmed = hostname.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutTrailingDot = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  if (withoutTrailingDot.startsWith("[") && withoutTrailingDot.endsWith("]")) {
    return withoutTrailingDot.slice(1, -1);
  }
  return withoutTrailingDot;
};

const originHostname = (originHeader: string | undefined): string | null => {
  if (!originHeader) return null;
  if (originHeader === "null") return null;
  try {
    return new URL(originHeader).hostname;
  } catch {
    return null;
  }
};

const isLoopback = (hostname: string | null): boolean => {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  if (LOOPBACK_HOSTS.has(normalized)) return true;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  return false;
};

const parseIpv4Address = (hostname: string): number[] | null => {
  const parts = hostname.split(".");
  if (parts.length !== IPV4_OCTET_COUNT) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > IPV4_OCTET_MAX) return null;
    octets.push(octet);
  }
  return octets;
};

const isTailscaleIpv4Address = (hostname: string): boolean => {
  const octets = parseIpv4Address(hostname);
  if (!octets) return false;
  return (
    octets[0] === TAILSCALE_IPV4_FIRST_OCTET &&
    octets[1] >= TAILSCALE_IPV4_SECOND_OCTET_MIN &&
    octets[1] <= TAILSCALE_IPV4_SECOND_OCTET_MAX
  );
};

const isTailscaleIpv6Address = (hostname: string): boolean =>
  hostname.startsWith(TAILSCALE_IPV6_PREFIX);

const isTailscaleDnsName = (hostname: string): boolean => hostname.endsWith(TAILSCALE_DNS_SUFFIX);

export const isLoopbackHost = (host: string): boolean => isLoopback(host);

export const isTailscaleHost = (host: string): boolean => {
  const normalized = normalizeHostname(host);
  if (!normalized) return false;
  return (
    isTailscaleIpv4Address(normalized) ||
    isTailscaleIpv6Address(normalized) ||
    isTailscaleDnsName(normalized)
  );
};

export const isAllowedHost = (host: string, options: NetworkAccessOptions = {}): boolean =>
  isLoopbackHost(host) || (Boolean(options.allowTailscale) && isTailscaleHost(host));

export const enforceNetworkAccess = (
  context: Context,
  options: NetworkAccessOptions = {},
): Response | null => {
  const hostHeader = context.req.header("host");
  const hostname = stripPort(hostHeader);
  if (!hostname || !isAllowedHost(hostname, options)) {
    return new Response("forbidden: host not allowed", { status: 403 });
  }
  const origin = context.req.header("origin");
  if (origin !== undefined) {
    const originHost = originHostname(origin);
    if (!originHost || !isAllowedHost(originHost, options)) {
      return new Response("forbidden: origin not allowed", { status: 403 });
    }
  }
  return null;
};

export const enforceLoopback = (context: Context): Response | null => enforceNetworkAccess(context);

export const createNetworkAccessMiddleware =
  (options: NetworkAccessOptions = {}): MiddlewareHandler =>
  async (context, next) => {
    const blocked = enforceNetworkAccess(context, options);
    if (blocked) return blocked;
    await next();
  };

export const loopbackMiddleware = createNetworkAccessMiddleware();
