# Combo v0.1 — Feature Map, Scope & Architecture

> IdeaForge document `6a5801ee8696cc3182e8f8e7`

## Vision

Combo is an open-source, local-first AI agent Chrome extension. Users bring their own API keys (BYOK), store secrets in an encrypted vault, index local folders for RAG, connect bidirectional MCP servers, generate files, and debug via CDP — all without sending data to Combo-hosted servers.

## Phase A Scope (this release)

- MV3 extension shell: service worker, side panel, offscreen document, content script
- pnpm monorepo with stub packages for all subsystems
- React 18 side panel placeholder ("Combo is alive")
- CI: lint, typecheck, unit tests, build, bundle budget, Playwright smoke
- No real LLM, vault crypto, RAG, MCP, or agent logic

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Side Panel (React + Tailwind + shadcn/ui)                  │
│  Chat UI, settings, file picker (Phase B+)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ chrome.runtime messaging
┌──────────────────────────▼──────────────────────────────────┐
│  Service Worker (background)                                  │
│  Lifecycle, side panel, offscreen doc management              │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────┐
│ Offscreen Doc │  │ Content Script│  │ Options Page      │
│ Zustand state │  │ DOM stub      │  │ Settings stub     │
│ RAG + agents  │  │ (Phase C)     │  │ (Phase B)         │
│ (Phase B+)    │  │               │  │                   │
└───────────────┘  └───────────────┘  └───────────────────┘
```

## Package Map

| Package   | Responsibility                          | Phase A Status |
|-----------|-----------------------------------------|----------------|
| shared    | Types, Zod schemas, protocols           | stub           |
| vault     | Web Crypto AES-GCM + PBKDF2 KEK         | stub           |
| rag       | pglite + pgvector + chunker + embedder  | stub           |
| files     | pdf.js, pdf-lib, SheetJS, mammoth       | stub           |
| mcp       | @modelcontextprotocol/sdk client/server | stub           |
| llm       | BYOK providers (OpenRouter first)       | stub           |
| agents    | planner/navigator/validator/file/orch.  | stub           |

## Verification Gates

| Gate | Description                        | Phase   |
|------|------------------------------------|---------|
| 1    | Workspace builds and tests pass    | A ✅    |
| 2    | Extension loads unpacked, no errors| A ✅  |
| 3    | Side panel renders placeholder     | A ✅    |
| 4    | Vault encrypt/decrypt round-trip   | B       |
| 5    | OpenRouter chat completion         | B       |
| 6    | RAG index + semantic search        | B       |
| 7    | File parse (PDF/DOCX/XLSX)         | B       |
| 8    | MCP tool call round-trip           | C       |
| 9    | Agent orchestration loop           | C       |
| 10   | CDP debug integration              | D       |

## Out of Scope (Phase A)

- Real LLM calls, pglite/pgvector, File System Access API, MCP client/server, agent orchestrator, CDP integration, vault crypto, functional chat UI.
