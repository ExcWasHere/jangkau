/**
 * Placeholder. `bun run db:types` menimpa file ini dengan tipe hasil
 * generate dari Supabase (`supabase gen types typescript`).
 *
 * Tipe tabel sengaja tidak ditulis tangan: salinan manual pasti
 * menyimpang dari migrasi.
 */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
