/**
 * GENERATED — do not edit by hand.
 * Written by scripts/generate-film-metadata.mjs from the real media files
 * via ffprobe. Re-run `npm run film:meta` after changing any film source.
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
  "/films/built-for-the-dark/master.mp4": { width: 720, height: 1280, durationSeconds: 14.14 },
  "/films/nobody-has-arrived-yet/master.mp4": { width: 1280, height: 960, durationSeconds: 30 },
  "/films/the-city-owes-you-nothing/master.mp4": { width: 720, height: 1280, durationSeconds: 16.79 },
  "/films/the-future-can-wait/master.mp4": { width: 1280, height: 720, durationSeconds: 66.57 },
  "/films/the-rain-stays-outside/master.mp4": { width: 720, height: 1280, durationSeconds: 43.62 },
  "/films/underroof-detail-bay/master.mp4": { width: 720, height: 1280, durationSeconds: 17.67 },
  "/films/underroof-highway-run/master.mp4": { width: 720, height: 1280, durationSeconds: 35.9 },
  "/films/underroof-written-off/master.mp4": { width: 720, height: 1280, durationSeconds: 36.87 },
};
