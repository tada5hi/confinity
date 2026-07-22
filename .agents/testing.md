# Testing

## Setup

- **Runner**: Jest 29, with TypeScript transpiled by `@swc/jest` (no type-checking during tests — fast SWC transform only).
- **Test location**: `test/unit/**` plus any `*.spec.ts` / `*.test.ts` (see `testRegex` below).
- **Config**: `test/jest.config.js` (`rootDir` is the repo root, `../` from the config file).
- **Fixtures**: `test/data/` — real config files loaded by the specs.
- **Env**: `NODE_ENV=test` (set by the `test` script via `cross-env`).

## Running Tests

```bash
npm run test              # run all tests
npm run test:coverage     # run with coverage (adds --coverage)

# a single file / pattern (forward extra args after --):
npm run test -- test/unit/module.spec.ts
npm run test -- -t "should load explicit file"
```

## Jest Configuration Highlights

From `test/jest.config.js`:

- `testEnvironment: 'node'`
- `transform`: `^.+\.tsx?$` → `@swc/jest`
- `testRegex`: `(/unit/.*|(\.|/)(test|spec))\.(ts|js)x?$`
- `testPathIgnorePatterns`: `writable`, `dist`, `/unit/mock-util.ts`
- `collectCoverageFrom`: `src/**/*.ts` (excluding `*.d.ts`)

## Test Layers

### Unit Tests

`test/unit/module.spec.ts` exercises the `Container` end-to-end against fixture files — there are no mocks. Each test constructs a `Container` with real `Options`, loads fixtures from `test/data/`, and asserts on `get(...)` results. This validates discovery, name derivation, path resolution, and merge behavior together.

## Fixtures (`test/data/`)

| File                   | Format       | Purpose                                                            |
|------------------------|--------------|--------------------------------------------------------------------|
| `project.conf`         | `key=value`  | Base config (`server.core.host`, `client.web.host`, `db.*`, …).    |
| `project.server.conf`  | `key=value`  | Overrides/adds (`core.port`, `db.database`) — merged over base.     |
| `project.client.yml`   | YAML         | Verifies non-`.conf` formats load and merge (`web.port`).          |
| `project.invalid.conf` | `key=value`  | Lacks the `project` prefix — used to check prefix filtering.        |

All fixtures use the `project` prefix so tests pass `{ prefix: 'project' }`. After stripping the prefix, `project.server.conf` becomes element name `server`, so `get('server.core')` resolves `core` inside it.

## Testing Philosophy

- Tests assert the **expected** behavior of the load/merge/get contract described in [architecture.md](architecture.md), not just whatever the implementation happens to do. A failing test may indicate a real bug in `Container`, not a broken test.
- Prefer driving behavior through the public API (`new Container(...)`, `load`/`loadFile`, `get`) with real fixture files over stubbing `locter`/`pathtrace`/`smob`. Because the library is a thin orchestrator over those dependencies, integration-style tests with fixtures give the most signal; add new fixtures under `test/data/` rather than mocking file I/O.

## Code Coverage

```bash
npm run test:coverage     # report written to coverage/
```

Global thresholds are enforced (`coverageThreshold.global` in `test/jest.config.js`) — a run fails if coverage drops below:

| Metric     | Threshold |
|------------|-----------|
| Branches   | 58%       |
| Functions  | 77%       |
| Lines      | 73%       |
| Statements | 73%       |

When adding code paths, add tests so coverage stays above these floors (or raise the floors alongside new tests).

## CI Pipeline

GitHub Actions (`.github/workflows/main.yml`) on push/PR to `develop`, `master`, `next`, `beta`, `alpha`, running on Node 20:

```
Install ──► Build ──┬─► Lint
                    ├─► Test  (npm run test)
                    └─► (Lint + Test) ──► Release (semantic-release)
```

Build output is cached between jobs. Tests run against the built state after `Install` + `Build`.

## Writing New Tests

1. Place test files under `test/unit/` (or name them `*.spec.ts` / `*.test.ts`) so `testRegex` picks them up.
2. Add any needed config fixtures to `test/data/`; construct `Container` with the matching `prefix`/`suffix`/`cwd`.
3. Run `npm run test` (or `npm run test:coverage`) to verify and keep thresholds green.
