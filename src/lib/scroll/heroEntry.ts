// Plain mutable object (not React state) — same "no re-renders per frame"
// pattern as progress/explodeState/screenState in HeroScene.tsx. CrtPowerOn
// tweens `.value` directly on the entry-button click; CrtScreenShard reads
// it every frame to blend its shader between pure procedural static (0) and
// the real hero video texture (1) — see CrtScreenShard.tsx's uSignalBlend
// uniform. This is NOT the screen's overall visibility anymore — that's
// controlled entirely by scroll progress now (see HeroScene's Orchestrator,
// `screenState.value = screen`), so the screen itself stays opaque and
// legible, showing the live video, all the way through the pre-impact hold.
// An earlier version of this file used this same object to drive overall
// visibility instead (fading the whole screen to transparent on click,
// independent of scroll) — that was the wrong mechanism once real video
// needed to play THROUGH the hold and break in sync with the video's own
// impact frame: fading the screen out ~0.7s after click would have hidden
// the footage a full second before the kick ever lands (see
// CrtPowerOn.tsx's handleEnter for the real timing).
//
// Starts at 0 (pure static, no signal) and is tweened to 1 exactly once, on
// the entry click, as the video starts playing underneath it — there is no
// reset. A real page reload re-executes this module and gets a fresh object
// back at 0, which is what makes "reload starts like the very first time"
// work with zero extra bookkeeping.
export const signalBlend = { value: 0 };

// Single source of truth for Hero's pin distance, shared between Hero.tsx
// (which uses it for the real ScrollTrigger `end` value) and CrtPowerOn.tsx
// (which needs the SAME number to compute a real pixel scroll target for
// the automatic post-click shatter sequence — see HERO_ENTRY_SETTLE_PROGRESS
// below). Keeping this in one place means the two can never silently drift
// out of sync with each other.
export const HERO_PIN_VH_MULTIPLIER = 2.0;

// Where the automatic post-click sequence lands, in Hero's own 0-1 scroll
// progress terms — comfortably inside HeroScene's EXPLODE_SETTLE(0.62) to
// ZOOM_START(0.85) resting plateau, so shards are genuinely settled (not
// mid-explode, not already zooming away) the instant scroll unlocks and
// hands off to the user.
export const HERO_ENTRY_SETTLE_PROGRESS = 0.68;

// Also the single source of truth for HeroScene.tsx's own Orchestrator —
// re-exported from here instead of duplicated as a second literal, so
// CrtPowerOn's automatic sequence (see below) can pace itself against the
// EXACT real explode window rather than a guessed/duplicated copy that
// could silently drift out of sync with the actual shard choreography.
export const HERO_EXPLODE_START = 0.28;
export const HERO_EXPLODE_SETTLE = 0.62;

// A point INSIDE HeroScene's SCREEN_BREAK_START..END window (0.41-0.43) —
// the real scroll-progress value CrtPowerOn's automatic sequence targets so
// the visible screen-crack snap lands there, not just "somewhere in the
// explode range." Re-exported from here (not a private literal in
// CrtPowerOn.tsx) for the same reason as HERO_EXPLODE_START/SETTLE above:
// if HeroScene's own break window ever moves, this has to move with it.
export const HERO_SCREEN_BREAK_MID = 0.42;

// The far end of the same break window — the scroll-progress value at which
// the CRT screen has FULLY snapped to gone (shard cluster fully takes over).
// Real glass doesn't un-shatter: once scroll has ever reached this point,
// Hero.tsx clamps any later upward scroll so progress can never drop back
// below it again for the rest of the session — the shard cluster stays
// fully scroll-scrubbable (explode/settle/zoom all still respond normally)
// but the flat whole screen can never be scrolled back into view. Shares
// HeroScene's own literal via this constant for the same drift-proofing
// reason as HERO_SCREEN_BREAK_MID above.
export const HERO_SCREEN_BREAK_END = 0.43;

// Video source selection breakpoint — same 700px threshold HeroScene.tsx
// already uses for its own mobile shard seed (MOBILE_SEED), reused here so
// "which hero video plays" and "which shard layout renders" never silently
// disagree about what counts as mobile.
export const HERO_VIDEO_BREAKPOINT = 700;

// The real, frame-inspected impact timestamp shared by BOTH source cuts
// (confirmed independently via ffmpeg frame extraction on each file — the
// mobile cut's kick lands sharp-and-held from ~1.33s-1.83s, the web cut's
// from ~1.4s-1.73s; 1.5s sits inside both windows and inside the user's own
// stated 1.5-2s range). This is what lets CrtPowerOn.tsx use ONE shared
// timing constant for the automatic sequence regardless of which platform's
// video is actually playing.
export const HERO_IMPACT_TIME = 1.5;

// Where each cut's ambient tail loops from once it plays through to its
// natural end — deliberately NOT 0, so a loop never replays the whole
// approach-and-impact narrative. Genuinely different per source (the two
// cuts were trimmed differently), unlike HERO_IMPACT_TIME above.
export const HERO_LOOP_TIME: { web: number; mobile: number } = {
  web: 3.1,
  mobile: 2.2,
};

// How long the click-triggered "static resolves into the real video feed"
// blend takes — also how long the boot text/button group takes to fade out
// on the same click (see CrtPowerOn.tsx's exitTl, both start at time 0).
// CrtPowerOn's automatic scroll sequence begins the instant this finishes,
// so this duration is subtracted from HERO_IMPACT_TIME to get the real
// budget for the pre-break scroll segment — see handleEnter's own comment.
export const HERO_SIGNAL_BLEND_DURATION = 0.7;
