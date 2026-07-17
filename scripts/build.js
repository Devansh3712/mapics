/**
 * mapics build step.
 *
 * Scans ./assets for photos (HEIC/HEIF, and also JPG/PNG if you drop those in),
 * extracts GPS coordinates + capture date from EXIF, converts each photo into a
 * web-friendly full-size JPEG plus a small thumbnail, merges in your hand-written
 * captions from ./captions.json, and writes:
 *
 *   site/data.json      -> array consumed by the frontend
 *   site/photos/*.jpg   -> converted full images + thumbnails
 *
 * Run with:  npm run build
 *
 * Photos without GPS data are skipped with a warning (they can't be placed on a map).
 */

import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import exifr from "exifr";
import sharp from "sharp";
import heicConvert from "heic-convert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "assets");
const SITE_DIR = path.join(ROOT, "site");
const PHOTOS_OUT = path.join(SITE_DIR, "photos");
const DATA_OUT = path.join(SITE_DIR, "data.json");
const CAPTIONS_FILE = path.join(ROOT, "captions.json");

const FULL_MAX = 1600; // longest edge of the full/polaroid image
const THUMB_MAX = 160; // longest edge of the map thumbnail
const JPEG_QUALITY = 82;

const HEIC_EXTS = new Set([".heic", ".heif"]);
const OTHER_IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function slugify(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

async function loadCaptions() {
  if (!existsSync(CAPTIONS_FILE)) {
    console.warn("⚠  No captions.json found — polaroids will have empty messages.");
    return {};
  }
  try {
    const raw = await readFile(CAPTIONS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    // Build a case-insensitive lookup by filename.
    const map = new Map();
    for (const [k, v] of Object.entries(parsed)) {
      map.set(k.toLowerCase(), v);
    }
    return map;
  } catch (err) {
    console.error("✖  Failed to parse captions.json:", err.message);
    return new Map();
  }
}

/** Return a decoded image buffer (JPEG-ish) that sharp can process. */
async function toProcessableBuffer(filePath, ext, inputBuffer) {
  if (HEIC_EXTS.has(ext)) {
    // Prefer sharp if it was compiled with HEIF support; otherwise fall back to
    // the pure-JS heic-convert (slower but dependency-free).
    try {
      // Probing metadata throws if HEIF support is missing.
      await sharp(inputBuffer).metadata();
      return inputBuffer; // sharp can handle it directly
    } catch {
      const out = await heicConvert({
        buffer: inputBuffer,
        format: "JPEG",
        quality: 0.92,
      });
      return Buffer.from(out);
    }
  }
  return inputBuffer;
}

function extractLatLng(gps) {
  if (!gps) return null;
  const lat = gps.latitude;
  const lng = gps.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

async function main() {
  if (!existsSync(ASSETS_DIR)) {
    console.error(`✖  assets/ directory not found at ${ASSETS_DIR}`);
    process.exit(1);
  }

  // Fresh photos output each build.
  await rm(PHOTOS_OUT, { recursive: true, force: true });
  await mkdir(PHOTOS_OUT, { recursive: true });

  const captions = await loadCaptions();
  const entries = (await readdir(ASSETS_DIR)).filter((f) => !f.startsWith("."));

  const results = [];
  const usedSlugs = new Set();
  let skipped = 0;

  for (const file of entries) {
    const ext = path.extname(file).toLowerCase();
    if (!HEIC_EXTS.has(ext) && !OTHER_IMG_EXTS.has(ext)) continue;

    const filePath = path.join(ASSETS_DIR, file);
    try {
      const inputBuffer = await readFile(filePath);

      // 1. EXIF: GPS + date. exifr reads HEIC EXIF directly.
      // NOTE: do NOT use `pick` here — `latitude`/`longitude` are computed fields
      // that get filtered out by `pick`, leaving photos wrongly marked as ungeotagged.
      const meta = await exifr.parse(inputBuffer, {
        gps: true,
        tiff: true,
        exif: true,
      }).catch(() => null);

      const coords = extractLatLng(meta);
      if (!coords) {
        console.warn(`⚠  Skipping "${file}" — no GPS coordinates in EXIF.`);
        skipped++;
        continue;
      }

      // 2. Decode to a sharp-processable buffer.
      const processable = await toProcessableBuffer(filePath, ext, inputBuffer);

      // 3. Unique output slug.
      let slug = slugify(file);
      let n = 1;
      while (usedSlugs.has(slug)) slug = `${slugify(file)}_${n++}`;
      usedSlugs.add(slug);

      const fullName = `${slug}.jpg`;
      const thumbName = `${slug}_thumb.jpg`;

      // 4. Write full + thumbnail (auto-rotate to respect EXIF orientation).
      const base = sharp(processable).rotate();
      await base
        .clone()
        .resize({ width: FULL_MAX, height: FULL_MAX, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(path.join(PHOTOS_OUT, fullName));

      await base
        .clone()
        .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "cover", position: "attention" })
        .jpeg({ quality: 78, mozjpeg: true })
        .toFile(path.join(PHOTOS_OUT, thumbName));

      const date = meta?.DateTimeOriginal || meta?.CreateDate || null;
      const caption = captions.get?.(file.toLowerCase()) ?? "";

      results.push({
        id: slug,
        file,
        lat: coords.lat,
        lng: coords.lng,
        date: date ? new Date(date).toISOString() : null,
        caption,
        full: `photos/${fullName}`,
        thumb: `photos/${thumbName}`,
      });

      console.log(`✔  ${file} → (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`);
    } catch (err) {
      console.error(`✖  Error processing "${file}":`, err.message);
      skipped++;
    }
  }

  // Sort by date (oldest first) for stable output.
  results.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  await writeFile(DATA_OUT, JSON.stringify(results, null, 2) + "\n", "utf8");

  console.log("");
  console.log(`Done. ${results.length} photo(s) mapped, ${skipped} skipped.`);
  console.log(`→ ${path.relative(ROOT, DATA_OUT)}`);
  if (results.length === 0) {
    console.log("");
    console.log("No geotagged photos found. Drop HEIC photos into assets/ and re-run.");
    console.log("The site will show a friendly empty state until then.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
