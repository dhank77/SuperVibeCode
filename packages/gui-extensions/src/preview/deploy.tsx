import { Button } from "@opencode/ui/button"
import { Tooltip } from "@opencode/ui/tooltip"
import { useExtension } from "../sdk"
import type definition from "./index"

/** Asks the agent to put the app online on Vercel, in the timeline title row beside the dev server. */
export default function DeployButton(props: { onDeploy(): void }) {
  const extension = useExtension<typeof definition>()

  return (
    <Tooltip placement="bottom" value={extension.t("deploy.tooltip")}>
      <Button size="small" variant="ghost" icon="outline-arrow-up-right" onClick={() => props.onDeploy()}>
        {extension.t("deploy.label")}
      </Button>
    </Tooltip>
  )
}
