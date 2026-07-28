# Architecture

## Overview

Confinity's primary entry point is the `FSStore` class (`src/store/fs.ts`). Its **friendly constructor** builds a `NamingScheme` from `prefix`/`suffix`/`extensions`, and because `FSStore extends Store` a single object exposes both the filesystem concern (`load`/`loadFile`) and the pure query engine (`add`/`getSync`). Together they implement a **load → store → merge → get** pipeline: config files are discovered and parsed, each stored as a named `Element` (`{ name, data, source }`), and later queried by dotted key. A query walks every stored element, resolves the requested path within each, and merges all matches into a single result — copying on the way out, so nothing internal escapes. A `Container` (`src/module.ts`) can wrap a store as a read-only view to hand to consumers. All I/O, path resolution, and merging are delegated to the three runtime dependencies (`locter`, `pathtrace`, `smob`), keeping the code focused on orchestration, name derivation, and merge precedence.

```
new FSStore(options) ──► builds NamingScheme ──► FSStore extends Store
                                                     │
directories/files ──► [locter: locate + parse via Reader] ──► Element[] { name, data, source }
                                                        │
                              get(key) ────────────────►│  match key vs each Element.name (segment-wise)
                                                        │  resolve remainder via pathtrace
                                                        │  copy, then merge matches via smob
                                                        └► value

new Container(store) ──► read-only get/getSync/has view over a ReadableStore
```

- **`NamingScheme`** (`src/naming/module.ts`, implements `INamingScheme`) owns the prefix/suffix/extensions convention in both directions: `toPatterns()` (convention → glob) and `toName(path)` (path → element name).
- **`Store`** (`src/store/module.ts`, implements `IStore`) is the pure, in-memory query/merge engine: it owns the element array, its lazy sort, key↔name matching, path resolution, merge precedence, and the copy-on-read isolation guarantee. Its async `get` is simply the resolved `getSync`.
- **`FSStore`** (`src/store/fs.ts`, extends `Store`) adds the filesystem concern: a friendly constructor that builds the naming scheme, directory resolution, glob discovery (via the naming scheme), and parsing through a `Reader` port (with a `ReaderSync` twin). It exposes both async loaders (`load`/`loadFile`) and their **sync twins** (`loadSync`/`loadFileSync`), and overrides `get` to **lazily load** on the first call (memoized).
- **`Container`** (`src/module.ts`) wraps a `ReadableStore` as a read-only `get`/`getSync`/`has` view; the loadable/mutable surface stays on the store.

## Core Concepts

### `Element` — a loaded config unit

```typescript
export type Element = {
    name: string,                   // derived from the file name (prefix/suffix stripped)
    data: Record<string, unknown>,  // parsed file contents
    source?: string                 // absolute path it was parsed from
};
```

Elements are held in `Store.items` and kept sorted by `name` (lazily, the first time a read runs after a load), using a **code-unit** comparator — never `localeCompare`, so precedence cannot depend on the ambient ICU locale. The sort is stable, so equal names keep load order. `source` is the identity used for load idempotency: `addAll` replaces an element loaded from the same file rather than appending a duplicate.

### `FSStoreOptions`

```typescript
export type FSStoreOptions = StoreOptions & {   // StoreOptions = { mergeFn? }
    cwd?: string,               // base dir for relative paths (default: process.cwd())
    prefix?: string,            // file-name prefix, e.g. "project"
    suffix?: string,            // file-name suffix
    extensions?: string[],      // default: conf, js, mjs, cjs, ts, mts, yml, yaml
    naming?: INamingScheme,     // custom convention; overrides prefix/suffix/extensions
    read?: Reader,              // custom async parser; overrides the default (locter's read)
    readSync?: ReaderSync,      // custom sync parser (for loadSync/loadFileSync); default locter's readSync
    onError?: 'throw' | 'skip'  // what to do with an unreadable file (default 'throw')
    // + mergeFn (from StoreOptions): default smob createMerger({ array:false, inPlace:false })
};
```

The `FSStore` **friendly constructor** normalizes these: it strips any leading `.` from `extensions`, defaults `cwd` to `process.cwd()`, and builds a `NamingScheme` from `prefix`/`suffix`/`extensions` — unless a custom `naming` is supplied, in which case those three are ignored. `mergeFn` is passed down to the `Store` base. The `naming`, `read`, and `readSync` fields are the injection points that let callers substitute the convention or either (async/sync) parser.

**Validation happens here, not at read time.** Only an *omitted* `extensions` falls back to the defaults — an explicitly empty array throws, rather than silently restoring the full list (executable formats included). `NamingScheme`'s constructor rejects a `prefix`/`suffix` that is not a literal file-name segment (path separators, `..`, or glob syntax), so a value like `'../secrets/app'` cannot escape `cwd` and `'**'` cannot make discovery recursive.

