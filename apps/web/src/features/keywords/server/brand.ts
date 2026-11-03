import fs from "node:fs";
import { normalize, STOP_WORDS, tokens } from "@ranklark/core/metadata";
import type { SerpApp } from "@ranklark/core/scoring";

/**
 * Brand / navigational keyword detection (server-only: reads the system word list).
 * A brand keyword is one people type to find ONE specific app. You can't win it, and App Review
 * Guideline 2.3.7 forbids other apps' names in your metadata, so it gets no opportunity score.
 */

let dict: Set<string> | null | undefined;
function dictionary() {
  if (dict !== undefined) return dict;
  try {
    dict = new Set(
      fs
        .readFileSync(/*turbopackIgnore: true*/ process.env.ASO_WORDLIST ?? "/usr/share/dict/words", "utf8")
        .toLowerCase()
        .split("\n"),
    );
  } catch {
    dict = null; // no word list on this machine → rule 3 is skipped (never guess)
  }
  return dict;
}

// common app vocabulary that isn't in an English dictionary but is NOT a brand
const APP_WORDS = new Set(
  "adhd todo todos wifi emoji emojis selfie selfies gif gifs pdf pdfs vpn gps app apps ios sudoku anime manga crypto kpop ocr keto vegan hiit pilates kegel bmi pomodoro journaling ebook ebooks podcast podcasts email emails chatbot widgets ringtone ringtones wallpapers screenshot screenshots livestream esports mahjong solitaire lofi asmr kanban scrabble tetris".split(
    " ",
  ),
);

function isDictionaryWord(w: string): boolean {
  const d = dictionary();
  if (!d) return true;
  if (APP_WORDS.has(w)) return true;
  const c = [w];
  if (w.endsWith("ies")) c.push(`${w.slice(0, -3)}y`);
  if (w.endsWith("es")) c.push(w.slice(0, -2));
  if (w.endsWith("s")) c.push(w.slice(0, -1));
  if (w.endsWith("ing")) c.push(w.slice(0, -3), `${w.slice(0, -3)}e`);
  if (w.endsWith("ed")) c.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith("er")) c.push(w.slice(0, -2));
  return c.some((x) => d.has(x));
}

/** "Fudget: Monthly Budget Planner" → "Fudget". Null when the title has no "Name: descriptor" split. */
function brandSegment(title: string): string | null {
  const parts = title.split(/\s*[:|]\s*|\s+[-–—]\s+/);
  return parts.length > 1 ? parts[0] : null;
}

/** words that matter: "The Habit Burger Grill" ≈ "habit burger grill" */
const core = (s: string | null | undefined) =>
  tokens(s)
    .filter((w) => !STOP_WORDS.has(w))
    .join(" ");

export function isBrandTerm(term: string, top: SerpApp[]): boolean {
  if (!top.length) return false;
  const t = core(term) || normalize(term);
  const words = tokens(term);
  if (!t || !words.length) return false;
  const texts = top.map((a) => new Set(tokens(`${a.name} ${a.subtitle ?? ""}`)));
  const first = top[0];

  // 1) the whole keyword is the start of the #1 app's name or developer, and almost nobody else uses it
  //    — but "weekly budget planner" vs "Weekly: Budget Planner & Bills" is a normal phrase, so a multi-word
  //    keyword of ordinary words only counts when it IS the full app name or the developer's name
  const fullName = core(first.name) === t;
  const byDev = core(first.seller).startsWith(t);
  const owns = core(first.name).startsWith(t) || byDev;
  const distinctive = words.length === 1 || fullName || byDev || !isDictionaryWord(words[0]);
  if (owns && distinctive && top.slice(1).filter((a) => core(`${a.name} ${a.subtitle ?? ""}`).includes(t)).length < 2) return true;

  // 2) coined word (not English): a brand when almost nobody uses it (fampal, centbook), or when it's in
  //    the #1 app's name and only a few copycats share it (habitify, habitkit). Used by 4+ apps = vocabulary.
  const firstName = new Set(tokens(first.name));
  for (const w of words) {
    if (w.length < 4 || STOP_WORDS.has(w) || isDictionaryWord(w)) continue;
    const users = texts.filter((s) => s.has(w)).length;
    if (users <= 1 || (firstName.has(w) && users <= 3)) return true;
    // a one-word made-up search ("habitify", "habitkit") is a brand even when copycats reuse the name;
    // real vocabulary saturates the results (7+ of the top 10 use it)
    if (words.length === 1 && users < 7) return true;
  }

  // 3) brand appended to a generic phrase: "habit tracker ripples" → #1 is "Ripples: Habit Tracker"
  const last = words[words.length - 1];
  const seg = brandSegment(first.name);
  if (words.length > 1 && last.length >= 4 && seg && tokens(seg).includes(last) && texts.slice(1).every((s) => !s.has(last))) {
    const firstWords = texts[0];
    if (words.every((w) => firstWords.has(w))) return true;
  }
  return false;
}
