/**
 * Reads real duration and pixel dimensions out of the film source files and
 * writes them to src/lib/work/filmMedia.generated.ts.
 *
 * Build-time rather than client-side on purpose: reading metadata in the
 * browser means the first render has no duration and no aspect ratio, so
 * the card shows a placeholder and the player resizes under the user once
 * `loadedmetadata` fires. Generating it here means the correct ratio is in
 * the HTML from the first paint, with no layout shift and no wrong label.
 *
 * Run: npm run film:meta   (and commit the generated file)
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Every film's WEB master, discovered rather than listed — adding a film
// means adding its folder, not editing this file.
//
// Deliberately probes the master that actually ships, not the original
// upload: the source of `underroof-highway-run` is 60fps 1080p and its web
// master is 30fps 720p, so reading the source would report a duration and
// a shape the browser never sees.
import { readdirSync } from "node:fs";

const filmsDir = resolve(root, "public/films");
const SOURCES = readdirSync(filmsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => `/films/${e.name}/master.mp4`)
  .sort();

function probe(publicPath) {
  const file = resolve(root, "public", publicPath.replace(/^\//, ""));
  if (!existsSync(file)) throw new Error(`missing media file: ${file}`);
  const raw = execFileSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "json",
      file,
    ],
    { encoding: "utf8" },
  );
  const json = JSON.parse(raw);
  const stream = json.streams?.[0];
  const duration = Number(json.format?.duration);
  if (!stream?.width || !stream?.height || !Number.isFinite(duration)) {
    throw new Error(`could not read metadata for ${publicPath}`);
  }
  return {
    width: stream.width,
    height: stream.height,
    durationSeconds: Math.round(duration * 100) / 100,
  };
}

const entries = SOURCES.map((src) => [src, probe(src)]);

const body = entries
  .map(
    ([src, m]) =>
      `  ${JSON.stringify(src)}: { width: ${m.width}, height: ${m.height}, durationSeconds: ${m.durationSeconds} },`,
  )
  .join("\n");

writeFileSync(
  resolve(root, "src/lib/work/filmMedia.generated.ts"),
  `/**
 * GENERATED — do not edit by hand.
 * Written by scripts/generate-film-metadata.mjs from the real media files
 * via ffprobe. Re-run \`npm run film:meta\` after changing any film source.
 *
 * Exists so duration labels, card metadata and the player's aspect ratio
 * all derive from the file itself rather than from strings typed by hand,
 * which is how "00:45" ends up on a clip that is actually 1:12 long.
 */
export type FilmMedia = {
  width: number;
  height: number;
  durationSeconds: number;
};

export const FILM_MEDIA: Record<string, FilmMedia> = {
${body}
};
`,
  "utf8",
);

console.log(`film metadata written for ${entries.length} sources:`);
for (const [src, m] of entries) {
  console.log(`  ${src.padEnd(30)} ${m.width}x${m.height}  ${m.durationSeconds}s`);
}
