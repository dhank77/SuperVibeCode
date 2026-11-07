export * as SuperVibeCodeRouterPlugin from "./supervibecode-router.js"

import os from "node:os"
import { define } from "@opencode/plugin/effect/plugin"
import { Money } from "@opencode/schema/money"
import { Duration, Effect, Schedule, Schema } from "effect"
import { Model } from "../model.js"
import { Rpc } from "../rpc.js"
import { Variant } from "../variant.js"

// Set at build time for release builds; SUPERVIBECODE_ROUTER_URL in the environment overrides it.
declare const SUPERVIBECODE_ROUTER_URL: string | undefined

/** The provider SuperVibeCode's own AI service adds once the user signs in. */
export const providerID = "supervibecode"

/**
 * The SuperVibeCode AI service: a SumoRouter instance that sells model access by credit. Signing in creates an API key
 * for this computer, so the agent keeps working after the 7-day session ends; the session is only needed to show the
 * balance and to top up. Without a configured address the plugin does nothing.
 */
export const Plugin = define({
  id: "supervibecode.router",
  effect: Effect.fn(function* (ctx) {
    const base = origin()
    if (!base) return
    const state = {
      account: decodeAccount(yield* ctx.storage.get(ACCOUNT)),
      models: [] as readonly RouterModel[],
      hash: "",
    }

    const sync = Effect.fn("SuperVibeCodeRouter.sync")(function* () {
      // Another project's window may have signed in or out; the account lives in storage shared by all of them.
      const account = decodeAccount(yield* ctx.storage.get(ACCOUNT))
      const models = account
        ? yield* request(base, "/api/models", { schema: RouterModels }).pipe(
            Effect.map((items) => items.filter((item) => item.mode === "chat")),
            Effect.orElseSucceed(() => state.models),
          )
        : []
      const hash = JSON.stringify([account?.key, models])

      if (hash === state.hash) return
      state.account = account
      state.models = models
      state.hash = hash
      yield* ctx.provider.reload()
    })

    yield* ctx.provider.transform((providers) => {
      const key = state.account?.key

      if (!key || state.models.length === 0) return
      providers.update(providerID, (provider) => {
        provider.name = "SuperVibeCode"
        provider.activation = "enabled"
        provider.package = "@opencode/ai/providers/openai-compatible"
        provider.settings = { baseURL: `${base}/v1`, provider: providerID, apiKey: key }
        provider.integrationID = undefined
      })

      for (const item of state.models) {
        const catalog = findCatalog(providers.list(), item)

        providers.models.update(providerID, item.slug, (model) => {
          model.modelID = Model.ID.make(item.slug)
          model.name = item.name || item.slug
          if (catalog?.family) model.family = catalog.family
          model.capabilities = {
            tools: catalog?.capabilities.tools ?? true,
            input: item.supports_vision ? ["text", "image"] : ["text"],
            output: ["text"],
            ...(catalog?.capabilities.temperature === undefined
              ? {}
              : { temperature: catalog.capabilities.temperature }),
          }
          model.limit = { context: item.context_length, output: catalog?.limit.output ?? model.limit.output }
          model.time = { released: item.created * 1000 }
          model.cost = [
            {
              input: perMillion(item.prompt_price_nano),
              output: perMillion(item.completion_price_nano),
              cache: {
                read: perMillion(item.cache_read_price_nano ?? item.prompt_price_nano),
                write: Money.USDPerMillionTokens.zero,
              },
            },
          ]
          // Claude goes through the Anthropic Messages endpoint, which keeps prompt caching intact.
          if (item.owned_by === "anthropic") {
            model.package = "@opencode/ai/providers/anthropic-compatible"
            model.settings = { baseURL: `${base}/v1`, provider: providerID, apiKey: key }
          }
          model.variants = item.supports_reasoning ? [...Variant.resolve(withPackage(model))] : []
        })
      }
    })

    // A new sign-in starts on the service's own models unless the user already chose another.
    yield* ctx.model.transform((models) => {
      if (!state.account?.key) return
      const current = models.default.get()

      if (current && current.providerID !== "opencode") return
      const choices = models.list(providerID)
      const pick = choices.find((model) => /sonnet/i.test(model.id)) ?? choices[0]

      if (pick) models.default.set(providerID, pick.id)
    })

    const signIn = Effect.fn("SuperVibeCodeRouter.signIn")(function* (token: string, email: string) {
      const kept = state.account?.email === email ? state.account : undefined
      const key =
        kept?.key && kept.keyID
          ? { id: kept.keyID, key: kept.key }
          : yield* request(base, "/api/keys", {
              method: "POST",
              token,
              body: { name: `SuperVibeCode (${os.hostname()})` },
              schema: CreatedKey,
            })
      const account = { email, token, key: key.key, keyID: key.id }

      yield* ctx.storage.set(ACCOUNT, account)
      yield* sync()

      return { status: "signed-in" as const }
    })

    const finish = (email: string) =>
      Effect.fn("SuperVibeCodeRouter.finish")(function* (result: typeof LoginResult.Type) {
        if ("token" in result) return yield* signIn(result.token, email)
        if ("mfa" in result && result.mfa.setup)
          return { status: "error" as const, message: "Turn on two-factor authentication on the website first." }
        if ("mfa" in result) return { status: "mfa" as const, mfaToken: result.mfa.token }

        return { status: "verify" as const }
      })

    yield* ctx.rpc
      .register(Contract, {
        status: () =>
          Effect.gen(function* () {
            const account = decodeAccount(yield* ctx.storage.get(ACCOUNT))
            const [methods, billing] = yield* Effect.all(
              [
                request(base, "/api/auth/methods", { schema: Methods }).pipe(Effect.option),
                request(base, "/api/billing/config", { schema: BillingConfig }).pipe(Effect.option),
              ],
              { concurrency: "unbounded" },
            )
            const me = account
              ? yield* request(base, "/api/me", { token: account.token, schema: Me }).pipe(Effect.option)
              : undefined
            const config = billing._tag === "Some" ? billing.value : undefined

            return compact({
              origin: base,
              signedIn: Boolean(account),
              email: account?.email,
              // The key keeps working after the session ends; only the balance needs a fresh sign-in.
              sessionExpired: Boolean(account) && me?._tag !== "Some",
              balanceNano: me?._tag === "Some" ? me.value.balance_nano : undefined,
              name: me?._tag === "Some" ? me.value.name : undefined,
              registration: methods._tag === "Some" ? methods.value.registration : true,
              captcha: methods._tag === "Some" ? Boolean(methods.value.turnstile_site_key) : false,
              topup: config?.enabled ?? false,
              idrPerUsd: config?.idr_per_usd,
              minTopupIdr: config?.min_topup_idr,
              maxTopupIdr: config?.max_topup_idr,
            })
          }),
        login: (input) =>
          request(base, "/api/auth/login", {
            method: "POST",
            body: { email: input.email, password: input.password },
            schema: LoginResult,
          }).pipe(Effect.flatMap(finish(input.email)), Effect.catch(failure)),
        verify: (input) =>
          request(base, "/api/auth/mfa/verify", {
            method: "POST",
            body: { mfa_token: input.mfaToken, code: input.code },
            schema: Schema.Struct({ token: Schema.String }),
          }).pipe(
            Effect.flatMap((result) => signIn(result.token, input.email)),
            Effect.catch(failure),
          ),
        logout: () =>
          Effect.gen(function* () {
            const account = decodeAccount(yield* ctx.storage.get(ACCOUNT))

            if (account?.keyID)
              yield* request(base, `/api/keys/${encodeURIComponent(account.keyID)}`, {
                method: "DELETE",
                token: account.token,
                schema: Schema.Unknown,
              }).pipe(Effect.ignore)
            yield* ctx.storage.remove(ACCOUNT)
            yield* sync()

            return { ok: true }
          }),
        topup: (input) =>
          Effect.gen(function* () {
            const account = decodeAccount(yield* ctx.storage.get(ACCOUNT))

            if (!account) return { status: "error" as const, message: "Sign in first." }

            return yield* request(base, "/api/billing/topups", {
              method: "POST",
              token: account.token,
              body: { amount_idr: input.amountIdr },
              schema: Topup,
            }).pipe(Effect.map(topupOutput), Effect.catch(failure))
          }),
        topupStatus: (input) =>
          Effect.gen(function* () {
            const account = decodeAccount(yield* ctx.storage.get(ACCOUNT))

            if (!account) return { status: "error" as const, message: "Sign in first." }

            return yield* request(base, `/api/billing/topups/${encodeURIComponent(input.orderId)}`, {
              token: account.token,
              schema: Topup,
            }).pipe(Effect.map(topupOutput), Effect.catch(failure))
          }),
      })
      .pipe(Effect.orDie)

    // Models change on the service without a release, and other windows sign in and out.
    yield* sync().pipe(Effect.ignore, Effect.repeat(Schedule.spaced(Duration.minutes(1))), Effect.forkScoped)
  }),
})

