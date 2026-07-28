<p align="center">
    <img src="assets/logo.svg" alt="Confinity" width="128" height="128" />
</p>

<h1 align="center">Confinity</h1>

<p align="center">
    <b>Load & merge configuration across a multi-package application.</b><br>
    An <code>FSStore</code> discovers config files in one or many directories, parses<br>
    <code>.conf</code>, <code>.yml</code>, <code>.json</code>, JS/TS &amp; more, and serves them through a single dotted-path getter.
</p>

<p align="center">
    <a href="https://github.com/tada5hi/confinity/actions/workflows/main.yml"><img src="https://github.com/tada5hi/confinity/actions/workflows/main.yml/badge.svg" alt="CI" /></a>
    <a href="https://www.npmjs.com/package/confinity"><img src="https://img.shields.io/npm/v/confinity.svg?logo=npm&logoColor=white" alt="npm version" /></a>
    <a href="https://snyk.io/test/github/tada5hi/confinity"><img src="https://snyk.io/test/github/tada5hi/confinity/badge.svg" alt="Known Vulnerabilities" /></a>
    <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white" alt="Conventional Commits" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
</p>

<p align="center">
    <a href="#-quick-start"><b>Quick Start</b></a>
    ·
    <a href="#-how-it-works">How It Works</a>
    ·
    <a href="#-configuration">Configuration</a>
    ·
    <a href="#-api">API</a>
</p>

<br>

## Table of Contents

