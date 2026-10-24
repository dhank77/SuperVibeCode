import type { VcsSyncOutcome } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { showToast, type ToastAction } from "@opencode/ui/toast"
import { createMemo, createSignal, lazy, mapArray, onCleanup, Suspense } from "solid-js"
import { Command, createKeyed, MenuItem, Panel, type PanelTab, type SessionRef, type Setup } from "../sdk"
import { commitMessage, desktopLink } from "./git"
import type definition from "./index"

// Commits from one burst of agent turns go out in one push.
const PUSH_DELAY_MS = 20_000

const HistoryPane = lazy(() => import("./history"))

// Outcomes worth a word only when the user asked for the commit or push themselves.
const quiet: readonly VcsSyncOutcome[] = ["committed", "clean", "pushed", "norepo", "restored"]

// Outcomes whose toast says what to do next.
const explained: readonly VcsSyncOutcome[] = ["busy", "norepo", "noremote", "detached", "failed"]

const setup: Setup<typeof definition> = (ctx) => {
  const sessions = ctx.sessions
  const prefs = ctx.stores.prefs

  // One git operation at a time per workspace, so a commit and a push never race for git's index lock.
  const queues = new Map<string, Promise<unknown>>()
  const pushes = new Map<string, ReturnType<typeof setTimeout>>()
  // Problems already reported per workspace in this window, so the same one does not toast after every turn.
  const told = new Set<string>()
  // Bumped after each commit or restore, so an open history shows the new version.
  const [revision, setRevision] = createSignal(0)
  onCleanup(() => pushes.forEach((timer) => clearTimeout(timer)))

  // The server runs git itself, without a shell, with the user's own git configuration and stored credentials.
  const run = (session: SessionRef, operation: "commit" | "push" | "restore", value = "") => {
    const directory = session.location?.directory

    if (!directory) return Promise.resolve<VcsSyncOutcome>("failed")
    const client = session.server.client
    const location = { directory }
    const previous = queues.get(directory) ?? Promise.resolve()

    const next = previous
      .then(() => {
        if (operation === "commit") return client.vcs.commit({ location, message: value }, { signal: ctx.signal })

        if (operation === "restore") return client.vcs.restore({ location, hash: value }, { signal: ctx.signal })

        return client.vcs.push({ location }, { signal: ctx.signal })
      })
      .then((response): VcsSyncOutcome => response.data.outcome)
      .catch((): VcsSyncOutcome => "failed")

    queues.set(directory, next)

    return next
  }

  // GitHub Desktop opens through its own link scheme, which the desktop app hands to the operating system.
  const openDesktop = (session: SessionRef) => {
    const directory = session.location?.directory

    if (directory) ctx.system.openExternal(desktopLink(directory))
  }

  const actions = (session: SessionRef): ToastAction[] =>
    ctx.desktop ? [{ label: ctx.t("action.desktop"), onClick: () => openDesktop(session) }] : []

  const tell = (session: SessionRef, outcome: VcsSyncOutcome, asked: boolean) => {
    const key = `${session.location?.directory ?? session.key}\n${outcome}`

    if (!asked && (quiet.includes(outcome) || told.has(key))) return
    told.add(key)

    showToast({
      variant: outcome === "failed" || outcome === "busy" ? "error" : quiet.includes(outcome) ? "success" : "default",
      title: ctx.t(`${outcome}.title`),
      description: explained.includes(outcome) ? ctx.t(`${outcome}.description`) : undefined,
      actions: quiet.includes(outcome) ? [] : actions(session),
    })
  }

  const push = async (session: SessionRef, asked: boolean) => {
    const outcome = await run(session, "push")

    if (outcome === "pushed") told.clear()
    tell(session, outcome, asked)
  }

  const schedulePush = (session: SessionRef) => {
    const directory = session.location?.directory

    if (!directory) return
    clearTimeout(pushes.get(directory))
    pushes.set(
      directory,
      setTimeout(() => {
        pushes.delete(directory)
        void push(session, false)
      }, PUSH_DELAY_MS),
    )
  }

  const commit = async (session: SessionRef, message: string, asked: boolean) => {
    const outcome = await run(session, "commit", message)

    tell(session, outcome, asked)

    if (outcome === "committed") setRevision((value) => value + 1)

    if (outcome === "committed" && prefs.value.push) schedulePush(session)
  }

  // A restore is a new commit on top, so it pushes like any other: GitHub gets it without a force push.
  const restore = async (session: SessionRef, hash: string) => {
    const outcome = await run(session, "restore", hash)

    tell(session, outcome, true)

    if (outcome === "restored") setRevision((value) => value + 1)

    if (outcome === "restored" && prefs.value.push) void push(session, false)

    return outcome
  }

  // The user's latest prompt names the work the agent just did.
  const prompt = (session: SessionRef) =>
    session.server.data.session.message.list(session.id).findLast((item) => item.type === "user")?.text

  // Every open session, routed or in the background: when an agent turn ends, its changes become a commit.
  createMemo(
    mapArray(
      () => sessions.list().map((session) => session.key),
      (key) => {
        const session = () => sessions.list().find((item) => item.key === key)
        const turn = { running: false }

        createKeyed(
          () => {
            const current = session()

            return current?.id ? current.server.data.session.status(current.id) : undefined
          },
          (status) => {
            if (status === "running") {
              turn.running = true

              return
            }

            if (!turn.running) return
            turn.running = false
            const current = session()

            if (current && prefs.value.commit)
              void commit(current, commitMessage(prompt(current), ctx.t("message.fallback")), false)
          },
        )
      },
    ),
  )

  const routed = () => {
    const view = sessions.current()

    return view?.id ? sessions.list().find((item) => item.key === view.key) : undefined
  }

  const command = (id: string, title: string, action: (session: SessionRef) => void) =>
    ctx.add(Command, (): Command | undefined => {
      const session = routed()

      if (!session) return undefined

      return { id, title: ctx.t(title), group: ctx.t("command.category"), run: () => action(session) }
    })

  command("commit", "command.commit", (session) => {
    void commit(session, commitMessage(prompt(session), ctx.t("message.manual")), true)
  })
  command("push", "command.push", (session) => {
    void push(session, true)
  })

  if (ctx.desktop) command("desktop", "command.desktop", openDesktop)

  ctx.add(
    Command,
    (): Command => ({
      id: "toggle-commit",
      title: ctx.t(prefs.value.commit ? "command.commit.off" : "command.commit.on"),
      group: ctx.t("command.category"),
      run: () =>
        prefs.update((draft) => {
          draft.commit = !draft.commit
        }),
    }),
  )

  ctx.add(
    Command,
    (): Command => ({
      id: "toggle-push",
      title: ctx.t(prefs.value.push ? "command.push.off" : "command.push.on"),
      group: ctx.t("command.category"),
      run: () =>
        prefs.update((draft) => {
          draft.push = !draft.push
        }),
    }),
  )

  // Beside Code and Preview: every version the agent made, each one click from coming back.
  const historyTab: PanelTab = {
    id: "history",
    get title() {
      return ctx.t("history.title")
    },
    pinned: true,
    label: () => (
      <div class="flex items-center gap-1.5">
        <Icon name="outline-undo" size="small" />
        <span class="truncate">{ctx.t("history.title")}</span>
      </div>
    ),
  }

  ctx.add(Panel, {
    id: "history",
    region: "side",
    list: () => [historyTab],
    render: (props) => (
      <Suspense>
        <HistoryPane
          session={props.session}
          revision={revision()}
          restore={(hash) => restore(props.session, hash)}
          open={(url) => ctx.system.openExternal(url)}
        />
      </Suspense>
    ),
  })

  ctx.add(MenuItem, {
    menu: "session.panel",
    id: "history",
    get title() {
      return ctx.t("history.title")
    },
    icon: "outline-undo",
    order: 16,
    run() {
      const session = routed()

      if (session) ctx.layout.open("history", session)
    },
  })
}

export default setup
