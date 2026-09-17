// beam.ts — the capability token. The beam bytes are the key.
// Lenia grids are display-only; this is the authoritative format.
// TODO(moifeu-spike): wrap encode_bytes_to_beams output here if live
// Moifeu beams should be the wire format — verifier stays unchanged.

export interface BeamClaim {
  v: 1;
  seat: string;   // seat id ("susano", "morgana", ...)
  ops: string[];  // tool scope granted
  iat: number;    // issued-at, epoch seconds
  exp: number;    // expiry, epoch seconds; 0 = no expiry
  nonce: string;  // fresh per issuance — rotation friendly
}

const enc = new TextEncoder();

function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = t.length % 4 === 0 ? "" : "=".repeat(4 - (t.length % 4));
  const bin = atob(t + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function sign(data: Uint8Array, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

function constantTimeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function encodeBeam(claim: BeamClaim, secret: string): Promise<string> {
  const body = enc.encode(JSON.stringify(claim));
  const mac = await sign(body, secret);
  return `${toB64url(body)}.${toB64url(mac)}`;
}

export type VerifyOk = { ok: true; claim: BeamClaim; raw: string };
export type VerifyErr = { ok: false; reason: string };

export async function verifyBeam(beam: string, secret: string): Promise<VerifyOk | VerifyErr> {
  const parts = beam.trim().split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed beam (expected body.mac)" };
  let body: Uint8Array;
  let mac: Uint8Array;
  try {
    body = fromB64url(parts[0]);
    mac = fromB64url(parts[1]);
  } catch {
    return { ok: false, reason: "beam is not valid base64url" };
  }
  const expect = await sign(body, secret);
  if (!constantTimeEq(mac, expect)) return { ok: false, reason: "checksum failed — forged or corrupted key" };
  let claim: BeamClaim;
  try {
    claim = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return { ok: false, reason: "beam body is not valid JSON" };
  }
  if (claim.v !== 1) return { ok: false, reason: `unknown beam version ${claim.v}` };
  if (claim.exp !== 0 && claim.exp * 1000 < Date.now()) return { ok: false, reason: "beam expired" };
  return { ok: true, claim, raw: beam };
}

export async function beamHash(beam: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(beam));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}