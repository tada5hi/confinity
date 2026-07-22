# Conventions

## Tooling

| Tool                          | Purpose                                                              |
|-------------------------------|----------------------------------------------------------------------|
| **TypeScript 6**              | Source language; `strict` + `noUncheckedIndexedAccess`, extends `@tada5hi/tsconfig`. |
| **[tsdown](https://tsdown.dev)** | Bundles `src/index.ts` to ESM + `.d.mts` types in one step (`build`). |
| **[Vitest](https://vitest.dev)** | Test runner + v8 coverage (see [testing.md](testing.md)).         |
| **ESLint** (`@tada5hi/eslint-config`, flat config) | Linting via `eslint.config.js` (ESLint 10 + typescript-eslint 8). |
| **commitlint** (`@tada5hi/commitlint-config`) | Enforces Conventional Commits on the `commit-msg` hook. |
| **release-please**            | Automated versioning, changelog, and release PRs from commit history. |
| **husky**                     | Git hooks; `prepare` script installs them, `.husky/commit-msg` runs commitlint. |

## Workflow

- After changing source, **build** (`npm run build`), **typecheck** (`npm run typecheck`), and **lint** (`npm run lint`); lint, typecheck, and test all run in CI and gate the branch. Note: `tsdown` (the build) does **not** fail on type errors, so `npm run typecheck` is what actually catches them.
- Run `npm run test` (and `npm run test:coverage` when touching logic) before opening a PR — coverage thresholds (80%) are enforced.
- Keep the public surface flowing through `src/index.ts`; don't export internal helpers.

## Code Style

- **Module format**: ESM only (`"type": "module"`); source and build output are both ESM.
- **Indentation**: 4 spaces, LF line endings, UTF-8, final newline (`.editorconfig`).
- **Linting**: `@tada5hi/eslint-config` (flat config) via `eslint.config.js`, ignoring `dist/**`. The config is `@stylistic`-based — prefer running `npm run lint:fix` for formatting (operator line-breaks, object-curly-newline, import list style) rather than hand-formatting.
- **File headers**: source files carry the standard copyright/license block (see existing files) — preserve it when creating new files.

## Naming Conventions

- **Files**: lowercase, single-word module names (`module.ts`, `types.ts`, `index.ts`).
- **Types**: PascalCase; option/config shapes use an `Options`/`NormalizedOptions` pair (raw input vs defaulted). See `src/types.ts`.
- **Booleans**: prefixed (`itemsSorted`).
- **Methods**: verb-first (`load`, `loadFile`, `findFiles`, `normalizeOptions`, `merge`, `get`).

## File Organization

- Exported **types** live in `src/types.ts`; implementation lives in `src/module.ts`.
- `src/index.ts` is the barrel — it re-exports `./module` and `./types` and defines the package's public API.
- Add new public types to `types.ts` and re-export via the barrel; keep private/protected helpers inside `module.ts`.

## TypeScript

- `tsconfig.json` extends `@tada5hi/tsconfig` and sets: `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `noEmit: true` (tsdown emits the build), `allowImportingTsExtensions: true`, and `types: ["node"]`.
- The base config enables `strict`, `noUncheckedIndexedAccess`, and `verbatimModuleSyntax` — index accesses must be guarded (prefer `for…of`/`.map` over indexed `for` loops), and type-only imports must use `import type`.
- `"types": ["node"]` is required because the library uses Node APIs (`node:path`, `process`); without it the Node globals are not in scope.

## Commit Convention

Commits follow **[Conventional Commits](https://www.conventionalcommits.org)** and are validated by commitlint on the `commit-msg` hook:

```
<type>(<optional scope>): <subject>

# e.g.
feat: use last matching output for getter
fix(deps): bump pathtrace to v2
build(deps-dev): bump vitest from 4.1.9 to 4.1.10
```

The commit `type` drives the next release version — release-please reads the history to decide `major`/`minor`/`patch`.

## Build Output

- `npm run build` runs `tsdown` (config in `tsdown.config.ts`): `entry: src/index.ts`, `format: esm`, `dts: true`, `sourcemap: true`.
- Produces `dist/index.mjs`, `dist/index.mjs.map`, and `dist/index.d.mts`. tsdown cleans `dist/` on each build.
- Runtime dependencies (`locter`, `pathtrace`, `smob`) are treated as external and are not bundled.
- Only `dist/` is published to npm (`files` field).

## Release Process

- Automated via **release-please** (`release-please-config.json`, `.release-please-manifest.json`), run by `.github/workflows/release.yml` on push to `master`; publishing is handled by `tada5hi/monoship`.
- `release-please-config.json` uses `release-type: node`, `include-v-in-tag: true` (tags look like `v1.0.0`), and `bump-minor-pre-major: true`.
- **`release-as: "1.0.0"`** is currently pinned so the next release is exactly `v1.0.0`. Remove that key after the `1.0.0` release cuts, so subsequent versions are computed from commit history again.
- Do not hand-edit `version` in `package.json`, `CHANGELOG.md`, or `.release-please-manifest.json` — release-please manages them via its release PR.

## CI/CD

- `.github/workflows/main.yml` (CI) triggers on push/PR to `develop`, `master`, `next`, `beta`, `alpha` (Node 24): **Install → Build → (Lint, Test)** plus an independent **Typecheck** job. Composite actions live in `.github/actions/install` and `.github/actions/build`, caching `node_modules` (keyed on `package-lock.json`) and `dist/`.
- `.github/workflows/release.yml` (Release) runs release-please on `master`.
- `master` is the default and release branch; dependabot targets `master` (`.github/dependabot.yml`).

## Best Practices

- Prefer configuring or extending the delegated dependencies (`locter`, `pathtrace`, `smob`) over adding file-parsing, path, or merge logic directly to `Container` — see [architecture.md](architecture.md).
- Study surrounding patterns and the existing `Container` methods before adding new behavior; keep the core a thin orchestrator.
- Keep changes covered by fixture-driven tests in `test/` and consistent with the conventions above.
