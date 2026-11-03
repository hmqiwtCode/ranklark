import { describe, expect, it } from "vitest";
import { audit, keywordFieldTokens, LIMITS, normalize, phrasesFrom, placement, tokens, utf8Bytes } from "../src/metadata";

describe("tokenizer", () => {
  it("normalizes punctuation, case and apostrophes", () => {
    expect(normalize("  Kid’s  Habit-Tracker! ")).toBe("kids habit tracker");
    expect(tokens("Budget & Bills")).toEqual(["budget", "bills"]);
  });

  it("splits the keyword field on commas", () => {
    expect(keywordFieldTokens("habit,daily goals, streak")).toEqual(["habit", "daily", "goals", "streak"]);
  });

  it("counts UTF-8 bytes (the keyword field limit is bytes, not characters)", () => {
    expect(utf8Bytes("abc")).toBe(3);
    expect(utf8Bytes("é")).toBe(2);
  });
});

describe("placement", () => {
  const fields = { name: "Streakly: Habit Tracker", subtitle: "Daily goals", keywords: "routine,streaks", seller: null };

  it("finds which field covers each word", () => {
    const p = placement("habit tracker", fields);
    expect(p.covered).toBe(true);
    expect(p.exactInTitle).toBe(true);
    expect(p.where).toEqual(["T"]);
  });

  it("lets a plural search term match a singular word, and reports missing words", () => {
    expect(placement("habits", fields).where).toEqual(["T"]);
    expect(placement("routines", fields).where).toEqual(["K"]);
    expect(placement("water reminder", fields).missing).toEqual(["water", "reminder"]);
  });
});

describe("phrasesFrom", () => {
  it("never joins words across separators like & or :", () => {
    const p = phrasesFrom("Glubbo - Drink Water Reminder: Hydration tracker & fish tank");
    expect(p).toContain("hydration tracker");
    expect(p).toContain("fish tank");
    expect(p).not.toContain("tracker fish");
  });
});

describe("audit", () => {
  it("flags an over-long title", () => {
    const { issues, usage } = audit({ name: "x".repeat(LIMITS.name + 1), subtitle: null, keywords: null });
    expect(usage.name.used).toBe(LIMITS.name + 1);
    expect(issues.some((i) => i.field === "name")).toBe(true);
  });
});
