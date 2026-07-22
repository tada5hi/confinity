# Project Structure

Confinity is a **single-package** TypeScript library. Source lives in `src/`, tests and fixtures in `test/`, and build output goes to `dist/` (git-ignored).

## Directory Layout

```
confinity/
├── src/
│   ├── index.ts               # Barrel: re-exports module.ts + types.ts (public API)
│   ├── module.ts              # Container class — the entire runtime logic
│   └── types.ts               # Element, MergeFn, Options, NormalizedOptions
├── test/
│   ├── jest.config.js         # Jest config (SWC transform, coverage thresholds)
│   ├── unit/
│   │   └── module.spec.ts     # Container behavior tests
│   └── data/                  # Fixture config files loaded by the tests
│       ├── project.conf          # key=value (.conf) fixture
│       ├── project.server.conf   # key=value (.conf) fixture
│       ├── project.client.yml    # YAML fixture
│       └── project.invalid.conf  # fixture without the `project` prefix
├── rollup.config.mjs          # Rollup build (SWC compile → CJS + ESM)
├── tsconfig.json              # Build tsconfig (extends @tada5hi/tsconfig)
├── tsconfig.eslint.json       # Wider tsconfig for linting src + test
├── .eslintrc                  # ESLint config (@tada5hi/eslint-config-typescript)
├── commitlint.config.js       # Conventional Commits enforcement
├── release.config.js          # semantic-release config
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
| `findFiles(path)`             | protected   | Builds glob patterns from prefix/suffix/extensions; calls `locateMany`.    |
| `normalizeOptions(input)`     | protected   | Applies defaults for `cwd`, `extensions`, and `mergeFn`.                    |
| `merge(primary, secondary)`   | protected   | Object-vs-object deep merge, otherwise first-defined wins.                  |

## Key Dependencies

| Dependency  | Role                                                                       |
|-------------|-----------------------------------------------------------------------------|
| `locter`    | `locateMany` (glob file discovery), `load` (parse config), `buildFilePath`. |
| `pathtrace` | `expandPath` (resolve wildcard segments), `getPathInfo` (read a value).      |
| `smob`      | `createMerger` (deep merge with `array:false, inPlace:false`), `isObject`.   |

Dev tooling (Rollup, SWC, Jest, ESLint, commitlint, semantic-release, husky) is all shared `@tada5hi/*` config. See [conventions.md](conventions.md).

## Package Exports

```json
{
    "./package.json": "./package.json",
    ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.mjs",
        "require": "./dist/index.cjs"
    }
}
```

- `main` → `dist/index.cjs`, `module` → `dist/index.mjs`, `types` → `dist/index.d.ts`.
- Only `dist/` is published (`files` field).
- The public API is controlled by the `src/index.ts` barrel — anything not re-exported there is internal. `module.ts` protected members are implementation detail and must not be relied on by callers.

## Separation of Concerns

- **Config discovery & parsing** → delegated to `locter` (Confinity does not read files itself).
- **Path/key resolution** → delegated to `pathtrace`.
- **Merging** → delegated to `smob` (swappable via `Options.mergeFn`).
- **Orchestration, name derivation, and merge precedence** → owned by `Container` (`src/module.ts`).
