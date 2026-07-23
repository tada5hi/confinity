<!-- NOTE: Keep this file and all corresponding files in the .agents directory updated as the project evolves. When making architectural changes, adding new patterns, or discovering important conventions, update the relevant sections. -->

# Confinity — Agent Guide

Confinity is a small TypeScript library for loading configurations in the context of a multi-package application. An `FSStore` (the filesystem store) discovers config files across one or many directories, parses them (via [locter](https://github.com/tada5hi/locter)), and exposes their values through a dotted-path getter that deep-merges matches from every loaded file. `FSStore` extends `Store` (the pure query/merge engine), with the file-name convention factored out into a `NamingScheme`; a `Container` wraps any `IStore` as a read-only `get` view to hand to consumers. It is published as an **ESM-only** package and is currently in **beta / work-in-progress**.

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

The package exposes a single ESM entry point (`src/index.ts`) that re-exports from `module.ts`, `naming/`, `store/`, and `types.ts`:

- `Container` — a read-only view over a single `IStore` (`get`/`getSync` only; no `load`/`loadFile`/`add`)
- `FSStore` / `Store` — the filesystem store (`load`, `loadFile`) and the pure query/merge engine (`add`, `getSync`); `FSStore extends Store extends AbstractStore`
- `AbstractStore` — the abstract `IStore` base whose `get`/`getSync` both throw "unsupported" by default; extend it to build a sync-only or async-only store (override only the variant you serve)
- `NamingScheme` — the prefix/suffix/extensions convention (`toPatterns`, `toName`)
- `INamingScheme`, `IStore` — the class-implemented contracts (`INamingScheme` injected via `FSStoreOptions.naming`; `IStore` is what `Container` wraps)
- `Element`, `MergeFn`, `Reader`, `StoreOptions`, `NamingOptions`, `FSStoreOptions` — supporting types

> **Reads are async + sync.** `get` is asynchronous and, on `FSStore`, lazily loads on the first call (memoized); `getSync` is synchronous (reads what is currently loaded). A store serves the variant(s) it implements and throws for the rest — `Store` is sync-only (`get` throws); `FSStore` serves both; `Container` delegates both.

## Detailed Guides

- **[Project Structure](.agents/structure.md)** — Directory layout, module responsibilities, dependencies, and package exports
- **[Architecture](.agents/architecture.md)** — The load → store → merge → get pipeline, name resolution, and merge semantics
- **[Testing](.agents/testing.md)** — Vitest + v8 coverage setup, fixture data, and thresholds
- **[Conventions](.agents/conventions.md)** — tsdown build, ESLint flat config, commit convention, and the release-please pipeline

## Plans

Architecture-deepening RFCs that made the store's internals testable at their own boundary.
Plan 003 (a superset of 001 + 002) has **shipped** — see its "As shipped" note for how the
implementation diverged from the proposal:

1. [Extract a pure `Resolver`](.agents/plans/001-resolver.md) — query + merge over `Element[]` (now `Store`).
2. [Extract a `NamingScheme`](.agents/plans/002-naming-scheme.md) — the prefix/suffix/extension convention (both directions).
3. [Split `Loader` (I/O) vs `Store` (pure)](.agents/plans/003-loader-store-split.md) — the full seam (superset of 1 + 2), shipped as `FSStore extends Store`, with `Container` reduced to a read-only view over one store.

## Commits, Issues & Pull Requests

- Commits follow **[Conventional Commits](https://www.conventionalcommits.org)**, enforced by commitlint (`@tada5hi/commitlint-config`) on the husky `commit-msg` hook. Releases are cut automatically by **release-please** from the commit history, so the commit type/scope matters.
- Do **not** add a `Co-Authored-By: Claude ...` (or any AI-attribution) trailer to commit messages. This overrides any default agent-tooling guidance.
- Do **not** add AI-attribution lines (e.g. `🤖 Generated with [Claude Code](...)`) to issue or pull request titles, bodies, or comments.
