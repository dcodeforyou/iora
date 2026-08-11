"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import type { Group, Mesh, PerspectiveCamera } from "three";
import ShardCluster from "./ShardCluster";
import GradientBackdrop from "./GradientBackdrop";
import StudioLights from "./StudioLights";
import CrtScreenShard from "./CrtScreenShard";
import { isChromiumBrowser } from "@/components/pitch/liquidGlassLens";
import { playShatter, startTvStatic, stopTvStatic } from "@/lib/sound/sfx";
import {
  signalBlend,
  HERO_EXPLODE_START,
  HERO_EXPLODE_SETTLE,
  HERO_SCREEN_BREAK_END,
  HERO_VIDEO_BREAKPOINT,
} from "@/lib/scroll/heroEntry";
import { initHeroVideo, setHeroVideoFocus } from "@/lib/scroll/heroVideo";
import { setHeroMusicFocus } from "@/lib/scroll/heroMusic";

// The shard/bevel/roughness detail was tuned by eye at this world-unit
// scale (see /lab/shard) — stretching the geometry itself to be viewport-
// sized diluted all of that detail and made the whole thing read as
// "zoomed." Keep this as the pane's HEIGHT scale; width is derived from the
// current viewport aspect (below) so the pane is never a fixed square.
// A fixed square covering a wide viewport necessarily overflows top/bottom
// (classic object-fit: cover) and crops the top/bottom corners clean off
// screen — which is exactly why the rounded corners and corner-darkening
// were invisible before: they existed, just outside the visible frame.
const PANE_HEIGHT = 3.2;

// How much further from the camera GradientBackdrop sits than
// CrtScreenShard's own pane (must match the `position` prop passed to
// <GradientBackdrop> below — kept as one named constant instead of two
// separate literals so they can never silently drift apart, which would
// throw off the backdropScale math right below).
const BACKDROP_Z_OFFSET = 1.4;

// Scroll-progress (0-1 across Hero's own pin range) breakpoints. Aligned
// with Hero.tsx's own headline reveal (starts at p=0.32) and CrtPowerOn's
// telegram message (fades out over the first ~400px of scroll, which is
// the same ~0.30 of Hero's 1.5×viewportHeight pin range at typical
// viewport heights) — the screen should stay whole and the shard cluster
// should stay completely uninvolved through the entire CRT-power-on +
// telegram beat, only breaking once that's cleared and the real headline
// is taking over, not on the first few percent of scroll like an earlier
// version of this file did.
// EXPLODE_START is well BEFORE the screen actually breaks — the shard
// cluster starts its own motion while still fully hidden behind the solid
// CRT screen, on purpose. Revealing it right at EXPLODE_START (an earlier
// version) meant the cluster was shown sitting almost perfectly still —
// GlassShard's own per-shard onset stagger means outer shards genuinely
// haven't started moving yet that early — which read as an unwanted
// "frozen, tiled, cracked-but-not-bursting" state. Waiting to reveal until
// explode has already built up well past every shard's own onset (see
// GlassShard's 0.15 max stagger) means the very first frame anyone ever
// sees has EVERY shard already in visible motion — the burst is always
// shown already-in-progress, never starting from a visible standstill.
const EXPLODE_START = HERO_EXPLODE_START;
const EXPLODE_SETTLE = HERO_EXPLODE_SETTLE;
const SCREEN_BREAK_START = 0.41;
const SCREEN_BREAK_END = HERO_SCREEN_BREAK_END;
// Deliberately far below SCREEN_BREAK_START, not the same value — the TV
// static loop's stop/restart used a single threshold here originally,
// and real scroll (Lenis's `scrub: 1` smoothing can still overshoot/
// settle right around a boundary, not just approach it monotonically)
// could hover across that one narrow 0.41-0.43 line for multiple frames,
// re-triggering the loop's ~0.4s fade-in immediately after its own
// ~0.22s fade-out — reported as the static "persisting forever," which
// was actually never a single loop failing to stop but a restart cycle
// that never fully settled. A wide hysteresis gap between this and
// SCREEN_BREAK_START means only a genuine, deliberate scroll back up
// (not a sub-threshold wobble at the crack point) can restart it.
const TV_STATIC_RESTART_THRESHOLD = 0.15;
// The rest between EXPLODE_SETTLE and ZOOM_START is a flat plateau — scroll
// stays scrubbed the whole time (no hard scroll-lock, which would fight
// GSAP's own scrub-pin position reads), but a wide flat plateau in the
// progress-to-state mapping is the standard way a scrubbed timeline reads
// as "stuck"/resting rather than continuously changing — shards should
// genuinely sit there, settled, long enough to actually look at (and be
// parallaxed via cursor) before the exit takes over.
//
// ZOOM_START moved earlier (0.93 -> 0.85) — the exit itself needs real
// scroll distance to read as a continued, decently-paced departure rather
// than a sudden final lurch crammed into the pin's last ~7%. Paired with
// Hero.tsx's own further-widened pin distance so the hold plateau doesn't
// lose much of its own room in the trade.
const ZOOM_START = 0.85;
const ZOOM_END = 1.0;

