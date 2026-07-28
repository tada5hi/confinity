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

Merge several keys, letting later keys take precedence for scalars:

```typescript
const db = store.getSync(['db', 'server.db', 'server.core.db']);
// → { host: '127.0.0.1', user: 'admin', password: 'start123', database: 'app' }
```

### Sync vs. async (lazy) reads

Reads come in two variants. `getSync` is **synchronous** — it returns whatever is currently loaded. `get` is **asynchronous** and, on an `FSStore`, **lazily loads on the first call**, then reads — the load is **memoized** (runs at most once, is shared across concurrent callers, and is skipped if config was already loaded via `load()`/`loadFile()`). This gives two usage modes:

```typescript
// eager: load once, then cheap synchronous reads
const store = new FSStore({ prefix: 'project', cwd: 'config' });
await store.load();
store.getSync('server.core');          // sync

// lazy / async (the default get): loads once on the first call
await store.get('server.core');
```

Not every store serves both variants — the unsupported one throws:

| Store                             | `get` (async)      | `getSync` (sync) |
|-----------------------------------|:------------------:|:----------------:|
| `Store` (memory)                  | ✗ throws           | ✓                |
| `FSStore`                         | ✓ (lazy, memoized) | ✓                |
| custom (`extends AbstractStore`)  | whatever it implements; the other throws              |

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
2. **Loading** — each file is parsed, and everything that resolves to a plain object is stored as an `Element` — `{ name, data }`. A file's `name` is its base name with the configured `prefix`/`suffix` (and the adjoining `.`) stripped. Non-object contents (e.g. a scalar YAML) are silently skipped.
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
| `extensions` | `string[]`                                         | `conf`, `js`, `mjs`, `cjs`, `ts`, `mts`, `yml`, `yaml`                  | Extensions to discover. A leading `.` is stripped automatically.                              |
| `mergeFn`    | `(target, source) => Record<string, any>`         | [`smob`](https://github.com/tada5hi/smob) merger (arrays replaced, immutable) | Strategy used to deep-merge two objects during `get`.                                   |
| `naming`     | `INamingScheme`                                    | `NamingScheme` from `prefix`/`suffix`/`extensions`                      | Custom naming implementation (overrides `prefix`/`suffix`/`extensions`).                       |
| `read`       | `(filePath: string) => Promise<unknown>`          | [`locter`](https://github.com/tada5hi/locter)'s `read`                  | Custom reader/parser used to turn a file path into a value.                                    |

## 📚 API

The primary entry point is the `FSStore` class; the `Store` base, the `AbstractStore` base, the read-only `Container` view, the `NamingScheme`, and their contracts are exported too. Reads come in two variants: a synchronous `getSync` and an asynchronous `get` (which an `FSStore` uses to lazily load) — a store serves the variant(s) it implements and **throws** for the others (see the capability matrix under [Quick Start](#-quick-start)).

### `FSStore` (extends `Store`)

A `Store` that populates itself from the filesystem. Its **friendly constructor** normalizes `extensions` and builds a `NamingScheme` from `prefix`/`suffix`/`extensions` (unless a custom `naming` is supplied); parsing goes through a `Reader` port (`read`, default [`locter`](https://github.com/tada5hi/locter)'s `read`).

```typescript
new FSStore(options?: FSStoreOptions)
```

| Member     | Signature                                             | Description                                                                                     |
|------------|-------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| `load`     | `load(input?: string \| string[]): Promise<void>`    | Discovers config files in one or many directories (defaults to `cwd`), then loads each.         |
| `loadFile` | `loadFile(input: string \| string[]): Promise<void>` | Loads a single file (or array, in parallel) directly, deriving its `name`.                      |
| `add`      | `add(element: Element): void`                        | *(from `Store`)* Adds a named element to the store.                                              |
| `getSync`  | `getSync<T = any>(key: string \| string[]): T \| undefined` | *(from `Store`)* Resolves a dotted key across elements, merged. An array of keys merges in order. Reads only what is currently loaded. |
| `get`      | `get<T = any>(key: string \| string[]): Promise<T \| undefined>` | Like `getSync`, but async — lazily loads from the filesystem on the first call (memoized), then resolves. |

### `Store`

The pure, in-memory half (`add` + `getSync`, no filesystem) that `FSStore` extends — construct it directly if you want to feed elements in by hand. It is **synchronous only**: an in-memory lookup has no reason to be async, so `get` throws (inherited from `AbstractStore`).

```typescript
new Store(options?: StoreOptions)   // { mergeFn? }
```

### `AbstractStore`

The abstract base that every store extends — it implements `IStore` with both `get` and `getSync` **throwing "unsupported" by default**. A concrete store overrides only the variant(s) it can serve, so a sync-only or async-only store is trivial (implement one; the other throws automatically). `Store` overrides `getSync`; `FSStore` additionally overrides `get`.

### `Container`

A **read-only view over a single store**. Wrap a store (e.g. an `FSStore` you have already loaded) to hand consumers dotted-path lookups without exposing the loading or mutation surface — `load`/`loadFile`/`add` stay on the store.

```typescript
new Container(store: IStore)
```

| Member     | Signature                                               | Description                                          |
|------------|---------------------------------------------------------|------------------------------------------------------|
| `getSync`  | `getSync<T = any>(key: string \| string[]): T \| undefined` | Delegates to the wrapped store's `getSync`. No mutation. |
| `get`      | `get<T = any>(key: string \| string[]): Promise<T \| undefined>` | Delegates to the wrapped store's `get`; propagates its throw if that variant is unsupported. |

### Types

```typescript
type Element = {
    name: string;               // derived from the file name (prefix/suffix stripped)
    data: Record<string, any>;  // parsed file contents
};

type MergeFn = (target: Record<string, any>, source: Record<string, any>) => Record<string, any>;

type Reader = (filePath: string) => Promise<unknown>;

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
};

// Contracts (interfaces, class-implemented)
interface INamingScheme {
    toPatterns(): string[];
    toName(filePath: string): string;
}

interface IStore {
    add(element: Element): void;
    get<T = any>(key: string | string[]): Promise<T | undefined>;      // async (default)
    getSync<T = any>(key: string | string[]): T | undefined;           // sync
}
```

## 🧩 Extending

Two seams are injectable through `FSStoreOptions`:

```typescript
import { FSStore, type INamingScheme, type Reader } from 'confinity';

// Custom naming: control which files match and how names are derived.
const naming: INamingScheme = {
    toPatterns: () => ['*.config.json'],
    toName: (filePath) => filePath.split('/').pop()!.replace('.config.json', ''),
};

// Custom reader: e.g. parse a bespoke format, or read from memory.
const read: Reader = async (filePath) => ({ /* parsed value */ });

const store = new FSStore({ naming, read });
```

Need to change how values are stored, queried or merged? Subclass `Store` (or `FSStore`) — both implement `IStore`. To write a store from scratch, extend `AbstractStore` and override only the read variant(s) you can serve (`get`, `getSync`, or both); the unimplemented one throws automatically, so a sync-only or async-only store needs no boilerplate.

## 🔀 Merge Semantics

When two matches combine, `Store.merge(primary, secondary)` decides *whether* to merge — the injected `mergeFn` decides *how*:

- **Two objects** → deep-merged by the configured `mergeFn`. The default [`smob`](https://github.com/tada5hi/smob) merger **replaces** arrays (does not concatenate) and is immutable (`inPlace: false`).
- **Scalar `primary`** → wins over `secondary`.
- **`undefined` `primary`** → yields the existing accumulator.

Because accumulated results are passed as `secondary`, the more-recently-resolved value survives for non-object values — so for `get([...keys])`, later keys take precedence for scalars.

## ✅ Requirements

- **Node.js** `>=22`
- **ESM only** — `import` syntax; there is no CommonJS (`require`) entry point.

## 📄 License

Published under the [MIT License](./LICENSE). Copyright © Peter Placzek ([tada5hi](https://github.com/tada5hi)).
