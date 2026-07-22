# Plan 003 — Split `Loader` (I/O) vs `Store` (pure)

**Status:** implemented · **Candidate:** 3 of 3 · **Dependency category:** Local-substitutable (fs) + In-process

> Superset of Plans [001](001-resolver.md) (Store == Resolver) and [002](002-naming-scheme.md)
> (NamingScheme). Shipped as one self-contained refactor.

> **As shipped.** The `Loader` was **not** a standalone class — its filesystem logic was folded
> into `FSStore extends Store` (`src/store/fs.ts`), whose **friendly constructor** builds a
> `NamingScheme` from `prefix`/`suffix`/`extensions`, so `load`/`loadFile` and the pure `add`/`get`
> live on one object. The `createStore` factory was **removed** — you construct an `FSStore`
> directly. `Container` (`src/module.ts`) is now a **read-only view over a single `IStore`** (not a
> façade with `load`/`loadFile`): it exposes only `get`, and loading/mutation stay on the wrapped
> store. Two `I`-prefixed contracts were added — `INamingScheme` and `IStore` — and both the naming
> scheme and the reader port are injectable via `FSStoreOptions` (`naming?: INamingScheme`,
> `read?: Reader`).

## Problem

`Container` co-owns two concerns bound by the shared mutable `items` state:

- **I/O**: `load` / `loadFile` / `findFiles` — discover and parse files (`locter`, `fs`, async).
- **Pure query**: `get` / `merge` — resolve keys and deep-merge in memory.

The filesystem concern is entangled with the pure logic, so neither can be tested in
isolation: pure query tests drag in the filesystem, and load tests drag in query behavior.

## Proposed Interface

Three collaborators, with `Container` reduced to a thin façade that wires them.

```ts
// src/naming.ts   — see Plan 002
export class NamingScheme { toPatterns(): string[]; toName(p: string): string; }

// src/store.ts    — see Plan 001 (Resolver)
export class Store {
    constructor(options?: { mergeFn?: MergeFn });
    add(element: Element): void;
    get<T = any>(key: string | string[]): T | undefined;
}

// src/loader.ts   — the filesystem-facing producer of elements
export class Loader {
    constructor(options: { cwd: string; naming: NamingScheme });
    /** Discover + parse config files across directories (defaults to cwd). */
    fromDirectories(input?: string | string[]): Promise<Element[]>;
    /** Parse specific files, deriving names via the NamingScheme. */
    fromFiles(input: string | string[]): Promise<Element[]>;
}
```

Usage inside `Container`:

```ts
class Container {
    async load(input?) {
        const els = await this.loader.fromDirectories(input);
        els.forEach((e) => this.store.add(e));
    }
    async loadFile(input) {
        const els = await this.loader.fromFiles(input);
        els.forEach((e) => this.store.add(e));
    }
    get<T = any>(key) { return this.store.get<T>(key); }
}
```

### What it hides

- **Loader**: directory resolution (`path.resolve` vs absolute), glob discovery via
  `NamingScheme.toPatterns()` + `locateMany`, parsing via `read` (+ `.default` unwrap and the
  non-object skip), parallel loads, and name derivation via `NamingScheme.toName()`.
- **Store**: the element array, lazy sort, key↔name matching, `pathtrace` resolution, merge.

## Dependency Strategy

**Local-substitutable** for the `Loader` (filesystem): test it against real fixture
directories under `test/data/` (and, where useful, a `mkdtemp` scratch dir). Optionally define
a minimal **reader port** (`(path: string) => Promise<unknown>`, defaulting to `locter.read`)
so the loader's naming/skip logic can be tested without touching disk — a ports-&-adapters
seam for the one true I/O dependency.

The **Store** is **In-process** (pure) — tested with hand-built `Element[]` (see Plan 001).

## Testing Strategy

- **Store boundary tests** (`test/unit/store.spec.ts`): matching, precedence, merge, sort — no fs.
- **Loader boundary tests** (`test/unit/loader.spec.ts`): discovery per option combination,
  name derivation, non-object skip, absolute vs relative paths — against fixtures (or the
  reader port).
- **Keep** 2–3 `Container` end-to-end smoke tests proving the façade wires correctly.
- **Delete** the `get`-heavy and discovery-heavy assertions from `module.spec.ts` now covered
  by the two boundary suites.

## Phased Implementation

1. Land Plan 002 (`NamingScheme`) and Plan 001 (`Store`/`Resolver`) internals.
2. Add `src/loader.ts` moving `findFiles`, directory resolution, and file parsing/naming into it.
3. Reduce `Container` to construct `NamingScheme` + `Store` + `Loader` and delegate.
4. Add `store.spec.ts` + `loader.spec.ts`; trim `module.spec.ts` to façade smoke tests.
5. Verify: `npm run typecheck && npm run lint && npm run test:coverage && npm run build`.

## Compatibility

Public `Container` API unchanged; all existing tests pass. `NamingScheme`, `Store`, and
`Loader` are additive public API (re-exported from the barrel).
