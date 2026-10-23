import { createUniqueId, type ComponentProps } from "solid-js"

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 366 42"
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g opacity={props.muted === false ? 1 : 0.6} class="[[data-color-scheme=dark]_&]:opacity-100">
        <g mask={props.fade === false ? undefined : `url(#${mask})`}>
          <g
            opacity={props.muted === false ? 1 : 0.16 * 0.7}
            fill={props.outline ? "none" : "currentColor"}
            stroke={props.outline ? "currentColor" : undefined}
            stroke-width={props.outline ? 1 : undefined}
          >
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M6 6L6 12L24 12L24 36L0 36L0 30L18 30L18 18L0 18L0 0L24 0L24 6Z"
            />
            <path pathLength={props.outline ? 1 : undefined} d="M30 6L36 6L36 30L48 30L48 6L54 6L54 36L30 36Z" />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M60 6L84 6L84 36L66 36L66 42L60 42ZM66 30L78 30L78 12L66 12Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M90 6L114 6L114 24L96 24L96 30L114 30L114 36L90 36ZM108 12L96 12L96 18L108 18Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M120 6L144 6L144 18L138 18L138 12L126 12L126 36L120 36Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M156 30L150 30L150 0L156 0ZM156 30L168 30L168 0L174 0L174 30L168 30L168 36L156 36Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M186 36L180 36L180 12L186 12ZM180 0L186 0L186 6L180 6Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M192 0L198 0L198 6L216 6L216 36L192 36ZM198 30L210 30L210 12L198 12Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M222 6L246 6L246 24L228 24L228 30L246 30L246 36L222 36ZM240 12L228 12L228 18L240 18Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M258 6L258 30L276 30L276 36L252 36L252 0L276 0L276 6Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M282 6L306 6L306 36L282 36ZM288 30L300 30L300 12L288 12Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M312 6L330 6L330 0L336 0L336 36L312 36ZM318 30L330 30L330 12L318 12Z"
            />
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M342 6L366 6L366 24L348 24L348 30L366 30L366 36L342 36ZM360 12L348 12L348 18L360 18Z"
            />
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="366" height="42">
          <rect width="366" height="42" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="183" y1="22" x2="183" y2="42" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
