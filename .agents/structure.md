# Project Structure

Confinity is a **single-package**, **ESM-only** TypeScript library. Source lives in `src/`, tests and fixtures in `test/`, and build output goes to `dist/` (git-ignored).

## Directory Layout

```
confinity/
├── src/
│   ├── index.ts               # Barrel: re-exports module.ts + types.ts (public API)
│   ├── module.ts              # Container class — the entire runtime logic
│   └── types.ts               # Element, MergeFn, Options, NormalizedOptions
├── test/
│   ├── vitest.config.ts       # Vitest config (include globs + v8 coverage thresholds)
│   ├── unit/
│   │   └── module.spec.ts     # Container behavior tests
│   └── data/                  # Fixture config files loaded by the tests
│       ├── project.conf          # key=value (.conf) fixture
│       ├── project.server.conf   # key=value (.conf) fixture
│       ├── project.client.yml    # YAML fixture
│       ├── project.invalid.conf  # prefixed fixture → element "invalid"
│       └── scalar.yml            # non-object fixture (skipped on load)
├── tsdown.config.ts           # Build config (ESM + .d.mts, sourcemaps)
├── tsconfig.json              # Typecheck config (noEmit; extends @tada5hi/tsconfig)
├── eslint.config.js           # ESLint flat config (@tada5hi/eslint-config)
├── commitlint.config.mjs      # Conventional Commits enforcement
├── release-please-config.json # release-please configuration
├── .release-please-manifest.json # last-released version tracked by release-please
├── .husky/commit-msg          # runs commitlint on commit
└── package.json
```

## Module Responsibilities

| Module          | Purpose                                                                                          |
|-----------------|--------------------------------------------------------------------------------------------------|
| `src/index.ts`  | Public entry point. `export * from './module'` and `export * from './types'`.                    |
| `src/module.ts` | Defines the `Container` class — file discovery, loading, name normalization, merge, and lookup.  |
| `src/types.ts`  | Public type definitions consumed by `Container` and library users.                               |

### `Container` surface (`src/module.ts`)

| Member                        | Visibility  | Role                                                                       |
|-------------------------------|-------------|----------------------------------------------------------------------------|
| `constructor(options?)`       | public      | Normalizes `Options` → `NormalizedOptions`, seeds empty item list.         |
| `get<T>(key)`                 | public      | Resolves a dotted key (or array of keys) across loaded items, merged.      |
| `load(input?)`                | public      | Discovers config files in one/many directories, then loads each.          |
| `loadFile(input)`             | public      | Loads a single file (or array) directly, deriving its `name`.             |
| `findFiles(cwd)`              | protected   | Builds glob patterns from prefix/suffix/extensions; calls `locateMany`.     |
| `normalizeOptions(input)`     | protected   | Applies defaults for `cwd`, `extensions`, and `mergeFn`.                    |
| `merge(primary, secondary)`   | protected   | Object-vs-object deep merge, otherwise first-defined wins.                  |

## Key Dependencies

| Dependency  | Role                                                                       |
|-------------|-----------------------------------------------------------------------------|
| `locter`    | `locateMany` (glob file discovery, `cwd` option), `read` (parse config), `buildFilePath`. |
| `pathtrace` | `expandPath` (resolve wildcard segments), `getPathInfo` (read a value).      |
| `smob`      | `createMerger` (deep merge with `array:false, inPlace:false`), `isObject`.   |

Dev tooling (tsdown, vitest, ESLint, commitlint, release-please, husky) is all shared `@tada5hi/*` config. See [conventions.md](conventions.md).

## Package Exports

```json
{
    "./package.json": "./package.json",
    ".": {
        "types": "./dist/index.d.mts",
        "import": "./dist/index.mjs"
    }
}
```

- `main` → `dist/index.mjs`, `types` → `dist/index.d.mts`. **ESM-only** — there is no CJS (`require`) entry.
- Only `dist/` is published (`files` field); `publishConfig.access` is `public`.
- The public API is controlled by the `src/index.ts` barrel — anything not re-exported there is internal. `module.ts` protected members are implementation detail and must not be relied on by callers.

## Separation of Concerns

- **Config discovery & parsing** → delegated to `locter` (Confinity does not read files itself).
- **Path/key resolution** → delegated to `pathtrace`.
- **Merging** → delegated to `smob` (swappable via `Options.mergeFn`).
- **Orchestration, name derivation, and merge precedence** → owned by `Container` (`src/module.ts`).
