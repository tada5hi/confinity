# Architecture

## Overview

Confinity's primary entry point is the `FSStore` class (`src/store/fs.ts`). Its **friendly constructor** builds a `NamingScheme` from `prefix`/`suffix`/`extensions`, and because `FSStore extends Store` a single object exposes both the filesystem concern (`load`/`loadFile`) and the pure query engine (`add`/`getSync`). Together they implement a **load → store → merge → get** pipeline: config files are discovered and parsed, each stored as a named `Element` (`{ name, data }`), and later queried by dotted key. A query walks every stored element, resolves the requested path within each, and merges all matches into a single result. A `Container` (`src/module.ts`) can wrap a store as a read-only `get` view to hand to consumers. All I/O, path resolution, and merging are delegated to the three runtime dependencies (`locter`, `pathtrace`, `smob`), keeping the code focused on orchestration, name derivation, and merge precedence.

```
new FSStore(options) ──► builds NamingScheme ──► FSStore extends Store
                                                     │
directories/files ──► [locter: locate + parse via Reader] ──► Element[] { name, data }
                                                        │
                              get(key) ────────────────►│  match key vs each Element.name
                                                        │  resolve remainder via pathtrace
                                                        └► merge matches via smob ──► value

new Container(store) ──► read-only get(key) view over one IStore
```

- **`NamingScheme`** (`src/naming/module.ts`, implements `INamingScheme`) owns the prefix/suffix/extensions convention in both directions: `toPatterns()` (convention → glob) and `toName(path)` (path → element name).
- **`AbstractStore`** (`src/store/base.ts`, implements `IStore`) is the abstract base whose `get` (async) and `getSync` (sync) **both throw "unsupported" by default** — a concrete store overrides only the variant(s) it can serve.
- **`Store`** (`src/store/module.ts`, extends `AbstractStore`) is the pure, in-memory query/merge engine: it owns the element array, its lazy sort, key↔name matching, path resolution, and merge precedence. It implements sync `getSync` and is **sync-only** — the async `get` stays the throwing default.
- **`FSStore`** (`src/store/fs.ts`, extends `Store`) adds the filesystem concern: a friendly constructor that builds the naming scheme, directory resolution, glob discovery (via the naming scheme), and parsing through a `Reader` port (with a `ReaderSync` twin). It exposes both async loaders (`load`/`loadFile`) and their **sync twins** (`loadSync`/`loadFileSync`), and overrides `get` to **lazily load** on the first call (memoized), so it serves both read variants.
- **`Container`** (`src/module.ts`) wraps a single `IStore` as a read-only `get`/`getSync` view — delegating both variants; the loadable/mutable surface stays on the store.

## Core Concepts

### `Element` — a loaded config unit

```typescript
export type Element = {
    name: string,               // derived from the file name (prefix/suffix stripped)
    data: Record<string, any>   // parsed file contents
};
```

Elements are held in `Store.items` and kept sorted by `name` (lazily, the first time `getSync` runs after a load). Sorting makes lookup order deterministic.

### `FSStoreOptions`

```typescript
export type FSStoreOptions = StoreOptions & {   // StoreOptions = { mergeFn? }
    cwd?: string,               // base dir for relative paths (default: process.cwd())
    prefix?: string,            // file-name prefix, e.g. "project"
    suffix?: string,            // file-name suffix
    extensions?: string[],      // default: conf, js, mjs, cjs, ts, mts, yml, yaml
    naming?: INamingScheme,     // custom convention; overrides prefix/suffix/extensions
    read?: Reader,              // custom async parser; overrides the default (locter's read)
    readSync?: ReaderSync       // custom sync parser (for loadSync/loadFileSync); default locter's readSync
    // + mergeFn (from StoreOptions): default smob createMerger({ array:false, inPlace:false })
};
```

The `FSStore` **friendly constructor** normalizes these: it strips any leading `.` from `extensions`, defaults `cwd` to `process.cwd()`, and builds a `NamingScheme` from `prefix`/`suffix`/`extensions` — unless a custom `naming` is supplied, in which case those three are ignored. `mergeFn` is passed down to the `Store` base. The `naming`, `read`, and `readSync` fields are the injection points that let callers substitute the convention or either (async/sync) parser.

## Data Flow

### 1. Discovery — `FSStore.load(input?)` → `findFiles()`

