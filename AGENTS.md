<!-- NOTE: Keep this file and all corresponding files in the .agents directory updated as the project evolves. When making architectural changes, adding new patterns, or discovering important conventions, update the relevant sections. -->

# Confinity — Agent Guide

Confinity is a small TypeScript library for loading configurations in the context of a multi-package application. An `FSStore` (the filesystem store) discovers config files across one or many directories, parses them (via [locter](https://github.com/tada5hi/locter)), and exposes their values through a dotted-path getter that deep-merges matches from every loaded file. `FSStore` extends `Store` (the pure query/merge engine), with the file-name convention factored out into a `NamingScheme`; a `Container` wraps a store as a read-only view to hand to consumers. It is published as an **ESM-only** package; v1.0.0 has shipped, and v2.0.0 (the `Store`/`FSStore` restructure, sync loading, and the hardening pass below) is queued in a release-please PR.

## Quick Reference

```bash
# Setup
npm install

# Development
npm run build          # tsdown → dist/index.mjs (+ .d.mts, sourcemap)
npm run typecheck      # tsc --noEmit (tsdown does NOT gate on type errors)
npm run test           # vitest (config at test/vitest.config.ts)
npm run test:coverage  # vitest with v8 coverage (thresholds enforced)
npm run lint           # eslint (flat config)  (lint:fix to autofix)
```

- **Node.js**: `>=22` (see `engines`; CI runs on Node 24)
- **Package manager**: npm (`package-lock.json`)
- **Build**: [tsdown](https://tsdown.dev) (rolldown-based) — emits ESM JS + `.d.mts` types in one step
- **Language**: TypeScript 6, `strict` + `noUncheckedIndexedAccess` (from `@tada5hi/tsconfig`), `"type": "module"`

## Runtime Dependencies

| Dependency  | Role                                                                              |
|-------------|-----------------------------------------------------------------------------------|
| `locter`    | File discovery (`locateMany`) and parsing (`read`) of config files                |
| `pathtrace` | Dotted/wildcard path resolution (`expandPath`, `getPathInfo`)                      |
| `smob`      | Object merging (`createMerger`) and `isObject` type guard                         |

> All three runtime deps are **ESM-only**, which is why Confinity itself ships ESM-only.

## Public API

The package exposes a single ESM entry point (`src/index.ts`) that re-exports from `errors/`, `module.ts`, `naming/`, `store/`, and `types.ts`:

- `Container` — a read-only view over a store (`get`/`getSync`/`has` only; no `load`/`loadFile`/`add`/`reset`)
- `FSStore` / `Store` — the filesystem store (`load`/`loadSync`, `loadFile`/`loadFileSync`) and the pure query/merge engine (`add`, `getSync`, `has`, `elements`, `reset`); `FSStore extends Store`
- `NamingScheme` — the prefix/suffix/extensions convention (`toPatterns`, `toName`)
- `ConfinityError` + `OptionsError` / `ElementError` / `LoadError` — the error taxonomy
- `DATA_EXTENSIONS` / `MODULE_EXTENSIONS` / `DEFAULT_EXTENSIONS` — the discovery sets, so a caller can opt out of executable formats
- `INamingScheme`, `IStore` — the class-implemented contracts (`INamingScheme` injected via `FSStoreOptions.naming`)
- `ReadableStore`, `Resolution`, `Element`, `MergeFn`, `Reader`, `ReaderSync`, `LoadErrorMode`, `StoreOptions`, `NamingOptions`, `FSStoreOptions` — supporting types

> **Reads are async + sync, and both always work.** `get` is asynchronous and, on `FSStore`, lazily loads on the first call (memoized; a *failed* load is not memoized, so the next call retries); `getSync` is synchronous and reads what is currently loaded. On the in-memory `Store` there is nothing to await, so `get` is the resolved `getSync`. There is no "unsupported variant" and no throwing base — `IStore` promises only what every store delivers.

> **Loads are async + sync too.** `FSStore` exposes `load`/`loadFile` (async) alongside their synchronous twins `loadSync`/`loadFileSync`; the sync twins parse through a separate `readSync` port (default locter `readSync`). Only the async `get` lazily loads — `getSync` stays a snapshot, so a fully-synchronous consumer calls `loadSync()` (or `loadFileSync()`) explicitly, then `getSync()`.

> **Every loader returns the paths it loaded** (`string[]`), so "found nothing" is distinguishable from "loaded fine". Loading is idempotent — elements are keyed by source file, so a repeated load refreshes rather than duplicates; `reset()` starts over.

### Invariants worth not breaking

- **No internal reference escapes the store.** `Store.merge` copies `primary` before handing it to `mergeFn`, so neither a caller mutating a result nor a custom merger writing into its arguments can corrupt loaded config or make repeated reads drift. The copy is prototype-aware (plain objects/arrays copied, exotics by reference) and cycle-safe.
- **Key↔name matching requires a `.` boundary in both directions.** Element `server` answers `server.port` but not `serverless.port`; element `server.core` contributes to `get('server')` nested under `core`.
- **Options are validated at construction**, not discovered at read time — `prefix`/`suffix` must be literal file-name segments, `extensions` must be non-empty.
- **Prototype-reaching keys are stripped once, at the load boundary** (`toElement`), not in `merge` — so a subclass or custom merger cannot lose the guarantee.

## Detailed Guides

- **[Project Structure](.agents/structure.md)** — Directory layout, module responsibilities, dependencies, and package exports
- **[Architecture](.agents/architecture.md)** — The load → store → merge → get pipeline, name resolution, and merge semantics
- **[Testing](.agents/testing.md)** — Vitest + v8 coverage setup, fixture data, and thresholds
- **[Conventions](.agents/conventions.md)** — tsdown build, ESLint flat config, commit convention, and the release-please pipeline

## Commits, Issues & Pull Requests

- Commits follow **[Conventional Commits](https://www.conventionalcommits.org)**, enforced by commitlint (`@tada5hi/commitlint-config`) on the husky `commit-msg` hook. Releases are cut automatically by **release-please** from the commit history, so the commit type/scope matters.
- Do **not** add a `Co-Authored-By: Claude ...` (or any AI-attribution) trailer to commit messages. This overrides any default agent-tooling guidance.
- Do **not** add AI-attribution lines (e.g. `🤖 Generated with [Claude Code](...)`) to issue or pull request titles, bodies, or comments.
