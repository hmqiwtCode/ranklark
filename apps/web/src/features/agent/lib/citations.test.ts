import { describe, expect, it } from "vitest";
import { checkFinding, extractNumbers, numberMatches } from "./citations";
import { app, score, scoreFact } from "./fixtures.test-util";

const facts = [
  scoreFact(
    "F1",
    score("habit tracker", {
      popularity: 62,
      difficulty: 71,
      opportunity: 25,
      yourRank: { rank: 14, approx: true },
      top: [app(1, "Streaks", 118836), app(2, "Habitify", 1234567)],
    }),
    '"habit tracker": popularity 62 (estimate), difficulty 71, opportunity 25',
  ),
  scoreFact("F2", score("habit app", { popularity: 33, difficulty: 55, opportunity: 30 })),
];

describe("extractNumbers", () => {
  it("reads the styles people write", () => {
    const got = extractNumbers("Ranks #14, has 118,836 ratings (120k), 1.2M installs, 45% share, rated 4.8 and 5 million users");
    expect(got.map((n) => [n.raw, n.base, n.scale, n.decimals, n.percent])).toEqual([
      ["14", 14, 1, 0, false],
      ["118,836", 118836, 1, 0, false],
      ["120k", 120, 1000, 0, false],
      ["1.2M", 1.2, 1e6, 1, false],
      ["45%", 45, 1, 0, true],
      ["4.8", 4.8, 1, 1, false],
      ["5 million", 5, 1e6, 0, false],
    ]);
  });

  it("ignores digits glued to letters (fact IDs, multipliers)", () => {
    expect(extractNumbers("Per F12 and N3 this is 3x better")).toEqual([]);
  });
});

describe("numberMatches", () => {
  const n = (s: string) => extractNumbers(s)[0];
  it("allows rounding and truncation to the written precision", () => {
    expect(numberMatches(n("4.8"), 4.83087)).toBe(true);
    expect(numberMatches(n("119k"), 118836)).toBe(true);
    expect(numberMatches(n("118k"), 118836)).toBe(true);
    expect(numberMatches(n("1.2M"), 1234567)).toBe(true);
    expect(numberMatches(n("62"), 62)).toBe(true);
    expect(numberMatches(n("63"), 62)).toBe(false);
    expect(numberMatches(n("2M"), 118836)).toBe(false);
  });
  it("matches percentages against 0–100 values and fractions", () => {
    expect(numberMatches(n("25%"), 25)).toBe(true);
    expect(numberMatches(n("25%"), 0.25)).toBe(true);
  });
});

describe("checkFinding", () => {
  it("rejects findings without citations", () => {
    const r = checkFinding({ claim: "habit tracker is great", terms: ["habit tracker"], factIds: [] }, facts);
    expect(r.verdict).toEqual({ status: "unsupported", note: "Cites no facts.", by: "rules" });
  });

  it("rejects findings that cite unknown facts", () => {
    const r = checkFinding({ claim: "habit tracker is great", terms: [], factIds: ["F1", "F99"] }, facts);
    expect(r.verdict?.status).toBe("unsupported");
    expect(r.verdict?.by).toBe("rules");
    expect(r.unknownFactIds).toEqual(["F99"]);
  });

  it("passes numbers found in the cited facts, including nested competitor data and the summary", () => {
    const r = checkFinding(
      {
        claim: "habit tracker has popularity 62 but difficulty 71; Streaks has ~119k ratings and you rank #14.",
        terms: ["habit tracker"],
        factIds: ["F1"],
      },
      facts,
    );
    expect(r.verdict).toBeNull();
    expect(r.unmatchedNumbers).toEqual([]);
  });

  it("returns numbers that appear in none of the cited facts, without auto-rejecting", () => {
    // 33 exists, but only in F2, which this finding doesn't cite
    const r = checkFinding({ claim: "habit tracker has popularity 80 and beats habit app at 33", terms: [], factIds: ["F1"] }, facts);
    expect(r.verdict).toBeNull();
    expect(r.unmatchedNumbers).toEqual(["80", "33"]);
  });

  it("ignores numbers that are part of the finding's own keywords", () => {
    const f = [scoreFact("F1", score("2048 puzzle", { popularity: 40 }))];
    const r = checkFinding({ claim: "2048 puzzle has popularity 40", terms: ["2048 puzzle"], factIds: ["F1"] }, f);
    expect(r.unmatchedNumbers).toEqual([]);
  });

  it("accepts a Map of facts", () => {
    const r = checkFinding({ claim: "difficulty 55", terms: [], factIds: ["F2"] }, new Map(facts.map((x) => [x.id, x])));
    expect(r.unmatchedNumbers).toEqual([]);
  });
});
