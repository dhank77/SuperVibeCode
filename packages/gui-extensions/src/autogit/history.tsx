import type { VcsHistory, VcsSyncOutcome, VcsVersion } from "@opencode/client/promise"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { createResource, createSignal, For, Show } from "solid-js"
import { useExtension, type MountedSession } from "../sdk"
import { commitPage } from "./git"
import type definition from "./index"

/** The workspace's versions, newest first: one per agent turn, each restorable as a new commit. */
export default function HistoryPane(props: {
  session: MountedSession
  /** Changes whenever a commit or restore may have added a version. */
  revision: number
  restore(hash: string): Promise<VcsSyncOutcome>
  open(url: string): void
}) {
  const extension = useExtension<typeof definition>()
  const [confirming, setConfirming] = createSignal<string>()
  const [restoring, setRestoring] = createSignal<string>()
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

  const [history, { refetch }] = createResource(
    () => {
      const directory = props.session.location?.directory

      return directory ? { directory, revision: props.revision } : undefined
    },
    (input): Promise<VcsHistory | undefined> =>
      props.session.server.client.vcs
        .history({ location: { directory: input.directory } })
        .then((response) => response.data)
        .catch(() => undefined),
  )

  const restore = async (version: VcsVersion) => {
    setConfirming(undefined)
    setRestoring(version.hash)
    await props.restore(version.hash)
    setRestoring(undefined)
    void refetch()
  }

  const message = (text: string) => (
    <div class="flex flex-1 items-center justify-center px-6 text-center text-13-regular text-v2-text-text-subtle">
      {text}
    </div>
  )

  return (
    <Show
      when={history()?.versions.length ? history() : undefined}
      fallback={message(extension.t(history.loading ? "history.loading" : "history.empty"))}
    >
      {(current) => (
        <div class="flex size-full min-h-0 flex-col">
          <div class="flex shrink-0 items-center gap-2 border-b-[0.5px] border-v2-border-border-muted px-3 py-2">
            <span class="min-w-0 flex-1 truncate text-12-regular text-v2-text-text-muted">
              {extension.t("history.hint")}
            </span>
            <Show when={current().web}>
              {(web) => (
                <Button size="small" variant="ghost" onClick={() => props.open(web())}>
                  {extension.t("history.repository")}
                </Button>
              )}
            </Show>
          </div>
          <ol class="min-h-0 flex-1 overflow-y-auto py-1">
            <For each={current().versions}>
              {(version, index) => (
                <li class="group flex items-start gap-3 px-3 py-2 hover:bg-v2-background-bg-subtle">
                  <Icon
                    name={index() === 0 ? "outline-rotate-clockwise" : "outline-undo"}
                    size="small"
                    class="mt-0.5 shrink-0 text-v2-icon-icon-muted"
                  />
                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="text-13-regular text-v2-text-text-base" title={version.subject}>
                      {version.subject || version.hash.slice(0, 7)}
                    </span>
                    <span class="text-12-regular text-v2-text-text-subtle">
                      {date.format(version.time)} · {version.author} · {version.hash.slice(0, 7)}
                    </span>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <Show when={current().web}>
                      {(web) => (
                        <Button
                          size="small"
                          variant="ghost-muted"
                          onClick={() => props.open(commitPage(web(), version.hash))}
                        >
                          {extension.t("history.view")}
                        </Button>
                      )}
                    </Show>
                    <Show
                      when={index() > 0}
                      fallback={
                        <span class="px-2 text-12-regular text-v2-text-text-subtle">
                          {extension.t("history.current")}
                        </span>
                      }
                    >
                      <Show
                        when={confirming() === version.hash}
                        fallback={
                          <Button
                            size="small"
                            variant="neutral"
                            disabled={!!restoring()}
                            onClick={() => setConfirming(version.hash)}
                          >
                            {extension.t(restoring() === version.hash ? "history.restoring" : "history.restore")}
                          </Button>
                        }
                      >
                        <Button size="small" variant="ghost-muted" onClick={() => setConfirming(undefined)}>
                          {extension.t("history.cancel")}
                        </Button>
                        <Button size="small" variant="warning" onClick={() => void restore(version)}>
                          {extension.t("history.confirm")}
                        </Button>
                      </Show>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ol>
        </div>
      )}
    </Show>
  )
}
