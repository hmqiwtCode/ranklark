/**
 * Metadata tokenization + audit.
 * Field limits are Apple-documented (App Store Connect Help → Platform version information).
 * Rules tagged `observed` come from industry testing, not Apple, and are labelled as such in the UI.
 */
export const LIMITS = { name: 30, subtitle: 30, keywords: 100, promo: 170, description: 4000 } as const;

// Words that carry no search intent on the App Store (kept deliberately short and conservative).
export const STOP_WORDS = new Set(
  (
    "a an and are as at be by for from has have in is it its of on or that the this to was were will with " +
    "you your our we us my me i can do just get all any more most very also into than then there these those " +
    "app apps application iphone ipad ios"
  ).split(" "),
);

// Fragments that show up when people n-gram descriptions/URLs; never useful as keywords.
const JUNK =
  /^(https?|www|com|net|org|io|dev|terms?|privacy|policy|legal|support|contact|email|copyright|rights|reserved|inc|ltd|llc|subscription|subscriptions|auto|renew|renews|renewal|cancel|account|itunes|eula|tos)$/i;

export function normalize(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return normalize(s).split(" ").filter(Boolean);
}

export const isUseful = (t: string) => t.length > 1 && !STOP_WORDS.has(t) && !JUNK.test(t) && !/^\d+$/.test(t);

export function keywordFieldTokens(field: string | null | undefined): string[] {
  if (!field) return [];
  return field
    .split(",")
    .flatMap((part) => tokens(part))
    .filter(Boolean);
}

