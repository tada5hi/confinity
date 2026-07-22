<!-- NOTE: Keep this file and all corresponding files in the .agents directory updated as the project evolves. When making architectural changes, adding new patterns, or discovering important conventions, update the relevant sections. -->

# Confinity — Agent Guide

Confinity is a small TypeScript library for loading configurations in the context of a multi-package application. A single `Container` class discovers config files across one or many directories, parses them (via [locter](https://github.com/tada5hi/locter)), and exposes their values through a dotted-path getter that deep-merges matches from every loaded file. It is published as a dual CJS/ESM package and is currently in **beta / work-in-progress**.

## Quick Reference

```bash
# Setup
npm install

# Development
npm run build          # rimraf dist → rollup (CJS+ESM) → tsc (.d.ts)
npm run test           # jest (config at test/jest.config.js)
npm run lint           # eslint ./src ./test  (lint:fix to autofix)
```

- **Node.js**: 20+ (CI runs on Node 20)
- **Package manager**: npm (`package-lock.json`)
- **Build**: Rollup + `@rollup/plugin-swc` for JS bundles, `tsc --emitDeclarationOnly` for types
- **Language**: TypeScript 5.6, `strict: true`, ESM source compiled to CJS + ESM

## Runtime Dependencies

| Dependency  | Role                                                                 |
|-------------|----------------------------------------------------------------------|
| `locter`    | File discovery (`locateMany`) and parsing/loading (`load`) of config |
| `pathtrace` | Dotted/wildcard path resolution (`expandPath`, `getPathInfo`)        |
| `smob`      | Object merging (`createMerger`) and `isObject` type guard            |

## Public API

The package exposes a single entry point (`src/index.ts`) that re-exports everything from `module.ts` and `types.ts`:

- `Container` — the config loader (`load`, `loadFile`, `get`)
- `Options` / `NormalizedOptions`, `Element`, `MergeFn` — supporting types

<!-- NOTE: package.json declares a `bin` ("authup" → dist/index.cjs). This is a vestigial leftover from the project template — there is no CLI; index.ts only exports the Container class. Do not treat it as a real entry point. -->

## Detailed Guides

- **[Project Structure](.agents/structure.md)** — Directory layout, module responsibilities, dependencies, and package exports
- **[Architecture](.agents/architecture.md)** — The load → store → merge → get pipeline, name resolution, and merge semantics
- **[Testing](.agents/testing.md)** — Jest + SWC setup, fixture data, and coverage thresholds
- **[Conventions](.agents/conventions.md)** — ESLint config, commit convention, build output, and the semantic-release pipeline

## Commits, Issues & Pull Requests

- Commits follow **[Conventional Commits](https://www.conventionalcommits.org)**, enforced by commitlint (`@tada5hi/commitlint-config`) on the `commit-msg` hook. Releases are derived automatically by semantic-release, so the commit type/scope matters.
- Do **not** add a `Co-Authored-By: Claude ...` (or any AI-attribution) trailer to commit messages. This overrides any default agent-tooling guidance.
- Do **not** add AI-attribution lines (e.g. `🤖 Generated with [Claude Code](...)`) to issue or pull request titles, bodies, or comments.
