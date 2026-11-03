import { describe, expect, it } from "vitest";
import {
  catalogUrl,
  extractServerData,
  hintsHeaders,
  hintsUrl,
  itunesSearchUrl,
  parseCatalog,
  parseHints,
  parseItunes,
  parseSearchPage,
  probeLengths,
  STOREFRONTS,
  webSearchUrl,
} from "../src/apple";

// Fixtures are hand-written minimal shapes of each response (no copied Apple content).

describe("iTunes Search / Lookup", () => {
  it("builds URLs", () => {
    expect(itunesSearchUrl("habit tracker", "us")).toContain("term=habit+tracker");
    expect(itunesSearchUrl("habit tracker", "us")).toContain("country=us");
  });

  it("keeps software results only and drops descriptions unless asked", () => {
    const json = {
      results: [
        { wrapperType: "software", trackId: 1, trackName: "One", description: "long text" },
        { wrapperType: "artist", trackId: 2, trackName: "Not an app" },
        { kind: "software", trackId: 3, trackName: "Three" },
      ],
    };
    const apps = parseItunes(json as never);
    expect(apps.map((a) => a.trackId)).toEqual([1, 3]);
    expect(apps[0].description).toBeUndefined();
    expect(parseItunes(json as never, true)[0].description).toBe("long text");
  });
});

describe("autocomplete hints", () => {
  it("sends the storefront header (Apple returns an empty list without it)", () => {
    expect(hintsHeaders("us")["X-Apple-Store-Front"]).toBe(`${STOREFRONTS.us.id}-1,29`);
    expect(hintsUrl("hab")).toContain("term=hab");
  });

  it("parses the plist shape", () => {
    const body = `<plist><dict><key>hints</key><array>
      <dict><key>term</key><string>Habit Tracker</string><key>priority</key><integer>3</integer></dict>
      <dict><key>term</key><string>habits &amp; goals</string></dict>
    </array></dict></plist>`;
    expect(parseHints(body)).toEqual([
      { term: "habit tracker", priority: 3 },
      { term: "habits & goals", priority: undefined },
    ]);
  });

  it("parses the JSON shape and tolerates garbage", () => {
    expect(parseHints(JSON.stringify({ hints: [{ term: "Budget" }] }))).toEqual([{ term: "budget", priority: undefined }]);
    expect(parseHints("{not json")).toEqual([]);
  });

  it("probes a few prefix lengths, always ending at the full length", () => {
    expect(probeLengths(2)).toEqual([1, 2]);
    expect(probeLengths(13)).toEqual([1, 2, 3, 4, 6, 9, 13]);
    expect(probeLengths(20).at(-1)).toBe(20);
  });
});

describe("web search page", () => {
  const page = (data: unknown) =>
    `<html><script type="application/json" id="serialized-server-data">${JSON.stringify(data)}</script></html>`;

  it("reads apps in App Store order, skipping editorial cards and duplicates", () => {
    const html = page({
      data: [
        {
          data: {
            shelves: [
              {
                items: [
                  { lockup: { adamId: "11", title: "First", subtitle: "Sub", rating: 4.5, ratingCount: "1200" } },
                  { $kind: "editorial" },
                  { appEvent: { lockup: { adamId: 22, title: "Event app" } } },
                  { lockup: { adamId: "11", title: "First again" } },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(parseSearchPage(html)).toEqual([
      { id: 11, title: "First", subtitle: "Sub", rating: 4.5, ratingCount: 1200, kind: "app" },
      { id: 22, title: "Event app", subtitle: null, rating: null, ratingCount: null, kind: "event" },
    ]);
  });

  it("throws a clear error when Apple changes the page", () => {
    expect(() => parseSearchPage("<html></html>")).toThrow(/serialized-server-data/);
    expect(extractServerData("<html></html>")).toBeNull();
  });

  it("builds the URL per storefront", () => {
    expect(webSearchUrl("a b", "gb")).toBe("https://apps.apple.com/gb/iphone/search?term=a%20b");
  });
});

describe("catalog proxy", () => {
  it("maps subtitle, ratings histogram and chart position", () => {
    const json = {
      data: [
        {
          id: "5",
          attributes: {
            name: "Five",
            platformAttributes: { ios: { subtitle: "Do things" } },
            userRating: { ratingCount: 10, ratingCountList: [1, 1, 1, 2, 5] },
            chartPositions: { appStore: { genreName: "Health", position: 7, chart: "top-free" } },
          },
        },
      ],
    };
    expect(parseCatalog(json)).toEqual([
      {
        id: 5,
        name: "Five",
        subtitle: "Do things",
        ratingCount: 10,
        ratingHistogram: [1, 1, 1, 2, 5],
        chart: { genre: "Health", position: 7, chart: "top-free" },
      },
    ]);
    expect(catalogUrl([1, 2], "us")).toContain("ids=1,2");
  });
});
