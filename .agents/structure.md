# Project Structure

Confinity is a **single-package**, **ESM-only** TypeScript library. Source lives in `src/`, tests and fixtures in `test/`, and build output goes to `dist/` (git-ignored).

## Directory Layout

```
confinity/
├── src/
│   ├── index.ts               # Root barrel: re-exports errors + module + naming + store + types (public API)
│   ├── module.ts              # Container — read-only view over a store (get/getSync/has)
│   ├── types.ts               # Foundational types: Element, MergeFn
│   ├── errors/
│   │   ├── index.ts           # Barrel
│   │   ├── base.ts            # ConfinityError — base of everything confinity throws
│   │   ├── element.ts         # ElementError — malformed element passed to add()
│   │   ├── load.ts            # LoadError — file could not be read/parsed (carries path + cause)
│   │   └── options.ts         # OptionsError — unusable constructor option
│   ├── naming/
│   │   ├── index.ts           # Barrel: re-exports module + types
│   │   ├── module.ts          # NamingScheme (implements INamingScheme) — prefix/suffix/extensions convention
│   │   └── types.ts           # INamingScheme, NamingOptions
│   └── store/
│       ├── index.ts           # Barrel: re-exports constants + fs + module + types
│       ├── constants.ts       # DATA_/MODULE_/DEFAULT_EXTENSIONS discovery sets
│       ├── module.ts          # Store implements IStore — pure in-memory query/merge engine
│       ├── fs.ts              # FSStore extends Store — filesystem load/loadFile + lazy get
│       └── types.ts           # IStore, ReadableStore, Resolution, StoreOptions, Reader, FSStoreOptions
├── test/
│   ├── vitest.config.ts       # Vitest config (include globs + v8 coverage thresholds)
│   ├── unit/
│   │   ├── store.spec.ts      # Pure Store (query/merge/isolation) tests
│   │   ├── naming.spec.ts     # NamingScheme (toPatterns/toName) tests
│   │   ├── fsstore.spec.ts    # FSStore (load/loadFile/get + reader port) tests
│   │   └── module.spec.ts     # Container (read-only wrapper) tests
│   └── data/                  # Fixture config files loaded by the tests
│       ├── module/            # Module-format fixtures (.mjs) + a YAML with a literal `default:` key
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
| `src/index.ts`         | Root public barrel. `export *` from `./errors`, `./module`, `./naming`, `./store`, `./types`.       |
| `src/module.ts`        | `Container` — a read-only view (`get`/`getSync`/`has`) over a store.                               |
| `src/types.ts`         | Foundational public types: `Element` (incl. `source`), `MergeFn`.                                   |
| `src/errors/`          | The `ConfinityError` taxonomy — one class per file (`max-classes-per-file`).                        |
| `src/naming/module.ts` | `NamingScheme` (implements `INamingScheme`) — both directions of the prefix/suffix/extensions convention. |
| `src/naming/types.ts`  | The `INamingScheme` contract and `NamingOptions`.                                                   |
| `src/store/constants.ts` | `DATA_EXTENSIONS` / `MODULE_EXTENSIONS` / `DEFAULT_EXTENSIONS` — the discovery sets, exported so a caller can exclude executable formats. |
| `src/store/module.ts`  | `Store implements IStore` — the pure, in-memory query/merge engine, incl. the copy-on-read isolation guarantee. |
| `src/store/fs.ts`      | `FSStore extends Store` — adds the filesystem concern (`load`/`loadFile` + the sync twins `loadSync`/`loadFileSync`) and overrides `get` to lazily load (memoized). |
| `src/store/types.ts`   | The `IStore` contract, `ReadableStore`, `Resolution`, `StoreOptions`, the `Reader`/`ReaderSync` ports, `LoadErrorMode`, and `FSStoreOptions`. |

### `Container` (`src/module.ts`)

`new Container(store: ReadableStore)` is a **read-only view over a store**. It holds the store in a `#store` private field and exposes only `get`, `getSync` and `has` — no `load`/`loadFile`/`add`/`reset`. The parameter type is `Pick<IStore, 'get' | 'getSync' | 'has'>`, so the mutable surface is not even reachable through the reference it was handed.

| Member                        | Visibility  | Role                                                                       |
|-------------------------------|-------------|----------------------------------------------------------------------------|
| `constructor(store)`          | public      | Stores the wrapped store in `#store`.                                      |
| `getSync<T>(key)`             | public      | Delegates. Read-only — no mutation.                                        |
| `get<T>(key)`                 | public      | Delegates to the async read.                                               |
| `has(key)`                    | public      | Delegates to the existence check.                                          |

### `Store` surface (`src/store/module.ts`, implements `IStore`)

| Member                        | Visibility  | Role                                                                       |
|-------------------------------|-------------|----------------------------------------------------------------------------|
| `constructor(options?)`       | public      | Seeds an empty item list; resolves `mergeFn` (default smob merger).        |
| `add(element)`                | public      | Validates and appends a named `Element`; marks the list unsorted. Throws `ElementError` on a malformed one. |
| `getSync<T>(key)`             | public      | Resolves a dotted key across elements, merged (sync).                      |
| `get<T>(key)`                 | public      | The resolved `getSync` — an in-memory read has nothing to await.           |
| `has(key)`                    | public      | Whether any element contributed, so a configured `false`/`null` is distinguishable from absent. |
| `elements()`                  | public      | Sorted, detached copy of every element (with `source`) for provenance.     |
| `reset()`                     | public      | Drops every element.                                                       |
| `resolve(key)`                | protected   | The single matcher behind `getSync` and `has` — returns `{ exists, value }`. |
| `resolveIn(data, path, cb)`   | protected   | Wildcard-expanded path lookup within one element's data.                    |
| `nest(segments, value)`       | protected   | **Pure** — wraps a child element's data in the name segments the key did not consume. |
| `sort()`                      | protected   | Lazy code-unit sort by name (never `localeCompare`).                        |
| `merge(primary, secondary)`   | protected   | Copies `primary`, then object-vs-object deep merge; otherwise primary wins. |
| `copy(value, seen?)`          | protected   | **Pure** — prototype-aware, cycle-safe structural copy; exotics by reference. |

