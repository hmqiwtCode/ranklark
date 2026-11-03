/** Row shapes of the SQLite tables (see migrations.ts). */
export type AppRow = {
  id: number;
  bundle_id: string | null;
  name: string;
  subtitle: string | null;
  subtitle_source: string | null;
  chart_json: string | null;
  seller: string | null;
  icon: string | null;
  genre: string | null;
  genre_id: number | null;
  rating: number | null;
  rating_count: number;
  price: number;
  version: string | null;
  released_at: string | null;
  url: string | null;
  description: string | null;
  keywords_field: string | null;
  keywords_source: string | null;
  primary_country: string;
  is_mine: number;
  added_at: string;
  updated_at: string;
};