// Chosen empirically (real Chrome, 390px-wide rest-state screenshots) —
// seed=17 (desktop's own, tuned only at its wide aspect) left the whole
// left and bottom of a narrow mobile frame empty; tried 5 and 23 too,
// both still lopsided (one dominant piece, a whole side sparse). 42 is
// the one that landed a piece in all four quadrants at this aspect.
const MOBILE_SEED = 42;

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type OrchestratorProps = {
  progress: { value: number };
  explodeState: { value: number };
  zoomState: { value: number };
  screenState: { value: number };
  screenRef: React.RefObject<Mesh | null>;
  shardGroupRef: React.RefObject<Group | null>;
  baseDistance: number;
};

/**
 * Reads the single scroll-progress value every frame and fans it out:
 * - screenState snaps from 1 to 0 across SCREEN_BREAK_START..END — the
 *   "kick" is a break, not a dissolve, it just happens much later in the
 *   scroll than it used to (see the constants above).
 * - explode ramps from there to EXPLODE_SETTLE — each shard's own
 *   onset/magnitude is further staggered by distance-from-center inside
 *   GlassShard itself, so the break visibly radiates outward from the
 *   impact point instead of every piece moving in lockstep. GlassShard
 *   ALSO derives its own opacity from this same value, fading each shard
 *   in as it flies apart rather than popping in solid.
 * - zoomState ramps from ZOOM_START to ZOOM_END — the exit beat, shards
 *   pushed toward/past camera and faded back out, layered on top of
 *   wherever explode left them.
 * - camera dolly, unrelated timing, purely cosmetic push-in from whatever
 *   base distance the current viewport's cover framing computed.
 * Also toggles Object3D.visible directly (not React state) so the whole
 * screen and the shard cluster are never both actually rendered/costing
 * frame time at once — one is always fully off once the other has taken
 * over, and the cluster goes fully invisible again once fully zoomed away.
 */
