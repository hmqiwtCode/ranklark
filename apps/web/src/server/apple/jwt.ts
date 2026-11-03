import crypto from "node:crypto";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** ES256 JWT signed with a P-256 private key (.p8 / PEM). Used by App Store Connect and Apple Ads. */
export function signES256(header: Record<string, unknown>, payload: Record<string, unknown>, privateKeyPem: string) {
  const h = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", ...header }));
  const p = b64url(JSON.stringify(payload));
  const key = crypto.createPrivateKey(normalizePem(privateKeyPem));
  const sig = crypto.sign("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" });
  return `${h}.${p}.${b64url(sig)}`;
}

/** Accepts PEM with real newlines, "\n"-escaped newlines (common in .env files), or a bare base64 body. */
export function normalizePem(pem: string) {
  let s = pem.trim().replace(/\\n/g, "\n");
  if (!s.includes("-----BEGIN"))
    s = `-----BEGIN PRIVATE KEY-----\n${s
      .replace(/\s+/g, "")
      .match(/.{1,64}/g)!
      .join("\n")}\n-----END PRIVATE KEY-----`;
  return s;
}
