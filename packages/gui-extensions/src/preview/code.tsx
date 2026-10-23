import { Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useExtension, type MountedSession, type SessionScreen } from "../sdk"
import type definition from "./index"

/** The workspace's files beside the selected file's code, like an editor, in one side panel tab. */
export default function CodePane(props: {
  session: MountedSession
  screen: SessionScreen
  path: string | undefined
  onSelect(path: string): void
}) {
  const extension = useExtension<typeof definition>()

  const files = () => {
    const tree = extension.uses.tree()

    return tree.status === "active" ? tree.value : undefined
  }

  const message = (text: string) => (
    <div class="flex flex-1 items-center justify-center px-6 text-center text-13-regular text-v2-text-text-subtle">
      {text}
    </div>
  )

  return (
    <Show when={files()} fallback={message(extension.t("code.unavailable"))}>
      {(tree) => (
        <div class="flex size-full min-h-0">
          <div class="w-60 shrink-0 overflow-y-auto border-r-[0.5px] border-v2-border-border-muted px-2 pt-2">
            <Dynamic
              component={tree().Tree}
              session={props.session}
              screen={props.screen}
              active={props.path}
              onFileClick={props.onSelect}
            />
          </div>
          <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <Show when={props.path} keyed fallback={message(extension.t("code.select"))}>
              {(path) => <Dynamic component={tree().View} session={props.session} screen={props.screen} path={path} />}
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}
