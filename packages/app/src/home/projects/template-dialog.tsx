import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { TextField } from "@opencode/ui/text-field"
import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { projectDirectory, projectTemplates, validProjectName, type ProjectTemplate } from "./templates"

export type TemplateChoice = {
  template: ProjectTemplate["id"]
  name: string
  parent: string
}

/** Picks a template, a name and a folder for a new project. */
export function TemplateDialog(props: {
  initial: TemplateChoice
  /** Opens the folder picker; the dialog comes back with the folder chosen. */
  onBrowse(choice: TemplateChoice): void
  /** Creates the project, or resolves to an error message. */
  onCreate(choice: TemplateChoice): Promise<string | undefined>
}) {
  const dialog = useDialog()
  const language = useLanguage()

  const [state, setState] = createStore<TemplateChoice & { error?: string; busy: boolean }>({
    ...props.initial,
    busy: false,
  })

  const choice = () => ({ template: state.template, name: state.name.trim(), parent: state.parent.trim() })
  const nameValid = () => validProjectName(choice().name)
  const ready = () => nameValid() && !!choice().parent && !state.busy

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()

    if (!ready()) return
    setState({ busy: true, error: undefined })
    const error = await props.onCreate(choice())

    setState({ busy: false, error })

    if (!error) dialog.close()
  }

  return (
    <Dialog size="x-large">
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("home.template.title")}
          description={language.t("home.template.description")}
        />
      </DialogHeader>
      <DialogBody>
        <form class="flex h-full min-h-0 flex-col" onSubmit={submit}>
          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4">
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup">
              <For each={projectTemplates}>
                {(item) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={state.template === item.id}
                    data-action={`template-${item.id}`}
                    class={`
                    flex min-w-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors
                    ${
                      state.template === item.id
                        ? "border-v2-border-border-strong bg-v2-overlay-simple-overlay-hover"
                        : "border-v2-border-border-muted hover:bg-v2-overlay-simple-overlay-hover"
                    }
                  `}
                    onClick={() => setState("template", item.id)}
                  >
                    <span class="flex w-full min-w-0 items-baseline justify-between gap-2">
                      <span class="truncate text-14-medium text-v2-text-text-base">
                        {language.t(`home.template.${item.id}.title`)}
                      </span>
                      <span class="shrink-0 text-12-regular text-v2-text-text-faint">
                        {language.t(`home.template.needs.${item.needs}`)}
                      </span>
                    </span>
                    <span class="text-13-regular text-v2-text-text-muted">
                      {language.t(`home.template.${item.id}.description`)}
                    </span>
                  </button>
                )}
              </For>
            </div>
            <TextField
              autofocus
              label={language.t("home.template.name")}
              value={state.name}
              onChange={(name) => setState("name", name)}
              validationState={state.name && !nameValid() ? "invalid" : undefined}
              error={state.name && !nameValid() ? language.t("home.template.name.invalid") : undefined}
            />
            <div class="flex items-end gap-2">
              <div class="min-w-0 flex-1">
                <TextField
                  label={language.t("home.template.folder")}
                  value={state.parent}
                  onChange={(parent) => setState("parent", parent)}
                />
              </div>
              <Button type="button" variant="neutral" size="large" onClick={() => props.onBrowse(choice())}>
                {language.t("home.template.browse")}
              </Button>
            </div>
            <Show when={nameValid() && choice().parent}>
              <p class="-mt-2 break-all text-12-regular text-v2-text-text-faint">
                {language.t("home.template.path", { path: projectDirectory(choice().parent, choice().name) })}
              </p>
            </Show>
            <Show when={state.error}>
              {(message) => <p class="text-13-regular text-v2-state-fg-danger">{message()}</p>}
            </Show>
          </div>
          <div class="flex shrink-0 justify-end gap-2 px-6 pb-5 pt-1">
            <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button type="submit" variant="contrast" size="large" disabled={!ready()}>
              {language.t(state.busy ? "home.template.creating" : "home.template.create")}
            </Button>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  )
}
