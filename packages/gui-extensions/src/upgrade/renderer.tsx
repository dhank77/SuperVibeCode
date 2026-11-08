import { showToast } from "@opencode/ui/toast"
import { createSignal, lazy } from "solid-js"
import { createKeyed, type Setup } from "../sdk"
import type { Policy } from "./contract"
import type definition from "./index"

/**
 * Keeps users on a supported version. Below the publisher's minimum, a dialog that can't be dismissed asks for the
 * update; below the latest version, a reminder shows once per release.
 */
const setup: Setup<typeof definition> = (ctx) => {
  if (!ctx.desktop) return
  const Required = lazy(() => import("./required"))
  // Bumped when the required dialog is dismissed anyway (Escape, a backdrop click), which opens it again.
  const [opened, setOpened] = createSignal(0)

  const policy = (): Policy | undefined => {
    const live = ctx.uses.upgrade()

    return live.status === "active" ? live.value.state() : undefined
  }

  /** Installs the update where the app can do it itself; a Mac without a signed build, or a failure, downloads it. */
  const update = async () => {
    const current = policy()
    const updater = ctx.uses.updater()

    if (!current) return
    if (current.os !== "mac" && updater.status === "active") {
      const state = await updater.value.check({ signal: ctx.signal }).catch(() => undefined)

      if (state?.status === "ready" || state?.status === "download-required")
        return void updater.value.install().catch(() => ctx.system.openExternal(current.download))
    }
    ctx.system.openExternal(current.download)
  }

  const recheck = async () => {
    const live = ctx.uses.upgrade()

    if (live.status !== "active") return

    return live.value.refresh({ signal: ctx.signal }).catch(() => undefined)
  }

  createKeyed(
    () => (policy()?.status === "required" ? opened() + 1 : undefined),
    () => {
      ctx.dialogs.open(
        () => (
          <Required
            policy={() => policy()}
            update={update}
            recheck={recheck}
            dismissed={() => setOpened((count) => count + 1)}
          />
        ),
        { replace: true },
      )
    },
  )

  createKeyed(
    () => {
      const current = policy()

      if (current?.status !== "outdated" || !current.latest) return
      if (ctx.stores.dismissed.value.version === current.latest) return

      return current.latest
    },
    (latest) => {
      const current = policy()

      showToast({
        title: ctx.t("outdated.title", { latest }),
        description: ctx.t("outdated.description", { current: current?.current ?? ctx.build.version }),
        persistent: true,
        actions: [
          { label: ctx.t("outdated.update"), variant: "primary", onClick: () => void update() },
          {
            label: ctx.t("outdated.later"),
            onClick: () => ctx.stores.dismissed.set({ version: latest }),
          },
        ],
      })
    },
  )
}

export default setup
