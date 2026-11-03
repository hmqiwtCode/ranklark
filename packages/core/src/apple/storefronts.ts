/**
 * Storefronts we support, with:
 *  - id:      the number sent in X-Apple-Store-Front (search hints only)
 *  - locales: App Store Connect locales shown in that storefront — default language first, then Apple's
 *             "additional supported languages". Source: ASC Help › Reference › App Store localizations
 *             (extracted 2026-11-02). Apple frames it as display, AppTweak's fake-keyword tests show the
 *             same sets are indexed for search (e.g. US also indexes es-MX, vi, ko…).
 */
export const STOREFRONTS: Record<string, { name: string; flag: string; id: number; locales: string[] }> = {
  us: {
    name: "United States",
    flag: "🇺🇸",
    id: 143441,
    locales: ["en-US", "es-MX", "zh-Hans", "zh-Hant", "fr-FR", "ko", "pt-BR", "ru", "ar-SA", "vi"],
  },
  gb: { name: "United Kingdom", flag: "🇬🇧", id: 143444, locales: ["en-GB"] },
  ca: { name: "Canada", flag: "🇨🇦", id: 143455, locales: ["en-CA", "fr-CA"] },
  au: { name: "Australia", flag: "🇦🇺", id: 143460, locales: ["en-AU", "en-GB"] },
  vn: { name: "Vietnam", flag: "🇻🇳", id: 143471, locales: ["en-GB", "vi"] },
  jp: { name: "Japan", flag: "🇯🇵", id: 143462, locales: ["ja", "en-US"] },
  kr: { name: "South Korea", flag: "🇰🇷", id: 143466, locales: ["ko", "en-GB"] },
  de: { name: "Germany", flag: "🇩🇪", id: 143443, locales: ["de-DE", "en-GB"] },
  fr: { name: "France", flag: "🇫🇷", id: 143442, locales: ["fr-FR", "en-GB"] },
  es: { name: "Spain", flag: "🇪🇸", id: 143454, locales: ["es-ES", "ca", "en-GB"] },
  it: { name: "Italy", flag: "🇮🇹", id: 143450, locales: ["it", "en-GB"] },
  br: { name: "Brazil", flag: "🇧🇷", id: 143503, locales: ["pt-BR", "en-GB"] },
  mx: { name: "Mexico", flag: "🇲🇽", id: 143468, locales: ["es-MX", "en-GB"] },
  in: { name: "India", flag: "🇮🇳", id: 143467, locales: ["en-GB", "hi", "bn", "gu", "kn", "ml", "mr", "or", "pa", "ta", "te", "ur"] },
  id: { name: "Indonesia", flag: "🇮🇩", id: 143476, locales: ["en-GB", "id"] },
  th: { name: "Thailand", flag: "🇹🇭", id: 143475, locales: ["en-GB", "th"] },
  ph: { name: "Philippines", flag: "🇵🇭", id: 143474, locales: ["en-GB"] },
  sg: { name: "Singapore", flag: "🇸🇬", id: 143464, locales: ["en-GB", "zh-Hans"] },
  tw: { name: "Taiwan", flag: "🇹🇼", id: 143470, locales: ["zh-Hant", "en-GB"] },
  nl: { name: "Netherlands", flag: "🇳🇱", id: 143452, locales: ["nl-NL", "en-GB"] },
  se: { name: "Sweden", flag: "🇸🇪", id: 143456, locales: ["sv", "en-GB"] },
  tr: { name: "Türkiye", flag: "🇹🇷", id: 143480, locales: ["en-GB", "tr"] },
};

export const COUNTRY_CODES = Object.keys(STOREFRONTS);
export const isCountry = (c: string | null | undefined): c is string => !!c && c in STOREFRONTS;

/** Pick the localization that feeds a storefront's main listing, given the locales an app actually has. */
export function primaryLocaleFor(country: string, available: string[]): string | null {
  const prefs = STOREFRONTS[country]?.locales ?? ["en-US"];
  return prefs.find((l) => available.includes(l)) ?? (available.includes("en-US") ? "en-US" : (available[0] ?? null));
}
