# Combo Architecture

Combo is a local-first AI agent Chrome extension built as a pnpm monorepo. Phase A delivers the MV3 shell and stub packages; real capabilities land in subsequent phases.

## Extension surfaces

| Surface          | Entry point                         | Role                                      |
|------------------|-------------------------------------|-------------------------------------------|
| Side panel       | `extension/src/sidepanel/`          | Primary UI (React 18 + Tailwind + shadcn) |
| Service worker   | `extension/src/background/index.ts` | Lifecycle, offscreen doc, messaging       |
| Offscreen doc    | `extension/src/offscreen/`          | Persistent workers + Zustand (Phase B+)   |
| Content script   | `extension/src/content/content.ts`  | DOM interaction stub (Phase C)            |
| Options page     | `extension/src/options/options.tsx` | Settings stub (Phase B)                   |

## Monorepo packages

All packages live under `packages/` and are consumed by the extension via workspace references:

- **shared** — Zod schemas, protocol types, message format
- **vault** — Encrypted credential store (AES-GCM + PBKDF2 in Phase B)
- **rag** — Local vector search (pglite + pgvector in Phase B)
- **files** — Document parsing (pdf.js, mammoth, SheetJS in Phase B)
- **mcp** — Model Context Protocol client/server (Phase C)
- **llm** — BYOK provider abstraction (OpenRouter first, Phase B)
- **agents** — Multi-agent orchestration (Phase C)

## Messaging protocol

Extension surfaces communicate via `chrome.runtime.sendMessage` with typed payloads prefixed `combo:`. Protocol version is exported from `@combo/shared` as `COMBO_PROTOCOL_VERSION`.

## Build pipeline

Vite + `@crxjs/vite-plugin` bundles the extension to `extension/dist/`. Root scripts orchestrate lint (Biome), typecheck (tsc project references), unit tests (Vitest), bundle budget (size-limit), and E2E (Playwright).

## Design principles

1. **Local-first** — user data stays on device; BYOK for LLM calls
2. **No Combo-hosted backend** — extension is self-contained
3. **Performant** — bundle budgets enforced from day one
4. **Fully tested** — every package has tests; CI on every push

See [spec docs](./spec/part1.md) for the full feature map and phase plan.
