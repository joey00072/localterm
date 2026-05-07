import { describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import {
  createNetworkAccessMiddleware,
  isAllowedHost,
  isLoopbackHost,
  isTailscaleHost,
  loopbackMiddleware,
} from "../src/security.js";

const app = new Hono();
app.use("*", loopbackMiddleware);
app.get("/probe", (context) => context.json({ ok: true }));

const tailscaleApp = new Hono();
tailscaleApp.use("*", createNetworkAccessMiddleware({ allowTailscale: true }));
tailscaleApp.get("/probe", (context) => context.json({ ok: true }));

const probe = (headers: Record<string, string>) =>
  app.request("http://localhost/probe", { headers });

const tailscaleProbe = (headers: Record<string, string>) =>
  tailscaleApp.request("http://localhost/probe", { headers });

describe("isLoopbackHost", () => {
  it("accepts loopback addresses", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
  });

  it("accepts *.localhost (RFC 6761, always resolves to loopback)", () => {
    expect(isLoopbackHost("localterm.localhost")).toBe(true);
    expect(isLoopbackHost("api.myapp.localhost")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("10.0.0.1")).toBe(false);
    expect(isLoopbackHost("evil.example.com")).toBe(false);
    expect(isLoopbackHost("notlocalhost")).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
  });
});

describe("isTailscaleHost", () => {
  it("accepts Tailscale IPv4, IPv6, and MagicDNS hosts", () => {
    expect(isTailscaleHost("100.64.0.1")).toBe(true);
    expect(isTailscaleHost("100.127.255.255")).toBe(true);
    expect(isTailscaleHost("fd7a:115c:a1e0::1")).toBe(true);
    expect(isTailscaleHost("[fd7a:115c:a1e0::1]")).toBe(true);
    expect(isTailscaleHost("workstation.tailnet.ts.net")).toBe(true);
  });

  it("rejects non-Tailscale private networks and unrelated names", () => {
    expect(isTailscaleHost("100.63.255.255")).toBe(false);
    expect(isTailscaleHost("100.128.0.0")).toBe(false);
    expect(isTailscaleHost("192.168.1.5")).toBe(false);
    expect(isTailscaleHost("evil.example.com")).toBe(false);
  });
});

describe("isAllowedHost", () => {
  it("keeps Tailscale hosts opt-in", () => {
    expect(isAllowedHost("127.0.0.1")).toBe(true);
    expect(isAllowedHost("100.64.0.1")).toBe(false);
    expect(isAllowedHost("100.64.0.1", { allowTailscale: true })).toBe(true);
  });
});

describe("loopbackMiddleware", () => {
  it("allows requests with loopback Host", async () => {
    const response = await probe({ host: "127.0.0.1:3417" });
    expect(response.status).toBe(200);
  });

  it("allows IPv6 loopback", async () => {
    const response = await probe({ host: "[::1]:3417" });
    expect(response.status).toBe(200);
  });

  it("rejects forged Host header (DNS rebind)", async () => {
    const response = await probe({ host: "evil.example.com" });
    expect(response.status).toBe(403);
  });

  it("allows reverse-proxied *.localhost Host header", async () => {
    const response = await probe({
      host: "localterm.localhost",
      origin: "https://localterm.localhost",
    });
    expect(response.status).toBe(200);
  });

  it("rejects cross-origin requests", async () => {
    const response = await probe({
      host: "127.0.0.1:3417",
      origin: "https://evil.example.com",
    });
    expect(response.status).toBe(403);
  });

  it("allows same-origin loopback requests", async () => {
    const response = await probe({
      host: "127.0.0.1:3417",
      origin: "http://127.0.0.1:3417",
    });
    expect(response.status).toBe(200);
  });

  it("allows null origin (non-CORS contexts)", async () => {
    const response = await probe({ host: "127.0.0.1:3417" });
    expect(response.status).toBe(200);
  });
});

describe("createNetworkAccessMiddleware", () => {
  it("allows Tailscale Host and Origin when enabled", async () => {
    const response = await tailscaleProbe({
      host: "100.64.0.1:3417",
      origin: "http://workstation.tailnet.ts.net:3417",
    });
    expect(response.status).toBe(200);
  });

  it("still rejects non-Tailscale Host headers when enabled", async () => {
    const response = await tailscaleProbe({ host: "192.168.1.5:3417" });
    expect(response.status).toBe(403);
  });
});
