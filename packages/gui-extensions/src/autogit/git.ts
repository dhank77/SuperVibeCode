// Pure helpers of the automatic git workflow, unit-testable without a server.

/** A commit subject from the user's prompt: its first non-empty line, at most 72 characters. */
export function commitMessage(prompt: string | undefined, fallback: string) {
  const line = prompt
    ?.split("\n")
    .map((item) => item.trim())
    .find((item) => item.length > 0)

  if (!line) return fallback

  return line.length > 72 ? `${line.slice(0, 71)}…` : line
}

/**
 * The GitHub Desktop link that opens a local repository, on every platform GitHub Desktop registers its link scheme
 * (macOS and Windows; Linux forks of it too).
 */
export function desktopLink(directory: string) {
  return `x-github-client://openLocalRepo/${encodeURIComponent(directory)}`
}
