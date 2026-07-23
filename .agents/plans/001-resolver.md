# Plan 001 — Extract a pure `Resolver`

**Status:** superseded by [003](003-loader-store-split.md) · **Candidate:** 1 of 3 · **Dependency category:** In-process (pure)

> The pure query/merge engine shipped as the `Store` class (`src/store/module.ts`), implementing the `IStore` interface — see plan 003.

## Problem

`Container` (`src/module.ts`) tangles the library's most intricate logic — resolving a
dotted key across named config elements and deep-merging the matches — with file
discovery and loading. The query logic lives in `get()` (key↔name matching, remainder
computation, `pathtrace` expansion) and `merge()` (scalar-vs-object precedence), operating
on the in-memory `items: Element[]` store with a lazy sort.

Because there is no internal seam, **every behavioral test of `get` must load real files
from `test/data/`**. The name-matching and merge-precedence rules — where real bugs hide —
cannot be exercised at their own boundary.

## Proposed Interface

A pure, in-memory `Resolver` that owns the element store and all query/merge logic.

```ts
// src/resolver.ts
import type { Element, MergeFn } from './types';

export class Resolver {
    constructor(options?: { mergeFn?: MergeFn });

    /** Add a named config element to the store. */
    add(element: Element): void;

    /** Resolve a dotted key (or array of keys), deep-merged across all elements. */
    get<T = any>(key: string | string[]): T | undefined;
}
```

Usage inside `Container`:

```ts
class Container {
    protected resolver: Resolver;

    constructor(options: Options = {}) {
        this.options = this.normalizeOptions(options);
        this.resolver = new Resolver({ mergeFn: this.options.mergeFn });
    }

    // loadFile(...) { ...derive name...; this.resolver.add({ name, data }); }
    get<T = any>(key: string | string[]) { return this.resolver.get<T>(key); }
}
```

### What it hides

- The `items` array and its **lazy sort** (`localeCompare` on first `get` after mutation).
- **Key↔name matching**: exact match, prefix match with dot-aware remainder, empty-name
  fallthrough, and skip.
- **Path resolution** via `pathtrace` (`expandPath` + `getPathInfo`).
- **Merge precedence**: `undefined` → take other; object+object → `mergeFn`; otherwise the
  primary (most-recently-resolved) value wins.

## Dependency Strategy

**In-process** — merged directly. `pathtrace` and `smob` are pure; the `mergeFn` is
injected via the constructor. No filesystem, no `locter`. The `Resolver` is constructed and
tested with hand-built `Element[]` fixtures.

## Testing Strategy

- **New boundary tests** (`test/unit/resolver.spec.ts`) built from in-memory elements:
  - exact-name match returns whole `data`; prefix match resolves the remainder.
  - empty-name element answers a full key path.
  - multi-key `get([...])` merges results; later keys win for scalars.
  - object+object merge uses `mergeFn`; scalar keeps the primary; wildcard segments resolve.
  - lazy-sort determinism (order-independent results after `add`).
- **Keep** a few `Container` integration tests as load-path smoke tests
  (`should read config for server core app`, `client web app`).
- **Delete/relocate** the `get`-heavy assertions from `module.spec.ts` that now duplicate
  resolver boundary coverage.

## Phased Implementation

1. Add `src/resolver.ts` with the `Resolver` class; move `get`, `merge`, matching, `items`,
   and the lazy-sort flag into it. Export it from `src/index.ts`.
2. Reduce `Container.get` to `return this.resolver.get(key)`; `loadFile` calls
   `this.resolver.add({ name, data })`.
3. Add `test/unit/resolver.spec.ts`; trim redundant `get` assertions from `module.spec.ts`.
4. Verify: `npm run typecheck && npm run lint && npm run test:coverage && npm run build`.

## Compatibility

Public `Container` API (`constructor`, `load`, `loadFile`, `get`) is unchanged; all existing
tests pass. `Resolver` is additive public API (re-exported from the barrel).