## Data Flow

### 1. Discovery — `FSStore.load(input?)` → `findFiles()`

- `input` may be a single directory, an array of directories, or omitted (falls back to `cwd`). An explicitly **empty** array means *no* directories, which is distinct from omitting it. Relative directories are resolved against `cwd` and deduplicated, so `load([abs, './'])` scans once.
- `findFiles` calls `naming.toPatterns()` to build glob patterns, then `locter.locateMany(patterns, { cwd, onlyFiles: true })` **once per directory**, in order. `toFilePaths` then flattens the results deterministically — directories keep the order given, files within one are ordered by path, and a file reachable from two directories is loaded once, at its first occurrence.
- `load` returns the absolute paths it loaded, so a caller can tell "nothing matched" from "loaded fine". Pattern selection (owned by `NamingScheme`):

  | prefix | suffix | patterns                                                        |
  |--------|--------|-----------------------------------------------------------------|
  | ✓      | ✓      | `{prefix}.*.{suffix}.{ext}`                                      |
  | ✓      | —      | `{prefix}.{ext}`, `{prefix}.*.{ext}`                             |
  | —      | ✓      | `{suffix}.{ext}`, `*.{suffix}.{ext}`                             |
  | —      | —      | `*.{ext}`                                                        |

  where `{ext}` expands to `{conf,json,js,mjs,...}` — or to the bare extension when exactly one is configured, since a one-alternative brace group (`{conf}`) is matched *literally* by the glob engine and would silently find nothing. The single `*` matches one filename segment (any characters except a path separator), so discovery is non-recursive — it does **not** descend into subdirectories. A prefix+suffix pattern therefore requires a middle segment (`project.server.conf` is not matched by `project.*.server.{ext}`).

### 2. Loading — `FSStore.loadFile(input)`

- Accepts a single path or an array (read in parallel via `Promise.all`), deduplicated. Relative paths resolve against `cwd`.
- Parses through the `Reader` port (`read(filePath)`), which defaults to `locter.read()`; substitute it via `FSStoreOptions.read`. Every file is read before the first failure is raised, so which error surfaces depends on input order rather than on which read lost a race. A failure is wrapped in a `LoadError` naming the file (with the original as `cause`), or skipped entirely when `onError: 'skip'`.
- Unwraps a module export using locter's brand-based `isModuleRecord` — **not** the presence of a `default` key. A `.yml`/`.conf`/`.json` config is entitled to a top-level `default:` of its own, and sniffing for the key silently discarded every sibling.
- **Skips** anything that is not an object (`smob.isObject`); the file simply does not appear in the loader's return value.
- Strips `__proto__`/`constructor`/`prototype` own keys, recursively, at this boundary — once, where the data enters, so no subclass or custom `mergeFn` can lose the guarantee.
- Derives `name` via `naming.toName(filePath)`: strip directory and extension, then strip a configured `prefix`/`suffix` **at a segment boundary**. Example: with `prefix: "project"`, `project.server.conf` → name `server`; `projectile.conf` → `''` (it does not follow the convention, so its keys belong at the root).
- `addAll`s `{ data, name, source }` to the store — replacing any element already loaded from the same `source`, so a repeated load refreshes instead of duplicating.

**Sync twins.** `loadSync`/`loadFileSync` mirror `load`/`loadFile` step-for-step. The two paths share every pure step — `resolveDirectories`/`resolveFilePath` (path resolution) and `toElement` (`.default` unwrap + non-object skip + name derivation) — and diverge only at the two I/O calls: `readSync` (default `locter.readSync`, injectable via `FSStoreOptions.readSync`) instead of `read`, and `locateManySync` instead of `locateMany` for discovery. The sync file path parses **sequentially** rather than via `Promise.all`. Unlike `get`, `getSync` does **not** trigger a lazy `loadSync` — it stays a snapshot of what is loaded, so a synchronous consumer calls `loadSync()`/`loadFileSync()` explicitly first.

### 3. Lookup — `Store.getSync<T>(key)`

`getSync` and `has` share one matcher, `resolve(key)`, which returns `{ exists, value }` — so the two can never disagree about whether a key is present, and a configured `false`/`null` is distinguishable from absent.

- Ensures `items` is sorted by `name` first.
- Per element (keys are plain strings; the v1 array form was removed):
  - `key` is empty → take the element's whole `data` (a whole-store read that ignores namespaces).
  - element has an empty name → the full `key` is looked up within `data`.
  - `key === element.name` → take the element's whole `data`.
  - `key` starts with `` `${element.name}.` `` → strip the name and dot; the remainder is looked up within `data`.
  - `element.name` starts with `` `${key}.` `` → the element sits *below* the key, so its data contributes **nested** under the name segments the key did not consume (`nest`). An element named `server.core` therefore answers `get('server')` as `{ core: … }`.
  - otherwise → skip the element.