- `input` may be a single directory, an array of directories, or omitted (falls back to `cwd`). Relative directories are resolved against `cwd`.
- `findFiles` calls `naming.toPatterns()` to build glob patterns, then `locter.locateMany(patterns, { cwd, onlyFiles: true })` — the search directory is passed as `cwd`. Pattern selection (owned by `NamingScheme`):

  | prefix | suffix | patterns                                                        |
  |--------|--------|-----------------------------------------------------------------|
  | ✓      | ✓      | `{prefix}.*.{suffix}.{ext}`                                      |
  | ✓      | —      | `{prefix}.{ext}`, `{prefix}.*.{ext}`                             |
  | —      | ✓      | `{suffix}.{ext}`, `*.{suffix}.{ext}`                             |
  | —      | —      | `*.{ext}`                                                        |

  where `{ext}` expands to `{conf,js,mjs,...}`. The single `*` matches one filename segment (any characters except a path separator), so discovery is non-recursive — it does **not** descend into subdirectories. A prefix+suffix pattern therefore requires a middle segment (`project.server.conf` is not matched by `project.*.server.{ext}`).

### 2. Loading — `FSStore.loadFile(input)`

- Accepts a single path or an array (loaded in parallel via `Promise.all`). Relative paths resolve against `cwd`.
- Parses through the `Reader` port (`read(filePath)`), which defaults to `locter.read()`; substitute it via `FSStoreOptions.read`. Uses `file.default` when present (module configs with `export default` return a record whose `.default` holds the value; plain data files — `.conf`, `.yml`, `.json` — return the parsed object directly).
- **Skips** anything that is not a plain object (`smob.isObject`).
- Derives `name` via `naming.toName(filePath)`: strip directory and extension, then strip a configured `prefix`/`suffix` (and the adjoining `.`). Example: with `prefix: "project"`, `project.server.conf` → name `server`.
- `add`s `{ data, name }` to the store, marking the list unsorted.

**Sync twins.** `loadSync`/`loadFileSync` mirror `load`/`loadFile` step-for-step. The two paths share every pure step — `resolveDirectories`/`resolveFilePath` (path resolution) and `toElement` (`.default` unwrap + non-object skip + name derivation) — and diverge only at the two I/O calls: `readSync` (default `locter.readSync`, injectable via `FSStoreOptions.readSync`) instead of `read`, and `locateManySync` instead of `locateMany` for discovery. The sync file path parses **sequentially** rather than via `Promise.all`. Unlike `get`, `getSync` does **not** trigger a lazy `loadSync` — it stays a snapshot of what is loaded, so a synchronous consumer calls `loadSync()`/`loadFileSync()` explicitly first.

### 3. Lookup — `Store.getSync<T>(key)`

- Ensures `items` is sorted by `name` first.
- **Array key**: resolves each key in turn and merges the results together (`output = merge(value, output)`), so later keys take precedence for scalars.
- **String key**, per element:
  - `key === element.name` → take the element's whole `data` (remainder `''`).
  - `key` starts with `element.name` → strip the name (and dot); the remainder is looked up within `data`.
  - element has an empty name → the full `key` is looked up within `data`.
  - otherwise → skip the element.
- The remainder is resolved with `pathtrace.expandPath` (expands wildcards) + `getPathInfo`; only existing values are merged in.
- Returns the accumulated `output` cast to `T` (or `undefined`).

### 3b. Async / lazy lookup — `FSStore.get<T>(key)`

- `getSync` (above) reads only what is **currently loaded** — on a never-loaded `FSStore` it returns `undefined`.
- `get` covers the lazy path: if the store is not yet `loaded`, it awaits a **memoized** `load()` (a shared `loading` promise, so concurrent callers trigger it once; skipped entirely if config was already loaded via `load()`/`loadFile()`), then delegates to sync `getSync`.
- On the base `Store`, `get` is **not** overridden — it inherits the throwing default from `AbstractStore`, since an in-memory lookup has no reason to be async.

### 4. Merge — `Store.merge(primary, secondary)`

```typescript
protected merge(primary: unknown | undefined, secondary: unknown) {
    if (typeof primary === 'undefined') return secondary;         // nothing new
    if (isObject(primary) && isObject(secondary)) {
        return this.mergeFn(primary, secondary);                  // deep merge
    }
    return primary;                                               // scalar: primary wins
}
```

- Two objects → deep-merged by the configured `mergeFn` (default `smob` merger: arrays **replaced**, not concatenated; immutable — `inPlace: false`).
- A scalar `primary` wins over `secondary`; an `undefined` primary yields the existing accumulator. Because accumulated results are passed as `secondary`, the more-recently-resolved value is the one that survives for non-object values.

