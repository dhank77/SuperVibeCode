import { Icon } from "@opencode/ui/icon"
import { createMemo, lazy, mapArray, onCleanup, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { Command, createKeyed, onIdle, Panel, type PanelTab, type SessionRef, type Setup } from "../sdk"
import { Preview } from "./contract"
import { detectURL } from "./detect"
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

const setup: Setup<typeof definition> = (ctx) => {
  const sessions = ctx.sessions
  const layout = ctx.layout
  const PreviewPane = lazy(() => import("./pane"))
  onCleanup(onIdle(() => void PreviewPane.preload()))

  // The last address each session's dev server announced, keyed by `session.key`.
  const [found, setFound] = createStore<Record<string, string>>({})

  const routed = () => {
    const view = sessions.current()

    if (!view?.id) return undefined

    return sessions.list().find((item) => item.key === view.key)
  }

  // The desktop's browser pane shows the app with devtools and agent control; elsewhere this extension's own panel
  // shows it in a frame.
  const show = (session: SessionRef, url: string) => {
    const browser = ctx.uses.browser()

    if (browser.status === "active" && browser.value.attached(session)) return browser.value.show(session, url)
    layout.open(`${ctx.id}:app`, session, { tab: "select" })
  }

  const announce = (session: SessionRef, url: string, open: boolean) => {
    setFound(session.key, url)

    if (open && ctx.stores.prefs.value.auto) show(session, url)
  }

  const watch = (session: SessionRef, id: string) => {
    const shell = session.server.data.shell.get(id)

    if (!shell) return
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

      if (url) return announce(session, url, open)
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))

      return read(page?.data.cursor ?? cursor, text)
    }

    void read(0, "")
  }

  // The routed session's running shells, the agent's and the composer's shell mode alike. Each one is read until it
  // announces an address, exits, or stays quiet past `SCAN_MS`.
  createKeyed(routed, (session) => {
    if (session.location) void session.server.data.shell.sync(session.location)

    const running = createMemo(
      () =>
        session.server.data.shell
          .listBySession(session.id)
          .filter((shell) => shell.status === "running")
          .map((shell) => shell.id),
      [],
      { equals: (previous, next) => previous.join("\n") === next.join("\n") },
    )

    createMemo(mapArray(running, (id) => watch(session, id)))
  })

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
    const url = found[session.key]

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
        <PreviewPane url={found[props.session.key]} />
      </Suspense>
    ),
  })
}

const trim = (directory: string) => directory.replace(/[\\/]+$/, "")

export default setup
