# Architecture

## Overview

Confinity is organized around one class, `Container` (`src/module.ts`), which implements a **load → store → merge → get** pipeline. Config files are discovered and parsed, each stored as a named `Element` (`{ name, data }`), and later queried by dotted key. A query walks every stored element, resolves the requested path within each, and merges all matches into a single result. All I/O, path resolution, and merging are delegated to the three runtime dependencies (`locter`, `pathtrace`, `smob`), keeping `Container` focused on orchestration, name derivation, and merge precedence.

```
directories/files ──► [locter: locate + parse] ──► Element[] { name, data }
                                                        │
                              get(key) ────────────────►│  match key vs each Element.name
                                                        │  resolve remainder via pathtrace
                                                        └► merge matches via smob ──► value
```

## Core Concepts

### `Element` — a loaded config unit

```typescript
export type Element = {
    name: string,               // derived from the file name (prefix/suffix stripped)
    data: Record<string, any>   // parsed file contents
};
```

Elements are held in `Container.items` and kept sorted by `name` (lazily, the first time `get` runs after a load). Sorting makes lookup order deterministic.

### Options

```typescript
export type Options = {
    cwd?: string,               // base dir for relative paths (default: process.cwd())
    prefix?: string,            // file-name prefix, e.g. "project"
    suffix?: string,            // file-name suffix
    extensions?: string[],      // default: conf, js, mjs, cjs, ts, mts, yml, yaml
    mergeFn?: MergeFn           // default: smob createMerger({ array:false, inPlace:false })
};
```

`normalizeOptions` fills defaults and strips any leading `.` from extensions, producing `NormalizedOptions` (same shape but with `cwd`, `extensions`, and `mergeFn` required).

## Data Flow

### 1. Discovery — `load(input?)` → `findFiles()`

- `input` may be a single directory, an array of directories, or omitted (falls back to `cwd`). Relative directories are resolved against `options.cwd`.
- `findFiles` builds glob patterns from `prefix`/`suffix`/`extensions`, then calls `locter.locateMany(patterns, { cwd, onlyFiles: true })` — the search directory is passed as `cwd`. Pattern selection:

  | prefix | suffix | patterns                                                        |
  |--------|--------|-----------------------------------------------------------------|
  | ✓      | ✓      | `{prefix}.*.{suffix}.{ext}`                                      |
  | ✓      | —      | `{prefix}.{ext}`, `{prefix}.*.{ext}`                             |
  | —      | ✓      | `{suffix}.{ext}`, `*.{suffix}.{ext}`                             |
  | —      | —      | `*.{ext}`                                                        |

  where `{ext}` expands to `{conf,js,mjs,...}`. The single `*` matches one filename segment (any characters except a path separator), so discovery is non-recursive — it does **not** descend into subdirectories. A prefix+suffix pattern therefore requires a middle segment (`project.server.conf` is not matched by `project.*.server.{ext}`).

### 2. Loading — `loadFile(input)`

- Accepts a single path or an array (loaded in parallel via `Promise.all`). Relative paths resolve against `options.cwd`.
- Parses through `locter.read()`; uses `file.default` when present (module configs with `export default` return a record whose `.default` holds the value; plain data files — `.conf`, `.yml`, `.json` — return the parsed object directly).
- **Skips** anything that is not a plain object (`smob.isObject`).
- Derives `name` from the base file name: strip directory and extension, then strip a configured `prefix`/`suffix` (and the adjoining `.`). Example: with `prefix: "project"`, `project.server.conf` → name `server`.
- Pushes `{ data, name }` onto `items` and marks the list unsorted.

### 3. Lookup — `get<T>(key)`

- Ensures `items` is sorted by `name` first.
- **Array key**: resolves each key in turn and merges the results together (`output = merge(value, output)`), so later keys take precedence for scalars.
- **String key**, per element:
  - `key === element.name` → take the element's whole `data` (remainder `''`).
  - `key` starts with `element.name` → strip the name (and dot); the remainder is looked up within `data`.
  - element has an empty name → the full `key` is looked up within `data`.
  - otherwise → skip the element.
- The remainder is resolved with `pathtrace.expandPath` (expands wildcards) + `getPathInfo`; only existing values are merged in.
- Returns the accumulated `output` cast to `T` (or `undefined`).

### 4. Merge — `merge(primary, secondary)`

```typescript
protected merge(primary: unknown | undefined, secondary: unknown) {
    if (typeof primary === 'undefined') return secondary;         // nothing new
    if (isObject(primary) && isObject(secondary)) {
        return this.options.mergeFn(primary, secondary);          // deep merge
    }
    return primary;                                               // scalar: primary wins
}
```

- Two objects → deep-merged by the configured `mergeFn` (default `smob` merger: arrays **replaced**, not concatenated; immutable — `inPlace: false`).
- A scalar `primary` wins over `secondary`; an `undefined` primary yields the existing accumulator. Because accumulated results are passed as `secondary`, the more-recently-resolved value is the one that survives for non-object values.

## Design Decisions

### Thin core, delegated capabilities
File formats, glob semantics, path syntax, and merge strategy are **not** reimplemented — they come from `locter`, `pathtrace`, and `smob`. To support a new file type, prefer configuring/extending those dependencies over adding parsing logic to `Container`.

### Swappable merge strategy
`Options.mergeFn` lets callers replace the default merge behavior wholesale (e.g. to concatenate arrays). `Container.merge` only decides *whether* to merge (both-objects) vs take the primary; the *how* is the injected function.

### Name-based namespacing
A file's derived `name` acts as a key namespace. `get('server.core')` matches an element named `server` and resolves `core` inside it, or matches an element named `server.core` directly — allowing the same logical config to be split across files or nested within one.

## Error Handling

- Non-object file contents are silently ignored in `loadFile` (no throw) — invalid/empty configs are skipped rather than failing the whole load.
- Parse/IO errors surface from `locter.read` / `locateMany` and propagate to the caller (both `load` and `loadFile` are `async` and unhandled).
- `get` never throws for missing keys; it returns `undefined`.

## File Structure Mapping

```text
src/module.ts   → Container: load/loadFile/get/findFiles/normalizeOptions/merge
src/types.ts    → Element, MergeFn, Options, NormalizedOptions
src/index.ts    → public barrel
```
