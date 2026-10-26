import { Icon } from "@opencode/ui/icon"
import { showToast } from "@opencode/ui/toast"
import { createMemo, lazy, mapArray, onCleanup, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import {
  Command,
  createKeyed,
  createLatest,
  LinkHandler,
  MenuItem,
  onIdle,
  Panel,
  Slot,
  type PanelTab,
  type SessionRef,
  type Setup,
} from "../sdk"
import { Preview } from "./contract"
import { detectURL, isLocalServer, serverOrigin } from "./detect"
import { guessPlan, type Plan } from "./guess"
import type definition from "./index"

// How often a running shell's output is read while it has not announced an address yet.
const POLL_MS = 1_000

// Dev servers announce their address within seconds; a shell that stays quiet this long is not one.
const SCAN_MS = 3 * 60_000

// A shell that started this long before the window saw it announced its address to an earlier window: remember the
// address, but do not move the user's panel.
const FRESH_MS = 2 * 60_000

// How long dependencies may take to install before the server starts anyway, and how long their command may take to
// show up as running.
const INSTALL_MS = 15 * 60_000

const APPEAR_MS = 15_000

// An address can arrive split across output pages.
const TAIL = 8_192

// Announcements of one server this close together (a shell and a terminal both printing it, a quick restart) show it
// once, so a burst never opens a pile of tabs.
const SETTLE_MS = 10_000

// A server that could not start because another one holds its port.
const BUSY = /EADDRINUSE|address already in use/i

const setup: Setup<typeof definition> = (ctx) => {
  const sessions = ctx.sessions
  const layout = ctx.layout
  const PreviewPane = lazy(() => import("./pane"))
  const CodePane = lazy(() => import("./code"))
  const DevServerButton = lazy(() => import("./header"))
  const DeployButton = lazy(() => import("./deploy"))
  onCleanup(
    onIdle(() => {
      void PreviewPane.preload()
      void CodePane.preload()
      void DevServerButton.preload()
    }),
  )

  const [state, setState] = createStore<{
    // The last address each session's dev server announced, keyed by `session.key`.
    found: Record<string, string>
    // An address the desktop browser pane shows once it attaches to the session, keyed by `session.key`.
    pending: Record<string, string | undefined>
    // The file the code view shows, keyed by `session.key`.
    code: Record<string, string | undefined>
  }>({ found: {}, pending: {}, code: {} })

  // Shells whose address was already announced, per session key, so returning to a session never opens it again.
  const announced = new Map<string, Set<string>>()
  // The server last shown per session key, and when.
  const shown = new Map<string, { origin: string | undefined; at: number }>()
  // The session and shell that announced each server origin, so a session whose address is held by another session's
  // server (another project still running on that port) is told whose app it would show.
  const owners = new Map<string, { session: SessionRef; id: string }>()

  const stop = (owner: { session: SessionRef; id: string }) => {
    const shell = owner.session.server.data.shell.get(owner.id)

    void owner.session.server.client.shell
      .remove({ id: owner.id, location: shell?.location ?? { directory: owner.session.location?.directory } })
      .then(() => {
        for (const [origin, item] of owners) if (item.id === owner.id) owners.delete(origin)
      })
      .catch(() => showToast({ variant: "error", title: ctx.t("common.requestFailed") }))
  }

  // Another session's server still running at this origin, if any.
  const foreign = (session: SessionRef, origin: string | undefined) => {
    const owner = origin ? owners.get(origin) : undefined

    if (!owner || owner.session.key === session.key) return undefined

    if (owner.session.server.data.shell.get(owner.id)?.status !== "running") {
      if (origin) owners.delete(origin)

      return undefined
    }

    return owner
  }

  const warnForeign = (owner: { session: SessionRef; id: string }, url: string) => {
    const shell = owner.session.server.data.shell.get(owner.id)

    showToast({
      title: ctx.t("conflict.title", { url }),
      description: ctx.t("conflict.description", { command: shell?.command ?? "" }),
      persistent: true,
      actions: [
        { label: ctx.t("conflict.stop"), variant: "primary", onClick: () => stop(owner) },
        { label: ctx.t("conflict.dismiss"), onClick: "dismiss" },
      ],
    })
  }

  const routed = () => {
    const view = sessions.current()

    if (!view?.id) return undefined

    return sessions.list().find((item) => item.key === view.key)
  }

  // On desktop the browser pane shows the app, with devtools and agent control, and reuses the tab on the same server.
  // Until the pane attaches the address waits for it; a frame there would leave the app window. Only windows without
  // the pane (the web, or the browser extension turned off) show the app in this extension's own panel.
  const show = (session: SessionRef, url: string, force = false) => {
    const origin = serverOrigin(url)
    const last = shown.get(session.key)

    if (!force && last && last.origin === origin && Date.now() - last.at < SETTLE_MS) return
    shown.set(session.key, { origin, at: Date.now() })
    const owner = foreign(session, origin)

    if (owner) warnForeign(owner, url)
    const browser = ctx.uses.browser()

    if (browser.status === "active" && browser.value.attached(session)) return browser.value.show(session, url)

    if (browser.status === "active" || browser.status === "pending") return setState("pending", session.key, url)
    layout.open(`${ctx.id}:app`, session, { tab: "select" })
  }

  // Syncs a waiting address with the desktop browser pane once it attaches to the routed session.
  createKeyed(
    () => {
      const session = routed()
      const browser = ctx.uses.browser()
      const url = session && state.pending[session.key]

      if (!session || !url || browser.status !== "active" || !browser.value.attached(session)) return undefined

      return { session, url, browser: browser.value }
    },
    (input) => {
      setState("pending", input.session.key, undefined)
      input.browser.show(input.session, input.url)
    },
    { equals: (previous, next) => previous.session.key === next.session.key && previous.url === next.url },
  )

  const announce = (session: SessionRef, url: string, open: boolean) => {
    setState("found", session.key, url)

    if (open && ctx.stores.prefs.value.auto) show(session, url)
  }

  const running = (session: SessionRef, command: string) =>
    session.server.data.shell
      .listBySession(session.id)
      .some(
        (shell) => shell.status === "running" && (shell.command === command || shell.command.endsWith(`&& ${command}`)),
      )

  // What the routed session's workspace would run, read from its root, for sessions that never started a server. Read
  // again after each agent turn, which may have created the project.
  const guessed = createLatest(
    () => {
      const session = routed()

      if (!session?.location) return undefined

      return `${session.key}\n${session.location.directory}\n${session.server.data.session.status(session.id)}`
    },
    async (key, signal) => {
      const session = routed()
      const directory = session?.location?.directory

      if (!session || !directory || !key.startsWith(`${session.key}\n`)) return undefined

      const client = session.server.client
      const location = { directory }
      const listing = await client.file.list({ location }, { signal })
      const files = listing.data.map((entry) => entry.path.replace(/[\\/]+$/, ""))

      const packageJson = files.includes("package.json")
        ? new TextDecoder().decode(await client.file.read({ location, path: "package.json" }, { signal }))
        : undefined

      return { session: session.key, plan: guessPlan({ files, packageJson }) }
    },
  )

  // The server to start: the one this session ran before, else the workspace's likely one.
  const plan = (session: SessionRef): Plan | undefined => {
    const dev = ctx.stores.dev(session).value
    const directory = session.location?.directory

    if (dev?.command)
      return {
        command:
          dev.cwd && directory && trim(dev.cwd) !== trim(directory)
            ? `cd ${quote(dev.cwd)} && ${dev.command}`
            : dev.command,
      }

    const latest = guessed.latest

    return latest?.session === session.key ? latest.plan : undefined
  }

  const shell = (session: SessionRef, command: string) =>
    session.server.client.session.shell({ sessionID: session.id, command })

  // Waits for a command the session started to finish, so the server starts after its dependencies installed. Gives up
  // when it never shows up as running, or runs longer than an install should.
  const settle = async (session: SessionRef, command: string) => {
    const started = Date.now()
    const appeared = { seen: false }

    const poll = async (): Promise<void> => {
      if (ctx.signal.aborted || Date.now() - started > INSTALL_MS) return

      const busy = running(session, command)

      if (busy) appeared.seen = true

      if (!busy && (appeared.seen || Date.now() - started > APPEAR_MS)) return

      await new Promise((resolve) => setTimeout(resolve, POLL_MS))

      return poll()
    }

    await poll()
  }

  // Runs the dev server through the composer's shell mode, installing dependencies first when they are missing, so
  // each step shows in the timeline and the preview opens once the server announces its address.
  const start = async (session: SessionRef) => {
    const next = plan(session)

    if (!next) return

    const failed = () => showToast({ title: ctx.t("common.requestFailed") })

    if (next.install) {
      const installing = await shell(session, next.install).then(
        () => true,
        () => false,
      )

      if (!installing) return failed()

      await settle(session, next.install)
    }

    await shell(session, next.command).catch(failed)
  }

  const watch = (session: SessionRef, id: string) => {
    const seen = announced.get(session.key) ?? new Set<string>()
    announced.set(session.key, seen)
    const shell = session.server.data.shell.get(id)

    if (!shell || seen.has(id)) return
    const open = Date.now() - shell.time.started < FRESH_MS
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    const signal = AbortSignal.any([ctx.signal, controller.signal])
    const deadline = Date.now() + SCAN_MS

    const read = async (cursor: number, tail: string): Promise<void> => {
      if (signal.aborted || Date.now() > deadline) return

      const page = await session.server.client.shell
        .output({ id, location: shell.location, cursor }, { signal })
        .catch(() => undefined)

      if (signal.aborted) return
      const text = (tail + (page?.data.output ?? "")).slice(-TAIL)
      const url = detectURL(text)

      if (url) {
        seen.add(id)
        void ctx.stores.dev(session).set({ command: shell.command, cwd: shell.cwd })
        const origin = serverOrigin(url)

        if (origin) owners.set(origin, { session, id })

        return announce(session, url, open)
      }

      if (BUSY.test(text)) {
        seen.add(id)

        return void showToast({
          variant: "error",
          title: ctx.t("busy.title"),
          description: ctx.t("busy.description", { command: shell.command }),
        })
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_MS))

      return read(page?.data.cursor ?? cursor, text)
    }

    void read(0, "")
  }

  // The routed session's running shells, the agent's and the composer's shell mode alike. Each one is read until it
  // announces an address, exits, or stays quiet past `SCAN_MS`. Keyed by the session's key, so a new session object for
  // the same session keeps the shells it already reads.
  createKeyed(
    () => routed()?.key,
    (key) => {
      const session = () => sessions.list().find((item) => item.key === key)
      const first = session()

      if (first?.location) void first.server.data.shell.sync(first.location)

      const running = createMemo(
        () => {
          const current = session()

          if (!current) return []

          return current.server.data.shell
            .listBySession(current.id)
            .filter((shell) => shell.status === "running")
            .map((shell) => shell.id)
        },
        [],
        { equals: (previous, next) => previous.join("\n") === next.join("\n") },
      )

      createMemo(
        mapArray(running, (id) => {
          const current = session()

          if (current) watch(current, id)
        }),
      )
    },
  )

  ctx.provide(Preview, {
    scan(input) {
      const url = detectURL(input.text)

      if (!url) return false
      const session = routed()
      const view = sessions.current()

      if (session && view && session.server.id === input.server && trim(view.directory) === trim(input.directory))
        announce(session, url, true)

      return true
    },
  })

  // A local server link in the conversation, e.g. the agent's "see it at http://localhost:5174/about", opens in the
  // preview instead of a system browser. Ahead of the file extension, which takes every other local link.
  ctx.add(LinkHandler, {
    priority: 20,
    match: (link) => !!link.session && isLocalServer(link.href),
    open(link) {
      if (!link.session) return

      setState("found", link.session.key, link.href)
      show(link.session, link.href, true)
    },
    exists: () => true,
  })

  ctx.add(Command, (): Command | undefined => {
    const session = routed()

    if (!session) return undefined
    const url = state.found[session.key]

    return {
      id: "open",
      title: ctx.t("command.open"),
      group: ctx.t("command.category.view"),
      enabled: !!url,
      run: () => {
        if (url) show(session, url)
      },
    }
  })

  ctx.add(
    Command,
    (): Command => ({
      id: "auto",
      title: ctx.t(ctx.stores.prefs.value.auto ? "command.auto.off" : "command.auto.on"),
      group: ctx.t("command.category.view"),
      run: () =>
        ctx.stores.prefs.update((draft) => {
          draft.auto = !draft.auto
        }),
    }),
  )

  ctx.add(Command, (): Command | undefined => {
    const session = routed()

    if (!session) return undefined
    const next = plan(session)

    return {
      id: "start",
      title: ctx.t("command.start"),
      group: ctx.t("command.category.view"),
      enabled: !!next && !running(session, next.command),
      run: () => void start(session),
    }
  })

  // Vercel hosts Node apps; a Laravel app needs a PHP host, so it gets no deploy button.
  const deployable = (session: SessionRef) => {
    const next = plan(session)

    return !!next && !next.command.includes("artisan")
  }

  // The agent deploys with the Vercel CLI, signing in first when needed, and reports the address.
  const deploy = (session: SessionRef) =>
    session.server.client.session
      .prompt({ sessionID: session.id, text: ctx.t("deploy.prompt") })
      .catch(() => showToast({ variant: "error", title: ctx.t("deploy.failed") }))

  ctx.add(Command, (): Command | undefined => {
    const session = routed()

    if (!session || !deployable(session)) return undefined

    return {
      id: "deploy",
      title: ctx.t("command.deploy"),
      group: ctx.t("command.category.view"),
      run: () => void deploy(session),
    }
  })

  const openCode = (session: SessionRef) => layout.open(`${ctx.id}:code`, session, { tab: "select" })

  ctx.add(Command, (): Command | undefined => {
    const session = routed()

    if (!session) return undefined

    return {
      id: "code",
      title: ctx.t("command.code"),
      group: ctx.t("command.category.view"),
      run: () => openCode(session),
    }
  })

  ctx.add(MenuItem, {
    menu: "session.panel",
    id: "code",
    get title() {
      return ctx.t("code.title")
    },
    icon: "code-slash",
    order: 15,
    run() {
      const session = routed()

      if (session) openCode(session)
    },
  })

  // The timeline title row starts the session's last dev server again, e.g. after opening it from the history.
  ctx.add(Slot, {
    at: "session.header",
    order: 30,
    render: (input) => (
      <Show when={plan(input.session)}>
        {(next) => (
          <Suspense>
            <DevServerButton
              command={next().install ? `${next().install} && ${next().command}` : next().command}
              running={running(input.session, next().command)}
              onStart={() => void start(input.session)}
              onShow={() => {
                const url = state.found[input.session.key]

                if (url) show(input.session, url, true)
              }}
            />
          </Suspense>
        )}
      </Show>
    ),
  })

  ctx.add(Slot, {
    at: "session.header",
    order: 31,
    render: (input) => (
      <Show when={deployable(input.session)}>
        <Suspense>
          <DeployButton onDeploy={() => void deploy(input.session)} />
        </Suspense>
      </Show>
    ),
  })

  // Always in the strip, like an app builder's code view beside the running app.
  const codeTab: PanelTab = {
    id: "code",
    get title() {
      return ctx.t("code.title")
    },
    pinned: true,
    label: () => (
      <div class="flex items-center gap-1.5">
        <Icon name="code-slash" size="small" />
        <span class="truncate">{ctx.t("code.title")}</span>
      </div>
    ),
  }

  ctx.add(Panel, {
    id: "code",
    region: "side",
    wide: true,
    list: () => [codeTab],
    render: (props) => (
      <Suspense>
        <CodePane
          session={props.session}
          screen={props.screen}
          path={state.code[props.session.key]}
          onSelect={(path) => setState("code", props.session.key, path)}
        />
      </Suspense>
    ),
  })

  const tab: PanelTab = {
    id: "app",
    get title() {
      return ctx.t("tab.title")
    },
    closable: "hover",
    label: () => (
      <div class="flex items-center gap-1.5">
        <Icon name="outline-globe" size="small" />
        <span class="truncate">{ctx.t("tab.title")}</span>
      </div>
    ),
  }

  ctx.add(Panel, {
    id: "app",
    region: "side",
    wide: true,
    list: (input) => (input.open.includes(tab.id) ? [tab] : []),
    render: (props) => (
      <Suspense>
        <PreviewPane url={state.found[props.session.key]} />
      </Suspense>
    ),
  })
}

const trim = (directory: string) => directory.replace(/[\\/]+$/, "")

// A POSIX shell word: the composer's shell mode runs commands through the user's shell.
const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

export default setup
