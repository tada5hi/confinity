# Project Structure

Confinity is a **single-package**, **ESM-only** TypeScript library. Source lives in `src/`, tests and fixtures in `test/`, and build output goes to `dist/` (git-ignored).

## Directory Layout

```
confinity/
├── src/
│   ├── index.ts               # Root barrel: re-exports module + naming + store + types (public API)
│   ├── module.ts              # Container — read-only view (get) over a single IStore
│   ├── types.ts               # Foundational types: Element, MergeFn
│   ├── naming/
│   │   ├── index.ts           # Barrel: re-exports module + types
│   │   ├── module.ts          # NamingScheme (implements INamingScheme) — prefix/suffix/extensions convention
│   │   └── types.ts           # INamingScheme, NamingOptions
│   └── store/
│       ├── index.ts           # Barrel: re-exports base + fs + module + types
│       ├── base.ts            # AbstractStore (implements IStore) — get/getSync both throw by default
│       ├── module.ts          # Store extends AbstractStore — pure in-memory query/merge engine (sync getSync)
│       ├── fs.ts              # FSStore extends Store — filesystem load/loadFile + lazy get
│       └── types.ts           # IStore, StoreOptions, Reader, FSStoreOptions
├── test/
│   ├── vitest.config.ts       # Vitest config (include globs + v8 coverage thresholds)
│   ├── unit/
│   │   ├── store.spec.ts      # Pure Store (query/merge) tests
│   │   ├── naming.spec.ts     # NamingScheme (toPatterns/toName) tests
│   │   ├── fsstore.spec.ts    # FSStore (load/loadFile/get + reader port) tests
│   │   └── module.spec.ts     # Container (read-only wrapper) tests
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

| Module                 | Purpose                                                                                             |
|------------------------|-----------------------------------------------------------------------------------------------------|
| `src/index.ts`         | Root public barrel. `export *` from `./module`, `./naming`, `./store`, `./types`.                   |
| `src/module.ts`        | `Container` — a read-only view (`get`/`getSync`) over a single `IStore`.                           |
| `src/types.ts`         | Foundational public types: `Element`, `MergeFn`.                                                    |
| `src/naming/module.ts` | `NamingScheme` (implements `INamingScheme`) — both directions of the prefix/suffix/extensions convention. |
| `src/naming/types.ts`  | The `INamingScheme` contract and `NamingOptions`.                                                   |
| `src/store/base.ts`    | `AbstractStore` (implements `IStore`) — abstract base whose `get`/`getSync` both throw "unsupported"; a concrete store overrides only the variant(s) it serves. |
| `src/store/module.ts`  | `Store extends AbstractStore` — the pure, in-memory query/merge engine (implements sync `getSync`; leaves `get` throwing). |
| `src/store/fs.ts`      | `FSStore extends Store` — adds the filesystem concern (`load`/`loadFile` + the sync twins `loadSync`/`loadFileSync`) and overrides `get` to lazily load (memoized). |
| `src/store/types.ts`   | The `IStore` contract (`get` + `getSync`), `StoreOptions`, the `Reader`/`ReaderSync` ports, and `FSStoreOptions`. |

### `Container` (`src/module.ts`)

`new Container(store: IStore)` is a **read-only view over a single store**. It holds the store and exposes only `get<T>(key)` and `getSync<T>(key)`, delegating to it — no `load`/`loadFile`/`add`. Wrap an already-loaded `FSStore` (or any `IStore`) to hand consumers dotted-path lookups without the loading/mutation surface.

| Member                        | Visibility  | Role                                                                       |
|-------------------------------|-------------|----------------------------------------------------------------------------|
| `constructor(store)`          | public      | Stores the wrapped `IStore`.                                               |
| `getSync<T>(key)`             | public      | Delegates to `store.getSync<T>(key)`. Read-only — no mutation.             |
| `get<T>(key)`                 | public      | Delegates to `store.get<T>(key)`; propagates the store's throw if that variant is unsupported. |

### `AbstractStore` surface (`src/store/base.ts`)

| Member                        | Visibility  | Role                                                                       |
|-------------------------------|-------------|----------------------------------------------------------------------------|
| `add(element)`                | abstract    | Left for the concrete store to implement.                                  |
| `getSync<T>(key)`             | public      | **Throws** "unsupported" by default; a sync store overrides it.            |
| `get<T>(key)`                 | public      | **Throws** "unsupported" by default; an async store overrides it.          |

### `Store` surface (`src/store/module.ts`, extends `AbstractStore`)

| Member                        | Visibility  | Role                                                                       |
|-------------------------------|-------------|----------------------------------------------------------------------------|
| `constructor(options?)`       | public      | Seeds an empty item list; resolves `mergeFn` (default smob merger).        |
| `add(element)`                | public      | Appends a named `Element`; marks the list unsorted.                        |
| `getSync<T>(key)`             | public      | Resolves a dotted key (or array of keys) across elements, merged (sync). Overrides the throwing base. |
| `get<T>(key)`                 | —           | *Not overridden* — inherits the throwing default; a memory store is sync-only. |
| `merge(primary, secondary)`   | protected   | Object-vs-object deep merge, otherwise first-defined wins.                  |

### `FSStore` surface (`src/store/fs.ts`, extends `Store`)

| Member                        | Visibility  | Role                                                                       |
|-------------------------------|-------------|----------------------------------------------------------------------------|
| `constructor(options?)`       | public      | Friendly ctor: resolves `cwd`, normalizes `extensions` + builds a `NamingScheme` (unless `naming` given), resolves the `Reader`/`ReaderSync` (default locter `read`/`readSync`), passes `mergeFn` to `Store`. |
| `get<T>(key)`                 | public      | Overrides the throwing default: lazily loads on the first call (memoized via a shared `loading` promise; skipped once `loaded`), then delegates to sync `getSync`. |
| `load(input?)`                | public      | Discovers config files in one/many directories (default cwd), then `add`s each; marks `loaded`. |
| `loadSync(input?)`            | public      | Synchronous twin of `load` (via `fromDirectoriesSync`); does **not** run lazily from `getSync`. |
| `loadFile(input)`             | public      | Loads a single file (or array) directly, deriving each `name`; marks `loaded`. |
| `loadFileSync(input)`         | public      | Synchronous twin of `loadFile` (via `fromFilesSync`).                      |
| `addAll(elements)`            | protected   | `add`s each element and marks `loaded` — the shared tail of every loader.  |
| `fromDirectories(input?)` / `…Sync` | protected | Resolve directories, discover files, delegate to `fromFiles`/`…Sync` (async vs sync twin). |
| `fromFiles(input)` / `…Sync`  | protected   | Async: parses in parallel; sync: sequential. Both call `toElement` (`.default` unwrap + non-object skip + name). |
| `findFiles(cwd)` / `…Sync`    | protected   | `naming.toPatterns()` → `locateMany`/`locateManySync` → absolute file paths. |
| `resolveDirectories(input?)`  | protected   | **Pure** — input → directory list (relative resolved against `cwd`, else `cwd`). Shared by both discovery paths. |
| `resolveFilePath(input)`      | protected   | **Pure** — resolve one path against `cwd` (absolutes untouched). Shared by both file paths. |
| `toElement(filePath, raw)`    | protected   | **Pure** — `.default` unwrap, non-object skip, `naming.toName`; returns an `Element` or `undefined`. Shared by both file paths. |

### `NamingScheme` surface (`src/naming/module.ts`)

| Member                        | Visibility  | Role                                                                       |
|-------------------------------|-------------|----------------------------------------------------------------------------|
| `constructor(options)`        | public      | Stores `prefix`, `suffix`, and normalized `extensions`.                    |
| `toPatterns()`                | public      | Builds glob patterns from prefix/suffix/extensions (non-recursive).        |
| `toName(filePath)`            | public      | Derives the element name from a file path (strip dir/ext, then prefix/suffix). |

## Key Dependencies

| Dependency  | Role                                                                       |
|-------------|-----------------------------------------------------------------------------|
| `locter`    | `locateMany` (glob discovery driven by `NamingScheme.toPatterns()`), `read` (parse config, the default `Reader`), `buildFilePath`. |
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
- The public API is controlled by the `src/index.ts` barrel — anything not re-exported there is internal. The `protected` members of `Store`, `FSStore`, and `NamingScheme` are implementation detail and must not be relied on by callers.

## Separation of Concerns

- **Config discovery & parsing** → delegated to `locter` (Confinity does not read files itself; the parse step is a swappable `Reader` port defaulting to locter's `read`).
- **Path/key resolution** → delegated to `pathtrace`.
- **Merging** → delegated to `smob` (swappable via `StoreOptions.mergeFn`).
- **Convention (name ↔ glob patterns)** → owned by `NamingScheme` (swappable via `FSStoreOptions.naming`).
- **Read capability contract (sync `getSync` + async `get`, unsupported variant throws)** → owned by `AbstractStore` (`src/store/base.ts`); concrete stores override the variant(s) they serve.
- **Query & merge precedence (sync `getSync`)** → owned by `Store` (`src/store/module.ts`).
- **Filesystem loading (directory resolution, discovery, parsing orchestration) + wiring + lazy async `get`** → owned by `FSStore` (`src/store/fs.ts`); its friendly constructor builds the `NamingScheme` from `prefix`/`suffix`/`extensions`. The async loaders (`load`/`loadFile`) and their sync twins (`loadSync`/`loadFileSync`) share every pure step (`resolveDirectories`/`resolveFilePath`/`toElement`) and differ only at the two I/O calls (`locateMany`/`read` vs `locateManySync`/`readSync`).
- **Read-only view** → owned by `Container` (`src/module.ts`), wrapping a single `IStore` as a `get`/`getSync` facade (delegates both).
