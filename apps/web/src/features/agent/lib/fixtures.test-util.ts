/** Shared test fixtures for the agent's pure modules (not a test file itself). */
import type { CompetitorApp, Fact, KeywordScore } from "./contract";

export const app = (id: number, name: string, ratingCount = 1000, subtitle: string | null = null): CompetitorApp => ({
  id,
  name,
  subtitle,
  rating: 4.5,
  ratingCount,
});

export const score = (term: string, over: Partial<KeywordScore> = {}): KeywordScore => ({
  term,
  popularity: 50,
  popSource: "hints_estimate",
  popReason: "Apple suggests it after 3 letters, at #2",
  difficulty: 40,
  resultCount: 200,
  brand: false,
  opportunity: 55,
  yourRank: null,
  top: [],
  ...over,
});

export const scoreFact = (id: string, data: KeywordScore, summary = `"${data.term}" scored`): Fact => ({
  id,
  nodeId: "w-1-1",
  iteration: 1,
  summary,
  sources: ["itunes_search", "hints_estimate", "ranklark_formula"],
  kind: "keyword_score",
  data,
});

export const profileFact = (id: string, appId: number, name: string, seller = "Acme Labs"): Fact => ({
  id,
  nodeId: "profile",
  iteration: 0,
  summary: `${name} by ${seller}`,
  sources: ["app_store_listing"],
  kind: "app_profile",
  data: {
    appId,
    name,
    subtitle: null,
    seller,
    genre: "Productivity",
    rating: 4.7,
    ratingCount: 12345,
    descriptionExcerpt: "",
    keywordsField: null,
    trackedTerms: [],
  },
});
