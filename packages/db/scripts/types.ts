/**
 * Membuat `src/database.types.ts` dari database yang sedang terhubung.
 *
 *   bun run scripts/types.ts
 *
 * Supabase CLI (`supabase gen types`) menghasilkan bentuk yang sama, tapi butuh
 * login + `link` per mesin. Skrip ini hanya membaca information_schema sehingga
 * tipe selalu sinkron dengan database yang benar-benar dipakai.
 */
import { SQL } from "bun";
import { writeFile } from "node:fs/promises";

const url = process.env.DATABASE_URL ?? buildUrl();
if (!url) {
  console.error("DATABASE_URL belum diset. Lihat scripts/apply.ts untuk variabel yang diterima.");
  process.exit(1);
}

function buildUrl(): string | null {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) return null;
  const host = process.env.SUPABASE_DB_HOST ?? "aws-1-ap-northeast-1.pooler.supabase.com";
  return `postgres://${encodeURIComponent(`postgres.${ref}`)}:${encodeURIComponent(password)}@${host}:5432/postgres?sslmode=require`;
}

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  is_generated: "NEVER" | "ALWAYS";
};

const sql = new SQL({ url, max: 1, connection_timeout: 30 });

const enums = (await sql`
  select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public'
   group by t.typname
   order by t.typname
`) as { name: string; labels: string[] }[];

const columns = (await sql`
  select c.table_name, c.column_name, c.data_type, c.udt_name,
         c.is_nullable, c.column_default, c.is_generated
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public'
     and t.table_type = 'BASE TABLE'
     and c.table_name <> 'spatial_ref_sys'
   order by c.table_name, c.ordinal_position
`) as ColumnRow[];

const viewColumns = (await sql`
  select c.table_name, c.column_name, c.data_type, c.udt_name,
         c.is_nullable, c.column_default, c.is_generated
    from information_schema.columns c
    join information_schema.views v
      on v.table_schema = c.table_schema and v.table_name = c.table_name
   where c.table_schema = 'public'
   order by c.table_name, c.ordinal_position
`) as ColumnRow[];

const enumTypeName = new Map(enums.map((e) => [e.name, pascal(e.name)]));

function pascal(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Memetakan tipe Postgres ke tipe TypeScript, termasuk nullability. */
function tsType(column: ColumnRow): string {
  const base = baseType(column);
  if (base === "unknown") return "unknown";
  return column.is_nullable === "YES" ? `${base} | null` : base;
}

function baseType(column: ColumnRow): string {
  if (column.data_type === "ARRAY") {
    const element = column.udt_name.replace(/^_/, "");
    return `${enumTypeName.get(element) ?? scalarType(element)}[]`;
  }
  if (column.data_type === "USER-DEFINED") {
    return enumTypeName.get(column.udt_name) ?? "unknown";
  }
  return scalarType(column.udt_name);
}

function scalarType(udt: string): string {
  switch (udt) {
    case "uuid":
    case "text":
    case "varchar":
    case "bpchar":
    case "citext":
      return "string";
    case "int2":
    case "int4":
    case "int8":
    case "float4":
    case "float8":
    case "numeric":
    case "money":
      return "number";
    case "bool":
      return "boolean";
    case "json":
    case "jsonb":
      return "Json";
    case "timestamptz":
    case "timestamp":
    case "date":
    case "time":
    case "timetz":
      return "string";
    case "bytea":
      return "Uint8Array";
    case "geography":
    case "geometry":
    case "vector":
      return "unknown";
    default:
      return "unknown";
  }
}

/** Kolom wajib saat insert: not null, tanpa default, bukan kolom generated. */
function isInsertRequired(column: ColumnRow): boolean {
  return (
    column.is_nullable === "NO" &&
    column.column_default === null &&
    column.is_generated === "NEVER"
  );
}

function groupByTable(rows: ColumnRow[]): Map<string, ColumnRow[]> {
  const map = new Map<string, ColumnRow[]>();
  for (const row of rows) {
    const list = map.get(row.table_name) ?? [];
    list.push(row);
    map.set(row.table_name, list);
  }
  return map;
}

function renderRow(columns: ColumnRow[]): string {
  return columns
    .map((c) => `  ${c.column_name}: ${tsType(c)};`)
    .join("\n");
}

function renderEntity(name: string, columns: ColumnRow[]): string {
  const required = columns.filter(isInsertRequired);
  const insertPick =
    required.length > 0
      ? `Pick<${pascal(name)}Row, ${required.map((c) => `"${c.column_name}"`).join(" | ")}>`
      : "Record<never, never>";

  return [
    `    ${name}: {`,
    `      Row: ${pascal(name)}Row;`,
    `      Insert: ${insertPick} & Partial<${pascal(name)}Row>;`,
    `      Update: Partial<${pascal(name)}Row>;`,
    `    };`,
  ].join("\n");
}

const tables = groupByTable(columns);
const views = groupByTable(viewColumns);

const header = `/**
 * Tipe database Jangkau.
 *
 * DIBUAT OTOMATIS oleh packages/db/scripts/types.ts — jangan disunting manual.
 * Regenerasi setelah migrasi: bun run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

`;

const enumBlock = enums
  .map((e) => `export type ${enumTypeName.get(e.name)} = ${e.labels.map((l) => `"${l}"`).join(" | ")};`)
  .join("\n");

const rowBlocks = [...tables.entries(), ...views.entries()]
  .map(([name, cols]) => `export interface ${pascal(name)}Row {\n${renderRow(cols)}\n}`)
  .join("\n\n");

const databaseBlock = [
  "export interface Database {",
  "  public: {",
  "    Tables: {",
  [...tables.entries()].map(([name, cols]) => renderEntity(name, cols)).join("\n"),
  "    };",
  "    Views: {",
  [...views.entries()].map(([name, cols]) => renderEntity(name, cols)).join("\n"),
  "    };",
  "    Enums: {",
  enums.map((e) => `      ${e.name}: ${enumTypeName.get(e.name)};`).join("\n"),
  "    };",
  "  };",
  "}",
  "",
].join("\n");

await writeFile("src/database.types.ts", [header, enumBlock, "", rowBlocks, "", databaseBlock].join("\n"), "utf8");
await sql.close();

console.log(`OK src/database.types.ts — ${tables.size} tabel, ${views.size} view, ${enums.length} enum`);
