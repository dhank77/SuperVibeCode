import { type Accessor, createMemo } from "solid-js"
import { filter, firstBy, flat, groupBy, mapValues, pipe, uniqueBy, values } from "remeda"
import { createSimpleContext } from "@opencode/ui/context"
import { useProviders } from "@/providers/catalog/providers"
import { useGlobal } from "@/runtime/server/runtime"

export type ModelKey = { providerID: string; modelID: string }

type Visibility = "show" | "hide"

const RECENT_LIMIT = 5

// luxon's diffNow().as("months") used an average month; keep the same window.
const sixMonths = 6 * 30.436875 * 24 * 60 * 60 * 1000

function modelKey(model: ModelKey) {
  return `${model.providerID}:${model.modelID}`
}

function dollars(value: number) {
  return String(Number(value.toFixed(value < 0.01 ? 3 : 2)))
}

export const isFreeModel = (model: { provider: { id: string }; cost?: { input: number; output?: number } }) =>
  (model.provider.id === "opencode" || model.provider.id === "supervibecode") &&
  (!model.cost || (model.cost.input === 0 && (model.cost.output ?? 0) === 0))

export const formatModelPrice = (model: {
  provider: { id: string }
  cost?: { input: number; output: number }
}) => {
  if (model.provider.id !== "supervibecode" || isFreeModel(model) || !model.cost) return undefined
  if (model.cost.input <= 0 && model.cost.output <= 0) return undefined
  return `$${dollars(model.cost.input)}/$${dollars(model.cost.output)}`
}

export const sortModels = <
  T extends {
    name: string
    provider: { id: string }
    cost?: { input: number; output?: number }
  },
>(
  a: T,
  b: T,
) => {
  if (a.provider.id === "supervibecode" && b.provider.id === "supervibecode") {
    const aFree = isFreeModel(a)
    const bFree = isFreeModel(b)
    if (aFree !== bFree) return aFree ? -1 : 1
    const aInput = a.cost?.input ?? 0
    const bInput = b.cost?.input ?? 0
    if (aInput !== bInput) return aInput - bInput
    const aOutput = a.cost?.output ?? 0
    const bOutput = b.cost?.output ?? 0
    if (aOutput !== bOutput) return aOutput - bOutput
  }
  return a.name.localeCompare(b.name)
}

const createModelsController = (directory: Accessor<string | undefined>) => {
  const providers = useProviders(() => directory())
  const models = useGlobal().models
  const store = models.store
  const setStore = models.set

  const available = createMemo(() =>
    providers.connected().flatMap((p) =>
      Object.values(p.models).map((m) => ({
        ...m,
        provider: p,
      })),
    ),
  )

  // Release dates as epoch ms; an unparseable date is NaN and never counts as recent.
  const release = createMemo(
    () =>
      new Map(
        available().map(
          (model) => [modelKey({ providerID: model.provider.id, modelID: model.id }), Date.parse(model.release_date)] as const,
        ),
      ),
  )

  const latest = createMemo(() =>
    pipe(
      available(),
      filter((x) => {
        const released = release().get(modelKey({ providerID: x.provider.id, modelID: x.id })) ?? NaN

        return Math.abs(Date.now() - released) < sixMonths
      }),
      groupBy((x) => x.provider.id),
      mapValues((models) =>
        pipe(
          models,
          // A free model shares its family and release date with its paid twin, so group them apart.
          groupBy((x) => `${x.family}:${isFreeModel(x)}`),
          values(),
          (groups) =>
            groups.flatMap((g) => {
              const first = firstBy(g, [(x) => x.release_date, "desc"])

              return first ? [{ modelID: first.id, providerID: first.provider.id }] : []
            }),
        ),
      ),
      values(),
      flat(),
    ),
  )

  const latestSet = createMemo(() => new Set(latest().map((x) => modelKey(x))))

  const visibility = createMemo(() => {
    const map = new Map<string, Visibility>()

    for (const item of store.user) map.set(`${item.providerID}:${item.modelID}`, item.visibility)

    return map
  })

  const list = createMemo(() =>
    available()
      .map((m) => ({
        ...m,
        name: m.name.replace("(latest)", "").trim(),
        latest: m.name.includes("(latest)"),
      }))
      .sort(sortModels),
  )

  const find = (key: ModelKey) => list().find((m) => m.id === key.modelID && m.provider.id === key.providerID)

  function update(model: ModelKey, state: Visibility) {
    const index = store.user.findIndex((x) => x.modelID === model.modelID && x.providerID === model.providerID)

    if (index >= 0) {
      setStore("user", index, (current) => ({ ...current, visibility: state }))

      return
    }

    setStore("user", store.user.length, { ...model, visibility: state })
  }

  const visible = (model: ModelKey) => {
    const key = modelKey(model)
    const state = visibility().get(key)

    if (state === "hide") return false

    if (state === "show") return true

    // SuperVibeCode AI sells a hand-picked list, so every model on it shows until the user hides it.
    if (model.providerID === "supervibecode") return true

    if (latestSet().has(key)) return true

    // Models without a parseable release date stay visible.
    return !Number.isFinite(release().get(key) ?? NaN)
  }

  const setVisibility = (model: ModelKey, state: boolean) => {
    update(model, state ? "show" : "hide")
  }

  const push = (model: ModelKey) => {
    const uniq = uniqueBy([model, ...store.recent], (x) => `${x.providerID}:${x.modelID}`)

    if (uniq.length > RECENT_LIMIT) uniq.pop()
    setStore("recent", uniq)
  }

  const variantKey = (model: ModelKey) => `${model.providerID}/${model.modelID}`
  const getVariant = (model: ModelKey) => store.variant?.[variantKey(model)]

  const setVariant = (model: ModelKey, value: string | undefined) => {
    const key = variantKey(model)

    if (!store.variant) {
      setStore("variant", { [key]: value ?? "default" })

      return
    }

    setStore("variant", key, value ?? "default")
  }

  return {
    ready: models.ready,
    list,
    find,
    visible,
    setVisibility,
    recent: {
      list: models.recent,
      push,
    },
    variant: {
      get: getVariant,
      set: setVariant,
    },
  }
}

export const { use: useModels, provider: ModelsProvider } = createSimpleContext({
  name: "Models",
  gate: false,
  init: (props: { directory?: string } = {}) => {
    return createModelsController(() => props.directory)
  },
})