## Design Decisions

### Thin core, delegated capabilities
File formats, glob semantics, path syntax, and merge strategy are **not** reimplemented — they come from `locter`, `pathtrace`, and `smob`. To support a new file type, prefer configuring/extending those dependencies (or injecting a custom `Reader`) over adding parsing logic to `FSStore`.

### Loader/query seam
The filesystem concern (`load`/`loadFile`, discovery, parsing) lives on `FSStore`; the pure query/merge engine lives on `Store`. Because `FSStore extends Store`, the two can be tested at their own boundary — `Store` with hand-built `Element[]` (no fs), `FSStore` against fixtures or a stubbed `Reader` port. The contracts (`IStore`, `INamingScheme`) are the seams callers inject through.

### Sync + async read capability contract
`IStore` declares **both** an asynchronous `get` and a synchronous `getSync`. `AbstractStore` (`src/store/base.ts`) implements the contract with both variants **throwing "unsupported" by default**, so a concrete store overrides only the one(s) it can serve — a sync-only or async-only store needs no boilerplate. This keeps the async/lazy loading concern out of the pure query engine while still exposing one uniform interface:

| Store                            | `get` (async)      | `getSync` (sync) |
|----------------------------------|:------------------:|:----------------:|
| `Store` (memory)                 | ✗ throws           | ✓                |
| `FSStore`                        | ✓ (lazy, memoized) | ✓                |
| custom (`extends AbstractStore`) | whatever it implements; the other throws              |

`Container` delegates **both** variants to the wrapped store, so calling a variant the store does not support propagates the store's throw.

### Sync + async loading (hand-written twins)

Loading has the same async/sync duality as reading: `FSStore` ships `load`/`loadFile` and their synchronous twins `loadSync`/`loadFileSync`, made possible because `locter` exposes sync twins of the two functions the store depends on (`locateManySync`, `readSync`). Rather than derive the twins from a shared generator body (as `locter` does internally with its `TwinOp`/`runTwin*` protocol), confinity keeps them **hand-written over extracted pure helpers** — each load body has a single I/O effect, so the pure parts (`resolveDirectories`, `resolveFilePath`, `toElement`) are shared and only the one I/O call is written twice. The generator machinery earns its keep for `locter`'s long, multi-effect bodies; for a one-effect body it would be more plumbing than it saves. The parse step's sync side is a separate injectable port (`ReaderSync`, default `locter.readSync`), the sibling of the async `Reader`. Note the asymmetry with reads: the async `get` lazily loads, but `getSync` is a pure snapshot and never triggers `loadSync` — a synchronous lazy-load would both change `getSync`'s contract and race a concurrent in-flight async `load` into double-adding elements.

### Swappable merge strategy
`StoreOptions.mergeFn` lets callers replace the default merge behavior wholesale (e.g. to concatenate arrays). `Store.merge` only decides *whether* to merge (both-objects) vs take the primary; the *how* is the injected function.

### Name-based namespacing
A file's derived `name` (from `NamingScheme.toName`) acts as a key namespace. `get('server.core')` matches an element named `server` and resolves `core` inside it, or matches an element named `server.core` directly — allowing the same logical config to be split across files or nested within one.

## Error Handling

- Non-object file contents are silently ignored in `loadFile` (no throw) — invalid/empty configs are skipped rather than failing the whole load.
- Parse/IO errors surface from the `Reader` (`locter.read`) / `locateMany` and propagate to the caller (both `load` and `loadFile` are `async` and unhandled).
- `getSync` never throws for missing keys; it returns `undefined`.
- Calling a read variant the store does not implement **throws** (the `AbstractStore` default) — e.g. `get` on a memory `Store`, or `getSync` on an async-only custom store. This is a programming error (wrong variant for the store), not a lookup miss.

## File Structure Mapping

```text
src/module.ts          → Container: read-only get/getSync view over one IStore
src/types.ts           → Element, MergeFn
src/naming/module.ts   → NamingScheme: toPatterns/toName
src/naming/types.ts    → INamingScheme, NamingOptions
src/store/base.ts      → AbstractStore: IStore base, get/getSync throw by default
src/store/module.ts    → Store extends AbstractStore: add/getSync/merge (pure sync query/merge engine)
src/store/fs.ts        → FSStore extends Store: load/loadFile (+ loadSync/loadFileSync twins)/findFiles + lazy get
src/store/types.ts     → IStore (get + getSync), StoreOptions, Reader, ReaderSync, FSStoreOptions
src/index.ts           → public barrel
```
