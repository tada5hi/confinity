# Plan 004 — Sync loading (`loadSync` / `loadFileSync`) via hand-written twins

**Status:** implemented · **Dependency category:** Local-substitutable (fs) + In-process (pure)

> **As shipped.** Landed exactly as proposed. `Reader` is unchanged; a sibling `ReaderSync`
> (`(filePath) => unknown`) type and a `readSync?` `FSStoreOptions` field were added (both
> re-exported from the barrel), so the change is **additive/non-breaking** (a `feat`). `FSStore`
> resolves `this.readerSync` in the ctor (`options.readSync ?? locter.readSync`) and gained
> `loadSync` / `loadFileSync`, plus the sync-twin protected helpers `fromDirectoriesSync` /
> `fromFilesSync` / `findFilesSync` (using `locateManySync`) and the shared pure helpers
> `resolveDirectories` / `resolveFilePath` / `toElement` / `addAll`. **No** generator machinery — the
> twins are hand-written, differing from their async siblings by one line each. `getSync` stayed a
> **pure snapshot** (not overridden on `FSStore`); a sync consumer calls `loadSync()` explicitly. All
> 59 tests pass at ~99% coverage; `typecheck`/`lint`/`build` are green.

> Builds on [003](003-loader-store-split.md). That plan gave reads a **sync/async capability
> contract** (`getSync` + `get`) but left *loading* async-only: `getSync` reads whatever is
> currently in memory, and the only way to populate an `FSStore` is `await load()` / `await
> loadFile()`. This plan closes the gap on the write side — synchronous `loadSync` / `loadFileSync`
> — so a fully-synchronous consumer can populate and query an `FSStore` without ever touching a
> promise. It is enabled by `locter@4.1`, which now ships sync twins of the two functions we depend
> on (`locateManySync`, `readSync`).

## Problem

`FSStore` can be **queried** synchronously (`getSync`) but only **loaded** asynchronously. A
consumer that must configure at startup on a synchronous path (a plugin `activate()`, a config
read before the event loop is trusted, a CLI that resolves config before its first `await`) has no
way in: `getSync` on a never-loaded store returns `undefined`, and the only loaders are `async`.

Yet the load pipeline touches I/O in **exactly two places** — everything else is already pure and
synchronous:

| Step (`src/store/fs.ts`)                                   | I/O?          | sync twin                 |
|-----------------------------------------------------------|---------------|---------------------------|
| `fromDirectories` — directory resolution (`path.resolve`) | pure          | — (reuse as-is)           |
| `findFiles` — `locateMany`                                | **async I/O** | `locateManySync`          |
| `fromFiles` — `this.reader(path)`                         | **async I/O** | a sync `Reader` twin      |
| `.default` unwrap · `isObject` skip · `naming.toName`     | pure          | — (reuse as-is)           |
| `add` · sort · `expandPath` · `getPathInfo` · `merge`     | pure          | — (reuse as-is)           |

So the sync loaders are almost entirely the *same code*: only the two I/O calls differ. The task is
to expose that without duplicating the orchestration around them.

## Proposed Interface

Additive only — no existing signature changes.

```ts
// src/store/types.ts
export type Reader     = (filePath: string) => Promise<unknown>;   // unchanged
export type ReaderSync = (filePath: string) => unknown;            // new — sync twin of Reader

export type FSStoreOptions = StoreOptions & {
    // ...existing fields unchanged...
    read?: Reader,            // async parser (default: locter `read`)
    readSync?: ReaderSync,    // NEW: sync parser (default: locter `readSync`)
};

// src/store/fs.ts — FSStore gains the sync twins of load/loadFile
class FSStore extends Store {
    loadSync(input?: string | string[]): void;   // twin of load()
    loadFileSync(input: string | string[]): void; // twin of loadFile()
}
```

- **`getSync` stays a pure snapshot.** It is *not* overridden to lazy-`loadSync`. A sync consumer
  calls `loadSync()` (or `loadFileSync()`) explicitly, then `getSync()`. Rationale below.
- **Reader as two separate ports, not one object.** Keeping `read` (async) untouched and adding a
  parallel `readSync` mirrors how locter itself exposes `read` / `readSync` (separate functions),
  keeps the change **non-breaking** (existing `read?: Reader` injections and their tests compile
  unchanged), and lets a caller override one side without the other.

### What it reuses (the hand-written twin)

The pure parts are extracted once and shared by both async and sync paths; only the I/O call site
differs. The duplication is one line per method:

```ts
// pure, shared by both variants
protected resolveDirectories(input?: string | string[]): string[] { /* path.resolve vs absolute */ }
protected toElement(filePath: string, raw: unknown): Element | undefined {
    const data = isObject(raw) && raw.default ? raw.default : raw;
    if (!isObject(data)) return undefined;                 // non-object skip
    return { data, name: this.naming.toName(filePath) };   // name derivation
}

// the only lines that differ between the twins:
protected async findFiles(cwd)     { return (await locateMany(this.naming.toPatterns(), { cwd, onlyFiles: true })).map(buildFilePath); }
protected      findFilesSync(cwd)  { return locateManySync(this.naming.toPatterns(), { cwd, onlyFiles: true }).map(buildFilePath); }

protected async fromFiles(fp)      { return this.toElement(fp, await this.reader(fp)); }
protected      fromFilesSync(fp)   { return this.toElement(fp, this.readerSync(fp)); }
```

