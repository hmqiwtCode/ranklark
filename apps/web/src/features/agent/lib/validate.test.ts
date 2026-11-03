import { describe, expect, it } from "vitest";
import type { Fact } from "./contract";
import { app, profileFact, score, scoreFact } from "./fixtures.test-util";
import {
  brandContext,
  brandSegment,
  normalizeDraft,
  normalizeKeywordField,
  type RecommendationDraft,
  validateRecommendation,
} from "./validate";

const OWN = 111;
const facts: Fact[] = [
  profileFact("F1", OWN, "Fudget: Budget Planner", "Fudget Ltd"),
  scoreFact(
    "F2",
    score("habit tracker", {
      top: [
        app(1, "Streaks: Habit Tracker"),
        app(2, "Day One: Daily Journal & Diary"),
        app(3, "Habit Tracker - Daily Routine"),
        app(4, "Simple Habit Tracker | Goals"),
        app(5, "Habit List"),
        app(OWN, "Fudget: Budget Planner"),
      ],
    }),
  ),
  scoreFact("F3", score("budget planner")),
  scoreFact("F4", score("streaks", { brand: true, opportunity: null, top: [app(1, "Streaks: Habit Tracker")] })),
  scoreFact("F5", score("fudget", { brand: true, opportunity: null, top: [app(OWN, "Fudget: Budget Planner")] })),
  scoreFact("F6", score("simple planner")),
];

const base: RecommendationDraft = {
  name: "Fudget: Habit Tracker",
  subtitle: "Budget Planner & Daily Goals",
  keywordField: "routine,money,saving,expense,streak",
  alternatives: [{ name: "Fudget - Budget & Habits", subtitle: "Plan money, build routines", why: "shorter" }],
  keywords: [
    { term: "habit tracker", role: "primary", placement: "name", why: "best opportunity", factIds: ["F2"] },
    { term: "budget planner", role: "secondary", placement: "subtitle", why: "core", factIds: ["F3"] },
  ],
  rationale: "r",
};
const input = { appId: OWN, keepBrand: "Fudget" };
const rules = (d: RecommendationDraft, f: Fact[] = facts, i: { appId: number | null; keepBrand: string } = input) =>
  validateRecommendation(d, f, i).issues.map((x) => `${x.level}:${x.rule}`);

describe("normalizeKeywordField", () => {
  it("trims, lowercases, strips spaces after commas and dedupes", () => {
    expect(normalizeKeywordField(" Habit , Tracker,habit,, Daily  Goals ，routine")).toBe("habit,tracker,daily goals,routine");
  });
});

describe("normalizeDraft", () => {
  it("cleans untrusted drafts", () => {
    const d = normalizeDraft({
      ...base,
      name: "  Fudget:   Habit Tracker ",
      keywordField: "A, B",
      keywords: [
        { term: "Habit Tracker!", role: "primary", placement: "name", why: "x", factIds: ["F2", "F2"] },
        { term: "habit tracker", role: "primary", placement: "name", why: "dupe", factIds: [] },
        { term: "x", role: "primary", placement: "name", why: "too short", factIds: [] },
        // biome-ignore lint/suspicious/noExplicitAny: untrusted input
        { term: "budget", role: "weird" as any, placement: "nowhere" as any, why: "", factIds: [] },
      ],
    });
    expect(d.name).toBe("Fudget: Habit Tracker");
    expect(d.keywordField).toBe("a,b");
    expect(d.keywords.map((k) => [k.term, k.role, k.placement, k.factIds])).toEqual([
      ["habit tracker", "primary", "name", ["F2"]],
      ["budget", "secondary", "keywords", []],
    ]);
  });
});

describe("brandSegment / brandContext", () => {
  it("splits Name: descriptor titles", () => {
    expect(brandSegment("Day One: Daily Journal & Diary")).toBe("Day One");
    expect(brandSegment("Habit Tracker - Daily Routine")).toBe("Habit Tracker");
    expect(brandSegment("Habit List")).toBeNull();
  });

  it("keeps distinctive competitor names, drops generic vocabulary and the run's own app", () => {
    const ctx = brandContext(facts, input);
    expect(ctx.brandTerms).toEqual(["streaks"]); // "fudget" is ours
    // "habit tracker" is a scored non-brand keyword; "simple habit tracker" is all vocabulary
    expect(ctx.competitorNames.sort()).toEqual(["day one", "streaks"]);
    // without the non-brand "simple planner" score, "simple" is unknown, so the segment counts as a name
    expect(brandContext(facts.slice(0, 5), input).competitorNames.sort()).toEqual(["day one", "simple habit tracker", "streaks"]);
  });
});