- [Why Confinity?](#-why-confinity)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [How It Works](#-how-it-works)
- [File Discovery](#-file-discovery)
- [Configuration](#-configuration)
- [API](#-api)
- [Extending](#-extending)
- [Merge Semantics](#-merge-semantics)
- [Migrating from v1](#-migrating-from-v1)
- [Requirements](#-requirements)
- [License](#-license)

## ✨ Why Confinity?

Large applications rarely keep their configuration in a single file. Services, clients, and databases each grow their own settings — sometimes split across packages, sometimes layered as overrides. Confinity gives you **one place to read all of it**:

- **📁 Multi-directory discovery** — point at one directory or many; files are located with glob patterns, never recursively.
- **🧩 Format-agnostic** — `.conf`, `.yml`/`.yaml`, `.json`, and `.js`/`.mjs`/`.cjs`/`.ts`/`.mts` modules all load through the same pipeline (parsing delegated to [`locter`](https://github.com/tada5hi/locter)).
- **🔗 Deep-merge on read** — a single `get('server.core')` collects and merges matches from **every** loaded file, so config can be split or layered freely.
- **🏷️ Name-based namespacing** — a file's name (after stripping a `prefix`/`suffix`) becomes a key namespace, so `project.server.conf` answers `get('server.*')`.
- **🎯 Dotted & wildcard paths** — resolve nested values (and wildcard segments) via [`pathtrace`](https://github.com/tada5hi/pathtrace).
- **🔧 Swappable strategy** — bring your own `mergeFn`, or inject a custom `naming` / `read` implementation.
- **📦 ESM-only, tiny core** — a thin orchestrator over `locter`, `pathtrace`, and `smob`; no config parsing reinvented.

## 📥 Installation

```bash
npm install confinity
```

> **ESM-only.** Confinity ships as an ES module (`"type": "module"`) and requires **Node.js `>=22`**. Import it with `import`, not `require()`.

## 🚀 Quick Start

Given a config directory:

```text
config/
├── project.conf          # server.core.host, client.web.host, db.*
├── project.server.conf   # core.port, db.database
└── project.client.yml    # web.port
```

Construct a store, load it, and read it — the **store is the loadable unit**:

```typescript
import { FSStore } from 'confinity';

const store = new FSStore({
    cwd: 'config',
    prefix: 'project',
});

// Discover & parse every `project.*` file in `cwd`
await store.load();

// Values from `project.conf` and `project.server.conf` are merged
const core = store.getSync('server.core');
// → { host: '1.1.1.1', port: 4010 }

const web = store.getSync('client.web');
// → { host: '1.1.1.2', port: 4000 }
```

Hand consumers a **read-only view** with `Container` — `get`/`getSync` only, no `load`/`loadFile`/`add`:

```typescript
import { Container } from 'confinity';

const config = new Container(store);
config.getSync('server.core'); // → { host: '1.1.1.1', port: 4010 }
```

Prefer to load specific files? Skip discovery and pass paths directly:

```typescript
const store = new FSStore({ prefix: 'project', cwd: 'config' });

await store.loadFile([
    'project.conf',
    'project.server.conf',
]);

store.getSync('server.core'); // → { host: '1.1.1.1', port: 4010 }
```

Fall back across several keys with `??` — **most specific first**, since a store read returns `undefined` when nothing matched:

```typescript
const db = store.getSync('server.core.db')
    ?? store.getSync('server.db')
    ?? store.getSync('db');
```

Ask whether a key was configured at all — which a value alone cannot tell you, because `false` and `null` are legitimate config:

```typescript
store.has('server.redis');   // → true even when the value is `false`
```

### Sync vs. async (lazy) reads

Reads come in two variants, and **every store serves both**. `getSync` is **synchronous** — it returns whatever is currently loaded. `get` is **asynchronous** and, on an `FSStore`, **lazily loads on the first call**, then reads — the load is **memoized** (runs at most once, is shared across concurrent callers, and is skipped if config was already loaded via `load()`/`loadFile()`). A load that *fails* is not memoized: the next `get` retries rather than replaying the error. This gives two usage modes:

```typescript
// eager: load once, then cheap synchronous reads
const store = new FSStore({ prefix: 'project', cwd: 'config' });
await store.load();
store.getSync('server.core');          // sync

// lazy / async (the default get): loads once on the first call
await store.get('server.core');
```

On a plain in-memory `Store` there is nothing to await, so `get` is simply the resolved `getSync`.

### Fully synchronous usage

Loading has the same duality: `load`/`loadFile` have synchronous twins, `loadSync`/`loadFileSync`. They accept the same input and do the same work, parsing through a separate synchronous port (`readSync`, default [`locter`](https://github.com/tada5hi/locter)'s `readSync`):

```typescript
const store = new FSStore({ prefix: 'project', cwd: 'config' });

store.loadSync();                      // or: store.loadFileSync(['project.conf'])
store.getSync('server.core');          // → { host: '1.1.1.1', port: 4010 }
```

Note the asymmetry with reads: **`getSync` never loads for you.** The async `get` lazily loads on its first call, but the sync read stays a pure snapshot of what is loaded, so a synchronous consumer calls `loadSync()`/`loadFileSync()` explicitly first — a synchronous lazy load would change `getSync`'s contract. A sync load still marks the store loaded, so a later `get()` will not re-read the files.

### Knowing what was loaded

Every loader returns the **absolute paths it actually loaded**, so "found nothing" is distinguishable from "loaded fine" — the failure a mistyped config directory otherwise hides completely:

```typescript
const loaded = await store.load(options.directory);
if (loaded.length === 0) {
    console.warn(`No configuration found in ${options.directory}.`);
}
```

Loading is **idempotent**: an element is keyed by its source file, so loading the same file twice — or the same directory under two names, or an explicit `load()` racing a lazy `get()` — refreshes that element instead of adding a duplicate. Call `reset()` to drop everything and start over. For provenance, `elements()` reports every stored element with the file it came from.

## 🔍 How It Works

An **`FSStore`** implements a **load → store → merge → get** pipeline. Its friendly constructor builds a **naming scheme** from your `prefix`/`suffix`/`extensions`; `load`/`loadFile` discover and parse files; `get` serves merged values. The pure, in-memory query/merge engine lives on `Store` — the base `FSStore` extends. Discovery, parsing, path resolution, and merging are delegated to the three runtime dependencies — Confinity owns only orchestration, name derivation, and merge precedence.

Taking the `config/` directory from [Quick Start](#-quick-start), each file becomes one `Element`:

```text
config/project.conf         →  Element { name: '',       data: { server: {…}, client: {…}, db: {…} } }
config/project.server.conf  →  Element { name: 'server', data: { core: { port: 4010 }, db: {…} } }
config/project.client.yml   →  Element { name: 'client', data: { web: { port: 4000 } } }
```

…and a single read walks all of them, resolving the key against each element's `name` before merging what it found:

```text
store.get('server.core')
  ├─ name ''        → resolve 'server.core'  → { host: '1.1.1.1' }
  ├─ name 'client'  → no match               → skipped
  ├─ name 'server'  → resolve 'core'         → { port: 4010 }
  └─ merged                                  → { host: '1.1.1.1', port: 4010 }
```

So the same key is answered jointly by the root file and the file *named* after it — which is what lets one logical config be split across files or layered as overrides.

1. **Discovery** — `load()` builds glob patterns from your `prefix`/`suffix`/`extensions` and locates matching files in each directory (non-recursively).
2. **Loading** — each file is parsed, and everything that resolves to an object is stored as an `Element` — `{ name, data, source }`. A file's `name` is its base name with the configured `prefix`/`suffix` (and the adjoining `.`) stripped. Contents that are not an object (e.g. a scalar YAML) are skipped — the file simply does not appear in the loader's return value.
3. **Lookup** — `get(key)` walks every stored element, matches the key against each element's `name`, resolves the remaining path within `data`, and merges all matches into one result.

## 🗂️ File Discovery

The naming scheme builds glob patterns from your options. The single `*` matches one filename segment (no path separator), so **discovery never descends into subdirectories**:

| `prefix` | `suffix` | Glob patterns                                       |
|:--------:|:--------:|-----------------------------------------------------|
|    ✓     |    ✓     | `{prefix}.*.{suffix}.{ext}`                          |
|    ✓     |    —     | `{prefix}.{ext}`, `{prefix}.*.{ext}`                |
|    —     |    ✓     | `{suffix}.{ext}`, `*.{suffix}.{ext}`                |
|    —     |    —     | `*.{ext}`                                           |

…where `{ext}` expands to your configured `extensions`. Because a `prefix` **and** `suffix` require a middle segment, `project.server.conf` is *not* matched by a `project` + `server` pattern.

**Name derivation.** With `prefix: 'project'`:

| File                  | Element name | Answers keys like            |
|-----------------------|--------------|------------------------------|
| `project.conf`        | *(empty)*    | `server.core`, `db.host`     |
| `project.server.conf` | `server`     | `server.core`, `server.db`   |
| `project.client.yml`  | `client`     | `client.web`                 |

An element with an empty name is looked up at the root, so its keys are addressable directly.

Matching is **segment-aware in both directions**. A key only matches an element name at a `.` boundary — element `server` answers `server.port` but never `serverless.port` — and an element named *below* the requested key contributes nested under the segments the key did not consume:

```text
Element { name: 'server.core', data: { host: '1.1.1.1' } }

store.getSync('server')            // → { core: { host: '1.1.1.1' } }
store.getSync('server.core.host')  // → '1.1.1.1'
```

So splitting `project.server.core.conf` out of `project.server.conf` does not hide it from `get('server')`; the more specific file wins where they overlap.

**Off-convention files.** `toName` derives a namespace only from a file that actually follows the scheme. With `prefix: 'project'`, `loadFile('production.conf')` yields the **root** name — its keys land at the top level, where naming a file explicitly implies you want them — rather than being filed under a `production` namespace nothing will ever query.

## ⚙️ Configuration

Pass `FSStoreOptions` to the `FSStore` constructor. Every field is optional:

```typescript
import { FSStore, type FSStoreOptions } from 'confinity';

const options: FSStoreOptions = {
    cwd: process.cwd(),
    prefix: 'project',
    suffix: undefined,
    extensions: ['conf', 'yml', 'yaml', 'json', 'js', 'ts'],
    mergeFn: (target, source) => ({ ...source, ...target }),
};

const store = new FSStore(options);
```

| Option       | Type                                              | Default                                                                 | Description                                                                                   |
|--------------|---------------------------------------------------|-------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| `cwd`        | `string`                                          | `process.cwd()`                                                         | Base directory for resolving relative directories and file paths.                             |
| `prefix`     | `string`                                          | —                                                                       | File-name prefix (e.g. `project`); stripped when deriving an element's `name`.                |
| `suffix`     | `string`                                          | —                                                                       | File-name suffix; stripped when deriving an element's `name`.                                 |
| `extensions` | `string[]`                                         | `DEFAULT_EXTENSIONS`                                                    | Extensions to discover. A leading `.` is stripped automatically. Omit for the defaults — an **empty array throws** rather than silently restoring them. |
| `mergeFn`    | `(target, source) => Record<string, unknown>`      | [`smob`](https://github.com/tada5hi/smob) merger (arrays replaced, immutable) | Strategy used to deep-merge two objects during a read. **Must be pure** — see [Merge Semantics](#-merge-semantics). |
| `naming`     | `INamingScheme`                                    | `NamingScheme` from `prefix`/`suffix`/`extensions`                      | Custom naming implementation (overrides `prefix`/`suffix`/`extensions`).                       |
| `read`       | `(filePath: string) => Promise<unknown>`          | [`locter`](https://github.com/tada5hi/locter)'s `read`                  | Custom asynchronous reader/parser used by `load`/`loadFile`.                                   |
| `readSync`   | `(filePath: string) => unknown`                   | [`locter`](https://github.com/tada5hi/locter)'s `readSync`              | Custom synchronous reader/parser used by `loadSync`/`loadFileSync`.                            |
| `onError`    | `'throw' \| 'skip'`                                | `'throw'`                                                               | What to do when a file cannot be read or parsed. `'throw'` raises a `LoadError` naming the file; `'skip'` keeps the files that did parse. |

**Options are validated at construction.** A `prefix`/`suffix` must be a literal file-name segment — anything containing a path separator, `..`, or glob syntax (`* ? { } , [ ] ! ( )`) throws an `OptionsError` instead of quietly widening discovery or escaping `cwd`. An empty `extensions` array throws for the same reason.

### Choosing which formats to discover

The default extension list includes formats that are **executed** to produce config (`js`, `mjs`, `cjs`, `ts`, `mts`) — discovering one imports it. That is the same trust model as every config loader, and it is what makes a `project.config.ts` possible; but when the search directory is not fully trusted, restrict discovery to data formats:

```typescript
import { FSStore, DATA_EXTENSIONS } from 'confinity';

const store = new FSStore({
    prefix: 'project',
    extensions: [...DATA_EXTENSIONS],   // conf, json, yml, yaml
});
```

`DATA_EXTENSIONS`, `MODULE_EXTENSIONS` and `DEFAULT_EXTENSIONS` (the two concatenated) are exported for exactly this.

## 📚 API

The primary entry point is the `FSStore` class; the `Store` base, the read-only `Container` view, the `NamingScheme`, the error classes, and their contracts are exported too. Reads come in two variants — a synchronous `getSync` and an asynchronous `get` (which an `FSStore` uses to lazily load) — and **both always work**.

### `FSStore` (extends `Store`)

A `Store` that populates itself from the filesystem. Its **friendly constructor** normalizes `extensions` and builds a `NamingScheme` from `prefix`/`suffix`/`extensions` (unless a custom `naming` is supplied); parsing goes through a `Reader` port (`read`, default [`locter`](https://github.com/tada5hi/locter)'s `read`).

```typescript
new FSStore(options?: FSStoreOptions)
```

| Member     | Signature                                             | Description                                                                                     |
|------------|-------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| `load`     | `load(input?: string \| string[]): Promise<string[]>` | Discovers config files in one or many directories (defaults to `cwd`; `[]` means none), loads each, and returns the paths loaded. |
| `loadFile` | `loadFile(input: string \| string[]): Promise<string[]>` | Loads a single file (or array, in parallel) directly, deriving its `name`.                   |
| `loadSync` | `loadSync(input?: string \| string[]): string[]`      | Synchronous twin of `load` — same discovery, parsed via `readSync`.                             |
| `loadFileSync` | `loadFileSync(input: string \| string[]): string[]` | Synchronous twin of `loadFile` — parses sequentially rather than in parallel.                 |
| `get`      | `get<T = unknown>(key: string): Promise<T \| undefined>` | Like `getSync`, but async — lazily loads from the filesystem on the first call (memoized), then resolves. |
| `reset`    | `reset(): void`                                       | Drops every element **and** the loaded marker, so the next load reads the filesystem again.     |
| `add`      | `add(element: Element): void`                        | *(from `Store`)* Adds a named element. Rejects a malformed element with an `ElementError`.       |
| `getSync`  | `getSync<T = unknown>(key: string): T \| undefined`   | *(from `Store`)* Resolves a dotted key across elements, merged. Reads only what is currently loaded — it never loads for you. |
| `has`      | `has(key: string): boolean`                          | *(from `Store`)* Whether any element contributes a value — `true` even when that value is `false`/`null`. |
| `elements` | `elements(): readonly Element[]`                     | *(from `Store`)* Every stored element with its `source` file, for provenance and diagnostics.    |

### `Store`

The pure, in-memory half (no filesystem) that `FSStore` extends — construct it directly to feed elements in by hand. Its `get` has nothing to await, so it is simply the resolved `getSync`.

```typescript
new Store(options?: StoreOptions)   // { mergeFn? }
```

### `Container`

A **read-only view over a single store**. Wrap a store (e.g. an `FSStore` you have already loaded) to hand consumers dotted-path lookups without exposing the loading or mutation surface — `load`/`loadFile`/`add`/`reset` stay on the store. The wrapped store is held in a private field, and the parameter is typed as only the read methods, so it cannot be reached back through the view.

```typescript
new Container(store: ReadableStore)   // Pick<IStore, 'get' | 'getSync' | 'has'>
```

| Member     | Signature                                               | Description                                          |
|------------|---------------------------------------------------------|------------------------------------------------------|
| `getSync`  | `getSync<T = unknown>(key: string): T \| undefined`     | Delegates to the wrapped store's `getSync`.          |
| `get`      | `get<T = unknown>(key: string): Promise<T \| undefined>` | Delegates to the wrapped store's `get`.             |
| `has`      | `has(key: string): boolean`                             | Delegates to the wrapped store's `has`.              |

### Errors

Everything confinity throws extends `ConfinityError`, so one `instanceof` catches the lot.

| Error            | Thrown when                                                                     |
|------------------|---------------------------------------------------------------------------------|
| `OptionsError`   | A constructor option is unusable — an empty `extensions` list, a `prefix`/`suffix` that is not a literal file-name segment. |
| `ElementError`   | `add()` received a malformed element (non-string `name`, non-object `data`).     |
| `LoadError`      | A file could not be read or parsed. Carries the offending `path` and the underlying error as `cause`. |

### Types

```typescript
type Element = {
    name: string;                   // derived from the file name (prefix/suffix stripped)
    data: Record<string, unknown>;  // parsed file contents
    source?: string;                // absolute path it was parsed from
};

type MergeFn = (
    target: Record<string, unknown>,
    source: Record<string, unknown>
) => Record<string, unknown>;

type Reader = (filePath: string) => Promise<unknown>;      // used by load / loadFile
type ReaderSync = (filePath: string) => unknown;           // used by loadSync / loadFileSync

type LoadErrorMode = 'throw' | 'skip';

type StoreOptions = {
    mergeFn?: MergeFn;
};

type FSStoreOptions = StoreOptions & {
    cwd?: string;
    prefix?: string;
    suffix?: string;
    extensions?: string[];
    naming?: INamingScheme;
    read?: Reader;
    readSync?: ReaderSync;
    onError?: LoadErrorMode;
};

// Contracts (interfaces, class-implemented)
interface INamingScheme {
    toPatterns(): string[];
    toName(filePath: string): string;
}

interface IStore {
    add(element: Element): void;
    get<T = unknown>(key: string): Promise<T | undefined>;   // async
    getSync<T = unknown>(key: string): T | undefined;        // sync
    has(key: string): boolean;
    elements(): readonly Element[];
    reset(): void;
}

// What a Container needs, and all it is given.
type ReadableStore = Pick<IStore, 'get' | 'getSync' | 'has'>;
```

> **`T` is not checked.** Both reads default to `T = unknown`, and a type argument is an *assertion* about a value parsed off disk moments earlier — nothing validates it. Narrow the result yourself (or run it through a schema validator) rather than trusting the annotation.

## 🧩 Extending

The convention and both parser ports are injectable through `FSStoreOptions`:

```typescript
import { FSStore, type INamingScheme, type Reader, type ReaderSync } from 'confinity';

// Custom naming: control which files match and how names are derived.
const naming: INamingScheme = {
    toPatterns: () => ['*.config.json'],
    toName: (filePath) => filePath.split('/').pop()!.replace('.config.json', ''),
};

// Custom reader: e.g. parse a bespoke format, or read from memory.
const read: Reader = async (filePath) => ({ /* parsed value */ });

// …and its synchronous twin, used by loadSync / loadFileSync.
const readSync: ReaderSync = (filePath) => ({ /* parsed value */ });

const store = new FSStore({ naming, read, readSync });
```

Supply only the port you use: `read` covers `load`/`loadFile`, `readSync` covers `loadSync`/`loadFileSync`, and each falls back to its `locter` default independently.

Need to change how values are stored, queried or merged? Subclass `Store` (or `FSStore`) — both implement `IStore`. To write a store from scratch, implement `IStore` directly; the interface promises only what every store can actually deliver, so there is no unimplemented variant waiting to throw at runtime.

## 🔀 Merge Semantics

When two matches combine, `Store.merge(primary, secondary)` decides *whether* to merge — the injected `mergeFn` decides *how*:

- **Two objects** → deep-merged by the configured `mergeFn`. The default [`smob`](https://github.com/tada5hi/smob) merger **replaces** arrays (does not concatenate) and is immutable (`inPlace: false`).
- **Scalar `primary`** → wins over `secondary`.
- **`undefined` `primary`** → yields the existing accumulator.

**Order.** Elements are sorted by `name` in code-unit order — deliberately not `localeCompare`, so precedence can never depend on the ambient locale. The sort is stable, so two elements with the same name keep load order. Because the accumulated result is passed as `secondary`, the **later** element wins for non-object values; two elements that both match therefore resolve "more specific last, and it wins".

**Nothing internal escapes.** Every value leaving the store is copied on its way out, so a caller mutating a result cannot corrupt loaded config, and repeated reads of the same key always return the same answer. Plain objects and arrays are copied structurally (cycles included); functions, `Date`s and class instances — which a `.ts`/`.mjs` config may legitimately export — pass through by reference.

> ⚠️ **A custom `mergeFn` must be pure.** It receives a defensive copy as `target`, but a merger that writes into `source`, or returns one of its arguments by reference, puts the aliasing back and makes repeated reads drift.

## 🔁 Migrating from v1

In v1, `Container` was a single class that both loaded files and answered queries, and its `get` was synchronous. v2 splits those roles: **`FSStore` is the loadable unit**, and `Container` is now a read-only *view* over a store.

```typescript
// v1
import { Container } from 'confinity';

const container = new Container({ prefix: 'project', cwd: 'config' });
await container.load();
const core = container.get('server.core');        // synchronous

// v2
import { FSStore } from 'confinity';

const store = new FSStore({ prefix: 'project', cwd: 'config' });
await store.load();
const core = store.getSync('server.core');        // synchronous read is now getSync
```

| v1                                  | v2                                                                     |
|-------------------------------------|------------------------------------------------------------------------|
| `new Container(options)`            | `new FSStore(options)` — same `cwd`/`prefix`/`suffix`/`extensions`/`mergeFn` fields |
| `container.load()` / `.loadFile()`  | unchanged on `FSStore` (now returning the paths loaded), plus new `loadSync()` / `loadFileSync()` |
| `container.get(key)` *(sync)*       | `store.getSync(key)` *(sync)* — or `await store.get(key)`, which lazily loads |
| `container.get([a, b, c])`          | removed — fall back explicitly with `getSync(a) ?? getSync(b) ?? getSync(c)` |
| `new Container(...)` as the read API | `new Container(store)` — read-only view; construct it **from** a store |
| type `Options`                      | type `FSStoreOptions`                                                  |
| type `NormalizedOptions`            | removed (internal)                                                     |

> ⚠️ **`get` kept its name but changed meaning, and the compiler will not always catch it.** In v1 `get` returned the value; in v2 it returns a `Promise`. Where the result flows into a typed slot (`const raw: ConfigInput = container.get('x')`) `tsc` now reports it, because both reads default to `T = unknown`. Where it flows into an `unknown` or `any` parameter — `normalize(container.get('x'))` — **nothing is reported**, and the function receives a Promise that most object guards happily accept, yielding an empty config and a service quietly running on defaults. Audit every `.get(` call site by hand: `getSync` for the eager path, `await get` for the lazy one.

Two more v2 changes worth a search of your own code:

- **Array keys are gone.** `get(['db', 'server.db'])` used to *merge* every candidate into a per-leaf blend — a result that existed in no config file. Replace it with a `??` chain, most specific first, which also lets you state the direction the array form could not express.
- **Matching now requires a `.` boundary, in both directions.** An element named `red` no longer answers `redis`, an off-convention `loadFile('production.conf')` now lands at the root instead of under `production`, and an element named `server.core` now *does* contribute to `get('server')`.

New in v2 and worth knowing about: `Store` (a pure in-memory store you feed by hand), `NamingScheme` plus the injectable `naming` / `read` / `readSync` seams, the synchronous loaders, `has()` / `elements()` / `reset()`, the `ConfinityError` family, and construction-time validation of `prefix` / `suffix` / `extensions`.

## ✅ Requirements

- **Node.js** `>=22`
- **ESM only** — `import` syntax; there is no CommonJS (`require`) entry point.

## 📄 License

Published under the [MIT License](./LICENSE). Copyright © Peter Placzek ([tada5hi](https://github.com/tada5hi)).
