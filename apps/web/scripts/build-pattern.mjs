/**
 * Regenerasi `public/pattern.svg` dari sumber aslinya.
 *
 * `assets/latar-belakang.svg` diekspor CorelDraw sebagai UTF-16 dengan
 * DOCTYPE internal subset dan `opacity:0.05` yang menempel di root. Browser
 * modern menolak kombinasi itu pada sebagian konteks, dan opacity bawaan
 * membuat motif tidak bisa dipakai sebagai CSS mask.
 *
 * Hasil: UTF-8, tanpa DOCTYPE, tanpa opacity, isi hitam penuh agar bisa
 * dipakai `mask-image` (warna diambil dari token CSS).
 *
 * Jalankan: bun run pattern
 */
import { readFile, writeFile } from "node:fs/promises";

const source = "assets/latar-belakang.svg";
const target = "public/pattern.svg";

const raw = await readFile(source);
let svg = new TextDecoder("utf-16le").decode(raw);

// BOM UTF-16LE harus dibuang agar TextDecoder tidak menyisakan karakter nol.
if (svg.charCodeAt(0) === 0xfeff) svg = svg.slice(1);

svg = svg
  .replace(/<\?xml[^>]*\?>\s*/, '<?xml version="1.0" encoding="UTF-8"?>\n')
  .replace(/<!DOCTYPE[\s\S]*?\]>\s*/, "")
  .replace(/<!\s*DOCTYPE[^>]*>\s*/i, "")
  .replace(/\.fil0\s*\{[^}]*\}/, ".fil0 {fill:#000000}")
  .replace(/\s*opacity:0?\.\d+;?/g, "")
  .replace(/width="600px"\s+height="600px"/, 'width="600" height="600"');

await writeFile(target, `${svg.trim()}\n`, "utf-8");
console.log(`pattern.svg ditulis (${svg.length} karakter)`);