function Orchestrator({
  progress,
  explodeState,
  zoomState,
  screenState,
  screenRef,
  shardGroupRef,
  baseDistance,
}: OrchestratorProps) {
  const { camera } = useThree();
  // Plain ref, not state — read/written only inside useFrame, same "no
  // React re-renders per frame" rule as everything else here. Fires once
  // at the exact SCREEN_BREAK_START crossing (the real break, not
  // EXPLODE_START which starts well before the screen visibly cracks —
  // see that constant's own comment) and resets once scroll retreats
  // back above it, so scrolling down into the break again replays it,
  // consistent with every other scroll-tied cue on this site.
  const hasShatteredRef = useRef(false);
  useFrame(() => {
    const p = progress.value;
    // Camera stays at a fixed distance — no dolly, ever. There USED to be a
    // purely cosmetic push-in here (up to 12% closer by the end of scroll),
    // barely noticeable against abstract static, but it moves the camera
    // relative to GradientBackdrop's own fixed-size plane too — once that
    // plane started carrying real video (see GradientBackdrop.tsx), any
    // camera movement changes the video's apparent size, i.e. zoom. Gating
    // the dolly to only run post-break wasn't enough: it still zoomed
    // continuously through the whole settle/hold/exit range whenever the
    // backdrop's video was the thing on screen — confirmed directly by
    // comparing the letterbox bar thickness between an early and a late
    // frame, which should be identical and weren't. Zero camera motion is
    // the only way to guarantee the video's apparent size never changes for
    // any reason, which is this feature's actual hard requirement.
    camera.position.z = baseDistance;

    if (p >= SCREEN_BREAK_START) {
      if (!hasShatteredRef.current) {
        hasShatteredRef.current = true;
        playShatter();
        stopTvStatic();
      }
    } else if (p < TV_STATIC_RESTART_THRESHOLD) {
      hasShatteredRef.current = false;
      // Idempotent (no-ops if already running) — covers both "from page
      // load" (this is true on the very first frame) and "sound got
      // enabled partway through the still-static pre-shatter scroll
      // range" (the toggle click doesn't know about this component;
      // this just starts it the next time this branch runs).
      startTvStatic();
    }
    // Between TV_STATIC_RESTART_THRESHOLD and SCREEN_BREAK_START: neither
    // branch runs — the hysteresis gap itself. Whatever state the static
    // loop was already in stays exactly as it was.

    const screen = 1 - smoothstep(SCREEN_BREAK_START, SCREEN_BREAK_END, p);
    const explode = smoothstep(EXPLODE_START, EXPLODE_SETTLE, p);
    const zoom = smoothstep(ZOOM_START, ZOOM_END, p);
    // Visibility is scroll-progress ONLY now — the screen stays fully
    // opaque (showing pure static before the entry click, the real hero
    // video after it) all the way through the pre-impact hold, and only
    // actually disappears when real scroll drives `p` through the narrow
    // SCREEN_BREAK_START..END window. `signalBlend` (heroEntry.ts) no
    // longer touches visibility at all — it only controls the static-vs-
    // video blend inside CrtScreenShard's own shader now. An earlier
    // version combined the two here via Math.min(), which faded the whole
    // screen to transparent within ~0.7s of the entry click regardless of
    // scroll — that hid the video a full second before its own impact
    // frame ever arrived, once real synced video playback was wired in.
    screenState.value = screen;
    explodeState.value = explode;
    zoomState.value = zoom;

    if (screenRef.current) screenRef.current.visible = screen > 0.001;
    // Invisible both BEFORE the break starts (screen still whole — this is
    // the "no shards at all initially, not even tiled together" fix) and
    // AFTER the zoom-away exit finishes (fully faded, scrolled past into
    // the next section) — visible only for the beat actually in between.
    if (shardGroupRef.current) {
      shardGroupRef.current.visible = screen < 0.999 && zoom < 0.999;
    }
  });
  return null;
}

function HeroPoster() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ink">
      <div className="h-64 w-64 rounded-3xl bg-gradient-to-br from-glass-glow/25 to-transparent blur-2xl" />
    </div>
  );
}

type SceneContentProps = {
  progress: { value: number };
  pointerState: { x: number; y: number };
};

/**
 * Rendered inside <Canvas> (useThree only works within the R3F tree).
 * The pane's width always matches the current viewport aspect exactly
 * (height fixed at PANE_HEIGHT, width = PANE_HEIGHT * aspect) — at the
 * distance that makes PANE_HEIGHT fill the frame vertically, the width
 * then ALSO exactly fills horizontally, with zero overflow and zero gap on
 * either axis, on any aspect ratio. That's what guarantees all four
 * corners land exactly at the screen's own corners instead of being
 * cropped off or leaving a letterboxed gap.
 */
