export * as Vcs from "./vcs.js"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "./schema.js"

export const Branch = Schema.Struct({
  current: optional(Schema.String),
  default: optional(Schema.String),
}).annotate({ identifier: "Vcs.Branch" })
export interface Branch extends Schema.Schema.Type<typeof Branch> {}

export const Info = Schema.Struct({
  provider: optional(Schema.String),
  branch: Branch,
}).annotate({ identifier: "Vcs.Info" })
export interface Info extends Schema.Schema.Type<typeof Info> {}

export const BranchList = Schema.Array(Schema.String).annotate({ identifier: "Vcs.BranchList" })
export type BranchList = typeof BranchList.Type

export const Base = Schema.Struct({
  name: Schema.String,
  ref: Schema.String,
  source: Schema.Literals(["reflog", "default"]),
}).annotate({ identifier: "Vcs.Base" })
export interface Base extends Schema.Schema.Type<typeof Base> {}

export const Mode = Schema.Literals(["working", "branch", "committed"]).annotate({ identifier: "Vcs.Mode" })
export type Mode = typeof Mode.Type

export const FileStatus = Schema.Struct({
  file: Schema.String,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
  status: Schema.Literals(["added", "deleted", "modified"]),
}).annotate({ identifier: "Vcs.FileStatus" })
export interface FileStatus extends Schema.Schema.Type<typeof FileStatus> {}

/**
 * How a commit or push of the working copy ended.
 * - `committed` / `pushed` / `restored`: done.
 * - `clean`: nothing to commit.
 * - `busy`: a merge, rebase or cherry-pick is in progress, so nothing was touched.
 * - `norepo`: the location is not inside a git repository.
 * - `noremote`: the repository has no `origin` remote to push to.
 * - `detached`: no branch is checked out.
 * - `failed`: git refused, e.g. a commit hook failed or a push had no stored credentials.
 */
export const SyncOutcome = Schema.Literals([
  "committed",
  "pushed",
  "restored",
  "clean",
  "busy",
  "norepo",
  "noremote",
  "detached",
  "failed",
]).annotate({ identifier: "Vcs.SyncOutcome" })
export type SyncOutcome = typeof SyncOutcome.Type

export const SyncResult = Schema.Struct({
  outcome: SyncOutcome,
  // Git's own message when it failed, for the user to act on.
  detail: optional(Schema.String),
}).annotate({ identifier: "Vcs.SyncResult" })
export interface SyncResult extends Schema.Schema.Type<typeof SyncResult> {}

export const CommitInput = Schema.Struct({
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
}).annotate({ identifier: "Vcs.CommitInput" })
export interface CommitInput extends Schema.Schema.Type<typeof CommitInput> {}

/** A commit on the current branch, newest first in a history. */
export const Version = Schema.Struct({
  hash: Schema.String,
  // The commit message's first line; an automatic commit's is the prompt that made it.
  subject: Schema.String,
  // Commit time in milliseconds since the epoch.
  time: Schema.Finite,
  author: Schema.String,
}).annotate({ identifier: "Vcs.Version" })
export interface Version extends Schema.Schema.Type<typeof Version> {}

export const History = Schema.Struct({
  versions: Schema.Array(Version),
  // The repository's page on its host, when origin is a GitHub, GitLab or Bitbucket remote.
  web: optional(Schema.String),
}).annotate({ identifier: "Vcs.History" })
export interface History extends Schema.Schema.Type<typeof History> {}

export const RestoreInput = Schema.Struct({
  hash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{7,64}$/)),
}).annotate({ identifier: "Vcs.RestoreInput" })
export interface RestoreInput extends Schema.Schema.Type<typeof RestoreInput> {}
