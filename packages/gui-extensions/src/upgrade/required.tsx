import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { showToast } from "@opencode/ui/toast"
import { onCleanup, Show } from "solid-js"
import { useExtension } from "../sdk"
import type { Policy } from "./contract"
import type definition from "./index"

/** The update the app requires. Dismissing it some other way calls `dismissed`, which opens it again. */
export default function Required(props: {
  policy: () => Policy | undefined
  update(): Promise<void>
  recheck(): Promise<Policy | undefined>
  dismissed(): void
}) {
  const ctx = useExtension<typeof definition>()
  const command = () => `curl -fsSL ${props.policy()?.site ?? "https://supervibecode.ai.id"}/install.sh | bash`

  // Closed by the app because the requirement ended, the owner run ends first and this is a no-op there.
  onCleanup(() => {
    if (props.policy()?.status === "required") queueMicrotask(props.dismissed)
  })

  const recheck = async () => {
    const policy = await props.recheck()

    if (policy?.status === "required") showToast({ title: ctx.t("required.stillOld", { current: policy.current }) })
  }

  return (
    <Dialog fit containerClass="max-w-[min(460px,calc(100vw-32px))]">
      <DialogHeader>
        <DialogTitleGroup
          title={ctx.t("required.title")}
          description={
            props.policy()?.message ||
            (props.policy()?.latest
              ? ctx.t("required.description", { current: ctx.build.version, latest: props.policy()?.latest ?? "" })
              : ctx.t("required.descriptionNoLatest", { current: ctx.build.version }))
          }
        />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-3 px-4 pb-4">
        <Show
          when={props.policy()?.os === "mac"}
          fallback={
            <Button variant="contrast" onClick={() => void props.update()}>
              {ctx.t("required.update")}
            </Button>
          }
        >
          <p class="text-13-regular text-v2-text-text-muted">{ctx.t("required.mac")}</p>
          <code class="block overflow-x-auto rounded-[6px] bg-v2-background-bg-base px-3 py-2 text-12-regular">
            {command()}
          </code>
          <Button
            variant="contrast"
            onClick={() => void ctx.system.copy(command()).then(() => showToast({ title: ctx.t("required.copied") }))}
          >
            {ctx.t("required.copy")}
          </Button>
        </Show>
        <div class="flex flex-wrap justify-between gap-2">
          <Button size="small" variant="ghost" onClick={() => ctx.system.openExternal(props.policy()?.download ?? "")}>
            {ctx.t("required.download")}
          </Button>
          <Button size="small" variant="ghost-muted" onClick={() => void recheck()}>
            {ctx.t("required.recheck")}
          </Button>
        </div>
      </DialogBody>
    </Dialog>
  )
}