/** The service's address without a trailing `/v1`, or undefined when SuperVibeCode has none. */
export function origin(env: Record<string, string | undefined> = process.env) {
  const value =
    env.SUPERVIBECODE_ROUTER_URL || (typeof SUPERVIBECODE_ROUTER_URL === "string" ? SUPERVIBECODE_ROUTER_URL : "")
  const trimmed = value.trim().replace(/\/+$/, "").replace(/\/v1$/, "")

  return URL.canParse(trimmed) ? trimmed : undefined
}

const ACCOUNT = "account"

const Account = Schema.Struct({
  email: Schema.String,
  token: Schema.String,
  key: Schema.String,
  keyID: Schema.String,
})

const decodeAccount = (value: unknown) =>
  Schema.decodeUnknownOption(Account)(value).pipe((option) => (option._tag === "Some" ? option.value : undefined))

const RouterModel = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  owned_by: Schema.String,
  context_length: Schema.Int,
  prompt_price_nano: Schema.Number,
  completion_price_nano: Schema.Number,
  cache_read_price_nano: Schema.NullOr(Schema.Number),
  created: Schema.Number,
  mode: Schema.String,
  supports_reasoning: Schema.Boolean,
  supports_vision: Schema.Boolean,
})
type RouterModel = typeof RouterModel.Type
const RouterModels = Schema.Array(RouterModel)

