# Combo v0.1 — Directory Layout, Verification & Phases

> IdeaForge document `6a58022f8696cc3182e8f91a`

## Directory Layout

```
combo/
├── .github/workflows/ci.yml
├── ATTRIBUTIONS.md
├── LICENSE
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── tsconfig.base.json
├── biome.json
├── vitest.config.ts
├── playwright.config.ts
├── size-limit.json
├── packages/
│   ├── shared/
│   ├── vault/
│   ├── rag/
│   ├── files/
│   ├── mcp/
│   ├── llm/
│   └── agents/
├── extension/
│   ├── manifest.json
│   ├── vite.config.ts
│   ├── src/background/index.ts
│   ├── src/offscreen/offscreen.html + offscreen.ts
│   ├── src/content/content.ts
│   ├── src/sidepanel/App.tsx + main.tsx
│   └── src/options/options.tsx
├── e2e/
│   └── smoke.spec.ts
└── docs/
    ├── spec/part1.md, part2.md, part3.md
    └── ARCHITECTURE.md
```

## Phase Roadmap

### Phase A (this PR) — Scaffold

MV3 shell, workspace, CI, stub packages, "Combo is alive" side panel.

### Phase B — Core capabilities

- vault: real Web Crypto AES-GCM + PBKDF2
- llm: OpenRouter BYOK provider
- rag: pglite + pgvector indexing
- files: PDF/DOCX/XLSX parsing
- Basic chat UI in side panel

### Phase C — Agent + MCP

- MCP client and Chrome-native server
- Agent orchestrator (planner/navigator/validator/file)
- Content script DOM interaction
- File generation

### Phase D — Advanced

- CDP debug integration
- Multi-provider LLM routing
- Advanced RAG (hybrid search, re-ranking)

## Verification Gates Status (Phase A)

| Gate | Status | Notes                              |
|------|--------|------------------------------------|
| 1    | GREEN  | `pnpm install && pnpm test && pnpm build` |
| 2    | GREEN  | Extension loads unpacked           |
| 3    | GREEN  | Side panel shows "Combo is alive"  |
| 4–10 | Phase B/C/D | Acknowledged, not in scope    |

## Load-unpacked test steps

1. `pnpm install && pnpm build`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click "Load unpacked" → select `extension/dist`
5. Click the Combo extension icon
6. Side panel opens with "Combo is alive"

## Success criteria

1. `pnpm install && pnpm test && pnpm build` succeed on fresh clone
2. Built extension loads unpacked with no console errors
3. Extension icon → side panel shows "Combo is alive"
4. `pnpm test:e2e` Playwright smoke passes
5. CI green on PR

## Task reference

IdeaForge Task: `6a580122a479f566d70320a2`
