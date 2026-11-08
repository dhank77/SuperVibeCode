import { lazy, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { Command, createKeyed, TitlebarItem, type Plugin, type ServerRef } from "@opencode/plugin/gui"
import { call, formatBalance, type Status } from "./api"
import type definition from "./index"

// The balance follows spending while the app is open.
const REFRESH_MS = 60_000

/**
 * The SuperVibeCode AI service in the titlebar: a sign-in pill until the user signs in, then the balance, which opens
 * the account dialog for topping up. Shows nothing when the build has no service configured.
 */
const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const AccountDialog = lazy(() => import("./dialog"))
  const [state, setState] = createStore({ status: undefined as Status | undefined })

  // The app's own server: the service plugin runs there, beside the credentials it saves.
  const server = (): ServerRef | undefined => {
    const refs = ctx.servers.list().map((id) => ctx.servers.get(id))

    return refs.find((ref) => ref?.builtin) ?? refs.find((ref) => ref?.local)
  }

  const refresh = async () => {
    const ref = server()

    if (!ref) return
    // A server without the plugin, or a build without a service address, has no account RPC.
    const status = await call(ref, "status", {}).catch(() => undefined)

    if (ctx.signal.aborted) return
    setState("status", status ? reconcile(status) : undefined)
    // The first launch with the service available introduces it, so a new user can start without an API key.
    if (!status || status.signedIn || ctx.stores.prefs.value.introduced) return
    ctx.stores.prefs.set({ introduced: true })
    open()
  }

  const open = () => {
    const ref = server()
    const status = state.status

    if (!ref || !status) return
    ctx.dialogs.open((dialog) => (
      <AccountDialog server={ref} status={state.status ?? status} refresh={refresh} close={dialog.close} />
    ))
  }

  // Each connection of the app's server: load the status now and keep the balance current while it lasts.
  createKeyed(
    () => (server()?.connected ? server() : undefined),
    () => {
      void refresh()
      const timer = setInterval(() => void refresh(), REFRESH_MS)

      onCleanup(() => clearInterval(timer))
    },
  )

  ctx.add(TitlebarItem, () => {
    const status = state.status

    if (!status) return
    if (!status.signedIn || status.sessionExpired)
      return {
        id: "account",
        label: ctx.t("titlebar.signIn"),
        title: ctx.t("titlebar.signIn.title"),
        icon: "providers" as const,
        run: open,
      }

    return {
      id: "account",
      label: formatBalance(status, ctx.locale.locale()),
      title: ctx.t("titlebar.balance.title"),
      icon: "brain" as const,
      run: open,
    }
  })

  ctx.add(Command, {
    id: "open",
    get title() {
      return ctx.t("command.open")
    },
    run: open,
  })
}

export default setup