- **The dot is part of both comparisons.** Matching is a path-segment test, not a string-prefix test, so element `server` never answers `serverless.port` and element `red` never answers `redis`.
- The remainder is resolved with `pathtrace.expandPath` (expands wildcards) + `getPathInfo`; only existing values are merged in.
- Returns the accumulated value cast to `T` (or `undefined`). **`T` is an unchecked assertion** — nothing validates the shape of a value parsed off disk.

### 3b. Async / lazy lookup — `FSStore.get<T>(key)`

- `getSync` (above) reads only what is **currently loaded** — on a never-loaded `FSStore` it returns `undefined`.
- `get` covers the lazy path: if the store is not yet `loaded`, it awaits a **memoized** `load()` (a shared `loading` promise, so concurrent callers trigger it once; skipped entirely if config was already loaded via `load()`/`loadFile()`), then delegates to sync `getSync`.
- A load that **fails** is not memoized: `loading` is cleared in the rejection path, so the next `get` retries rather than replaying a stale error forever.
- Concurrency is safe by construction rather than by promise juggling: elements are keyed by `source`, so a lazy `get` racing an explicit `load()` refreshes the same elements instead of adding them twice.
- On the base `Store`, `get` is the resolved `getSync` — an in-memory lookup has nothing to await, but the contract stays uniform.

### 4. Merge — `Store.merge(primary, secondary)`

```typescript
protected merge(primary: unknown | undefined, secondary: unknown) {
    if (typeof primary === 'undefined') return secondary;         // nothing new
    const value = this.copy(primary);                             // never alias stored data
    if (isObject(value) && isObject(secondary)) {
        return this.mergeFn(value, secondary);                    // deep merge
    }
    return value;                                                 // scalar: primary wins
}
```

- Two objects → deep-merged by the configured `mergeFn` (default `smob` merger: arrays **replaced**, not concatenated; immutable — `inPlace: false`).
- A scalar `primary` wins over `secondary`; an `undefined` primary yields the existing accumulator. Because accumulated results are passed as `secondary`, the more-recently-resolved value is the one that survives for non-object values.

**Why the copy.** `inPlace: false` only allocates a fresh object at the *top* level; nested objects are carried into it by reference and subsequent merges write *into* them. Without the copy, a read mutated the very elements it was reading — invisible with the default merger, but with an array-concatenating one the same key returned a longer array on every call, through a supposedly read-only `Container`. `primary` is the only argument that can still alias stored data (`secondary` is an accumulator this call chain already owns), so copying it alone is sufficient. `copy` is prototype-aware (plain objects and arrays are rebuilt; functions, `Date`s and class instances pass through by reference) and cycle-safe via an identity map, since a module config may legitimately be self-referencing. The corollary is a documented obligation: **a custom `mergeFn` must be pure.**

## Design Decisions

### Thin core, delegated capabilities
File formats, glob semantics, path syntax, and merge strategy are **not** reimplemented — they come from `locter`, `pathtrace`, and `smob`. To support a new file type, prefer configuring/extending those dependencies (or injecting a custom `Reader`) over adding parsing logic to `FSStore`.

### Loader/query seam
The filesystem concern (`load`/`loadFile`, discovery, parsing) lives on `FSStore`; the pure query/merge engine lives on `Store`. Because `FSStore extends Store`, the two can be tested at their own boundary — `Store` with hand-built `Element[]` (no fs), `FSStore` against fixtures or a stubbed `Reader` port. The contracts (`IStore`, `INamingScheme`) are the seams callers inject through.

### Sync + async read capability contract
`IStore` declares **both** an asynchronous `get` and a synchronous `getSync`, and **every store serves both**:

| Store                     | `get` (async)      | `getSync` (sync) |
|---------------------------|:------------------:|:----------------:|
| `Store` (memory)          | ✓ (resolved `getSync`) | ✓            |
| `FSStore`                 | ✓ (lazy, memoized) | ✓                |

An earlier design had an `AbstractStore` base whose `get`/`getSync` both threw "unsupported", letting a store override only the variant it served. It was **removed**: the type system still promised both, so `new Container(new Store()).get(x)` type-checked and always rejected — a capability difference expressed only as a runtime throw. Making an in-memory `get` simply resolve `getSync` is cheaper than any way of encoding the distinction (a split interface would force every consumer to narrow, contradicting the single uniform interface the API sells). The honest cut was the *smaller* one: one fewer export, no throwing paths, and a contract that means what it says.

### Sync + async loading (hand-written twins)