`loadSync` / `loadFileSync` are the exact shape of `load` / `loadFile` with the `await` removed and
the `Sync` helpers substituted; both `add` each element and set `loaded = true`.

### Why not the generator twin (locter's approach)

locter derives its sync/async surfaces from a single generator body (`TwinOp` / `TwinBody` +
`runTwinAsync` / `runTwinSync`) because its bodies are long, multi-step (locate → read → parse →
wrap), and have divergent error-recovery paths — enough substance that writing them twice would
drift. Even so, locter *opts out* of the machinery where a body is short or its recovery diverges
(`ModuleReader.read`). Confinity's bodies are ~3 lines with a **single** effect each; importing
~50 lines of `TwinOp`/`runTwin*` plumbing to dedupe one line per method is a net loss in
readability. Hand-written twins over extracted pure helpers are the right altitude here. (If a
future body grows multi-effect, revisit — the generator protocol can be lifted from locter then.)

### Why `getSync` stays a snapshot (no lazy sync-load)

Making `getSync` lazily `loadSync` on first call would be symmetric with `get`, but:

- It **changes `getSync`'s documented contract** ("reads what is currently loaded") and diverges
  `FSStore.getSync` from the pure `Store.getSync` it inherits.
- It introduces a **double-load race**: if an async `get()` is in flight (`loading` set, `loaded`
  still `false`) and a concurrent `getSync()` runs, `getSync` sees `!loaded`, loads synchronously
  and `add`s every element — then the pending async load resolves and `add`s them **again**,
  duplicating `items`. A synchronous call cannot await the in-flight promise to avoid this.

Keeping `getSync` a pure snapshot with an explicit `loadSync()` sidesteps both. Lazy convenience
stays async-only on `get`, where the memoized `loading` promise makes it safe.

## Dependency Strategy

**Local-substitutable** for the fs I/O, exactly as [003](003-loader-store-split.md): the `readSync`
port is the sync sibling of the `read` port, so the load-time naming/skip/`.default` logic is
tested against a **stubbed `ReaderSync`** (`() => ({ a: 1 })`) with no disk, and the full path is
tested against the real `test/data/` fixtures. `locateManySync` / `readSync` are treated as trusted
(locter's own twin tests cover them); confinity tests its **orchestration**, not locter.

## Testing Strategy

Extend `test/unit/fsstore.spec.ts` (no new suite — same collaborator, same boundary):

- **`loadSync` / `loadFileSync` parity**: after a sync load, `getSync('server.core')` etc. return
  the same merged values the existing async tests assert — the sync and async loaders must agree.
- **`readSync` port (no fs)**: `.default` unwrap, non-object skip, and absolute-vs-relative path
  handling driven through a stubbed `ReaderSync`, mirroring the existing async `Reader` cases.
- **Snapshot semantics**: `getSync` before any load is `undefined`; after `loadSync` it is
  populated; an eager `loadSync()` is honored by a later `get()` (no re-load — `loaded` guards it).
- **Default sync reader**: a real-fixture load with no injected `readSync` resolves via locter's
  `readSync` (default wiring).

Coverage thresholds (80%) must stay green; the new branches are small and fixture-covered.

## Phased Implementation

1. `types.ts`: add `ReaderSync`; add `readSync?` to `FSStoreOptions`. Re-export `ReaderSync` from
   the barrel.
2. `fs.ts`: extract `resolveDirectories` + `toElement` pure helpers; refactor `findFiles` /
   `fromFiles` / `fromDirectories` to use them (behavior-preserving).
3. `fs.ts`: resolve `this.readerSync` in the ctor (`options.readSync ?? locter.readSync`); add
   `findFilesSync` / `fromFilesSync` / `fromDirectoriesSync`, then `loadSync` / `loadFileSync`.
4. Tests: extend `fsstore.spec.ts` per above.
5. Docs: update `.agents/{architecture,structure,testing}.md` and `AGENTS.md` (the "Reads are async
   + sync" note extends to loads); add an "As shipped" note here.
6. Verify: `npm run typecheck && npm run lint && npm run test:coverage && npm run build`.

## Compatibility

**Non-breaking, additive.** `Reader` and every existing signature are unchanged; `ReaderSync`,
`readSync`, `loadSync`, and `loadFileSync` are new public surface (a `feat`, not `feat!`). Existing
async consumers and the current `Reader` stubs in the test suite compile and pass untouched.
Calling both an async `load()` and a sync `loadSync()` on the same store double-adds elements —
identical to calling `load()` twice today (explicit loads are the caller's responsibility; only the
lazy `get` path is idempotent).