const Methods = Schema.Struct({
  registration: Schema.Boolean,
  turnstile_site_key: Schema.NullOr(Schema.String),
})

const BillingConfig = Schema.Struct({
  enabled: Schema.Boolean,
  idr_per_usd: Schema.Number,
  min_topup_idr: Schema.Number,
  max_topup_idr: Schema.Number,
})

const Me = Schema.Struct({ name: Schema.String, balance_nano: Schema.Number })

const CreatedKey = Schema.Struct({ id: Schema.String, key: Schema.String })

const LoginResult = Schema.Union([
  Schema.Struct({ token: Schema.String }),
  Schema.Struct({ mfa: Schema.Struct({ token: Schema.String, setup: Schema.Boolean }) }),
  Schema.Struct({ verification_required: Schema.Boolean }),
])

const Topup = Schema.Struct({
  order_id: Schema.String,
  amount_idr: Schema.Number,
  status: Schema.String,
  payment_link_url: Schema.NullOr(Schema.String),
  payment_code: Schema.NullOr(Schema.String),
})

const topupOutput = (topup: typeof Topup.Type) =>
  compact({
    status: "ok" as const,
    orderId: topup.order_id,
    amountIdr: topup.amount_idr,
    state: topup.status,
    paymentUrl: topup.payment_link_url ?? undefined,
    paymentCode: topup.payment_code ?? undefined,
  })

/** Drops absent fields: RPC replies are JSON, which has no `undefined`. */
function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined)) as T
}

const Failure = Schema.Struct({ status: Schema.Literal("error"), message: Schema.String })

const SignInOutput = Schema.Union([
  Schema.Struct({ status: Schema.Literal("signed-in") }),
  Schema.Struct({ status: Schema.Literal("mfa"), mfaToken: Schema.String }),
  Schema.Struct({ status: Schema.Literal("verify") }),
  Failure,
])

const TopupOutput = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("ok"),
    orderId: Schema.String,
    amountIdr: Schema.Number,
    state: Schema.String,
    paymentUrl: Schema.optional(Schema.String),
    paymentCode: Schema.optional(Schema.String),
  }),
  Failure,
])

