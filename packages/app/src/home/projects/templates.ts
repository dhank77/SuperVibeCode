/**
 * Starting points for a new project. Each writes a small, current skeleton (dependencies at their latest release, so a
 * template does not age) and hands the rest to the agent: installing, starting the dev server, and building what the
 * user describes. Laravel ships its own skeleton through Composer, so its folder starts empty but for a marker.
 */
export type ProjectTemplate = {
  readonly id: "react" | "next" | "vue" | "html" | "laravel"
  /** What the user needs installed, shown on the card. */
  readonly needs: "node" | "php"
  /** Files to write, keyed by POSIX path relative to the project folder. */
  readonly files: (name: string) => Record<string, string>
  /** The agent's setup steps, ahead of what the user wants built. */
  readonly setup: string
}

// Laravel's create-project refuses a folder with any file in it, and the folder has to exist to open it as a project.
export const LARAVEL_MARKER = ".supervibecode-template"

const gitignore = ["node_modules", "dist", ".next", "out", ".env", ".env.*", "!.env.example", ".DS_Store", ""].join(
  "\n",
)

const nodeSetup =
  "Set up this new project: run git init, install the dependencies with npm install, and start the dev server with npm run dev in the background."

/** A package name npm accepts: lowercase, no spaces. */
export function packageName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[._-]+|[-]+$/g, "") || "app"
  )
}

/** A folder name that works on macOS, Windows and Linux. */
export function validProjectName(name: string) {
  return /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/.test(name) && !/[. ]$/.test(name)
}

/** The project folder inside `parent`, with the separator the server's paths already use. */
export function projectDirectory(parent: string, name: string) {
  const separator = parent.includes("\\") && !parent.includes("/") ? "\\" : "/"

  return `${parent.replace(/[\\/]+$/, "")}${separator}${name}`
}

function agents(stack: string, dev: string) {
  return `# Project

${stack}

- Start the dev server with \`${dev}\` and keep it running in the background; SuperVibeCode shows it in the preview.
- Style with Tailwind CSS utility classes. Tailwind v4 needs no config file; theme tokens go in the CSS with \`@theme\`.
`
}

