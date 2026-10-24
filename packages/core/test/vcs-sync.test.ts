import { $ } from "bun"
import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppProcess } from "@opencode/util/process"
import { FSUtil } from "@opencode/util/fs-util"
import { Location } from "@opencode/core/location"
import { AbsolutePath } from "@opencode/core/schema"
import { VcsSync, webPage } from "@opencode/core/vcs/sync"
import { initGit } from "./fixture/git"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const provide = (directory: string) =>
  Effect.provide(
    LayerNode.compile(LayerNode.group([VcsSync.node, AppProcess.node, FSUtil.node]), {
      replacements: [
        Location.node.replace(
          Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(directory) }))),
        ),
      ],
    }),
  )

const repository = Effect.acquireRelease(
  Effect.promise(async () => {
    const tmp = await tmpdir()
    await initGit(tmp.path, "-b", "main")

    return tmp
  }),
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
)

const write = (directory: string, file: string, content: string) =>
  Effect.promise(() => fs.writeFile(path.join(directory, file), content))

describe("VcsSync history and restore", () => {
  it.live("lists versions newest first and restores one as a new commit", () =>
    Effect.gen(function* () {
      const tmp = yield* repository
      const directory = tmp.path

      yield* Effect.gen(function* () {
        const sync = yield* VcsSync.Service

        yield* write(directory, "page.html", "first")
        expect((yield* sync.commit("Make a landing page")).outcome).toBe("committed")
        yield* write(directory, "page.html", "second")
        yield* write(directory, "extra.css", "added later")
        yield* write(directory, ".env", "SECRET=1")
        expect((yield* sync.commit("Make it darker")).outcome).toBe("committed")

        const before = yield* sync.history()
        expect(before.versions.map((version) => version.subject)).toEqual(["Make it darker", "Make a landing page"])
        expect(before.web).toBeUndefined()

        // An unsaved edit is kept as its own commit before the files change.
        yield* write(directory, "page.html", "unsaved")
        expect((yield* sync.restore(before.versions[1]!.hash)).outcome).toBe("restored")

        expect(yield* Effect.promise(() => fs.readFile(path.join(directory, "page.html"), "utf8"))).toBe("first")
        expect(yield* Effect.promise(() => Bun.file(path.join(directory, "extra.css")).exists())).toBe(false)
        expect(yield* Effect.promise(() => fs.readFile(path.join(directory, ".env"), "utf8"))).toBe("SECRET=1")

        const after = yield* sync.history()
        expect(after.versions.map((version) => version.subject)).toEqual([
          'Restore "Make a landing page"',
          "Save changes before restoring a version",
          "Make it darker",
          "Make a landing page",
        ])

        // Restoring the version the files already match changes nothing.
        expect((yield* sync.restore(after.versions[0]!.hash)).outcome).toBe("clean")
        expect((yield* sync.restore("0000000")).outcome).toBe("failed")

        yield* Effect.promise(() =>
          $`git -C ${directory} remote add origin git@github.com:dhank77/SuperVibeCode.git`.quiet(),
        )
        expect((yield* sync.history()).web).toBe("https://github.com/dhank77/SuperVibeCode")
      }).pipe(provide(directory))
    }),
  )
})

describe("webPage", () => {
  it.effect("reads the repository page from each remote form", () =>
    Effect.sync(() => {
      expect(webPage("https://github.com/dhank77/SuperVibeCode.git")).toBe("https://github.com/dhank77/SuperVibeCode")
      expect(webPage("git@github.com:dhank77/SuperVibeCode.git")).toBe("https://github.com/dhank77/SuperVibeCode")
      expect(webPage("ssh://git@gitlab.com/group/sub/app.git")).toBe("https://gitlab.com/group/sub/app")
      expect(webPage("https://user@bitbucket.org/team/app")).toBe("https://bitbucket.org/team/app")
      expect(webPage("https://git.example.com/team/app.git")).toBeUndefined()
    }),
  )
})
