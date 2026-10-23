import { Icon } from "@opencode/ui/icon"
import { showToast } from "@opencode/ui/toast"
import { createMemo, lazy, mapArray, onCleanup, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { Command, createKeyed, MenuItem, onIdle, Panel, Slot, type PanelTab, type SessionRef, type Setup } from "../sdk"
import { Preview } from "./contract"
import { detectURL, serverOrigin } from "./detect"
import type definition from "./index"

// How often a running shell's output is read while it has not announced an address yet.
const POLL_MS = 1_000

// Dev servers announce their address within seconds; a shell that stays quiet this long is not one.
const SCAN_MS = 3 * 60_000

// A shell that started this long before the window saw it announced its address to an earlier window: remember the
// address, but do not move the user's panel.
const FRESH_MS = 2 * 60_000

// An address can arrive split across output pages.
const TAIL = 8_192

// Announcements of one server this close together (a shell and a terminal both printing it, a quick restart) show it
// once, so a burst never opens a pile of tabs.
const SETTLE_MS = 10_000

const setup: Setup<typeof definition> = (ctx) => {
  const sessions = ctx.sessions
  const layout = ctx.layout
  const PreviewPane = lazy(() => import("./pane"))
  const CodePane = lazy(() => import("./code"))
  const DevServerButton = lazy(() => import("./header"))
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

    if (!open || !ctx.stores.prefs.value.auto) return

    // Like an app builder: the code sits beside the running app.
    if (layout.state(`${ctx.id}:code`, session) === "closed") layout.open(`${ctx.id}:code`, session, { tab: "append" })
    show(session, url)
  }

  // Runs the session's last dev server again through the composer's shell mode, so it shows in the timeline and the
  // preview opens once it announces its address.
  const start = (session: SessionRef) => {
    const dev = ctx.stores.dev(session).value

    if (!dev?.command) return
    const directory = session.location?.directory

    const command =
      dev.cwd && directory && trim(dev.cwd) !== trim(directory) ? `cd ${quote(dev.cwd)} && ${dev.command}` : dev.command

    void session.server.client.session
      .shell({ sessionID: session.id, command })
      .catch(() => showToast({ title: ctx.t("common.requestFailed") }))
  }

  const running = (session: SessionRef, command: string) =>
    session.server.data.shell
      .listBySession(session.id)
      .some(
        (shell) => shell.status === "running" && (shell.command === command || shell.command.endsWith(`&& ${command}`)),
      )

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

        return announce(session, url, open)
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
    const dev = ctx.stores.dev(session).value

    return {
      id: "start",
      title: ctx.t("command.start"),
      group: ctx.t("command.category.view"),
      enabled: !!dev?.command && !running(session, dev.command),
      run: () => start(session),
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
      <Show when={ctx.stores.dev(input.session).value?.command}>
        {(command) => (
          <Suspense>
            <DevServerButton
              command={command()}
              running={running(input.session, command())}
              onStart={() => start(input.session)}
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

  const codeTab: PanelTab = {
    id: "code",
    get title() {
      return ctx.t("code.title")
    },
    closable: "hover",
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
    list: (input) => (input.open.includes(codeTab.id) ? [codeTab] : []),
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
