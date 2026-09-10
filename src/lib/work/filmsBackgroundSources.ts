/**
 * One place the six background files are named.
 *
 * The whole point of the naming convention is that better loops can be
 * dropped in later by replacing the files alone — so both call sites read
 * these paths rather than repeating string literals that could drift apart.
 */
export const FILMS_BG_SOURCES = {
  desktopWebm: "/media/films-background/films-bg-desktop.webm",
  desktopMp4: "/media/films-background/films-bg-desktop.mp4",
  desktopPoster: "/media/films-background/films-bg-desktop-poster.webp",
  mobileWebm: "/media/films-background/films-bg-mobile.webm",
  mobileMp4: "/media/films-background/films-bg-mobile.mp4",
  mobilePoster: "/media/films-background/films-bg-mobile-poster.webp",
} as const;
