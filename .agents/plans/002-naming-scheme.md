# Plan 002 — Extract a `NamingScheme`

**Status:** superseded by [003](003-loader-store-split.md) · **Candidate:** 2 of 3 · **Dependency category:** In-process (pure)

> Shipped as the `NamingScheme` class (`src/naming/module.ts`), implementing the `INamingScheme` interface — see plan 003.

## Problem

The `prefix`/`suffix`/`extensions` convention lives in **two places, ~40 lines apart**, that
must agree but share no abstraction:

- `findFiles()` (`src/module.ts`) builds **glob patterns** from the convention
  (*convention → patterns*).
- `loadFile()` derives an **element name** from a file path by stripping the prefix/suffix
  and adjoining dots (*path → name*).

These are the forward and reverse directions of one convention. If they drift, discovery
finds files whose names are stripped inconsistently. **This seam is exactly where the recent
`locter` migration bug lived** (`**` → `*` in the glob), and the parallel dot-handling in the
name-stripper (`charAt(startIndex - 1) === '.'`) is only covered indirectly, through full
directory loads.

## Proposed Interface

A pure `NamingScheme` owning both directions of the convention.

```ts
// src/naming.ts
export interface NamingSchemeOptions {
    prefix?: string;
    suffix?: string;
    extensions: string[]; // already normalized (no leading dot)
}

export class NamingScheme {
    constructor(options: NamingSchemeOptions);

    /** Glob patterns that match files following this convention (non-recursive). */
    toPatterns(): string[];

    /** Derive the element name from a file path (base name, prefix/suffix stripped). */
    toName(filePath: string): string;
}
```

Usage inside `Container`:

```ts
// findFiles: locateMany(this.naming.toPatterns(), { cwd, onlyFiles: true })
// loadFile:  const name = this.naming.toName(input);
```

### What it hides

- Brace-expansion of extensions (`{conf,js,...}`) and the four prefix/suffix pattern branches.
- Base-name extraction from a path (separator normalization, last `/`, extension strip).
- Prefix/suffix stripping with dot-boundary handling.

## Dependency Strategy

**In-process** — merged directly. Pure string logic; the filesystem call (`locateMany`) and
parsing (`read`) stay in `Container`. The scheme is constructed from normalized options.

## Testing Strategy

- **New boundary tests** (`test/unit/naming.spec.ts`):
  - `toPatterns()` for all four `prefix`/`suffix` combinations and multi-extension sets.
  - `toName()` for prefix-only, suffix-only, both, neither; dotted middles; nested paths;
    Windows-style separators.
  - **Round-trip property**: for a synthetic file name the scheme would produce, at least one
    of `toPatterns()` matches it (guards forward/reverse drift).
- **Keep** the option-driven `Container` tests (`suffix only`, `custom extensions`,
  `prefix+suffix requires middle segment`) as thin integration checks.

## Phased Implementation

1. Add `src/naming.ts`; move pattern-building and name-derivation string logic into it.
   Export from `src/index.ts`.
2. `Container` builds a `NamingScheme` from normalized options; `findFiles` calls
   `toPatterns()`, `loadFile` calls `toName()`.
3. Add `test/unit/naming.spec.ts` (include the round-trip property test).
4. Verify: `npm run typecheck && npm run lint && npm run test:coverage && npm run build`.

## Compatibility

Public `Container` API unchanged; all existing tests pass. `NamingScheme` is additive public
API (re-exported from the barrel). Composes cleanly with Plan 001 and is a prerequisite piece
of Plan 003.
