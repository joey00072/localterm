import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "./terminal";

interface FakeWebSocketHandle {
  url: string;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  fireOpen: () => void;
  fireMessage: (payload: unknown) => void;
  fireClose: (code?: number) => void;
  fireError: () => void;
}

const fakeWebSockets: FakeWebSocketHandle[] = [];

const installFakeWebSocket = () => {
  class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly url: string;
    readyState: number = FakeWebSocket.CONNECTING;
    private listeners = new Map<string, Set<(event: unknown) => void>>();

    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = FakeWebSocket.CLOSED;
    });

    constructor(url: string) {
      this.url = url;
      fakeWebSockets.push({
        url,
        send: this.send,
        close: this.close,
        fireOpen: () => {
          this.readyState = FakeWebSocket.OPEN;
          this.dispatch("open", {});
        },
        fireMessage: (payload) => {
          this.dispatch("message", { data: JSON.stringify(payload) });
        },
        fireClose: (code = 1006) => {
          this.readyState = FakeWebSocket.CLOSED;
          this.dispatch("close", { code });
        },
        fireError: () => {
          this.dispatch("error", {});
        },
      });
    }

    addEventListener(name: string, handler: (event: unknown) => void): void {
      const set = this.listeners.get(name) ?? new Set();
      set.add(handler);
      this.listeners.set(name, set);
    }

    private dispatch(name: string, event: unknown): void {
      const set = this.listeners.get(name);
      if (!set) return;
      for (const handler of set) handler(event);
    }
  }
  vi.stubGlobal("WebSocket", FakeWebSocket);
};

vi.mock("@xterm/xterm", () => {
  class FakeXtermTerminal {
    cols = 80;
    rows = 24;
    unicode = { activeVersion: "11" };
    loadAddon = () => {};
    open = () => {};
    onData = () => {};
    onResize = () => {};
    attachCustomKeyEventHandler = () => {};
    write = () => {};
    reset = () => {};
    focus = () => {};
    dispose = () => {};
  }
  return { Terminal: FakeXtermTerminal };
});

vi.mock("@xterm/addon-fit", () => {
  class FakeFitAddon {
    fit = () => {};
  }
  return { FitAddon: FakeFitAddon };
});

vi.mock("@xterm/addon-clipboard", () => {
  class FakeClipboardAddon {}
  return { ClipboardAddon: FakeClipboardAddon };
});

vi.mock("@xterm/addon-unicode11", () => {
  class FakeUnicode11Addon {}
  return { Unicode11Addon: FakeUnicode11Addon };
});

vi.mock("@xterm/addon-web-links", () => {
  class FakeWebLinksAddon {}
  return { WebLinksAddon: FakeWebLinksAddon };
});

vi.mock("@xterm/addon-webgl", () => {
  class FakeWebglAddon {
    onContextLoss = () => {};
    dispose = () => {};
  }
  return { WebglAddon: FakeWebglAddon };
});

const stubBrowserGlobals = () => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load: () => Promise.resolve([]) },
  });
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
};

beforeEach(() => {
  fakeWebSockets.length = 0;
  stubBrowserGlobals();
  installFakeWebSocket();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Terminal modal", () => {
  it("does not show the lost-connection modal until two consecutive WebSocket closes", () => {
    render(<Terminal sessionId="alpha-otter-2k4r" />);

    expect(fakeWebSockets).toHaveLength(1);
    expect(screen.queryByText(/Lost connection/i)).toBeNull();

    act(() => {
      fakeWebSockets[0]?.fireClose();
    });
    expect(screen.queryByText(/Lost connection/i)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(fakeWebSockets).toHaveLength(2);

    act(() => {
      fakeWebSockets[1]?.fireClose();
    });
    expect(screen.queryByText(/Lost connection/i)).not.toBeNull();
  });

  it("closes the lost-connection modal when the WebSocket reconnects successfully", () => {
    render(<Terminal sessionId="alpha-otter-2k4r" />);
    act(() => {
      fakeWebSockets[0]?.fireClose();
      vi.advanceTimersByTime(1500);
      fakeWebSockets[1]?.fireClose();
    });
    expect(screen.queryByText(/Lost connection/i)).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1500);
      fakeWebSockets[2]?.fireOpen();
    });
    expect(screen.queryByText(/Lost connection/i)).toBeNull();
  });

  it("renders the dead-pill and 'Shell ended' modal when the server reports an exit", () => {
    render(<Terminal sessionId="alpha-otter-2k4r" />);
    act(() => {
      fakeWebSockets[0]?.fireOpen();
      fakeWebSockets[0]?.fireMessage({ type: "exit", code: 137 });
    });
    expect(screen.queryByText(/Shell ended/i)).not.toBeNull();
    expect(screen.queryByText(/exited · code 137/i)).not.toBeNull();
  });

  it("blocks the auto-reconnect loop after the shell exits", () => {
    render(<Terminal sessionId="alpha-otter-2k4r" />);
    act(() => {
      fakeWebSockets[0]?.fireOpen();
      fakeWebSockets[0]?.fireMessage({ type: "exit", code: 0 });
      fakeWebSockets[0]?.fireClose();
      vi.advanceTimersByTime(5000);
    });
    expect(fakeWebSockets).toHaveLength(1);
  });
});
