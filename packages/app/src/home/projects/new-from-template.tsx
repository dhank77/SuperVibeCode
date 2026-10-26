import { useDialog } from "@opencode/ui/context/dialog"
import { useCommand } from "@/shell/commands/command"
import { errorMessage } from "@/shell/layout/helpers"
import { useTabs } from "@/shell/tabs/tabs"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useDirectoryPicker } from "@/workspaces/selection/picker"
import { addProjects } from "./add"
import { TemplateDialog, type TemplateChoice } from "./template-dialog"
import { projectDirectory, projectTemplates } from "./templates"

// The folder the last project was created in, for this window's next one.
let lastParent: string | undefined

/** The folder that holds `path`, on any platform; empty for a top-level folder. */
function parentFolder(path: string) {
  const trimmed = path.replace(/[\\/]+$/, "")
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))

  return cut > 0 ? trimmed.slice(0, cut) : ""
}

/**
 * Starts a new project from a template: writes its skeleton, opens it, and starts a session whose message asks the
 * agent to set it up, ready for the user to add what to build. Without a server it uses the first one.
 */
export function useNewFromTemplate() {
  const dialog = useDialog()
  const global = useGlobal()
  const language = useLanguage()
  const pickDirectory = useDirectoryPicker()
  const servers = useServers()
  const tabs = useTabs()

  const open = (conn = servers.visible[0], initial?: TemplateChoice) => {
    if (!conn) return
    const projects = global.ensureServerCtx(conn).projects
    const recent = projects.last() ?? projects.list()[0]?.worktree

    // New projects go where the last one was made, or beside the most recent project.
    const choice = initial ?? {
      template: "react" as const,
      name: "my-app",
      parent: lastParent ?? (recent ? parentFolder(recent) : ""),
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

              open(conn, folder ? { ...current, parent: folder } : current)
            },
          })
        }
        onCreate={(current) => create(conn, current)}
      />
    ))
  }

  const create = async (conn: ServerConnection.Any, choice: TemplateChoice) => {
    const template = projectTemplates.find((item) => item.id === choice.template)

    if (!template) return language.t("common.requestFailed")
    const ctx = global.ensureServerCtx(conn)
    const directory = projectDirectory(choice.parent, choice.name)

    // A folder that already holds files is someone's work: never write a template over it.
    const existing = await ctx.sdk.api.file
      .list({ location: { directory }, path: "." })
      .then((response) => response.data.length)
      .catch(() => 0)

    if (existing > 0) return language.t("home.template.exists", { path: directory })
    lastParent = choice.parent

    try {
      for (const [file, content] of Object.entries(template.files(choice.name)))
        await ctx.sdk.api.file.write({
          path: projectDirectory(directory, file),
          payload: new TextEncoder().encode(content),
        })
    } catch (cause) {
      return errorMessage(cause, language.t("common.requestFailed"))
    }

    addProjects(ctx, [directory])
    void tabs.newDraft(
      { server: ServerConnection.key(conn), directory },
      `${template.setup} ${language.t("home.template.prompt")} `,
    )

    return undefined
  }

  return open
}

/** Offers New from template in the command palette and the desktop app's File menu, wherever the user is. */
export function useNewFromTemplateCommand() {
  const command = useCommand()
  const language = useLanguage()
  const open = useNewFromTemplate()

  command.register("project-template", () => [
    {
      id: "project.template",
      title: language.t("home.template.action"),
      category: language.t("command.category.project"),
      onSelect: () => open(),
    },
  ])

  return open
}
