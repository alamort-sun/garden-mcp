// index.ts — the garden edge. MCP server on Cloudflare Workers,
// Streamable HTTP transport, resolves at https://mcp.alamort.ca/mcp
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BeamClaim, encodeBeam, verifyBeam, beamHash } from "./beam";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  GARDEN_LEDGER: KVNamespace;
  GARDEN_HMAC_KEY: string;   // wrangler secret — signs beams
  GARDEN_ADMIN_KEY: string;  // wrangler secret — gates issue/revoke
  GARDEN_SEATS?: string;     // csv of seat ids (records live in KV)
}

export interface SeatRecord {
  ops: string[]; // ceiling: the most any beam for this seat may grant
  model: string; // Ollama route for this seat, e.g. "llama3.1:8b" or a Tailscale URL
}

export class GardenAgent extends McpAgent<Env> {
  server = new McpServer({ name: "garden", version: "0.1.0" });

  async init() {
    const env = this.env;
    const reject = (reason: string) => ({
      content: [{ type: "text" as const, text: `REJECTED: ${reason}` }],
      isError: true,
    });

    this.server.tool(
      "present_beam",
      "Present a Moifeu beam sequence (capability token) to bind this session to a seat. " +
        "The beam bytes are the key: checksum, expiry, seat allowlist and revocation are verified.",
      { beam: z.string().describe("wire beam: b64url(claim).b64url(hmac)") },
      async ({ beam }) => {
        const v = await verifyBeam(beam, env.GARDEN_HMAC_KEY);
        if (!v.ok) return reject(v.reason);
        const seat = await env.GARDEN_LEDGER.get<SeatRecord>(`seat:${v.claim.seat}`, "json");
        if (!seat) return reject(`seat "${v.claim.seat}" is not in the allowlist`);
        const h = await beamHash(v.raw);
        if (await env.GARDEN_LEDGER.get(`revoked:${h}`)) return reject("beam is revoked");
        const ops = v.claim.ops.filter((op) => seat.ops.includes(op));
        if (ops.length === 0) return reject("beam grants no allowed ops for this seat");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              bound: true, seat: v.claim.seat, ops,
              model: seat.model, expires: v.claim.exp || null, beam_hash: h,
            }, null, 2),
          }],
        };
      },
    );

    this.server.tool(
      "issue_beam",
      "Mint a beam for a seat (admin). Nothing secret is stored server-side — the beam itself is the key.",
      {
        seat: z.string(),
        ops: z.array(z.string()),
        admin_key: z.string(),
        ttl_hours: z.number().int().positive().max(8760).optional(),
      },
      async ({ seat, ops, admin_key, ttl_hours }) => {
        if (admin_key !== env.GARDEN_ADMIN_KEY) return reject("bad admin key");
        const rec = await env.GARDEN_LEDGER.get<SeatRecord>(`seat:${seat}`, "json");
        if (!rec) return reject(`seat "${seat}" is not in the allowlist`);
        const claim: BeamClaim = {
          v: 1, seat, ops: ops.filter((o) => rec.ops.includes(o)),
          iat: Math.floor(Date.now() / 1000),
          exp: ttl_hours ? Math.floor(Date.now() / 1000) + ttl_hours * 3600 : 0,
          nonce: crypto.randomUUID(),
        };
        const beam = await encodeBeam(claim, env.GARDEN_HMAC_KEY);
        const h = await beamHash(beam);
        await env.GARDEN_LEDGER.put(`beam:${h}`, JSON.stringify({ seat, exp: claim.exp }));
        return { content: [{ type: "text", text: JSON.stringify({ beam, beam_hash: h, claim }, null, 2) }] };
      },
    );

    this.server.tool(
      "revoke_beam",
      "Revoke a beam by hash or wire form (admin). Tombstone only — the seat stays. Rotate via a fresh issue.",
      { admin_key: z.string(), beam: z.string().optional(), beam_hash: z.string().optional() },
      async ({ admin_key, beam, beam_hash }) => {
        if (admin_key !== env.GARDEN_ADMIN_KEY) return reject("bad admin key");
        const h = beam_hash ?? (beam ? await beamHash(beam) : null);
        if (!h) return reject("provide beam or beam_hash");
        await env.GARDEN_LEDGER.put(`revoked:${h}`, String(Math.floor(Date.now() / 1000)));
        return { content: [{ type: "text", text: `revoked ${h}` }] };
      },
    );

    this.server.tool(
      "list_seats",
      "List seats on the allowlist and their route ceilings.",
      {},
      async () => {
        const ids = (env.GARDEN_SEATS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        const seats = await Promise.all(ids.map(async (id) => ({
          id,
          ...(await env.GARDEN_LEDGER.get<SeatRecord>(`seat:${id}`, "json") ?? { ops: [], model: "unset" }),
        })));
        return { content: [{ type: "text", text: JSON.stringify(seats, null, 2) }] };
      },
    );

    this.server.tool(
      "key_flower",
      "Project a beam into a deterministic key-flower (display only — Lenia stays viz theater).",
      { beam: z.string() },
      async ({ beam }) => {
        const v = await verifyBeam(beam, env.GARDEN_HMAC_KEY);
        if (!v.ok) return reject(v.reason);
        const h = await beamHash(beam);
        const hue = parseInt(h.slice(0, 4), 16) % 360;
        const hue2 = (hue + 60 + (parseInt(h.slice(4, 8), 16) % 120)) % 360;
        const petals = 6 + (parseInt(h.slice(8, 12), 16) % 7);
        let paths = "";
        for (let i = 0; i < petals; i++) {
          const a = (360 / petals) * i;
          const hu = (hue + ((hue2 - hue) * i) / petals + 360) % 360;
          paths += `<ellipse cx="0" cy="-76" rx="34" ry="62" fill="hsl(${hu.toFixed(0)} 70% 60%)" fill-opacity="0.45" transform="rotate(${a.toFixed(1)})"/>`;
        }
        const svg =
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">` +
          `<rect width="300" height="300" fill="#12091f"/>` +
          `<g transform="translate(150 150)">${paths}</g>` +
          `<circle cx="150" cy="150" r="26" fill="hsl(${hue} 80% 72%)" fill-opacity="0.9"/>` +
          `<text x="150" y="292" font-family="monospace" font-size="10" fill="#b9a6e8" text-anchor="middle">${v.claim.seat} · ${h.slice(0, 12)}</text>` +
          `</svg>`;
        return { content: [{ type: "text", text: svg }] };
      },
    );
  }
}

export default GardenAgent.mount("/mcp");