function SceneContent({ progress, pointerState }: SceneContentProps) {
  const { camera, size, gl, scene } = useThree();
  const aspect = size.width / size.height;
  const paneWidth = PANE_HEIGHT * aspect;

  const baseDistance = useMemo(() => {
    const fovRad = (((camera as PerspectiveCamera).fov ?? 40) * Math.PI) / 180;
    return PANE_HEIGHT / (2 * Math.tan(fovRad / 2));
  }, [camera]);

  // GradientBackdrop sits BACKDROP_Z_OFFSET further from the camera than
  // CrtScreenShard's own pane (so shards have real room to fly toward it) —
  // its width/height must scale up by EXACTLY the ratio of the two
  // distances for its video to appear at the same apparent size as the
  // screen's own. The previous constant (1.9) was tuned only for "big
  // enough to always cover the frame, including at extreme shard-explosion
  // excursions" — never for exact size-matching — and was never revisited
  // once the backdrop started showing real video too: it rendered the same
  // footage roughly 44% larger than the screen did, a visible zoom jump
  // exactly at the moment the screen breaks and hands off to it. Camera
  // distance to CrtScreenShard's pane (at z=0) is baseDistance; distance to
  // GradientBackdrop (at z=-BACKDROP_Z_OFFSET) is baseDistance +
  // BACKDROP_Z_OFFSET — angular size (what actually determines on-screen
  // apparent size under perspective) is proportional to worldSize/distance,
  // so matching that ratio is what makes the two surfaces show the SAME
  // apparent framing for the same UV-mapped video.
  const backdropScale = useMemo(() => (baseDistance + BACKDROP_Z_OFFSET) / baseDistance, [baseDistance]);

  const explodeState = useMemo(() => ({ value: 0 }), []);
  const zoomState = useMemo(() => ({ value: 0 }), []);
  const screenState = useMemo(() => ({ value: 1 }), []);
  const screenRef = useRef<Mesh>(null);
  const shardGroupRef = useRef<Group>(null);

  // The live hero video, bound into a THREE.VideoTexture once the element
  // exists — shared by BOTH CrtScreenShard (blends between pure static and
  // this texture via `signalBlend`, see heroEntry.ts, driven by
  // CrtPowerOn's entry click) AND GradientBackdrop (shows it directly once
  // the CRT screen breaks — see that component's own doc comment for why
  // that's what keeps the video visible, refracted through the shards).
  // ONE shared object works for both now that both are raw ShaderMaterials
  // using the exact same CONTAIN-fit math (the whole video frame, zero
  // crop — `.scale` is >=1 on the letterboxed axis) and the exact same
  // raw-byte texture sampling (see `colorSpace = NoColorSpace` below and
  // both shaders' own doc comments for why: a built-in material's
  // automatic sRGB handling, on a texture the GPU uploads with an
  // sRGB-aware internal format, was producing a systematically washed-out
  // result everywhere the video showed, not just where shards overlapped
  // it — confirmed directly as a real report, not a hypothetical).
  // GradientBackdrop's plane is sized to the SAME viewport aspect as
  // CrtScreenShard's pane (see its width/height below), which is what
  // makes ONE shared scale value correct for both. Plain mutable object
  // (not React state — same "no re-renders per frame" rule as
  // progress/explodeState elsewhere in this file), read every frame
  // inside each consumer's own useFrame rather than passed as a changing
  // prop that would need a re-render to update. `initHeroVideo()` is
  // idempotent, so calling it here too (CrtPowerOn's own mount effect
  // also calls it, to start the network request as early as possible)
  // just returns the same element/kicks off nothing new if that's already
  // run first.
  const videoState = useMemo<{ texture: THREE.VideoTexture | null; scale: [number, number] }>(
    () => ({ texture: null, scale: [1, 1] }),
    [],
  );

  useEffect(() => {
    const video = initHeroVideo();
    const texture = new THREE.VideoTexture(video);
    // NoColorSpace, not SRGBColorSpace — both consumers are raw
    // ShaderMaterials doing their own plain texture2D() sample with zero
    // color-space math of their own, so the texture needs to upload
    // without an sRGB-aware GPU internal format (which would otherwise
    // auto-linearize every sample regardless of which shader reads it,
    // with no matching re-encode on output — the actual root cause of a
    // "video looks washed out/whitish everywhere, not just under shards"
    // report that survived several rounds of material-only tuning).
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    videoState.texture = texture;

    const updateScale = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const videoAspect = video.videoWidth / video.videoHeight;
      const paneAspect = paneWidth / PANE_HEIGHT;
      // CONTAIN-fit: >=1 on the axis being letterboxed, 1 on the other —
      // the whole frame always fits, nothing is ever cropped/zoomed.
      videoState.scale =
        paneAspect > videoAspect ? [paneAspect / videoAspect, 1] : [1, videoAspect / paneAspect];
    };
    if (video.readyState >= 1) updateScale();
    video.addEventListener("loadedmetadata", updateScale);

    return () => {
      video.removeEventListener("loadedmetadata", updateScale);
      texture.dispose();
    };
  }, [paneWidth, videoState]);

  // Precompiles every material in the scene (crucially the shard cluster's
  // MeshTransmissionMaterial instances, which are otherwise left invisible
  // — see Orchestrator below — until the entry click, deferring their real
  // shader compile to that exact moment and producing the multi-hundred-
  // ms-to-second hitch this codebase has already documented elsewhere).
  // `gl.compile`/`compileAsync` traverse with `scene.traverse` for material
  // gathering (confirmed against Three's own source, not assumed) — NOT
  // `traverseVisible` — so this warms shaders for objects that are
  // currently `.visible = false` too, which is exactly the case here.
  // `compileAsync` (not the sync `compile`) so this doesn't block the main
  // thread; runs once, right after the scene's meshes/materials exist
  // (they're built synchronously via useMemo inside GlassShard/ShardCluster
  // during the same first render this effect commits after).
  const hasCompiledRef = useRef(false);
  useEffect(() => {
    if (hasCompiledRef.current) return;
    hasCompiledRef.current = true;
    void gl.compileAsync(scene, camera);
  }, [gl, scene, camera]);

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 4, 5]} intensity={1} />
      <GradientBackdrop
        width={paneWidth * backdropScale}
        height={PANE_HEIGHT * backdropScale}
        position={[0, 0, -BACKDROP_Z_OFFSET]}
        videoState={videoState}
        coverState={screenState}
      />
      <Suspense fallback={null}>
        {/* The one whole screen at rest — literally shard #1 (see
            CrtScreenShard), not a second object layered over the cluster. */}
        <CrtScreenShard
          ref={screenRef}
          width={paneWidth}
          height={PANE_HEIGHT}
          visibilityState={screenState}
          signalBlendState={signalBlend}
          videoState={videoState}
        />
        <ShardCluster
          ref={shardGroupRef}
          width={paneWidth}
          height={PANE_HEIGHT}
          shardCount={11}
          // fracturePane's recursive largest-piece splitting is genuinely
          // aspect-dependent — the SAME seed on a narrow/tall starting
          // rectangle (mobile portrait) can produce a structurally
          // different, less evenly-distributed set of piece centroids
          // than it does on a wide desktop one, since every split
          // decision is made against the actual current polygon shape.
          // seed=17 was only ever eyeballed at desktop's wide aspect —
          // confirmed empirically at 390px-wide (real Chrome, rest
          // state) leaving the whole left and bottom of the frame empty,
          // since explosion direction is just each piece's own centroid
          // normalized: no centroid there, nothing explodes there. Same
          // 700px threshold as heroCount above; desktop's own seed is
          // completely untouched either way.
          seed={size.width < 700 ? MOBILE_SEED : 17}
          // MeshTransmissionMaterial's transmissionSampler mode (see
          // GlassShard.tsx) is the thing that made the burst fast on
          // Chromium at DESKTOP resolution — but on Safari/WebKit at that
          // same resolution it's the opposite: measured (real Apple-GPU
          // WebKit, not software rendering) with heroCount at 3, that's
          // recurring 100-150ms hitches throughout the burst (one frame
          // spiked to 1438ms) — exactly the "hanging" reported. Dropping
          // to 1 fixed that, but then read as visibly flat/un-glassy on a
          // phone — "only one piece is [3D], not enough" — because a
          // PHONE viewport is a completely different cost story: re-ran
          // the identical WebKit measurement at a 390px-wide viewport with
          // heroCount=3 and it was just as clean as heroCount=1 (one
          // one-time ~126ms hitch, same steady-state frame time) — the
          // real constraint was always pixel fill-rate at desktop
          // resolution, not the browser engine by itself. So this isn't a
          // browser check at all below a certain width — every phone gets
          // the full desktop-tier 3, only WIDE non-Chromium viewports
          // (the actual measured-slow case) fall back to 1. 700px sits
          // comfortably below tablet width (see AGENTS.md's own 768px
          // tablet test point), which hasn't been measured either way and
          // stays on the conservative fallback until it has been.
          heroCount={isChromiumBrowser || size.width < 700 ? 3 : 1}
          explodeState={explodeState}
          zoomState={zoomState}
          pointerState={pointerState}
        />
        <Environment resolution={256}>
          <StudioLights />
        </Environment>
        <Orchestrator
          progress={progress}
          explodeState={explodeState}
          zoomState={zoomState}
          screenState={screenState}
          screenRef={screenRef}
          shardGroupRef={shardGroupRef}
          baseDistance={baseDistance}
        />
      </Suspense>
    </>
  );
}

