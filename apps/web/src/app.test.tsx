import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";
import * as api from "./lib/api";
import type { SessionMetadata } from "./lib/types";

vi.mock("./components/terminal", () => ({
  Terminal: ({ sessionId }: { sessionId: string }) => <div data-testid="terminal">{sessionId}</div>,
}));

const makeSession = (id: string): SessionMetadata => ({
  id,
  title: id,
  cwd: "/tmp",
  shell: "/bin/sh",
  pid: 1,
  cols: 80,
  rows: 24,
  createdAt: 0,
  exited: false,
  exitCode: null,
});

const setBrowserUrl = (relative: string) => {
  window.history.replaceState({}, "", relative);
};

const getCurrentPath = (): string => window.location.pathname;
const getCurrentSearch = (): string => window.location.search;

beforeEach(() => {
  setBrowserUrl("/");
});

afterEach(() => {
  vi.restoreAllMocks();
  setBrowserUrl("/");
});

describe("App", () => {
  it("creates a session at root and rewrites the path to /<id>", async () => {
    const create = vi
      .spyOn(api, "createSession")
      .mockResolvedValue(makeSession("jolly-otter-2k4r"));

    render(<App />);

    expect(await screen.findByTestId("terminal")).toHaveTextContent("jolly-otter-2k4r");
    expect(create).toHaveBeenCalledTimes(1);
    expect(getCurrentPath()).toBe("/jolly-otter-2k4r");
  });

  it("uses a path-segment id without contacting the server", async () => {
    setBrowserUrl("/sage-lion-cbqt");
    const create = vi.spyOn(api, "createSession");

    render(<App />);

    expect(await screen.findByTestId("terminal")).toHaveTextContent("sage-lion-cbqt");
    expect(create).not.toHaveBeenCalled();
    expect(getCurrentPath()).toBe("/sage-lion-cbqt");
  });

  it("upgrades a legacy ?id= URL into the path form", async () => {
    setBrowserUrl("/?id=legacy-fox-9mka");
    const create = vi.spyOn(api, "createSession");

    render(<App />);

    expect(await screen.findByTestId("terminal")).toHaveTextContent("legacy-fox-9mka");
    expect(create).not.toHaveBeenCalled();
    expect(getCurrentPath()).toBe("/legacy-fox-9mka");
    expect(getCurrentSearch()).toBe("");
  });

  it("upgrades the older ?tab= URL into the path form", async () => {
    setBrowserUrl("/?tab=legacy-fox-9mka");
    const create = vi.spyOn(api, "createSession");

    render(<App />);

    expect(await screen.findByTestId("terminal")).toHaveTextContent("legacy-fox-9mka");
    expect(create).not.toHaveBeenCalled();
    expect(getCurrentPath()).toBe("/legacy-fox-9mka");
  });

  it("ignores garbage paths and bootstraps a fresh session", async () => {
    setBrowserUrl("/index.html");
    const create = vi.spyOn(api, "createSession").mockResolvedValue(makeSession("fresh-bear-7m3a"));

    render(<App />);

    expect(await screen.findByTestId("terminal")).toHaveTextContent("fresh-bear-7m3a");
    expect(create).toHaveBeenCalledTimes(1);
    expect(getCurrentPath()).toBe("/fresh-bear-7m3a");
  });

  it("renders a static error notice when bootstrap fails", async () => {
    vi.spyOn(api, "createSession").mockRejectedValue(new Error("server down"));

    render(<App />);

    expect(await screen.findByText(/cannot reach localterm/)).toBeInTheDocument();
    expect(screen.getByText(/server down/)).toBeInTheDocument();
  });

  it("registers a beforeunload listener once a session is live", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    vi.spyOn(api, "createSession").mockResolvedValue(makeSession("alpha-otter-aaaa"));

    render(<App />);

    await screen.findByTestId("terminal");
    await waitFor(() => {
      const wasRegistered = addSpy.mock.calls.some(([eventName]) => eventName === "beforeunload");
      expect(wasRegistered).toBe(true);
    });
  });
});
