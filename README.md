# localterm

[![version](https://img.shields.io/npm/v/localterm?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/localterm)
[![downloads](https://img.shields.io/npm/dt/localterm.svg?style=flat&colorA=000000&colorB=000000)](https://npmjs.com/package/localterm)

Your terminal should just be a browser tab.

Run `npx localterm@latest start` and every browser tab is one shell. Open a new tab to spawn another. Close the tab to kill it. That's the whole product.

![demo](https://www.localterm.dev/demo.png)

## Install

Run this command anywhere:

```bash
npx localterm@latest start
```

This boots a local daemon and opens [`http://localterm.localhost:3417`](http://localterm.localhost:3417) in your browser. (`*.localhost` is reserved by [RFC 6761](https://datatracker.ietf.org/doc/html/rfc6761) and resolves to `127.0.0.1` in every modern browser, so no `/etc/hosts` edit needed.)

To install globally:

```bash
npm install -g localterm
localterm start
```

## Usage

The mental model is **shell = browser tab**:

- **New tab** → new shell
- **Close tab** → shell dies immediately
- **Reload tab** → fresh shell (the prior one is gone)

No session ids, no URL slugs, no reconnects. If you want a long-lived shell that survives reloads, run `tmux` _inside_ localterm.

## CLI

```bash
localterm start [-p 3417] [-H 127.0.0.1] [--allow-tailscale] [--no-open]   # daemonizes by default
localterm stop
localterm status
localterm url
localterm restart
```

State lives in `~/.localterm/` (PID, host, port, URL, server log at `~/.localterm/server.log`).

## Tailscale

To use localterm from another device in your tailnet, bind it to this machine's Tailscale IP and opt in to tailnet access:

```bash
npx localterm@latest start --host "$(tailscale ip -4)" --allow-tailscale --no-open
```

Then open the printed `http://<machine>.<tailnet>.ts.net:3417` URL from your Mac. Raw Tailscale IPs still work, but the CLI prefers the MagicDNS URL when it can read one from `tailscale status --json`.
When MagicDNS is enabled, `localterm start` and `localterm restart` print the `http://<machine>.<tailnet>.ts.net:3417` URL instead of the Tailscale IP. Run `localterm url` later to print it again, or `localterm status` for the full status block.

Anyone who can reach that URL on your tailnet can control a shell on this machine, so only use this on a tailnet you trust.

## Fork Fixes

This fork adds:

- Opt-in Tailscale access with `--allow-tailscale`, including MagicDNS `*.ts.net` Host and Origin validation.
- Startup, restart, status, and `localterm url` output that prefers the Tailscale MagicDNS URL over the raw Tailscale IP when available.
- Persisted daemon host and URL state in `~/.localterm/` so follow-up CLI commands print the same reachable URL.
- Clear connection-loss reporting and bounded WebSocket shutdown behavior from the fork's server/terminal fixes.
- Terminal usability fixes from the fork, including local font selection, scrollbar handling, Shift+Enter in TUIs, and duplicated-tab favicon state.

## Security

- Binds loopback hosts only: `127.0.0.1`, `localhost`, `*.localhost`, `::1`. Non-loopback values are rejected.
- Tailscale access is opt-in with `--allow-tailscale` and only admits Tailscale IPs or MagicDNS names.
- `/api/*` and `/ws` enforce allowed `Host` and `Origin` headers to defeat DNS-rebinding attacks.
- One PTY per WebSocket. Closing the tab kills the shell — no orphaned processes.

## Resources & Contributing Back

Looking to contribute back? Check out the [Contributing Guide](https://github.com/millionco/localterm/blob/main/CONTRIBUTING.md) and [`AGENTS.md`](https://github.com/millionco/localterm/blob/main/AGENTS.md) for code style.

Find a bug? Head over to our [issue tracker](https://github.com/millionco/localterm/issues) and we'll do our best to help. We love pull requests, too!

[**→ Start contributing on GitHub**](https://github.com/millionco/localterm/blob/main/CONTRIBUTING.md)

### License

localterm is MIT-licensed open-source software.