/** What the app calls on the server: the account, signing in and out, and topping up. */
export const Contract = Rpc.define({
  id: "supervibecode.account",
  methods: {
    status: {
      input: Schema.Struct({}),
      output: Schema.Struct({
        origin: Schema.String,
        signedIn: Schema.Boolean,
        email: Schema.optional(Schema.String),
        name: Schema.optional(Schema.String),
        sessionExpired: Schema.Boolean,
        balanceNano: Schema.optional(Schema.Number),
        registration: Schema.Boolean,
        captcha: Schema.Boolean,
        topup: Schema.Boolean,
        idrPerUsd: Schema.optional(Schema.Number),
        minTopupIdr: Schema.optional(Schema.Number),
        maxTopupIdr: Schema.optional(Schema.Number),
      }),
    },
    login: {
      input: Schema.Struct({ email: Schema.String, password: Schema.String }),
      output: SignInOutput,
    },
    verify: {
      input: Schema.Struct({ email: Schema.String, mfaToken: Schema.String, code: Schema.String }),
      output: SignInOutput,
    },
    logout: { input: Schema.Struct({}), output: Schema.Struct({ ok: Schema.Boolean }) },
    topup: { input: Schema.Struct({ amountIdr: Schema.Int }), output: TopupOutput },
    topupStatus: { input: Schema.Struct({ orderId: Schema.String }), output: TopupOutput },
  },
  events: {},
})

class RouterError extends Schema.TaggedError<RouterError>()("SuperVibeCodeRouter.Error", {
  message: Schema.String,
}) {}

const failure = (error: RouterError) => Effect.succeed({ status: "error" as const, message: error.message })

const ErrorBody = Schema.Struct({
  error: Schema.optional(Schema.Union([Schema.String, Schema.Struct({ message: Schema.String })])),
  message: Schema.optional(Schema.String),
})

/** Calls the service's API and decodes the reply; any failure carries the service's own message when it sent one. */
function request<A, I>(
  base: string,
  path: string,
  input: {
    readonly schema: Schema.Codec<A, I>
    readonly method?: "GET" | "POST" | "DELETE"
    readonly token?: string
    readonly body?: unknown
  },
) {
  return Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(`${base}${path}`, {
        method: input.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(input.body === undefined ? {} : { "content-type": "application/json" }),
          ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      })
      const json: unknown = await response.json().catch(() => undefined)

      return { ok: response.ok, status: response.status, json }
    },
    catch: () => new RouterError({ message: "Couldn't reach the SuperVibeCode service. Check your connection." }),
  }).pipe(
    Effect.flatMap((response) => {
      if (response.ok)
        return Schema.decodeUnknownEffect(input.schema)(response.json).pipe(
          Effect.mapError(() => new RouterError({ message: "The SuperVibeCode service sent an unexpected reply." })),
        )
      const body = Schema.decodeUnknownOption(ErrorBody)(response.json)
      const detail = body._tag === "Some" ? body.value : undefined
      const message =
        (typeof detail?.error === "object" ? detail.error.message : detail?.error) ??
        detail?.message ??
        `The SuperVibeCode service answered ${response.status}.`

      return Effect.fail(new RouterError({ message }))
    }),
  )
}

const perMillion = (nano: number) => Money.USDPerMillionTokens.make(nano / 1_000_000_000)

const withPackage = (model: Model.Info) => ({
  ...model,
  package: model.package ?? ("@opencode/ai/providers/openai-compatible" as Model.Info["package"]),
})

/** The catalog's entry for a model the service sells, for the capabilities and output limit the service doesn't report. */
function findCatalog(
  records: readonly { readonly provider: { readonly id: string }; readonly models: ReadonlyMap<string, Model.Info> }[],
  item: RouterModel,
) {
  const slug = item.slug.includes("/") ? item.slug.slice(item.slug.indexOf("/") + 1) : item.slug
  const matches = records.flatMap((record) =>
    record.provider.id === providerID
      ? []
      : Array.from(record.models.values())
          .filter((model) => model.id === slug || model.modelID === slug)
          .map((model) => ({ model, owner: record.provider.id === item.owned_by })),
  )

  return (matches.find((match) => match.owner) ?? matches[0])?.model
}
