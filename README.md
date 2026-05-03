# localterm

A browser-based terminal: one browser tab is one PTY session. Persistent xterm.js front-end, hono + node-pty back-end. pnpm monorepo built on [vite-plus](https://github.com/voidzero-dev/vite-plus) and [turbo](https://turbo.build).

The mental model is "shell = browser tab". Spawn another shell by opening a new browser tab and visiting localterm again; close a tab to retire its shell (the daemon reaps it after a short grace window). Reload restores the same shell because the page writes its session id into the URL path — e.g. `http://localterm.localhost/jolly-chipmunk-trea`.

## Quick start

```bash
pnpm install
pnpm build
sudo pnpm start
```

Opens `http://localterm.localhost` in your browser. (`*.localhost` is reserved by RFC 6761 and resolves to `127.0.0.1` in every modern browser — no `/etc/hosts` edit needed.) `Ctrl+C` stops the daemon and tears down all sessions.

`sudo` is needed to bind port 80; localterm immediately drops back to the invoking user (`SUDO_UID` / `SUDO_GID`) before accepting any connections, so every PTY runs under your normal account, never root. If a daemon ever boots up still elevated for any reason, it refuses to keep listening and exits.

If you don't want to type `sudo`, run on a high port instead — localterm includes the port in the URL when it isn't 80:

```bash
pnpm start -- --port 3417
# -> http://localterm.localhost:3417
```

## CLI

```bash
localterm start [-p 80] [-H 127.0.0.1] [--no-open]
localterm stop
localterm status
localterm restart        # detached restart, logs to ~/.localterm/server.log
localterm list           # ls
localterm new [-c cwd] [-s shell]
localterm kill <id>
```

State lives in `~/.localterm/` (PID, port, server log). When started under `sudo`, the state directory still resolves to the invoking user's `$HOME`, not `/var/root`.

`localterm` only binds loopback hosts (`127.0.0.1`, `localhost`, `*.localhost`, `::1`); non-loopback values are rejected. All `/api` and `/ws` routes additionally check the `Host` and `Origin` headers to defeat DNS-rebinding attacks.

## Tabs and shortcuts

There are no app-level keybindings — the browser is the tab manager. `Cmd+T` opens a browser tab; navigate it to your localterm URL to spawn a shell. `Cmd+W` closes a tab and `beforeunload` will ask before it goes. `Cmd+1`–`9` switch between tabs. Closing a tab without a refresh leaves the PTY idle; the server reaps it 30s after the last WebSocket disconnects.

## Structure

```
apps/
  web/          # vite + react + tailwind v4 + xterm.js
packages/
  server/       # hono + ws + node-pty + headless xterm (state mirror, idle reaper)
  cli/          # commander entry: start/stop/status/restart/list/new/kill
```

The server keeps a `@xterm/headless` instance per session, fed from every PTY chunk. On reconnect, the WebSocket sends a `serialize()` snapshot before live output resumes — so reloading the page (or even restarting the browser) restores vim/htop/less state exactly.

## Scripts

- `pnpm build` — turbo build (web → server → cli)
- `pnpm dev` — turbo watch all packages
- `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm format`

See `AGENTS.md` for code style and `CONTRIBUTING.md` for the contribution flow.