export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** naive English singular form — used only to flag likely singular/plural duplicates */
export function singular(t: string) {
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith("es") && /(s|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export type Fields = { name: string | null; subtitle: string | null; keywords: string | null; seller?: string | null };

export type Placement = "T" | "S" | "K" | "D";

/** Where does each word of a search term live in indexed metadata? */
export function placement(term: string, f: Fields): { covered: boolean; exactInTitle: boolean; where: Placement[]; missing: string[] } {
  const words = tokens(term).filter((w) => !STOP_WORDS.has(w) || tokens(term).length === 1);
  const T = new Set(tokens(f.name));
  const S = new Set(tokens(f.subtitle));
  const K = new Set(keywordFieldTokens(f.keywords));
  const D = new Set(tokens(f.seller));
  const where = new Set<Placement>();
  const missing: string[] = [];
  for (const w of words) {
    const variants = [w, singular(w)];
    const inT = variants.some((v) => T.has(v));
    const inS = variants.some((v) => S.has(v));
    const inK = variants.some((v) => K.has(v));
    const inD = variants.some((v) => D.has(v));
    if (inT) where.add("T");
    if (inS) where.add("S");
    if (inK) where.add("K");
    if (inD) where.add("D");
    if (!inT && !inS && !inK && !inD) missing.push(w);
  }
  const exactInTitle = normalize(f.name ?? "").includes(normalize(term));
  return { covered: missing.length === 0 && words.length > 0, exactInTitle, where: [...where], missing };
}

export type AuditIssue = {
  level: "error" | "warn" | "info";
  field: "name" | "subtitle" | "keywords" | "all";
  message: string;
  basis: "apple" | "observed";
};

export function audit(
  f: Fields,
  tracked: string[] = [],
): { issues: AuditIssue[]; usage: Record<string, { used: number; limit: number; bytes?: number }> } {
  const issues: AuditIssue[] = [];
  const name = f.name ?? "";
  const subtitle = f.subtitle ?? "";
  const kw = f.keywords ?? "";

  const usage = {
    name: { used: [...name].length, limit: LIMITS.name },
    subtitle: { used: [...subtitle].length, limit: LIMITS.subtitle },
    keywords: { used: [...kw].length, limit: LIMITS.keywords, bytes: utf8Bytes(kw) },
  };

  if (usage.name.used > LIMITS.name)
    issues.push({
      level: "error",
      field: "name",
      message: `App name is ${usage.name.used}/30 characters — App Store Connect will reject it.`,
      basis: "apple",
    });
  if (usage.subtitle.used > LIMITS.subtitle)
    issues.push({ level: "error", field: "subtitle", message: `Subtitle is ${usage.subtitle.used}/30 characters.`, basis: "apple" });
  if (usage.keywords.used > LIMITS.keywords)
    issues.push({ level: "error", field: "keywords", message: `Keyword field is ${usage.keywords.used}/100 characters.`, basis: "apple" });

  if (!f.subtitle)
    issues.push({
      level: "warn",
      field: "subtitle",
      message: "No subtitle on file. Add it (or connect App Store Connect) — the subtitle is an indexed field and 30 free characters.",
      basis: "apple",
    });
  else if (usage.subtitle.used < 22)
    issues.push({
      level: "info",
      field: "subtitle",
      message: `Subtitle uses ${usage.subtitle.used}/30 — ${30 - usage.subtitle.used} indexed characters unused.`,
      basis: "apple",
    });
  if (usage.name.used < 20)
    issues.push({
      level: "info",
      field: "name",
      message: `App name uses ${usage.name.used}/30 — consider a descriptive suffix ("Name – Core Keyword").`,
      basis: "observed",
    });

  if (!f.keywords) {
    issues.push({
      level: "warn",
      field: "keywords",
      message: "Keyword field unknown. It's hidden from the public store — paste it or connect your App Store Connect API key to audit it.",
      basis: "apple",
    });
  } else {
    if (/,\s/.test(kw))
      issues.push({
        level: "warn",
        field: "keywords",
        message: "Spaces after commas waste characters — separate keywords with commas only.",
        basis: "apple",
      });
    if (usage.keywords.used < 90)
      issues.push({
        level: "info",
        field: "keywords",
        message: `Keyword field uses ${usage.keywords.used}/100 — ${100 - usage.keywords.used} characters free.`,
        basis: "apple",
      });

    const nameSub = new Set([...tokens(name), ...tokens(subtitle)]);
    const kwTokens = keywordFieldTokens(kw);
    const dupes = [...new Set(kwTokens.filter((t) => nameSub.has(t)))];
    if (dupes.length)
      issues.push({
        level: "warn",
        field: "keywords",
        message: `Already in name/subtitle (wasted in keyword field): ${dupes.join(", ")}.`,
        basis: "apple",
      });

    const seen = new Map<string, number>();
    for (const t of kwTokens) seen.set(t, (seen.get(t) ?? 0) + 1);
    const repeated = [...seen].filter(([, n]) => n > 1).map(([t]) => t);
    if (repeated.length)
      issues.push({
        level: "warn",
        field: "keywords",
        message: `Repeated inside the keyword field: ${repeated.join(", ")}.`,
        basis: "apple",
      });

    const bySingular = new Map<string, string[]>();
    [...new Set([...kwTokens, ...nameSub])].forEach((t) => {
      const k = singular(t);
      bySingular.set(k, [...(bySingular.get(k) ?? []), t]);
    });
    const plurals = [...bySingular.values()].filter((v) => v.length > 1);
    if (plurals.length)
      issues.push({
        level: "info",
        field: "keywords",
        // developer.apple.com/app-store/search/: plurals of words you've already included "are considered duplicates"
        message: `Singular + plural both present (${plurals.map((p) => p.join("/")).join(", ")}). Apple counts a plural of a word you already use as a duplicate, so one is wasted.`,
        basis: "apple",
      });

    const filler = kwTokens.filter((t) => ["app", "apps", "free", "iphone", "ipad", "best"].includes(t));
    if (filler.length)
      issues.push({
        level: "info",
        field: "keywords",
        message: `Low-value words in keyword field: ${[...new Set(filler)].join(", ")}.`,
        basis: "observed",
      });
  }

  const uncovered = tracked.filter((t) => !placement(t, f).covered);
  if (uncovered.length && (f.keywords || f.subtitle)) {
    issues.push({
      level: "warn",
      field: "all",
      message: `${uncovered.length} tracked keyword${uncovered.length > 1 ? "s are" : " is"} missing words from your name, subtitle and keyword field: ${uncovered.slice(0, 8).join(", ")}${uncovered.length > 8 ? "…" : ""}.`,
      basis: "apple",
    });
  }

  return { issues, usage };
}

/** Candidate terms from competitor titles/subtitles (higher signal than descriptions). */
export function phrasesFrom(text: string | null | undefined, maxN = 3): string[] {
  const parts = (text ?? "").split(/[-–—:|•,&+/(){}[\]]/);
  const out = new Set<string>();
  for (const part of parts) {
    const ws = tokens(part);
    for (let n = 1; n <= maxN; n++) {
      for (let i = 0; i + n <= ws.length; i++) {
        const gram = ws.slice(i, i + n);
        if (!isUseful(gram[0]) || !isUseful(gram[gram.length - 1])) continue;
        if (gram.some((g) => JUNK.test(g))) continue;
        out.add(gram.join(" "));
      }
    }
  }
  return [...out];
}
