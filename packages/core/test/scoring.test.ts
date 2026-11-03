import { describe, expect, it } from "vitest";
import { ctrWeight, difficulty, hintsScore, opportunity, type SerpApp, serpRank, titleMatch, visibility } from "../src/scoring";

const app = (ratingCount: number, match: 0 | 0.5 | 1, rating = 4.5): SerpApp => ({
  id: ratingCount,
  name: "x",
  icon: null,
  seller: null,
  rating,
  ratingCount,
  titleMatch: match,
});

describe("scoring", () => {
  it("titleMatch: full / partial / none", () => {
    expect(titleMatch("habit tracker", "Best Habit Tracker")).toBe(1);
    expect(titleMatch("habit tracker", "Habit Coach")).toBe(0.5);
    expect(titleMatch("habit tracker", "Budget")).toBe(0);
  });

  it("difficulty rises with strong, relevant competitors and is scaled down when few apps compete", () => {
    const strong = Array.from({ length: 10 }, () => app(100_000, 1));
    const weak = Array.from({ length: 10 }, () => app(5, 0, 3));
    expect(difficulty(strong, 200)).toBeGreaterThan(90);
    expect(difficulty(weak, 200)).toBeLessThan(30);
    expect(difficulty(strong.slice(0, 2), 2)).toBeLessThan(difficulty(strong, 200));
    expect(difficulty([], 0)).toBe(0);
  });

  it("ctrWeight is 1 at #1 and falls off steeply", () => {
    expect(ctrWeight(1)).toBe(1);
    expect(ctrWeight(2)).toBeLessThan(0.25);
    expect(ctrWeight(null)).toBe(0);
    expect(ctrWeight(500)).toBe(0);
  });

  it("visibility is 100 when ranking #1 everywhere", () => {
    expect(visibility([{ rank: 1, popularity: 50 }])).toBe(100);
    expect(visibility([{ rank: null, popularity: 50 }])).toBe(0);
  });

  it("opportunity needs real signals and discounts terms you already own", () => {
    expect(opportunity(null, 10, null)).toBeNull();
    expect(opportunity(81, 19, 2)).toBeLessThan(opportunity(81, 19, 20)!);
  });

  it("hintsScore: unsuggested terms get 5, early suggestions score high", () => {
    expect(hintsScore(null, null, 0)).toBe(5);
    expect(hintsScore(2, 1, 10)).toBe(100);
    expect(hintsScore(9, 5, 10)).toBeLessThan(hintsScore(3, 5, 10));
  });

  it("serpRank prefers the web order and clamps API positions beyond the web window", () => {
    const web = [5, 6, 7];
    expect(serpRank(6, [9, 6, 5], web)).toEqual({ rank: 2, rankWeb: 2, rankApi: 2, approx: false });
    expect(serpRank(9, [9, 6, 5], web)).toEqual({ rank: 4, rankWeb: null, rankApi: 1, approx: true });
    expect(serpRank(9, [9], null)).toEqual({ rank: 1, rankWeb: null, rankApi: 1, approx: false });
    expect(serpRank(42, [9], web).rank).toBeNull();
  });
});