type HeroSceneProps = {
  /** 0..1 scroll progress through the pinned hero, written by Hero.tsx's
   * ScrollTrigger onUpdate. Plain mutable object — see AGENTS.md. */
  progress: { value: number };
};

/**
 * The camera's initial position.z here is only a placeholder until
 * SceneContent computes the real cover-framing distance on first frame —
 * kept close to that typical range so there's no visible pop.
 */
export default function HeroScene({ progress }: HeroSceneProps) {
  // Plain mutable object (not React state) written from a window-level
  // listener below and read every frame inside GlassShard's own useFrame —
  // same "no React re-renders per frame" rule as `progress`/`explodeState`.
  // `pointermove` alone covers mouse, pen AND most touch-drag interactions
  // in modern browsers, but `touchmove` is kept alongside it to match this
  // codebase's own established convention elsewhere (AttentionSection's
  // word-repulsion game explicitly handles touchmove separately, per
  // AGENTS.md's "Touch gets full interaction parity" rule) rather than
  // assuming pointermove alone is enough on every device.
  const pointerState = useMemo(() => ({ x: 0, y: 0 }), []);

  // Same breakpoint/resolved-once convention as heroVideo.ts's own
  // getActiveVideoKey — reused here to trim this canvas's GPU cost on
  // mobile only (lower DPR ceiling, no MSAA). Desktop keeps its original
  // settings untouched; mobile-only per explicit request, not a general
  // perf tune.
  const isMobile = useMemo(
    () => typeof window !== "undefined" && window.innerWidth < HERO_VIDEO_BREAKPOINT,
    [],
  );

  // IntersectionObserver-gated per AGENTS.md ("pause its render loop
  // entirely when scrolled off-screen") — same pattern already
  // established in ProofGlassCanvas.tsx. This canvas was missing it
  // entirely: it kept rendering every frame (full shard/transmission
  // material cost) even scrolled all the way down in Proof/Pitch/Footer,
  // competing for GPU time with whatever WAS on screen the whole time —
  // a real, measurable contributor to "not smooth," not just Hero's own
  // section reading choppy. While Hero is pinned it's continuously
  // intersecting (correct — it's genuinely on screen the whole pin), so
  // this only ever pauses it once the pin has actually released and
  // scrolled away.
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Same `isVisible` signal as the render-loop pause above — reused, not a
  // second observer, since it's already exactly "is Hero on screen right
  // now." Ducks the hero video's own volume down to ambient (not silent)
  // once Hero has fully scrolled out of view, back to full the instant any
  // sliver of it is back on screen. Independent of the site's own mute
  // toggle (see heroVideo.ts's own doc comment on setHeroVideoFocus) — that
  // one is the absolute on/off gate, this only ever adjusts the level.
  // setHeroMusicFocus runs off the exact same signal, in the same effect,
  // so the background track's own volume always moves in lockstep with
  // the video's — see heroMusic.ts's own doc comment.
  useEffect(() => {
    setHeroVideoFocus(isVisible);
    setHeroMusicFocus(isVisible);
  }, [isVisible]);

  useEffect(() => {
    const setFromClient = (clientX: number, clientY: number) => {
      pointerState.x = (clientX / window.innerWidth) * 2 - 1;
      pointerState.y = -((clientY / window.innerHeight) * 2 - 1);
    };
    const onPointerMove = (e: PointerEvent) => setFromClient(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) setFromClient(touch.clientX, touch.clientY);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [pointerState]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <Canvas
        // Mobile-only trim (see isMobile above) — this is the single
        // heaviest moment on the page: the shard-explosion auto-sequence
        // (see CrtPowerOn's handleEnter) drives a real scroll position on
        // every animation-frame tick WHILE the hero video is simultaneously
        // decoding/playing, all racing this canvas's own render. Reported
        // as the explosion visually finishing early/too fast on mobile —
        // a GSAP tween that runs its full real-world duration regardless of
        // frame rate will still look like it "jumps" to its end state early
        // if the device is dropping frames along the way, since fewer
        // intermediate frames actually get painted. Desktop keeps its
        // original [1,2] + antialias:true untouched. Mobile's [1,1.5] is
        // still within AGENTS.md's 1.5-2 DPR cap.
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        camera={{ position: [0, 0, 2.9], fov: 40 }}
        gl={{ antialias: !isMobile, alpha: true }}
        frameloop={isVisible ? "always" : "never"}
        fallback={<HeroPoster />}
      >
        <SceneContent progress={progress} pointerState={pointerState} />
      </Canvas>
    </div>
  );
}
