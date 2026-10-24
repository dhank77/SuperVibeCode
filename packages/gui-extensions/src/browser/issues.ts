import type { Cdp } from "./cdp"

/**
 * Something wrong with the page the user may want the agent to fix: an uncaught error, a dev server's error overlay
 * (Vite, Next.js), or a server error page such as Laravel's.
 */
export type PageIssue = { kind: "exception" | "overlay" | "http"; message: string }

export const MAX_ISSUE = 4_000

const binding = "__supervibecodeIssue"

const world = "supervibecode-issues"

/**
 * Watches the page for dev server error overlays, which carry the build error that broke it. Runs in its own world, so
 * the page's scripts cannot see or replace it; overlays are open shadow roots that this world can read.
 */
const overlayScript = `(() => {
  let last = ""
  const send = (value) => {
    if (value === last) return
    last = value
    try { globalThis[${JSON.stringify(binding)}](value) } catch {}
  }
  const text = (node) => (node && node.textContent ? node.textContent.trim() : "")
  const check = () => {
    const vite = document.querySelector("vite-error-overlay")
    if (vite && vite.shadowRoot) {
      const root = vite.shadowRoot
      const parts = [text(root.querySelector(".message")), text(root.querySelector(".file")), text(root.querySelector(".frame"))]
      return send(parts.filter(Boolean).join("\\n") || "Vite error overlay")
    }
    for (const portal of document.querySelectorAll("nextjs-portal")) {
      const root = portal.shadowRoot
      const dialog = root && root.querySelector("[data-nextjs-dialog], [data-nextjs-dialog-content]")
      if (dialog) return send(text(root.querySelector("#nextjs__container_errors_desc")) || text(dialog) || "Next.js error overlay")
    }
    send("")
  }
  // The script runs before the document has an element; observing the document itself covers what comes later.
  new MutationObserver(check).observe(document, { childList: true, subtree: true })
  setInterval(check, 1500)
})()`

/**
 * Tracks the current document's issue. Uncaught errors come from the protocol; overlays from a script the page cannot
 * reach; a 5xx document from the navigation. A new document starts clean.
 */
export function createIssues(cdp: Cdp, changed: () => void) {
  let issue: PageIssue | undefined

  const set = (next: PageIssue | undefined) => {
    issue = next && { kind: next.kind, message: next.message.slice(0, MAX_ISSUE) }
    changed()
  }

  // Only the top document: an iframe's error is rarely what the user is building, and its session differs.
  cdp.on("Runtime.exceptionThrown", (event, sessionID) => {
    if (sessionID || issue?.kind === "overlay") return
    const error = event.exceptionDetails
    const description = error.exception?.description ?? error.text

    // An Error's description carries its stack; a thrown value or a syntax error does not, so add where it happened.
    const where =
      error.url && !description.includes("\n    at ")
        ? `\n    at ${error.url}:${error.lineNumber + 1}:${error.columnNumber + 1}`
        : ""

    set({ kind: "exception", message: `${description}${where}` })
  })
  cdp.on("Runtime.bindingCalled", (event, sessionID) => {
    if (sessionID || event.name !== binding) return

    // The overlay closed, e.g. after the fix reloaded the module: its error is gone with it.
    if (!event.payload) {
      if (issue?.kind === "overlay") set(undefined)

      return
    }

    set({ kind: "overlay", message: event.payload })
  })

  return {
    current: () => issue,
    async enable() {
      await cdp.send("Runtime.addBinding", { name: binding, executionContextName: world })
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: overlayScript, worldName: world })
    },
    /** A new document committed, with its HTTP status. */
    navigated(url: string, status: number, statusText: string) {
      // 502 is the network proxy reporting a server that does not answer, which the pane shows on its own.
      set(
        status >= 500 && status !== 502
          ? { kind: "http", message: `${status} ${statusText}`.trim() + ` from ${url}` }
          : undefined,
      )
    },
  }
}
