# Combo v0.1 — Tech Stack, Performance & Testing

> IdeaForge document `6a5801ee8696cc3182e8f8e8`

## Tech Stack (locked)

| Layer        | Choice                                      |
|--------------|---------------------------------------------|
| Language     | TypeScript (strict)                         |
| Bundler      | Vite                                        |
| Workspace    | pnpm workspaces                             |
| UI           | React 18 + Tailwind CSS + shadcn/ui          |
| State        | Zustand (offscreen document)                |
| Extension    | Chrome MV3 vanilla APIs (no external SDK)   |
| Unit tests   | Vitest + @testing-library/react             |
| E2E tests    | Playwright                                  |
| Lint/format  | Biome                                       |

## Scripts

```bash
pnpm install    # install all workspace deps
pnpm lint       # biome check
pnpm typecheck  # tsc --build
pnpm test       # vitest run
pnpm test:bench # vitest bench (infrastructure ready)
pnpm test:e2e   # playwright smoke
pnpm build      # vite build extension
pnpm size       # size-limit bundle budget
```

## Performance (day 1 infrastructure)

### Bundle budgets

| Artifact  | Budget (gzipped) | Rationale                    |
|-----------|------------------|------------------------------|
| sidepanel | < 500 KB         | Fast side panel cold start   |
| offscreen | < 5 MB           | pglite floor (Phase B)       |

Configured in `size-limit.json`. CI fails on regression > 10% via size-limit CI mode.

### Benchmarks

`vitest.config.ts` includes `benchmark.include` for `**/*.bench.ts`. No benches in Phase A; infrastructure ready for Phase B.

## Testing discipline

### Unit tests

- Every package has `src/index.test.ts` with a passing placeholder test
- `vitest.config.ts` aggregates all packages at root
- Coverage threshold: 80% lines/functions/branches/statements
- Phase A stub packages excluded from coverage gate (re-enable per package in Phase B)

### E2E tests

- Playwright loads extension via `--load-extension` flag
- Smoke test: open side panel, assert "Combo is alive" text present
- Runs in CI after build step

### CI pipeline

`.github/workflows/ci.yml` runs on every push/PR:

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build`
5. `pnpm size`
6. `pnpm test:e2e`

## Commit style

Conventional commits: `feat(scaffold):`, `chore(ci):`, `docs:`, `test(smoke):`, etc.

Every commit must pass CI locally before push. No commented-out code or TODOs in shipped code.
