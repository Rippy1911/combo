# Combo

Local-first AI agent browser extension. BYOK, encrypted vault, folder RAG, bidirectional MCP, file generation, and CDP debug — shipping for Chrome/Edge.

**Phase A** delivers the MV3 scaffold: workspace, CI, stub packages, and a side panel that renders "Combo is alive".

## Features (roadmap)

| Capability        | Status   | Phase |
|-------------------|----------|-------|
| MV3 extension shell | ✅ shipped | A |
| Encrypted vault (BYOK) | stub | B |
| OpenRouter LLM      | stub   | B |
| Local RAG (pglite)  | stub   | B |
| File parsing        | stub   | B |
| MCP client/server   | stub   | C |
| Agent orchestration | stub   | C |
| CDP debug           | planned | D |

## Install from source

```bash
git clone https://github.com/Rippy1911/combo.git
cd combo
pnpm install
pnpm build
```

Load in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/dist` directory
5. Click the Combo icon — the side panel opens with **Combo is alive**

## Development

```bash
pnpm install        # install dependencies
pnpm dev            # watch-build extension (from extension/)
pnpm lint           # biome check
pnpm typecheck      # TypeScript strict
pnpm test           # vitest unit tests
pnpm test:e2e       # playwright smoke (build first)
pnpm build          # production extension build
pnpm size           # bundle budget check
```

## BYOK positioning

Combo never hosts your API keys or documents. You bring your own keys (OpenRouter, OpenAI, Anthropic, etc.) and store them in a local encrypted vault. RAG indexes folders on your machine. MCP servers run locally or connect to your infrastructure.

## Spec documents

- [Part 1: Feature map, scope & architecture](./docs/spec/part1.md)
- [Part 2: Tech stack, performance & testing](./docs/spec/part2.md)
- [Part 3: Directory layout, verification & phases](./docs/spec/part3.md)
- [Architecture overview](./docs/ARCHITECTURE.md)

## License

MIT — see [LICENSE](./LICENSE).

## Attributions

See [ATTRIBUTIONS.md](./ATTRIBUTIONS.md).
