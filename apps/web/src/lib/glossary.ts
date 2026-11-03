/**
 * Plain-language explanations shown behind every "?" in the app.
 * good: which direction is better for YOU (shown as a hint line).
 */
export type Term = { title: string; body: string; good?: "high" | "low"; source?: string };

export const GLOSSARY: Record<string, Term> = {
  keyword: { title: "Keyword", body: "A word or phrase people type into the App Store search box." },
  popularity: {
    title: "Popularity (0–100)",
    body: "How many people search this keyword. EST. = our estimate from Apple's search suggestions (if Apple suggests it after only a few letters, many people search it). APPLE ADS = Apple's own number. 5 = Apple never suggests it.",
    good: "high",
    source: "Apple autocomplete or Apple Ads",
  },
  difficulty: {
    title: "Difficulty (0–100)",
    body: "How hard it is to reach the top. We look at the top 10 apps: many ratings, the keyword in their name, and high stars make it harder.",
    good: "low",
    source: "Our formula on Apple's top 10 results",
  },
  opportunity: {
    title: "Opportunity (0–100)",
    body: "Is this keyword worth targeting? Combines popularity (more is better) and difficulty (less is better). Empty for brand names — you can't win another app's name.",
    good: "high",
  },
  brand: {
    title: "Brand",
    body: "This keyword is another app's name (or a company). People type it to find that one app, and Apple doesn't allow other apps' names in your metadata. Skip it.",
  },
  rank: {
    title: "Rank",
    body: "Your position when someone searches this keyword. #3 = third result. ≈45 = roughly 45th (beyond the top 12 we can read exactly). — = not in the top 200.",
    good: "low",
    source: "App Store web search + iTunes Search API",
  },
  delta: {
    title: "Δ 7d (change)",
    body: "How many places your rank moved in the last 7 days. ↑ green = you moved up. ↓ red = you dropped.",
    good: "high",
  },
  trend: {
    title: "Trend",
    body: "Your rank over the last days. Line going up = better rank. Gaps = you were outside the top 200 that day.",
  },
  topApps: {
    title: "Top apps",
    body: "The apps ranking #1–#5 for this keyword right now. Click an icon to see that app. An orange ring = one of your apps.",
  },
  placement: {
    title: "In metadata",
    body: "Where the keyword's words appear in your listing. T = app name (title), S = subtitle, K = hidden keyword field, D = developer name. You can only rank for words that are in these fields. “+1 missing” = one word isn't anywhere.",
  },
  checked: { title: "Checked", body: "When we last searched the App Store for this keyword." },
  visibility: {
    title: "Visibility",
    body: "Of all the taps you could get if you were #1 for every tracked keyword, how many you get today. Being #1 gets far more taps than #3 (≈28% vs ≈3%), so this number is usually small.",
    good: "high",
  },
  top10: {
    title: "Top 10",
    body: "How many of your keywords you rank in the first 10 results for. Most downloads come from here.",
    good: "high",
  },
  top50: { title: "Top 50", body: "How many of your keywords you rank in the first 50 results for.", good: "high" },
  ranked: { title: "Ranked", body: "How many of your keywords you appear for at all (top 200).", good: "high" },
  avgPopularity: {
    title: "Avg popularity",
    body: "Average popularity of the keywords you track. Higher = you're tracking words more people search.",
    good: "high",
  },
  movers: { title: "7-day movers", body: "Number of keywords that went up (green) and down (red) in the last 7 days." },
  bestOpp: { title: "Best opportunities", body: "Your keywords with the highest opportunity score that you don't already own (#1–#3)." },
  competeWith: {
    title: "Who you compete with",
    body: "Apps that show up most often in the top 10 for your keywords. Click to look at them.",
  },
  ratings: {
    title: "Ratings",
    body: "Average stars and total number of ratings on the App Store. More ratings usually means a stronger app.",
    good: "high",
  },
  store: { title: "Store", body: "Which country's App Store. Ranks differ a lot between countries." },
  keywordsCount: { title: "Keywords", body: "How many keywords you track for this app in this country." },
  spark14: { title: "14 days", body: "Your visibility over the last 14 days." },
  foundVia: {
    title: "Found via",
    body: "Where the idea came from. autocomplete = Apple suggested it while typing (#n = its place in the suggestion list). competitor titles = a word used in the names of the top apps.",
  },
  overlap: { title: "Overlap", body: "How many of your keywords this app is also in the top 10 for. Higher = closer competitor." },
  whereTheyRank: { title: "Where they rank", body: "Their position (#) for each of your keywords." },
  appName: { title: "App name (30)", body: "Your app's title. Max 30 characters. The strongest place for keywords." },
  subtitle: { title: "Subtitle (30)", body: "The short line under your app name. Max 30 characters. Also used for search." },
  keywordField: {
    title: "Keyword field (100)",
    body: "A hidden field only Apple sees. Max 100 characters. Separate words with commas, no spaces. Don't repeat words already in the name or subtitle.",
  },
  audit: {
    title: "Audit",
    body: "Problems in your listing. “Apple rule” = from Apple's documentation. “observed” = what ASO testers have seen, not official.",
  },
  coverage: {
    title: "Tracked keyword coverage",
    body: "Which of your keywords have all their words in your name, subtitle or keyword field. Missing words = you can't rank well for that keyword.",
  },
  locale: {
    title: "Localization",
    body: "Each country's App Store also reads some other languages. Example: the US store also reads Spanish (Mexico) and Vietnamese. Each one gives you another name + subtitle + keyword field to fill.",
  },
  coversTracked: { title: "Covers tracked", body: "How many of your tracked keywords this one language version fully covers." },
  candidates: {
    title: "Candidates",
    body: "Keyword ideas. Tick the ones you like, click “Score selected” to measure them, then “Track selected” to follow them every day.",
  },
  chart: { title: "Category chart", body: "The app's position in its category's Top Free / Top Paid chart, from Apple." },
  histogram: { title: "Rating breakdown", body: "How many 5★, 4★ … 1★ ratings the app has, from Apple." },
  ranksFor: {
    title: "Ranks for",
    body: "Keywords we've checked where this app shows up, and its position. Only keywords already searched with this tool are shown.",
  },
  fetchMode: {
    title: "Who calls Apple?",
    body: "server + extension: this server can check ranks itself, and the extension can too (good for one person). extension only (ASO_FETCH_MODE=extension): the server never calls Apple — needed when many people share one hosted dashboard.",
  },
  extHealth: {
    title: "Status",
    body: "Healthy = your keywords were checked today. Checking now = the extension is working. Needs attention = it stopped or Apple asked it to slow down — see the message and Troubleshooting below.",
  },
  checkedToday: {
    title: "Checked today",
    body: "How many of your tracked keywords already have today's App Store results. 100% = everything is up to date.",
    good: "high",
  },
  waiting: {
    title: "Waiting",
    body: "Jobs the extension still has to do: keyword rank checks, popularity lookups and app info updates. It works through them about every hour while Chrome is open.",
    good: "low",
  },
  appleRequests: {
    title: "Apple requests today",
    body: "How many requests your browser(s) sent to Apple today. The extension stops at 2,500 per browser per day and sends at most ~10 per minute, so Apple doesn't block you.",
  },
  devices: {
    title: "Connected browsers",
    body: "Each Chrome where the extension is installed and connected. Remove one and it stops instantly (its key no longer works).",
  },
  lastCheckIn: {
    title: "Last check-in",
    body: "The last time any connected browser talked to this dashboard. It checks in about once an hour while Chrome is open.",
  },
  activity14: {
    title: "Activity · 14 days",
    body: "What the extension delivered each day: blue = keyword rank checks, orange = popularity lookups. Empty days usually mean Chrome wasn't open that day.",
  },
  todayByHour: { title: "Today by hour", body: "When today's results arrived, in your local time. The outlined bar is the current hour." },
  activityFeed: {
    title: "Live activity",
    body: "Every result the extension sent, newest first. Rank checks show where YOUR app landed; popularity shows the new score.",
  },
  sweetSpot: {
    title: "Sweet spot",
    body: "Top-left corner: many searches but few strong competitors. Those keywords are the easiest wins.",
  },
};
