import { useDirectoryPicker } from "@/workspaces/selection/picker"
import { useServerActionsController } from "@/servers/registry/controller"
import { useSettingsCommand } from "@/settings/command"
import { useSettingsSurface } from "@/settings/surface"
import { type LocalProject } from "@/shell/state/layout"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { ServerConnection } from "@/runtime/server/registry"
import { closeHomeProject, errorMessage, homeProjectDirectories } from "@/shell/layout/helpers"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { showToast } from "@/shell/notifications/toast"
import { useDialog } from "@opencode/ui/context/dialog"
import { createResource } from "solid-js"
import { Schema } from "effect"
import { Persistence } from "@/runtime/persistence/schema"
import type { HomeController } from "../model"
import { useGlobal } from "@/runtime/server/runtime"
import { useRevealProject } from "./reveal"
import { TemplateDialog, type TemplateChoice } from "./template-dialog"
import { projectDirectory, projectTemplates } from "./templates"

export const HomeServersSchema = Schema.Struct({
  collapsed: Persistence.record(Persistence.fallback(Schema.Boolean, () => false)),
})

export function createHomeProjectsController(home: HomeController) {
  const platform = usePlatform()
  const pickDirectory = useDirectoryPicker()
  const dialog = useDialog()
  const language = useLanguage()
  const openSettings = useSettingsCommand()
  const settings = useSettingsSurface()
  const serverManagement = useServerActionsController()
  const global = useGlobal()
  const revealProject = useRevealProject()
  const [_state, setState, _, ready] = persisted(Persist.global("home.servers"), HomeServersSchema, { collapsed: {} })

  const [state] = createResource(
    () => ready.promise ?? Promise.resolve(),
    (promise) => promise.then(() => _state),
    { initialValue: _state },
  )

  function edit(conn: ServerConnection.Http, onSave?: (saved: ServerConnection.Http) => void) {
    void import("@/servers/connect/dialog").then(({ DialogServer }) => {
      void dialog.show(() => <DialogServer mode="edit" server={conn} onSave={(saved) => onSave?.(saved)} />)
    })
  }

  // An expired pairing session or a changed password signs the app out of an HTTP server; signing in again edits it,
  // and the action that asked for sign-in continues once the dialog saves, as it does for extension servers. It continues
  // with the saved connection: the one it started with still carries the rejected credentials.
  function authenticate(conn: ServerConnection.Any, onConnected?: (conn: ServerConnection.Any) => void) {
    if (conn.type !== "http" || !home.server.health(conn)?.unauthorized)
      return ServerConnection.authenticate(conn, () => onConnected?.(conn))
    edit(conn, onConnected)

    return true
  }

  // A new project from a template: write its skeleton, open it, and start a session whose message asks the agent to set
  // it up, ready for the user to add what to build.
  function fromTemplate(conn: ServerConnection.Any, initial?: TemplateChoice) {
    const homedir = home.project.homedir()

    const choice = initial ?? {
      template: "react" as const,
      name: "my-app",
      parent: homedir ? projectDirectory(homedir, "SuperVibeCode") : "",
    }

    void dialog.show(() => (
      <TemplateDialog
        initial={choice}
        onBrowse={(current) =>
          pickDirectory({
            server: conn,
            title: language.t("home.template.folder"),
            onSelect: (result) => {
              const folder = Array.isArray(result) ? result[0] : result

              fromTemplate(conn, folder ? { ...current, parent: folder } : current)
            },
          })
        }
        onCreate={(current) => createFromTemplate(conn, current)}
      />
    ))
  }

  async function createFromTemplate(conn: ServerConnection.Any, choice: TemplateChoice) {
    const template = projectTemplates.find((item) => item.id === choice.template)

    if (!template) return language.t("common.requestFailed")
    const api = home.server.context(conn).sdk.api
    const directory = projectDirectory(choice.parent, choice.name)

    // A folder that already holds files is someone's work: never write a template over it.
    const existing = await api.file
      .list({ location: { directory }, path: "." })
      .then((response) => response.data.length)
      .catch(() => 0)

    if (existing > 0) return language.t("home.template.exists", { path: directory })
    const files = Object.entries(template.files(choice.name))

    try {
      for (const [file, content] of files)
        await api.file.write({
          path: projectDirectory(directory, file),
          payload: new TextEncoder().encode(content),
        })
    } catch (cause) {
      return errorMessage(cause, language.t("common.requestFailed"))
    }

    home.project.add(conn, [directory])
    home.project.openProjectNewSession(conn, directory, `${template.setup} ${language.t("home.template.prompt")} `)

    return undefined
  }

  function directories(project: LocalProject) {
    return [project.worktree, ...(project.sandboxes ?? [])]
  }

  function choose(conn: ServerConnection.Any) {
    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (result) => home.project.add(conn, homeProjectDirectories(result)),
    })
  }

  return {
    copy: {
      language,
    },
    selection: {
      value: home.selection.value,
    },
    server: {
      list: home.server.list,
      health: home.server.health,
      projects: home.project.forServer,
      collapsed: (conn: ServerConnection.Any) => state().collapsed[ServerConnection.key(conn)] ?? false,
      toggleCollapsed: (conn: ServerConnection.Any) => {
        const key = ServerConnection.key(conn)
        setState("collapsed", key, !state().collapsed[key])
      },
      canRemove: (conn: ServerConnection.Any) => serverManagement.connection.canRemove(ServerConnection.key(conn)),
      remove: (conn: ServerConnection.Any) => serverManagement.connection.remove(ServerConnection.key(conn)),
      canHide: (conn: ServerConnection.Any) => serverManagement.connection.canHide(ServerConnection.key(conn)),
      hide: (conn: ServerConnection.Any) => serverManagement.connection.setHidden(ServerConnection.key(conn), true),
      edit: (conn: ServerConnection.Http) => edit(conn),
      authenticate: (conn: ServerConnection.Any) => authenticate(conn),
      focus: (conn: ServerConnection.Any) => {
        if (authenticate(conn, (next) => home.selection.focusServer(next))) return
        home.selection.focusServer(conn)
      },
    },
    project: {
      list: home.project.list,
      recentlyClosed: home.project.recentlyClosed,
      homedir: home.project.homedir,
      select: (conn: ServerConnection.Any, directory: string) => {
        if (authenticate(conn, (next) => home.project.select(next, directory))) return
        home.project.select(conn, directory)
      },
      add: home.project.add,
      openNewSession: (conn: ServerConnection.Any, directory: string) => {
        if (authenticate(conn, (next) => home.project.openProjectNewSession(next, directory))) return
        home.project.openProjectNewSession(conn, directory)
      },
      canImportSession: !!platform.openAttachmentPickerDialog,
      importSession: (conn: ServerConnection.Any, project: LocalProject) => {
        if (!platform.openAttachmentPickerDialog) return
        void platform
          .openAttachmentPickerDialog(
            {
              title: language.t("command.session.import"),
              accept: ["application/json"],
              extensions: ["json"],
            },
            async (file) => {
              const data = await Schema.decodeUnknownPromise(
                Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
              )(await file.text())

              const api = home.server.context(conn).sdk.api.session

              // SAFETY: the import endpoint validates the transcript, including exports written by earlier releases.
              const imported = await api.import({
                ...data,
                location: { directory: project.worktree },
              } as Parameters<typeof api.import>[0])

              home.project.openProjectSession(conn, project.worktree, imported)
            },
          )
          .catch((cause: unknown) => {
            showToast({
              title: language.t("common.requestFailed"),
              description: errorMessage(cause, language.t("common.requestFailed")),
            })
          })
      },
      edit: (conn: ServerConnection.Any, project: LocalProject) => {
        settings.openProject({
          server: ServerConnection.key(conn),
          project: project.worktree,
        })
      },
      hasUnread: (conn: ServerConnection.Any, project: LocalProject) => {
        const notification = global.ensureServerCtx(conn).notification

        return directories(project).some((directory) => notification.project.hasUnread(directory))
      },
      clearNotifications: (conn: ServerConnection.Any, project: LocalProject) => {
        const notification = global.ensureServerCtx(conn).notification
        directories(project).forEach((directory) => notification.project.markViewed(directory))
      },
      fromTemplate: (conn: ServerConnection.Any) => {
        if (authenticate(conn, (next) => fromTemplate(next))) return

        if (home.server.health(conn)?.healthy === false) return
        fromTemplate(conn)
      },
      choose: (conn: ServerConnection.Any) => {
        if (authenticate(conn, (next) => choose(next))) return

        if (home.server.health(conn)?.healthy === false) return
        choose(conn)
      },
      close: (conn: ServerConnection.Any, directory: string) => {
        const next = closeHomeProject(
          home.selection.value(),
          ServerConnection.key(conn),
          home.server.context(conn).projects,
          directory,
        )

        if (next) home.selection.set(next)
      },
      move: (conn: ServerConnection.Any, worktree: string, index: number) => {
        home.server.context(conn).projects.move(worktree, index)
      },
      canReveal: revealProject.available,
      reveal: revealProject.reveal,
    },
    utility: {
      settings: openSettings,
      help: () => platform.openExternal("https://opencode.ai/desktop-feedback"),
    },
  }
}

export type HomeProjectsController = ReturnType<typeof createHomeProjectsController>
