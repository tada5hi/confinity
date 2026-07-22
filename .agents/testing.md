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
npm run test -- test/unit/module.spec.ts
npm run test -- -t "should load explicit file"
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

`test/unit/module.spec.ts` exercises the `Container` end-to-end against fixture files — there are no mocks. Each test constructs a `Container` with real `Options`, loads fixtures from `test/data/`, and asserts on `get(...)` results. This validates discovery, name derivation, path resolution, and merge behavior together.

## Fixtures (`test/data/`)

| File                   | Format       | Purpose                                                            |
|------------------------|--------------|--------------------------------------------------------------------|
| `project.conf`         | `key=value`  | Base config (`server.core.host`, `client.web.host`, `db.*`, …).    |
| `project.server.conf`  | `key=value`  | Overrides/adds (`core.port`, `db.database`) — merged over base.     |
| `project.client.yml`   | YAML         | Verifies non-`.conf` formats load and merge (`web.port`).          |
| `project.invalid.conf` | `key=value`  | Carries the `project` prefix; loads as element `invalid` (`{app:{attr:'foo'}}`). |
| `scalar.yml`           | YAML scalar  | Parses to a non-object (`42`) — exercises the load-time skip path.  |

Most fixtures use the `project` prefix so tests pass `{ prefix: 'project' }`. After stripping the prefix, `project.server.conf` becomes element name `server`, so `get('server.core')` resolves `core` inside it. `scalar.yml` has no prefix and resolves to a number, so it is only picked up by the no-prefix discovery test and is skipped (not stored) because it is not an object.

## Testing Philosophy

- Tests assert the **expected** behavior of the load/merge/get contract described in [architecture.md](architecture.md), not just whatever the implementation happens to do. A failing test may indicate a real bug in `Container`, not a broken test.
- Prefer driving behavior through the public API (`new Container(...)`, `load`/`loadFile`, `get`) with real fixture files over stubbing `locter`/`pathtrace`/`smob`. Because the library is a thin orchestrator over those dependencies, integration-style tests with fixtures give the most signal; add new fixtures under `test/data/` rather than mocking file I/O. For custom-injection points (e.g. `Options.mergeFn`), pass a real function and assert on its observable effect.

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
3. Add any needed config fixtures to `test/data/`; construct `Container` with the matching `prefix`/`suffix`/`cwd`.
4. Run `npm run test` (or `npm run test:coverage`) to verify and keep thresholds green.