### `FSStore` surface (`src/store/fs.ts`, extends `Store`)

| Member                        | Visibility  | Role                                                                       |
|-------------------------------|-------------|----------------------------------------------------------------------------|
| `constructor(options?)`       | public      | Friendly ctor: resolves `cwd`, normalizes `extensions` + builds a `NamingScheme` (unless `naming` given), resolves the `Reader`/`ReaderSync` (default locter `read`/`readSync`) and `onError`, passes `mergeFn` to `Store`. |
| `get<T>(key)`                 | public      | Overrides `Store.get`: lazily loads on the first call (memoized via a shared `loading` promise, cleared on failure so a failed load retries; skipped once `loaded`), then delegates to `getSync`. |
| `load(input?)`                | public      | Discovers config files in one/many directories (default cwd; `[]` means none), then `addAll`s each. **Returns the loaded paths.** |
| `loadSync(input?)`            | public      | Synchronous twin of `load`; does **not** run lazily from `getSync`.        |
| `loadFile(input)`             | public      | Loads a single file (or array) directly, deriving each `name`.             |
| `loadFileSync(input)`         | public      | Synchronous twin of `loadFile` (via `fromFilesSync`).                      |
| `reset()`                     | public      | Clears elements **and** the `loaded`/`loading` state so the next load re-reads. |
| `addAll(elements)`            | protected   | Adds each element — **replacing** any element with the same `source` — marks `loaded`, returns the sources. The shared tail of every loader. |
| `fromDirectories(input?)` / `…Sync` | protected | Resolve directories, discover files, delegate to `fromFiles`/`…Sync` (async vs sync twin). |
| `fromFiles(input)` / `…Sync`  | protected   | Async: reads every file before raising, so error order is input order; sync: sequential. Both honour `onError` and wrap failures in `LoadError`, then call `toElement`. |
| `findFiles(dirs)` / `…Sync`   | protected   | `naming.toPatterns()` → `locateMany`/`locateManySync` **per directory** → `toFilePaths`. |
| `toFilePaths(results)`        | protected   | **Pure** — flattens per-directory results into a deterministic, duplicate-free list (directory order, then path order). |
| `resolveDirectories(input?)`  | protected   | **Pure** — input → deduplicated directory list. `undefined` → `cwd`; `[]` → none. Shared by both discovery paths. |
| `resolveFilePath(input)` / `resolveFilePaths(input)` | protected | **Pure** — resolve against `cwd` (absolutes untouched), deduplicated. Shared by both file paths. |
| `toElement(filePath, raw)`    | protected   | **Pure** — locter `isModuleRecord` unwrap, non-object skip, `sanitize` (strip `__proto__`/`constructor`/`prototype`), `naming.toName`, record `source`. Shared by both file paths. |

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
- `sideEffects: false` — the package is safe to tree-shake.
- The public API is controlled by the `src/index.ts` barrel — anything not re-exported there is internal. The `protected` members of `Store`, `FSStore`, and `NamingScheme` are the **subclassing** surface (that is the supported extension route alongside the `naming`/`read`/`readSync`/`mergeFn` injection points), but they are not part of the semver contract for plain callers.

## Separation of Concerns

- **Config discovery & parsing** → delegated to `locter` (Confinity does not read files itself; the parse step is a swappable `Reader` port defaulting to locter's `read`, and module detection uses locter's brand-based `isModuleRecord` rather than sniffing for a `default` key).
- **Path/key resolution** → delegated to `pathtrace`.
- **Merging** → delegated to `smob` (swappable via `StoreOptions.mergeFn`).
- **Convention (name ↔ glob patterns)** → owned by `NamingScheme` (swappable via `FSStoreOptions.naming`).
- **Read capability contract** → owned by `IStore` (`src/store/types.ts`), which promises only what every store can actually deliver — there is no throwing base.
- **Query, merge precedence & read isolation** → owned by `Store` (`src/store/module.ts`).
- **Filesystem loading (directory resolution, discovery, parsing orchestration) + wiring + lazy async `get`** → owned by `FSStore` (`src/store/fs.ts`); its friendly constructor builds the `NamingScheme` from `prefix`/`suffix`/`extensions`. The async loaders (`load`/`loadFile`) and their sync twins (`loadSync`/`loadFileSync`) share every pure step (`resolveDirectories`/`resolveFilePath`/`toElement`) and differ only at the two I/O calls (`locateMany`/`read` vs `locateManySync`/`readSync`).
- **Read-only view** → owned by `Container` (`src/module.ts`), wrapping a `ReadableStore` as a `get`/`getSync`/`has` facade.
- **Error vocabulary** → owned by `src/errors/`; everything thrown extends `ConfinityError`.
