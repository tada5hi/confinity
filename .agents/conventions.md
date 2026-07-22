# Conventions

## Tooling

| Tool                          | Purpose                                                              |
|-------------------------------|----------------------------------------------------------------------|
| **TypeScript 5.6**            | Source language; `strict: true`, extends `@tada5hi/tsconfig`.        |
| **Rollup + `@rollup/plugin-swc`** | Bundles `src/index.ts` to CJS + ESM (`build:js`).               |
| **`tsc --emitDeclarationOnly`** | Emits `.d.ts` type declarations (`build:types`).                   |
| **Jest + `@swc/jest`**        | Test runner (see [testing.md](testing.md)).                          |
| **ESLint** (`@tada5hi/eslint-config-typescript`) | Linting of `./src` and `./test`.                  |
| **commitlint** (`@tada5hi/commitlint-config`) | Enforces Conventional Commits on `commit-msg`.       |
| **semantic-release** (`@tada5hi/semantic-release`) | Automated versioning + npm publish in CI.       |
| **husky**                     | Git hooks (commit-msg → commitlint).                                 |
| **cross-env / rimraf**        | Cross-platform env vars and `dist/` cleanup in npm scripts.          |

## Workflow

- After changing source, **build** (`npm run build`) and **lint** (`npm run lint`) the affected files; both run in CI and will block a release.
- Run `npm run test` (and `npm run test:coverage` when touching logic) before opening a PR — coverage thresholds are enforced.
- Keep the public surface flowing through `src/index.ts`; don't export internal helpers.

## Code Style

- **Module format**: ESM source (`import`/`export`), compiled to both CJS (`dist/index.cjs`) and ESM (`dist/index.mjs`).
- **Indentation**: 4 spaces, LF line endings, UTF-8, final newline (`.editorconfig`).
- **Linting**: `@tada5hi/eslint-config-typescript` via `.eslintrc`, type-aware through `tsconfig.eslint.json`. Notable local overrides: `class-methods-use-this` off, `import/no-cycle` at `maxDepth: 1`, several `@typescript-eslint` rules relaxed.
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

- Extends `@tada5hi/tsconfig` with: `strict: true`, `module: commonjs`, `target: ES2020`, `lib: [ESNext]`, `outDir: dist`, `include: src/**/*.ts`.
- `tsconfig.eslint.json` widens the project to include `test/**` for type-aware linting only (not for the build).

## Commit Convention

Commits follow **[Conventional Commits](https://www.conventionalcommits.org)** and are validated by commitlint:

```
<type>(<optional scope>): <subject>

# e.g.
feat: use last matching output for getter
fix(deps): bump pathtrace to v1.0.0
build(deps-dev): bump rollup from 4.22.4 to 4.22.5
```

The commit `type` drives the next release version — semantic-release reads the history to decide `major`/`minor`/`patch`.

## Pre-commit Hooks

husky is configured (`prepare`-less, `husky` v9); the `commit-msg` hook runs commitlint to reject non-conforming messages. There is no auto-format/lint-staged hook — run `npm run lint` yourself.

## Build Output

- `npm run build` = `rimraf ./dist` → `cross-env NODE_ENV=production rollup -c` → `tsc --emitDeclarationOnly`.
- Produces `dist/index.cjs`, `dist/index.mjs` (both with sourcemaps), and `dist/index.d.ts`.
- Runtime dependencies (`locter`, `pathtrace`, `smob`) are marked **external** in `rollup.config.mjs` and are not bundled.
- Only `dist/` is published to npm (`files` field in `package.json`).

## Release Process

- Automated via **semantic-release** (`release.config.js` extends `@tada5hi/semantic-release`), run in the CI `Release` job with `GITHUB_TOKEN` and `NPM_TOKEN`.
- Do not hand-edit `version` in `package.json` or `CHANGELOG.md` — both are managed by the release automation from commit history.

## CI/CD

- `.github/workflows/main.yml` triggers on push/PR to `develop`, `master`, `next`, `beta`, `alpha` (Node 20).
- Job graph: **Install → Build → (Lint, Test) → Release**. Composite actions live in `.github/actions/install` and `.github/actions/build`, with `node_modules` and `dist/` caching.
- `develop` is the primary/default branch.

## Best Practices

- Prefer configuring or extending the delegated dependencies (`locter`, `pathtrace`, `smob`) over adding file-parsing, path, or merge logic directly to `Container` — see [architecture.md](architecture.md).
- Study surrounding patterns and the existing `Container` methods before adding new behavior; keep the core a thin orchestrator.
- Keep changes covered by fixture-driven tests in `test/` and consistent with the conventions above.
