import fs from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { BuiltinSkills } from "@opencode/core/config/plugin/builtin-skills"
import { SkillFile } from "@opencode/core/config/plugin/skill-file"
import { SkillScan } from "@opencode/core/config/plugin/skill-scan"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { FSUtil } from "@opencode/util/fs-util"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AbsolutePath } from "@opencode/core/schema"
import { testEffect } from "../lib/effect"
import { build } from "../../../../script/skills-index"

const root = path.resolve(import.meta.dir, "../../../../skills")
const it = testEffect(AppNodeBuilder.build(LayerNode.group([FSUtil.node])))

describe("BuiltinSkills", () => {
  test("reads the repository's skills folder when running from source", () => {
    expect(BuiltinSkills.source({})).toEqual({ type: "directory", path: AbsolutePath.make(root) })
  })

  test("downloads the published copy when there is no repository beside it", () => {
    expect(BuiltinSkills.source({}, "/$bunfs/root/opencode")).toEqual({ type: "url", url: BuiltinSkills.remote })
  })

  test("can be turned off", () => {
    expect(BuiltinSkills.source({ SUPERVIBECODE_BUILTIN_SKILLS: "0" })).toBeUndefined()
  })

  it.live("lets only taste-skill load on its own, so the design skills never compete", () =>
    Effect.gen(function* () {
      const files = yield* SkillScan.scan(root)
      const skills = yield* Effect.promise(() =>
        Promise.all(
          files.map(async (file) => {
            const parsed = SkillFile.parse(root, file, await fs.readFile(file, "utf8"))

            if (parsed._tag !== "Parsed") throw new Error(`${file} did not parse`)

            return parsed.skill
          }),
        ),
      )

      expect(skills.filter((skill) => skill.autoinvoke !== false).map((skill) => String(skill.id))).toEqual([
        "taste-skill",
      ])
      expect(skills.map((skill) => String(skill.id))).toContain("impeccable")
      expect(skills.every((skill) => skill.description)).toBe(true)
    }),
  )

  test("publishes an up-to-date index for compiled builds", async () => {
    expect(await fs.readFile(path.join(root, "index.json"), "utf8")).toBe(await build())
  })
})
