# Dependencies

Runtime:
- `@modelcontextprotocol/sdk` — MCP server SDK (Streamable HTTP transport)
- `agents` (Cloudflare Agents) — `McpAgent` Durable Object pattern
- `zod` — tool input schemas

Tooling:
- `wrangler` — Cloudflare Workers dev/deploy
- `typescript`, `@cloudflare/workers-types`

Infrastructure:
- Cloudflare Workers (compute + custom domain `mcp.alamort.ca`)
- Cloudflare KV `GARDEN_LEDGER` — seat allowlist + beam issuance/revocation records (stands in for the planned Spacetime/Luxana ledger; key shapes match so the swap is a binding change, not a schema change)
- Durable Objects (`MCP_OBJECT` / `GardenAgent`) — MCP session state

Upstream design:
- Moifeu beam sequences (alamort-sun/moifeu, private) — capability token source; integration point marked `TODO(moifeu-spike)` in `src/beam.ts`
