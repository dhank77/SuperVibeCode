export * as VcsSync from "./sync.js"

import path from "path"
import { Context, Duration, Effect, Layer } from "effect"
import { ChildProcess } from "effect/process"
import type { History, SyncResult, Version } from "@opencode/schema/vcs"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { FSUtil } from "@opencode/util/fs-util"
import { AppProcess } from "@opencode/util/process"
import { Location } from "../location.js"
import { gitExecutable } from "../util/git-executable.js"

// Environment files and private keys never enter an automatic commit, whatever .gitignore says.
const secrets = [
  ":(exclude,glob)**/.env",
  ":(exclude,glob)**/.env.*",
  ":(exclude,glob)**/*.pem",
  ":(exclude,glob)**/*.key",
]

// Git must never wait for input nobody can give: without stored credentials (a credential manager, the macOS
// Keychain, gh, an SSH agent) a push fails instead of prompting.
const noPrompt = {
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "never",
  GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
}

const PUSH_TIMEOUT = Duration.minutes(2)

const HISTORY_LIMIT = 100

/**
 * Commits and pushes the location's working copy with the user's own git, as a person would from a terminal. Runs git
 * directly, without a shell, so it behaves the same on macOS, Linux and Windows.
 */
export interface Interface {
  /** Stages every change except environment files and private keys, and commits them with `message`. */
  readonly commit: (message: string) => Effect.Effect<SyncResult>
  /** Pushes the current branch to `origin`, setting its upstream the first time. */
  readonly push: () => Effect.Effect<SyncResult>
  /** The current branch's latest commits, newest first, and the repository's web page. */
  readonly history: () => Effect.Effect<History>
  /**
   * Makes the files match the commit `hash` again, as a new commit on top, so the history and any pushed branch only
   * move forward. Unsaved changes are committed first, so nothing is lost.
   */
  readonly restore: (hash: string) => Effect.Effect<SyncResult>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/VcsSync") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    const processes = yield* AppProcess.Service
    const fs = yield* FSUtil.Service
    const cwd = location.directory

    const git = (args: string[], env?: Record<string, string>) =>
      processes.run(ChildProcess.make(gitExecutable, args, { cwd, env, extendEnv: true, stdin: "ignore" })).pipe(
        Effect.map((result) => ({
          ok: result.exitCode === 0,
          out: result.stdout.toString("utf8").trim(),
          err: result.stderr.toString("utf8").trim(),
        })),
        Effect.orElseSucceed(() => ({ ok: false, out: "", err: "git could not start" })),
      )

    // Undefined when the working copy can be committed; else why not.
    const blocked = Effect.fnUntraced(function* () {
      if (!(yield* git(["rev-parse", "--is-inside-work-tree"])).ok) return "norepo" as const
      const directory = (yield* git(["rev-parse", "--absolute-git-dir"])).out
      const markers = yield* Effect.forEach(
        ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"],
        (name) => fs.existsSafe(path.join(directory, name)),
      )

      return markers.some(Boolean) ? ("busy" as const) : undefined
    })

    const failed = (err: string): SyncResult => ({ outcome: "failed", ...(err ? { detail: err.slice(0, 2000) } : {}) })

    return Service.of({
      commit: Effect.fn("VcsSync.commit")(function* (message: string) {
        const reason = yield* blocked()

        if (reason) return { outcome: reason }
        const added = yield* git(["add", "-A", "--", ".", ...secrets])

        if (!added.ok) return failed(added.err)

        if ((yield* git(["diff", "--cached", "--quiet"])).ok) return { outcome: "clean" }
        const committed = yield* git(["commit", "-q", "-m", message])

        return committed.ok ? { outcome: "committed" } : failed(committed.err || committed.out)
      }),
      push: Effect.fn("VcsSync.push")(function* () {
        const reason = yield* blocked()

        if (reason) return { outcome: reason }
        const branch = yield* git(["symbolic-ref", "--short", "-q", "HEAD"])

        if (!branch.ok || !branch.out) return { outcome: "detached" }

        if (!(yield* git(["remote", "get-url", "origin"])).ok) return { outcome: "noremote" }
        const tracked = (yield* git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])).ok
        const pushed = yield* git(tracked ? ["push", "-q"] : ["push", "-q", "-u", "origin", branch.out], noPrompt).pipe(
          Effect.timeoutOrElse({
            duration: PUSH_TIMEOUT,
            orElse: () => Effect.succeed({ ok: false, out: "", err: "git push timed out" }),
          }),
        )

        return pushed.ok ? { outcome: "pushed" } : failed(pushed.err)
      }),
      history: Effect.fn("VcsSync.history")(function* () {
        const log = yield* git(["log", "-n", String(HISTORY_LIMIT), "--format=%H%x1f%s%x1f%ct%x1f%an%x1e"])
        const versions = log.ok
          ? log.out
              .split("\x1e")
              .map((record) => record.trim().split("\x1f"))
              .flatMap(([hash, subject, time, author]): Version[] =>
                hash && time ? [{ hash, subject: subject ?? "", time: Number(time) * 1000, author: author ?? "" }] : [],
              )
          : []
        const remote = yield* git(["remote", "get-url", "origin"])
        const web = remote.ok ? webPage(remote.out) : undefined

        return web ? { versions, web } : { versions }
      }),
      restore: Effect.fn("VcsSync.restore")(function* (hash: string) {
        const reason = yield* blocked()

        if (reason) return { outcome: reason }
        const target = yield* git(["rev-parse", "--verify", "-q", `${hash}^{commit}`])

        if (!target.ok) return failed(`Unknown version ${hash}`)
        const subject = (yield* git(["log", "-1", "--format=%s", target.out])).out
        const saved = yield* git(["add", "-A", "--", ".", ...secrets])

        if (!saved.ok) return failed(saved.err)

        if (!(yield* git(["diff", "--cached", "--quiet"])).ok) {
          const kept = yield* git(["commit", "-q", "-m", "Save changes before restoring a version"])

          if (!kept.ok) return failed(kept.err || kept.out)
        }

        // Files the version did not have are removed; untracked and ignored files, such as dependencies, stay.
        const restored = yield* git([
          "restore",
          `--source=${target.out}`,
          "--staged",
          "--worktree",
          "--",
          ".",
          ...secrets,
        ])

        if (!restored.ok) return failed(restored.err)

        if ((yield* git(["diff", "--cached", "--quiet"])).ok) return { outcome: "clean" }
        const committed = yield* git([
          "commit",
          "-q",
          "-m",
          `Restore "${subject}"`.slice(0, 200),
          "-m",
          `Restores the files to ${target.out.slice(0, 7)}.`,
        ])

        return committed.ok ? { outcome: "restored" } : failed(committed.err || committed.out)
      }),
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Location.node, AppProcess.node, FSUtil.node],
})

/** The repository's page for a GitHub, GitLab or Bitbucket remote, in any of git's URL forms. */
export function webPage(remote: string) {
  const match =
    /^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/(?:[^@/]+@)?|[^@/]+@)(github\.com|gitlab\.com|bitbucket\.org)[:/](.+?)(?:\.git)?\/?$/.exec(
      remote.trim(),
    )

  return match ? `https://${match[1]}/${match[2]}` : undefined
}
