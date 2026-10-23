import { fileURLToPath } from "node:url"

export function resolveExternalURL(value: string) {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)

  if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return url.href

  // GitHub Desktop's link that opens a local repository (macOS and Windows register it); nothing else of its scheme.
  if (url.protocol === "x-github-client:" && url.hostname.toLowerCase() === "openlocalrepo") return url.href

  return undefined
}

export function resolveLocalFilePath(value: string) {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)

  if (url.protocol !== "file:" || url.hostname) return undefined

  try {
    return fileURLToPath(url)
  } catch {
    return undefined
  }
}
