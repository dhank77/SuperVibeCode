import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { createSignal, Show } from "solid-js"
import { useExtension } from "../sdk"
import type definition from "./index"

/** The app in a frame, for windows without the desktop browser pane. */
export default function PreviewPane(props: { url: string | undefined }) {
  const extension = useExtension<typeof definition>()
  // Setting a frame's address again reloads it, also across origins where its own reload is out of reach.
  let frame: HTMLIFrameElement | undefined
  // Shows the app at a phone's viewport size, so its mobile layout shows.
  const [mobile, setMobile] = createSignal(false)

  return (
    <div class="flex h-full min-h-0 flex-col">
      <Show
        when={props.url}
        fallback={
          <div class="flex flex-1 items-center justify-center px-6 text-center text-13-regular text-v2-text-text-faint">
            {extension.t("empty")}
          </div>
        }
      >
        {(url) => (
          <>
            <div class="h-11 shrink-0 flex items-center gap-2 px-3 border-b-[0.5px] border-v2-border-border-muted">
              <span class="min-w-0 flex-1 truncate text-[13px] font-[440] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                {url()}
              </span>
              <Tooltip placement="top" value={extension.t("action.reload")}>
                <IconButton
                  variant="ghost-muted"
                  size="large"
                  aria-label={extension.t("action.reload")}
                  onClick={() => {
                    if (frame) frame.src = url()
                  }}
                  icon={<Icon name="outline-rotate-clockwise" />}
                />
              </Tooltip>
              <Tooltip placement="top" value={extension.t(mobile() ? "device.desktop" : "device.mobile")}>
                <IconButton
                  variant="ghost-muted"
                  size="large"
                  aria-label={extension.t(mobile() ? "device.desktop" : "device.mobile")}
                  aria-pressed={mobile()}
                  onClick={() => setMobile((value) => !value)}
                  icon={<Icon name={mobile() ? "outline-globe" : "outline-device-mobile"} />}
                />
              </Tooltip>
              <Tooltip placement="top" value={extension.t("action.external")}>
                <IconButton
                  variant="ghost-muted"
                  size="large"
                  aria-label={extension.t("action.external")}
                  onClick={() => extension.system.openExternal(url())}
                  icon={<Icon name="arrow-up-right" />}
                />
              </Tooltip>
            </div>
            <div
              class="flex min-h-0 flex-1"
              classList={{ "items-center justify-center bg-v2-background-bg-deep p-4": mobile() }}
            >
              <iframe
                ref={frame}
                class="border-0 bg-white"
                classList={{
                  "min-w-0 flex-1": !mobile(),
                  "h-full max-h-[844px] w-[390px] max-w-full shrink-0 rounded-[10px] shadow-lg": mobile(),
                }}
                src={url()}
                title={extension.t("tab.title")}
              />
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
