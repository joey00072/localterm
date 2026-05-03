import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import { Check, Copy, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { buildWebSocketUrl } from "@/lib/api";
import {
  COPY_FEEDBACK_MS,
  DEAD_SESSION_TITLE_PREFIX,
  DEFAULT_DOCUMENT_TITLE,
  DISCONNECT_MODAL_THRESHOLD_FAILURES,
  RECONNECT_DELAY_MS,
  RESIZE_DEBOUNCE_MS,
  RESTART_COMMAND,
  RETRY_BUTTON_FEEDBACK_MS,
  TERMINAL_BACKGROUND_HEX,
  TERMINAL_FONT_SIZE_PX,
  TERMINAL_LINE_HEIGHT,
  TERMINAL_SCROLLBACK_LINES,
  WS_CLOSE_SESSION_NOT_FOUND,
} from "@/lib/constants";
import { serverToClientMessageSchema } from "@/lib/schemas";
import type { ClientToServerMessage } from "@/lib/types";
import "@xterm/xterm/css/xterm.css";

const formatExitMarker = (code: number | null): string => {
  const description = code === null ? "shell exited" : `shell exited with code ${code}`;
  return `\r\n\x1b[2;31m[${description}]\x1b[0m\r\n`;
};

const titleForLiveSession = (raw: string): string => raw || DEFAULT_DOCUMENT_TITLE;
const titleForDeadSession = (raw: string): string =>
  `${DEAD_SESSION_TITLE_PREFIX}${raw || DEFAULT_DOCUMENT_TITLE}`;

interface TerminalProps {
  sessionId: string;
}

const TERMINAL_THEME_VESPER = {
  background: TERMINAL_BACKGROUND_HEX,
  foreground: "#ffffff",
  cursor: "#ffc799",
  cursorAccent: TERMINAL_BACKGROUND_HEX,
  selectionBackground: "#2a2a2a",
  selectionForeground: "#ffffff",
  black: TERMINAL_BACKGROUND_HEX,
  red: "#ff8080",
  green: "#99ffe4",
  yellow: "#ffc799",
  blue: "#a0a0a0",
  magenta: "#ffc799",
  cyan: "#99ffe4",
  white: "#ffffff",
  brightBlack: "#505050",
  brightRed: "#ff9999",
  brightGreen: "#b3ffe4",
  brightYellow: "#ffd1a8",
  brightBlue: "#b0b0b0",
  brightMagenta: "#ffc799",
  brightCyan: "#66ddcc",
  brightWhite: "#ffffff",
};

const FALLBACK_MONO_FONT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const resolveMonoFontFamily = (): string => {
  if (typeof window === "undefined") return FALLBACK_MONO_FONT_FAMILY;
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--font-mono")
    .trim();
  return value || FALLBACK_MONO_FONT_FAMILY;
};

const reloadToFreshSession = () => {
  window.location.assign(window.location.pathname);
};

const openNewShellInNewTab = () => {
  window.open(window.location.origin, "_blank", "noopener,noreferrer");
};

export const Terminal = ({ sessionId }: TerminalProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const manualReconnectRef = useRef<(() => void) | null>(null);
  const retryFeedbackTimerRef = useRef<number | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const [exitInfo, setExitInfo] = useState<{ code: number | null } | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [hasCopiedRestartCommand, setHasCopiedRestartCommand] = useState(false);
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let exited = false;
    let lastTitle = "";
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let resizeTimer: number | null = null;

    void document.fonts.load(`${TERMINAL_FONT_SIZE_PX}px "Geist Mono"`).catch(() => {});

    const terminal = new XtermTerminal({
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: resolveMonoFontFamily(),
      fontSize: TERMINAL_FONT_SIZE_PX,
      lineHeight: TERMINAL_LINE_HEIGHT,
      scrollback: TERMINAL_SCROLLBACK_LINES,
      theme: TERMINAL_THEME_VESPER,
      macOptionIsMeta: true,
      scrollOnUserInput: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new WebLinksAddon());
    terminal.loadAddon(new ClipboardAddon());
    const unicode11 = new Unicode11Addon();
    terminal.loadAddon(unicode11);
    terminal.unicode.activeVersion = "11";

    terminal.open(container);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch {
      /* webgl unavailable; xterm falls back to canvas */
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.key === "Tab" && (event.metaKey || event.ctrlKey)) return false;
      return true;
    });

    const send = (message: ClientToServerMessage) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };

    const sendResize = (cols: number, rows: number) => send({ type: "resize", cols, rows });

    const fitToContainer = () => {
      try {
        fit.fit();
        sendResize(terminal.cols, terminal.rows);
      } catch {
        /* container not yet measured */
      }
    };

    const scheduleFit = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        fitToContainer();
      }, RESIZE_DEBOUNCE_MS);
    };

    terminal.onData((data) => send({ type: "input", data }));
    terminal.onResize(({ cols, rows }) => sendResize(cols, rows));

    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    fitToContainer();
    terminal.focus();

    const connect = () => {
      if (disposed) return;
      const nextSocket = new WebSocket(buildWebSocketUrl(sessionId));
      socket = nextSocket;

      nextSocket.addEventListener("open", () => {
        if (disposed || socket !== nextSocket) return;
        setConsecutiveFailures(0);
        sendResize(terminal.cols, terminal.rows);
      });

      nextSocket.addEventListener("message", (event) => {
        if (disposed || socket !== nextSocket) return;
        let raw: unknown;
        try {
          raw = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
        } catch {
          return;
        }
        const parsed = serverToClientMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const message = parsed.data;
        if (message.type === "snapshot") {
          terminal.reset();
          terminal.write(message.data);
          lastTitle = message.title;
          setSessionTitle(message.title);
          document.title = exited ? titleForDeadSession(lastTitle) : titleForLiveSession(lastTitle);
        } else if (message.type === "output") {
          terminal.write(message.data);
        } else if (message.type === "title") {
          lastTitle = message.title;
          setSessionTitle(message.title);
          if (!exited) document.title = titleForLiveSession(lastTitle);
        } else if (message.type === "exit") {
          exited = true;
          terminal.write(formatExitMarker(message.code));
          document.title = titleForDeadSession(lastTitle);
          setExitInfo({ code: message.code });
        }
      });

      nextSocket.addEventListener("close", (event) => {
        if (socket === nextSocket) socket = null;
        if (disposed) return;
        if (exited) return;
        if (event.code === WS_CLOSE_SESSION_NOT_FOUND) {
          reloadToFreshSession();
          return;
        }
        if (socket !== null) return;
        setConsecutiveFailures((previous) => previous + 1);
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      });

      nextSocket.addEventListener("error", () => {
        try {
          nextSocket.close();
        } catch {
          /* socket already closing */
        }
      });
    };

    manualReconnectRef.current = () => {
      if (disposed || exited) return;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        socket?.close();
      } catch {
        /* socket already closing */
      }
      socket = null;
      connect();
    };

    connect();

    return () => {
      disposed = true;
      manualReconnectRef.current = null;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      observer.disconnect();
      try {
        socket?.close();
      } catch {
        /* socket already closed */
      }
      socket = null;
      terminal.dispose();
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, [sessionId]);

  const triggerManualReconnect = useCallback(() => {
    setIsRetryingConnection(true);
    manualReconnectRef.current?.();
    if (retryFeedbackTimerRef.current !== null) {
      window.clearTimeout(retryFeedbackTimerRef.current);
    }
    retryFeedbackTimerRef.current = window.setTimeout(() => {
      retryFeedbackTimerRef.current = null;
      setIsRetryingConnection(false);
    }, RETRY_BUTTON_FEEDBACK_MS);
  }, []);

  const copyRestartCommand = useCallback(() => {
    void navigator.clipboard
      .writeText(RESTART_COMMAND)
      .then(() => {
        setHasCopiedRestartCommand(true);
        if (copyFeedbackTimerRef.current !== null) {
          window.clearTimeout(copyFeedbackTimerRef.current);
        }
        copyFeedbackTimerRef.current = window.setTimeout(() => {
          copyFeedbackTimerRef.current = null;
          setHasCopiedRestartCommand(false);
        }, COPY_FEEDBACK_MS);
      })
      .catch(() => {
        /* clipboard permission denied; user can still select + copy manually */
      });
  }, []);

  useEffect(() => {
    return () => {
      if (retryFeedbackTimerRef.current !== null) {
        window.clearTimeout(retryFeedbackTimerRef.current);
        retryFeedbackTimerRef.current = null;
      }
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
        copyFeedbackTimerRef.current = null;
      }
    };
  }, []);

  const isShellDead = exitInfo !== null;
  const isDisconnected = !isShellDead && consecutiveFailures >= DISCONNECT_MODAL_THRESHOLD_FAILURES;
  const isModalOpen = isShellDead || isDisconnected;

  return (
    <div className="flex h-dvh w-dvw flex-col" style={{ background: TERMINAL_BACKGROUND_HEX }}>
      <header className="flex h-10 flex-none items-center justify-between gap-3 border-b border-border bg-background px-3">
        <div className="flex min-w-0 items-center gap-2">
          {isShellDead ? (
            <Badge variant="destructive" role="status" aria-live="polite">
              {exitInfo?.code === null ? "exited" : `exited · code ${exitInfo?.code}`}
            </Badge>
          ) : null}
          <span className="truncate font-mono text-sm text-muted-foreground">
            {sessionTitle || "shell"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="open a new shell in a new browser tab"
          title="opens in a new browser tab"
          render={<a href="/" target="_blank" rel="noopener noreferrer" />}
        >
          <Plus data-icon="inline-start" />
          New terminal
        </Button>
      </header>
      <div ref={containerRef} aria-label="terminal session" className="min-h-0 flex-1" />

      <AlertDialog open={isModalOpen}>
        <AlertDialogContent>
          {isShellDead ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Shell ended</AlertDialogTitle>
                <AlertDialogDescription>
                  {exitInfo?.code === null || exitInfo?.code === 0
                    ? "Open a new shell to keep going, or close this tab."
                    : `Exit code ${exitInfo?.code}. Open a new shell to keep going.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={openNewShellInNewTab}>New shell</AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
                  Lost connection
                </AlertDialogTitle>
                <AlertDialogDescription>
                  The localterm server isn't responding. Start it again from your terminal, then
                  retry.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  value={RESTART_COMMAND}
                  aria-label="restart command"
                  className="font-mono"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    onClick={copyRestartCommand}
                    aria-label={hasCopiedRestartCommand ? "Copied" : "Copy restart command"}
                  >
                    {hasCopiedRestartCommand ? <Check /> : <Copy />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <AlertDialogFooter>
                <AlertDialogAction onClick={triggerManualReconnect} disabled={isRetryingConnection}>
                  {isRetryingConnection ? <Spinner data-icon="inline-start" /> : null}
                  Retry
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