describe("validateRecommendation", () => {
  it("passes a clean recommendation and reports usage", () => {
    const r = validateRecommendation(base, facts, input);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.usage).toEqual({ name: 21, subtitle: 28, keywords: 35, keywordBytes: 35 });
  });

  it("enforces Apple's length limits in code points and reports bytes", () => {
    const r = validateRecommendation(
      { ...base, name: "Fudget: Habit Tracker for Everyone", subtitle: "x".repeat(31), keywordField: "é".repeat(101) },
      facts,
      input,
    );
    const rs = r.issues.map((i) => i.rule);
    expect(rs).toContain("name.length");
    expect(rs).toContain("subtitle.length");
    expect(rs).toContain("keywords.length");
    expect(r.issues.find((i) => i.rule === "keywords.length")?.message).toContain("202 bytes");
    expect(r.usage.keywords).toBe(101);
    expect(r.ok).toBe(false);
    // emoji are one code point each
    expect(validateRecommendation({ ...base, name: `Fudget ${"🔥".repeat(23)}` }, facts, input).usage.name).toBe(30);
  });

  it("flags an empty name and empty optional fields", () => {
    expect(rules({ ...base, name: " ", subtitle: "", keywordField: "" }, facts, { appId: OWN, keepBrand: "" })).toEqual(
      expect.arrayContaining(["error:name.empty", "warn:subtitle.empty", "warn:keywords.empty"]),
    );
  });

  it("flags spaces after commas, repeated tokens and words already in the name", () => {
    const rs = rules({ ...base, keywordField: "money, saving,habit,money app,saving" });
    expect(rs).toEqual(expect.arrayContaining(["warn:keywords.spaces", "warn:keywords.duplicate", "warn:keywords.in_name"]));
  });

  it("warns when the subtitle repeats words from the name (industry-observed)", () => {
    const r = validateRecommendation({ ...base, name: "Fudget: Habit Tracker", subtitle: "Habit Trackers With Friends" }, facts, input);
    const issue = r.issues.find((i) => i.rule === "subtitle.repeats_name");
    expect(issue).toMatchObject({ level: "warn", field: "subtitle" });
    // singular/plural variants count; stop words ("with") don't
    expect(issue?.message).toContain("habit, trackers.");
    expect(issue?.message).toContain("not documented by Apple");
    expect(r.ok).toBe(true);
    expect(rules({ ...base, subtitle: "Plan Your Day With Goals" })).not.toContain("warn:subtitle.repeats_name");
  });

  it("counts singular and plural as the same word in the keyword field (Apple)", () => {
    const r = validateRecommendation({ ...base, keywordField: "climb,climbs,money" }, facts, input);
    expect(r.issues.find((i) => i.rule === "keywords.duplicate")?.message).toContain("climb/climbs");
    // "habits" repeats "Habit" from the name
    const inName = validateRecommendation({ ...base, keywordField: "habits,money" }, facts, input).issues.find(
      (i) => i.rule === "keywords.in_name",
    );
    expect(inName?.message).toContain("habits");
  });

  it("warns when the keyword field repeats the app's category words (Apple)", () => {
    // the fixture profile's category is "Productivity"
    const r = validateRecommendation({ ...base, keywordField: "productivity,money" }, facts, input);
    const issue = r.issues.find((i) => i.rule === "keywords.category");
    expect(issue).toMatchObject({ level: "warn", field: "keywords" });
    expect(issue?.message).toContain("(Productivity)");
    expect(r.ok).toBe(true);
    const p = facts[0];
    if (p.kind !== "app_profile") throw new Error("fixture");
    const health: Fact[] = [{ ...p, data: { ...p.data, genre: "Health & Fitness" } }, ...facts.slice(1)];
    expect(rules({ ...base, keywordField: "fitness,money" }, health)).toContain("warn:keywords.category");
    expect(rules({ ...base, keywordField: "routine,money" }, health)).not.toContain("warn:keywords.category");
    // an idea run has no listing, so there is no category to compare against
    expect(rules({ ...base, keywordField: "productivity,money" }, facts.slice(1), { appId: null, keepBrand: "Fudget" })).not.toContain(
      "warn:keywords.category",
    );
  });

  it("warns about pricing words in the name or subtitle (Guideline 2.3.7)", () => {
    const r = validateRecommendation({ ...base, name: "Fudget: Free Habit Tracker", subtitle: "50% Off, Sales & Discounts" }, facts, input);
    const pricing = r.issues.filter((i) => i.rule === "metadata.pricing");
    expect(pricing.map((i) => [i.level, i.field])).toEqual([
      ["warn", "name"],
      ["warn", "subtitle"],
    ]);
    expect(pricing[0].message).toContain('"free"');
    expect(pricing[1].message).toContain('"sales", "discounts", "% off"');
    expect(pricing[1].message).toContain("2.3.7");
    expect(r.ok).toBe(true);
    // whole words only: "freedom" is not a price
    expect(rules({ ...base, subtitle: "Freedom From Overspending" })).not.toContain("warn:metadata.pricing");
    // a price written with a currency symbol
    const price = validateRecommendation({ ...base, subtitle: "Budgets for only $4.99" }, facts, input).issues.find(
      (i) => i.rule === "metadata.pricing",
    );
    expect(price?.message).toContain('"$4.99"');
    expect(rules({ ...base, name: "Fudget: Budget 2,99 €" })).toContain("warn:metadata.pricing");
    expect(rules({ ...base, subtitle: "Plan 4 Budgets In 1 Place" })).not.toContain("warn:metadata.pricing");
  });

  it("warns about unverifiable claims in the subtitle (Guideline 2.3.7)", () => {
    const claim = (subtitle: string) =>
      validateRecommendation({ ...base, subtitle }, facts, input).issues.find((i) => i.rule === "subtitle.claims");
    expect(claim("#1 Budget Planner")?.message).toContain('"#1"');
    expect(claim("World's Best Budget Planner")?.message).toContain('"world\'s best"');
    expect(claim("The Best Way To Budget")?.message).toContain('"best"');
    expect(claim("Top-Rated Budget Planner")?.message).toContain('"top rated"');
    expect(claim("Number One Budget Planner")?.message).toContain('"number one"');
    expect(claim("#1 Budget Planner")).toMatchObject({ level: "warn", field: "subtitle" });
    expect(claim("#1 Budget Planner")?.message).toContain("2.3.7");
    expect(claim("Budget Planner & Daily Goals")).toBeUndefined();
    expect(claim("Track 10 Goals")).toBeUndefined();
  });

  it('warns about "app" and # or @ in the keyword field (Apple keyword guidance)', () => {
    const issue = validateRecommendation({ ...base, keywordField: "money,budget app,#saving,@home" }, facts, input).issues.find(
      (i) => i.rule === "keywords.app_word",
    );
    expect(issue).toMatchObject({ level: "warn", field: "keywords" });
    expect(issue?.message).toContain('"app", "#", "@"');
    expect(rules({ ...base, keywordField: "money,apps" })).toContain("warn:keywords.app_word");
    expect(rules({ ...base, keywordField: "money,application,happy" })).not.toContain("warn:keywords.app_word");
  });

  it("rejects competitor brand terms and competitor names in any field", () => {
    expect(rules({ ...base, subtitle: "Like Streaks, for budgets" })).toContain("error:brand.competitor");
    expect(rules({ ...base, keywordField: "day,one,money" })).toContain("error:brand.competitor_name");
    expect(rules({ ...base, name: "Fudget Day One Habit" })).toContain("error:brand.competitor_name");
    const r = validateRecommendation({ ...base, keywordField: "streaks,money" }, facts, input);
    expect(r.issues.find((i) => i.rule === "brand.competitor")?.field).toBe("keywords");
    expect(r.ok).toBe(false);
  });

  it("exempts keepBrand, the app's own name and generic competitor phrases", () => {
    // "fudget" is brand-flagged but it's our own app; "habit tracker" is a competitor title segment but generic
    expect(rules({ ...base, name: "Fudget: Habit Tracker" })).toEqual([]);
    // without an own profile, keepBrand alone exempts it
    expect(rules(base, facts.slice(1), { appId: null, keepBrand: "Fudget" })).toEqual([]);
  });

  it("requires keepBrand in the name", () => {
    expect(rules({ ...base, name: "Habit Tracker: Wellness" })).toEqual(["error:brand.keep_missing"]);
  });

  it("checks alternatives too", () => {
    const rs = rules({
      ...base,
      alternatives: [
        { name: "Fudget: The Habit Tracker For Budgets", subtitle: "Streaks for money", why: "" },
        { name: "Habit Money", subtitle: "Plan", why: "" },
      ],
    });
    expect(rs).toEqual(expect.arrayContaining(["error:alternative.length", "error:alternative.brand", "warn:alternative.keep_missing"]));
  });

  it("checks that recommended keywords rest on evidence", () => {
    const rs = rules({
      ...base,
      keywords: [
        { term: "habit tracker", role: "primary", placement: "name", why: "", factIds: ["F2", "F42"] },
        { term: "money saving", role: "long_tail", placement: "keywords", why: "", factIds: [] },
        { term: "streaks", role: "secondary", placement: "keywords", why: "", factIds: ["F4"] },
      ],
    });
    expect(rs).toEqual(expect.arrayContaining(["error:keyword.unknown_fact", "warn:keyword.unscored", "warn:keyword.brand"]));
  });

  it("warns when a placement claim isn't satisfied by the text", () => {
    const rs = rules({
      ...base,
      keywords: [
        { term: "budget planner", role: "primary", placement: "name", why: "", factIds: ["F3"] },
        { term: "expense report", role: "long_tail", placement: "keywords", why: "", factIds: ["F3"] },
        { term: "habit tracker", role: "secondary", placement: "subtitle", why: "", factIds: ["F2"] },
      ],
    });
    expect(rs.filter((r) => r === "warn:keyword.placement")).toHaveLength(3);
    // keywords placement is satisfied by words spread across fields (Apple combines them)
    expect(
      rules({ ...base, keywords: [{ term: "habit routine", role: "long_tail", placement: "keywords", why: "", factIds: ["F2"] }] }),
    ).toEqual(["warn:keyword.unscored"]);
  });
});
