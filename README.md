# garden-mcp

The **garden edge**: a custom MCP server (Streamable HTTP) on Cloudflare Workers, resolving at `https://mcp.alamort.ca/mcp`.

Agents present **Moifeu beam sequences** — capability tokens, not keys minted into Lenia grids. The beam bytes are the key. The edge verifies checksum + seat allowlist + revocation, then binds the session to that seat's Ollama model / tool scope. Lenia stays viz / substrate theater; `key_flower` is display-only.

## Claim schema

```
BeamClaim { v: 1, seat: string, ops: string[], iat: number, exp: number, nonce: string }
wire: b64url(JSON(claim)).b64url(HMAC-SHA256(claim_bytes, GARDEN_HMAC_KEY))
ledger: seat:<id> → { ops ceiling, model route } · beam:<sha256> → issuance · revoked:<sha256> → tombstone
verify order: format → HMAC → version → expiry → allowlist → revocation → op ceiling
```

## Tools

- `present_beam` — verify a beam, bind the session to the seat's Ollama route
- `issue_beam` (admin) — mint a beam for a seat
- `revoke_beam` (admin) — tombstone a beam hash; rotate with a fresh issue
- `list_seats` — allowlist + route ceilings
- `key_flower` — display-only deterministic beam projection

## Deploy

1. `npm install && npx wrangler login`
2. `npx wrangler kv namespace create GARDEN_LEDGER` → paste the id into `wrangler.toml`
3. `npx wrangler secret put GARDEN_HMAC_KEY` and `npx wrangler secret put GARDEN_ADMIN_KEY`
4. Seed seats: `npx wrangler kv key put --namespace-id=<id> "seat:susano" --path=seeds/susano.json`
5. `npx wrangler deploy`

**Domain:** the route uses a Workers custom domain (`mcp.alamort.ca`), which requires alamort.ca to be a zone on the deploying Cloudflare account. On deploy, Cloudflare auto-creates the specific DNS record + TLS cert — a specific record overrides any `*.alamort.ca` wildcard. If alamort.ca DNS is not on Cloudflare yet, move the nameservers there (free plan; the existing site keeps working via proxied records).

## Status

Spike-grade, marked honestly: admin auth via tool arg (move to header check before `mount()`), KV ledger is eventually consistent (Spacetime/Luxana ledger swap planned, key shapes already match), session binding is returned as data — proxying chat through to Ollama over Tailscale is the next increment. `TODO(moifeu-spike)` in `src/beam.ts` marks the swap point for live Moifeu `encode_bytes_to_beams` output.
