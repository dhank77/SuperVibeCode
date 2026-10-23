export * as VcsSync from "./sync.js"

import path from "path"
import { Context, Duration, Effect, Layer } from "effect"
import { ChildProcess } from "effect/process"
import type { SyncResult } from "@opencode/schema/vcs"
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

/**
 * Commits and pushes the location's working copy with the user's own git, as a person would from a terminal. Runs git
 * directly, without a shell, so it behaves the same on macOS, Linux and Windows.
 */
export interface Interface {
  /** Stages every change except environment files and private keys, and commits them with `message`. */
  readonly commit: (message: string) => Effect.Effect<SyncResult>
  /** Pushes the current branch to `origin`, setting its upstream the first time. */
  readonly push: () => Effect.Effect<SyncResult>
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
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Location.node, AppProcess.node, FSUtil.node],
})