export const projectTemplates: readonly ProjectTemplate[] = [
  {
    id: "react",
    needs: "node",
    setup: nodeSetup,
    files: (name) => ({
      ".gitignore": gitignore,
      "AGENTS.md": agents("React with TypeScript, built with Vite, styled with Tailwind CSS v4.", "npm run dev"),
      "package.json": json({
        name: packageName(name),
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: { react: "latest", "react-dom": "latest" },
        devDependencies: {
          "@tailwindcss/vite": "latest",
          "@types/react": "latest",
          "@types/react-dom": "latest",
          "@vitejs/plugin-react": "latest",
          tailwindcss: "latest",
          typescript: "latest",
          vite: "latest",
        },
      }),
      "vite.config.ts": `import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
`,
      "tsconfig.json": json({
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ["vite/client"],
        },
        include: ["src"],
      }),
      "index.html": html(name, `<div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>`),
      "src/main.tsx": `import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
      "src/App.tsx": `export default function App() {
  return (
    <main className="grid min-h-dvh place-items-center bg-white p-8 text-zinc-900">
      <h1 className="text-2xl font-semibold tracking-tight">${name}</h1>
    </main>
  )
}
`,
      "src/index.css": `@import "tailwindcss";\n`,
    }),
  },
  {
    id: "next",
    needs: "node",
    setup: nodeSetup,
    files: (name) => ({
      ".gitignore": `${gitignore}next-env.d.ts\n`,
      "AGENTS.md": agents("Next.js with the App Router and TypeScript, styled with Tailwind CSS v4.", "npm run dev"),
      "package.json": json({
        name: packageName(name),
        private: true,
        version: "0.0.0",
        scripts: { dev: "next dev", build: "next build", start: "next start" },
        dependencies: { next: "latest", react: "latest", "react-dom": "latest" },
        devDependencies: {
          "@tailwindcss/postcss": "latest",
          "@types/node": "latest",
          "@types/react": "latest",
          "@types/react-dom": "latest",
          tailwindcss: "latest",
          typescript: "latest",
        },
      }),
      "postcss.config.mjs": `export default {\n  plugins: { "@tailwindcss/postcss": {} },\n}\n`,
      "tsconfig.json": json({
        compilerOptions: {
          target: "ES2022",
          lib: ["dom", "dom.iterable", "esnext"],
          allowJs: false,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "preserve",
          incremental: true,
          plugins: [{ name: "next" }],
          paths: { "@/*": ["./*"] },
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      }),
      "app/globals.css": `@import "tailwindcss";\n`,
      "app/layout.tsx": `import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: ${JSON.stringify(name)},
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`,
      "app/page.tsx": `export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center bg-white p-8 text-zinc-900">
      <h1 className="text-2xl font-semibold tracking-tight">${name}</h1>
    </main>
  )
}
`,
    }),
  },
  {
    id: "vue",
    needs: "node",
    setup: nodeSetup,
    files: (name) => ({
      ".gitignore": gitignore,
      "AGENTS.md": agents(
        "Vue 3 with TypeScript and <script setup>, built with Vite, styled with Tailwind CSS v4.",
        "npm run dev",
      ),
      "package.json": json({
        name: packageName(name),
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: { vue: "latest" },
        devDependencies: {
          "@tailwindcss/vite": "latest",
          "@vitejs/plugin-vue": "latest",
          tailwindcss: "latest",
          typescript: "latest",
          vite: "latest",
        },
      }),
      "vite.config.ts": `import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [vue(), tailwindcss()],
})
`,
      "tsconfig.json": json({
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "preserve",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ["vite/client"],
        },
        include: ["src"],
      }),
      "index.html": html(name, `<div id="app"></div>\n    <script type="module" src="/src/main.ts"></script>`),
      "src/main.ts": `import { createApp } from "vue"
import App from "./App.vue"
import "./style.css"

createApp(App).mount("#app")
`,
      "src/App.vue": `<template>
  <main class="grid min-h-dvh place-items-center bg-white p-8 text-zinc-900">
    <h1 class="text-2xl font-semibold tracking-tight">${name}</h1>
  </main>
</template>
`,
      "src/env.d.ts": `declare module "*.vue" {
  import type { DefineComponent } from "vue"
  const component: DefineComponent
  export default component
}
`,
      "src/style.css": `@import "tailwindcss";\n`,
    }),
  },
  {
    id: "html",
    needs: "node",
    setup: nodeSetup,
    files: (name) => ({
      ".gitignore": gitignore,
      "AGENTS.md": agents(
        "A static site: plain HTML and JavaScript, served and built with Vite, styled with Tailwind CSS v4. Add pages as more .html files.",
        "npm run dev",
      ),
      "package.json": json({
        name: packageName(name),
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        devDependencies: { "@tailwindcss/vite": "latest", tailwindcss: "latest", vite: "latest" },
      }),
      "vite.config.js": `import { defineConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [tailwindcss()],
})
`,
      "index.html": html(
        name,
        `<main class="grid min-h-dvh place-items-center bg-white p-8 text-zinc-900">
      <h1 class="text-2xl font-semibold tracking-tight">${name}</h1>
    </main>
    <script type="module" src="/src/main.js"></script>`,
      ),
      "src/main.js": `import "./style.css"\n`,
      "src/style.css": `@import "tailwindcss";\n`,
    }),
  },
  {
    id: "laravel",
    needs: "php",
    setup: `Set up a new Laravel app in this folder: first delete the ${LARAVEL_MARKER} file (for example with php -r "unlink('${LARAVEL_MARKER}');"), then run composer create-project laravel/laravel . and git init, and start php artisan serve in the background.`,
    files: () => ({ [LARAVEL_MARKER]: "" }),
  },
]

type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }

function json(value: Json) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function html(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escape(title)}</title>
  </head>
  <body>
    ${body}
  </body>
</html>
`
}

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
