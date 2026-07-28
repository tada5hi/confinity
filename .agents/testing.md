# Testing

## Setup

- **Runner**: [Vitest](https://vitest.dev) 4 (config at `test/vitest.config.ts`).
- **Test location**: `test/unit/**/*.{test,spec}.{js,ts}` (the `include` glob).
- **Fixtures**: `test/data/` — real config files loaded by the specs.
- **Coverage**: v8 provider (`@vitest/coverage-v8`).

## Running Tests

```bash
npm run test              # run all tests once
npm run test:coverage     # run once with coverage (thresholds enforced)

# a single file / pattern:
npm run test -- test/unit/store.spec.ts
npm run test -- -t "should load explicit files"
```

Both scripts pass `--run` so Vitest executes once and exits (no watch mode) — matching CI.

## Vitest Configuration Highlights

From `test/vitest.config.ts`:

- `test.include`: `['test/unit/**/*.{test,spec}.{js,ts}']`
- `test.coverage.provider`: `'v8'`
- `test.coverage.include`: `['src/**/*.{ts,tsx,js,jsx}']`
- `test.coverage.thresholds`: `branches`, `functions`, `lines`, `statements` all **80**

## Test Layers

### Unit Tests

Four suites test each collaborator at its own boundary:

| File                         | Under test  | Focus                                                                                  |
|------------------------------|-------------|-----------------------------------------------------------------------------------------|
| `test/unit/store.spec.ts`    | `Store`     | Pure query/merge over hand-built `Element[]` — matching (incl. the **segment-boundary** rule and **nested-element aggregation**), precedence, deep merge, wildcards, lazy sort, injected `mergeFn`, `has`/`elements`/`reset`, and `add` validation. Plus the **isolation** group: a read must not write into stored data, must not hand out a reference into a single matching element, must stay stable across repeated reads with an accumulating merger, and must carry exotics (`Date`, functions) through by reference. **No filesystem.** |
| `test/unit/naming.spec.ts`   | `NamingScheme` | `toPatterns()` per prefix/suffix combination (incl. the un-braced **single extension**), `toName()` derivation (incl. boundary rejection, off-convention → root, extensionless/dotfile stems), construct-time **validation**, and a glob↔name round-trip. |
| `test/unit/fsstore.spec.ts`  | `FSStore`   | The friendly constructor (extension normalization + validation, `mergeFn`/`naming`/`read` injection) + discovery/`load`/`loadFile`/`get`. Against real `test/data/` fixtures, real **module fixtures** in `test/data/module/` (the `.default` unwrap is brand-based, so it can only be exercised through a real file), and a stubbed `Reader` port for skip/name/path/`__proto__`/cycle handling. Plus **load reporting** (paths returned, empty for a missing directory, `source` recorded), **idempotency** (repeated loads, a directory named twice, a lazy `get` racing `load`, re-load refreshes), **error handling** (`LoadError` with `cause`, `onError: 'skip'`), the **async / lazy** path (memoized, and a *failed* load retried), `reset`, and the **sync twins**. |
| `test/unit/module.spec.ts`   | `Container` | The read-only wrapper exposes `getSync`/`get`/`has` over a wrapped `Store`, reflects an `FSStore` after it has been loaded, delegates the lazy `get`, and **does not expose** `load`/`add`/`reset` or the wrapped store. |

There is no `loader.spec.ts` — the former `Loader` was folded into `FSStore`, and its tests live in `fsstore.spec.ts`. Together the four suites run ~116 tests at ~99% coverage.

## Fixtures (`test/data/`)

| File                   | Format       | Purpose                                                            |
|------------------------|--------------|--------------------------------------------------------------------|
| `project.conf`         | `key=value`  | Base config (`server.core.host`, `client.web.host`, `db.*`, …).    |
| `project.server.conf`  | `key=value`  | Overrides/adds (`core.port`, `db.database`) — merged over base.     |
| `project.client.yml`   | YAML         | Verifies non-`.conf` formats load and merge (`web.port`).          |
| `project.invalid.conf` | `key=value`  | Carries the `project` prefix; loads as element `invalid` (`{app:{attr:'foo'}}`). |
| `scalar.yml`           | YAML scalar  | Parses to a non-object (`42`) — exercises the load-time skip path.  |

`test/data/module/` is a **separate directory** so its files do not disturb the discovery counts of the specs that scan `test/data` (discovery is non-recursive, so it stays invisible to them):

| File                    | Format     | Purpose                                                                     |
|-------------------------|------------|-----------------------------------------------------------------------------|
| `project.esm.mjs`       | ES module  | `export default {…}` — the only way to exercise the unwrap, since locter brands module records with a module-private `Symbol` that a stub cannot forge. |
| `project.scalar.mjs`    | ES module  | `export default 5` — a module whose default is not an object is skipped.     |
| `project.falsy.mjs`     | ES module  | `export default false` — unwrap is by brand, so a falsy default still unwraps and is then skipped. |
| `project.defaults.yml`  | YAML       | A **data** file with a literal top-level `default:` key plus siblings — pins that it is *not* treated as a module wrapper. |

Most fixtures use the `project` prefix so tests construct `new FSStore({ prefix: 'project', ... })` (or supply a custom `NamingScheme` / `Reader` via the same options). After stripping the prefix, `project.server.conf` becomes element name `server`, so `get('server.core')` resolves `core` inside it. `scalar.yml` has no prefix and resolves to a number, so it is only picked up by the no-prefix discovery test and is skipped (not stored) because it is not an object.

## Testing Philosophy

- Tests assert the **expected** behavior of the load/merge/get contract described in [architecture.md](architecture.md), not just whatever the implementation happens to do. A failing test may indicate a real bug in `Store`/`FSStore`/`NamingScheme`, not a broken test.
- Beware of pinning a bug through a stub. Several v1 tests asserted the `.default` unwrap by feeding a plain `{ default: … }` object through a stubbed `Reader` — which is exactly the input the unwrap must *not* treat as a module. A stub that can express something the real dependency cannot produce will happily certify the wrong behavior; use a real fixture for anything the dependency brands, validates or otherwise owns.
- Test each collaborator at its own boundary: `Store` with hand-built `Element[]` (no fs), `NamingScheme` on plain path/pattern strings, `FSStore` against real fixture files, `Container` wrapping a store. Prefer real fixtures over stubbing `locter`/`pathtrace`/`smob`; because the library is a thin orchestrator over those dependencies, integration-style tests with fixtures give the most signal — add new fixtures under `test/data/` rather than mocking file I/O. For the injection points (`StoreOptions.mergeFn`, `FSStoreOptions.naming`, `FSStoreOptions.read` / the `Reader` port), pass a real implementation and assert on its observable effect.

## Code Coverage

```bash
npm run test:coverage     # v8 report; fails if any metric < 80%
```

Thresholds (`test.coverage.thresholds` in `test/vitest.config.ts`) are enforced — a run fails if coverage drops below **80%** for branches, functions, lines, or statements. When adding code paths, add tests so coverage stays above these floors.

## CI Pipeline

GitHub Actions (`.github/workflows/main.yml`) on push/PR to `develop`, `master`, `next`, `beta`, `alpha`, running on Node 24:

```
Install ──┬─► Build ──┬─► Lint
          │           └─► Test  (npm run test)
          └─► Typecheck  (npm run typecheck)
```

Build output is cached between jobs; lint and test both depend on a successful build. Typecheck (`tsc --noEmit`) runs independently of the build because **tsdown does not fail on type errors** — a full `tsc` pass is the only gate that catches them. Releases are handled separately by `.github/workflows/release.yml` (release-please) on `master` — see [conventions.md](conventions.md).

## Writing New Tests

1. Place test files under `test/unit/` named `*.spec.ts` / `*.test.ts` so the `include` glob picks them up.
2. Import test globals from `vitest` (`import { describe, expect, it } from 'vitest'`).
3. Test at the right boundary: a pure query/merge case → `new Store(...)` with hand-built elements in `store.spec.ts`; a convention case → `new NamingScheme(...)` in `naming.spec.ts`; a filesystem case → `new FSStore(...)` (add fixtures to `test/data/`) in `fsstore.spec.ts`; a read-only-view case → `new Container(store)` in `module.spec.ts`.
4. Run `npm run test` (or `npm run test:coverage`) to verify and keep thresholds green.