Loading has the same async/sync duality as reading: `FSStore` ships `load`/`loadFile` and their synchronous twins `loadSync`/`loadFileSync`, made possible because `locter` exposes sync twins of the two functions the store depends on (`locateManySync`, `readSync`). Rather than derive the twins from a shared generator body (as `locter` does internally with its `TwinOp`/`runTwin*` protocol), confinity keeps them **hand-written over extracted pure helpers** — each load body has a single I/O effect, so the pure parts (`resolveDirectories`, `resolveFilePaths`, `toFilePaths`, `toElement`) are shared and only the one I/O call is written twice. The generator machinery earns its keep for `locter`'s long, multi-effect bodies; for a one-effect body it would be more plumbing than it saves. The parse step's sync side is a separate injectable port (`ReaderSync`, default `locter.readSync`), the sibling of the async `Reader`. Note the asymmetry with reads: the async `get` lazily loads, but `getSync` is a pure snapshot and never triggers `loadSync` — a synchronous lazy-load would change `getSync`'s contract from "read what is loaded" to "maybe hit the disk", which is precisely the property a synchronous consumer chose it for. (Double-adding is no longer a reason: elements are keyed by `source`, so concurrent loads converge rather than duplicate.)

### Swappable merge strategy
`StoreOptions.mergeFn` lets callers replace the default merge behavior wholesale (e.g. to concatenate arrays). `Store.merge` only decides *whether* to merge (both-objects) vs take the primary; the *how* is the injected function. The injected function **must be pure** — see the merge section above.

### Validate at construction, report at load
Two complementary rules keep failures loud:

- Anything decidable from the options alone throws in the constructor (`OptionsError`) rather than producing an empty result at read time — an empty `extensions` list, a `prefix`/`suffix` that is not a literal file-name segment.
- Anything only knowable after touching the filesystem is **reported, not thrown**: the loaders return the paths they loaded, so a caller can decide whether "no config found" is an error in *its* context. The store does not guess, because only the caller knows whether the directory came from a `--config` flag or a default. An unreadable *file*, by contrast, is a genuine failure and throws a `LoadError` naming it (unless `onError: 'skip'`).

### Executable formats are opt-out, not opt-in
The default extension set includes `js`/`mjs`/`cjs`/`ts`/`mts`, so discovery can *execute* a matching file. That is the same trust model as every config loader in the ecosystem, and it is what makes a `project.config.ts` work at all — flipping the default would break a headline feature and buy no real security property (whoever can write `project.evil.js` into your project root can already write `index.ts`). Instead the two sets are **exported** (`DATA_EXTENSIONS`, `MODULE_EXTENSIONS`, `DEFAULT_EXTENSIONS`), so restricting discovery to data formats is one obvious line. No `allowExecutable` flag: `extensions` already expresses it.

### Name-based namespacing
A file's derived `name` (from `NamingScheme.toName`) acts as a key namespace. `get('server.core')` matches an element named `server` and resolves `core` inside it, or matches an element named `server.core` directly — allowing the same logical config to be split across files or nested within one.

## Error Handling

Everything confinity throws extends `ConfinityError` (`src/errors/`), so one `instanceof` catches the lot.

- `OptionsError` — an unusable constructor option. Thrown eagerly, at construction.
- `ElementError` — a malformed element passed to `add` (non-string `name`, non-object `data`). Thrown at `add`, not as a `localeCompare is not a function` from a later unrelated read.
- `LoadError` — a file could not be read or parsed. Carries the offending `path` and the underlying error as `cause`, because the raw dependency error does not name the file. Suppressed per-file by `onError: 'skip'`.
- Non-object file contents are **skipped, not thrown** — an invalid/empty config does not fail the whole load. The file's absence from the loader's return value is the signal.
- A directory that does not exist, or holds nothing matching, is **not** an error — `load` returns `[]`.
- `getSync` never throws for a missing key; it returns `undefined`. Use `has(key)` to tell "absent" from "configured as `false`/`null`".

## File Structure Mapping

```text
src/module.ts          → Container: read-only get/getSync/has view over a ReadableStore
src/types.ts           → Element (name/data/source), MergeFn
src/naming/module.ts   → NamingScheme: toPatterns/toName
src/naming/types.ts    → INamingScheme, NamingOptions
src/errors/            → ConfinityError + OptionsError / ElementError / LoadError
src/store/constants.ts → DATA_/MODULE_/DEFAULT_EXTENSIONS
src/store/module.ts    → Store implements IStore: add/get/getSync/has/elements/reset + merge/copy
src/store/fs.ts        → FSStore extends Store: load/loadFile (+ sync twins)/findFiles + lazy get
src/store/types.ts     → IStore, ReadableStore, Resolution, StoreOptions, Reader, ReaderSync, FSStoreOptions
src/index.ts           → public barrel
```
