// Finds the address a dev server prints once it listens, in raw shell or terminal output. Electron-free and pure so it
// stays unit-testable under Bun.
//
// Covered: Vite ("Local: http://localhost:5173/"), Next, Nuxt, Astro, Angular, CRA, Remix, Bun, Laravel
// ("Server running on [http://127.0.0.1:8000]"), Django, Rails, Flask, Expo web, and servers that only print a port
// ("Server listening on port 3000").

// CSI sequences (colors, cursor moves) and OSC sequences (hyperlinks, titles).
const ansi = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g

// Words that mark the line naming where the server listens, so an unrelated URL in a log line is not taken.
// Whole words, so the "local" in "localhost" does not count.
const announce =
  /\b(?:local|loopback|running|listen\w*|ready|started|serving|serve|server|available|waiting|open|app url)\b/i

const address =
  /\bhttps?:\/\/(?:localhost|(?:[a-z\d-]+\.)+(?:localhost|test)|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1?\])(?::\d{2,5})?(?:\/[^\s"'<>\])]*)?/i

const port = /\b(?:listen\w*|running|started|serving|server)\b.*?\bport\b\s*:?\s*(\d{2,5})\b/i

/** The local address a dev server announced in `text`, normalized for a browser; undefined when there is none. */
export function detectURL(text: string) {
  return text
    .replace(ansi, "")
    .split(/\r?\n|\r/)
    .filter((line) => announce.test(line))
    .map(lineURL)
    .find((url) => url !== undefined)
}

function lineURL(line: string) {
  const match = address.exec(line)?.[0]

  if (match) return normalize(match)
  const number = port.exec(line)?.[1]

  return number ? `http://localhost:${number}/` : undefined
}

// Wildcard binds are not browsable addresses, and sentence punctuation is not part of the URL.
function normalize(input: string) {
  const url = new URL(input.replace(/[.,;:!]+$/, ""))

  if (url.hostname === "0.0.0.0" || url.hostname === "[::]") url.hostname = "localhost"

  return url.href
}
