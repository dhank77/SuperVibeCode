import { Button } from "@opencode/ui/button"
import { Tooltip } from "@opencode/ui/tooltip"
import { Show } from "solid-js"
import { useExtension } from "../sdk"
import type definition from "./index"

/** The session's dev server in the timeline title row: start the last one again, or show the running one. */
export default function DevServerButton(props: { command: string; running: boolean; onStart(): void; onShow(): void }) {
  const extension = useExtension<typeof definition>()

  return (
    <Show
      when={props.running}
      fallback={
        <Tooltip placement="bottom" value={extension.t("start.tooltip", { command: props.command })}>
          <Button size="small" variant="neutral" icon="outline-play" onClick={() => props.onStart()}>
            {extension.t("start.label")}
          </Button>
        </Tooltip>
      }
    >
      <Tooltip placement="bottom" value={extension.t("running.tooltip", { command: props.command })}>
        <Button size="small" variant="ghost" icon="outline-globe" onClick={() => props.onShow()}>
          {extension.t("running.label")}
        </Button>
      </Tooltip>
    </Show>
  )
}
