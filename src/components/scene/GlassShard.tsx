"use client";

import { forwardRef, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshTransmissionMaterial } from "@react-three/drei";
import type { Group } from "three";
import * as THREE from "three";
import { mergeRefs } from "@/lib/mergeRefs";
import { createShardGeometry, type ShardPiece } from "./shardShapes";

// Both branches below (MeshTransmissionMaterial and meshPhysicalMaterial)
// have their own distinct, incompatible generated ref types — a single
// `useRef<Material>` doesn't satisfy either one's stricter JSX ref typing.
// A plain callback ref sidesteps that: TS infers each call site's own
// concrete instance type, and assigning INTO this loosely-shaped variable
// (rather than the other direction) only needs `.opacity` to structurally
// match, which both real instances have.
type OpacityTarget = { opacity?: number };

type GlassShardProps = {
  piece: ShardPiece;
  depth?: number;
  /** "high" = real transmission material (chromatic aberration, distortion,
   * refraction) via drei's shared `transmissionSampler` mode — see the
   * material block below for why that's the fast version of this rather
   * than the old per-instance-FBO one. "low" = no transmission at all, a
   * cheap fresnel+envMap fake-glass (reflection + alpha blending only) for
   * background shards, per AGENTS.md's capability-tier spec. Never a
   * blanket mobile/desktop downgrade — the tier is about camera distance,
   * not device. */
  quality?: "high" | "low";
  /** 0 = resting (tiled, hairline crack gaps only), 1 = fully shattered
   * outward. Plain mutable object so a GSAP scroll timeline can drive every
   * shard every frame with zero React re-renders (dental-website's
   * scaleState/spinState pattern). Also drives this shard's own opacity
   * (see useFrame below) — it fades INTO existence as it flies apart,
   * rather than popping in fully solid before any motion starts. */
  explodeState?: { value: number };
  /** 0 = at rest (whatever explode left it at), 1 = fully zoomed away —
   * an ADDITIONAL push toward/past the camera plus a scale-up and fade,
   * layered on top of the explode position rather than replacing it, for
   * the exit beat once scroll carries past Hero into the next section. */
  zoomState?: { value: number };
  /** Normalized -1..1 pointer position (mouse or touch, unified), for the
   * settled-shard parallax — see useFrame below for why this only kicks in
   * once a shard has actually settled near its exploded resting spot. */
  pointerState?: { x: number; y: number };
  /** Half-diagonal of the whole pane — used to normalize how far this
   * shard's own centroid sits from the impact point (the center). A real
   * center punch doesn't launch the whole screen uniformly: pieces near the
   * impact break away hard, pieces near the outer edge stay far more
   * anchored. Without this every shard moved the same amount regardless of
   * where it sat, which read as "pieces appearing out of nowhere" rather
   * than a punch propagating outward from one point. */
  maxRadius?: number;
};

const REST = { value: 0 };
const REST_POINTER = { x: 0, y: 0 };

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const GlassShard = forwardRef<Group, GlassShardProps>(function GlassShard(
  {
    piece,
    depth = 0.07,
    quality = "high",
    explodeState = REST,
    zoomState = REST,
    pointerState = REST_POINTER,
    maxRadius = 2.5,
  },
  ref,
) {
  const localRef = useRef<Group>(null);
  const materialRef = useRef<OpacityTarget | null>(null);
  const geometry = useMemo(
    () => createShardGeometry(piece.shape, depth, piece.id),
    [piece, depth],
  );

  // Explosion direction: straight out from the pane's center through this
  // shard's own resting position, so every shard flies its own way and none
  // cross paths.
  const direction = useMemo(() => {
    const d = piece.centroid.clone();
    return d.lengthSq() > 1e-6 ? d.normalize() : new THREE.Vector2(1, 0);
  }, [piece]);

  // Deterministic per-shard spin variation from its own id (not Math.random)
  // — identical every render, no hydration/flicker risk. Reused below as a
  // deterministic per-shard PARALLAX strength too, so settled shards don't
  // all drift by the exact same amount (which would read as one rigid
  // plate moving, not real depth).
  const spin = useMemo(() => {
    const s = Math.sin(piece.id * 12.9898) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1; // -1..1
  }, [piece.id]);

  // 0 at the impact point (screen center), ~1 at the pane's outer corners.
  const distRatio = useMemo(
    () => Math.min(1, piece.centroid.length() / maxRadius),
    [piece, maxRadius],
  );

  // Base (fully-settled, fully-visible) opacity per tier — dropped from
  // 0.55 to 0.32 for the low tier: at 0.55 combined with high
  // envMapIntensity it read as a hazy, milky white rather than genuinely
  // transparent glass with reflections on top. The high tier's real
  // transmission material stays at 1 (its "clear vs whitish" balance is
  // tuned via its own thickness/attenuation/envMapIntensity props
  // instead, not opacity). The dynamic fade below multiplies this, it
  // doesn't replace it. (An earlier round of this session dropped this to
  // 0.1, chasing a whitish-video report that turned out to be a texture
  // color-space bug elsewhere, not this material — restored to 0.32 now
  // that the real cause is fixed.)
  const baseOpacity = quality === "high" ? 1 : 0.32;

  useFrame((state) => {
    if (!localRef.current) return;
    // A center punch reaches the middle first and the crack propagates
    // outward — center pieces start moving as soon as explode lifts off 0;
    // outer pieces lag behind by up to 0.15 of the whole range (not the
    // 0.7 an earlier version used) — that wider stagger meant a LOT of
    // the cluster was still sitting completely still (zero motion) at any
    // given moment, which combined with HeroScene's own reveal timing
    // produced a visible "frozen, tiled, cracked-but-not-bursting" beat —
    // exactly the "stable state" that shouldn't be seen at all. This
    // tighter stagger, paired with HeroScene revealing the cluster only
    // once explode has already built up well past this whole window (see
    // its own comment), means EVERY shard — even the outermost — already
    // has real, visible motion the very first frame it's ever shown.
    const onset = distRatio * 0.15;
    const localT = Math.min(1, Math.max(0, (explodeState.value - onset) / (1 - onset)));
    // Fast-out, not smoothstep's symmetric ease — a real fracture bursts
    // away from the impact point quickly and then settles, it doesn't
    // ease into motion gently. power2-out shape (1 - (1-t)^2): a sharp
    // initial burst that decelerates into its resting position.
    const localExplode = 1 - (1 - localT) * (1 - localT);
    // And they don't move nearly as far — the outer pane stays anchored
    // near its frame instead of the whole screen launching uniformly.
    // Pulled inward (2.0 -> 1.3) — the previous magnitude sent shards far
    // enough out that the resting cluster read as scattered debris at the
    // frame edges rather than a broken pane still loosely holding
    // together, and the few high-tier "reflective" shards among them
    // could end up flung far enough that none stayed clearly visible.
    // Both the 1.3 constant above and everything it was tuned against
    // (desktop's wide pane) assume plenty of horizontal room — but travel
    // distance is a FIXED world-unit magnitude, not something that
    // naturally shrinks with the pane. On a narrow/tall mobile viewport
    // the pane itself is much narrower (paneWidth = PANE_HEIGHT * aspect,
    // see HeroScene.tsx) while this constant stayed the same, so the same
    // burst that reads as "loosely held together" on desktop sent nearly
    // every shard flying off a 390px-wide phone frame entirely — confirmed
    // visually: only a sliver of one shard remained on screen at rest.
    // `maxRadius` already IS the pane's own half-diagonal (passed down
    // from ShardCluster, incorporating both width and height), so it's
    // the natural signal for "how much room does this burst actually
    // have" without needing a separate viewport-width prop threaded
    // through. 2.5 is this file's own existing default maxRadius prop
    // value (~1.2 aspect and wider) — anchoring the clamp there means
    // every desktop/landscape viewport this was ever tuned and tested
    // against gets scale exactly 1 (byte-for-byte unchanged), and ONLY
    // narrower-than-that (portrait tablets, phones) scales the burst down
    // proportionally to how much less room it actually has.
    const mobileMagnitudeScale = Math.min(1, maxRadius / 2.5);
    const magnitude = 1.3 * mobileMagnitudeScale * (1 - distRatio * 0.7);
    const zoom = zoomState.value;

    const t = state.clock.elapsedTime;
    const breathe = quality === "high" ? Math.sin(t * 0.6 + piece.id) * 0.01 : 0;

    // Parallax only kicks in once THIS shard has mostly settled into its
    // own exploded position (not mid-flight — a shard still being flung
    // outward shouldn't also be doing a subtle cursor wobble on top of
    // that), and fades back out once the zoom-away exit takes over. Each
    // shard's own strength is derived from `spin` (already deterministic
    // per shard) so the settled cluster reads as having real depth rather
    // than one rigid plate drifting together.
    const parallaxAmount = smoothstep(0.55, 1, localExplode) * (1 - zoom);
    const parallaxDepth = 0.06 + Math.abs(spin) * 0.05;

    // The exit CONTINUES the same outward burst further, rather than
    // switching to a different "fly toward camera" mechanic — per
    // explicit direction, scrolling past the hold should read as one
    // unbroken motion, the burst simply carrying on until shards are off-
    // screen, not a new kind of movement kicking in partway through.
    // Multiplying the existing outward `magnitude` (not adding a new
    // axis of motion) is what keeps it feeling like the same burst.
    // Multiplier eased down from 6 to 4 — paired with HeroScene's own
    // widened ZOOM_START window, the exit now covers a bit less absolute
    // distance over noticeably more scroll, reading as a continued,
    // decently-paced departure rather than a sudden final lurch.
    const exitMagnitude = magnitude * (1 + zoom * 4);
    // A little continued Z-drift and scale-up alongside it — real thrown
    // debris does gain a bit of apparent size as it keeps moving, this
    // is intentionally the minor/secondary cue here, not the dominant one
    // the way it briefly was.
    const zoomZ = zoom * 1.2;
    const zoomScale = 1 + zoom * 0.6;
    // Entry reveal is done via SCALE (0 -> 1), not opacity — confirmed by
    // direct visual testing that setting `.opacity` on
    // MeshTransmissionMaterial has no real effect: it's a custom shader
    // (see drei's own source), and it does not respect the standard
    // opacity/transparent blending the way a stock material does. The
    // result without this fix was solid, fully-OPAQUE black shard
    // silhouettes appearing the instant shardGroup became visible,
    // regardless of what `.opacity` was set to — scale genuinely controls
    // whether there's any geometry to rasterize at all, so it works
    // regardless of shader internals. Ramped VERY fast now (first 0.03 of
    // the explode range, not 0.18) — 0.18 was itself a visible "shard
    // visibly growing from a tiny sliver" beat, which read as messy rather
    // than a clean break. The CRT screen (HeroScene's own narrow
    // SCREEN_BREAK window) already owns the actual transition moment —
    // this only needs to be fast enough that a shard is never caught
    // mid-grow in a visible frame, not a designed reveal of its own.
    const entryScale = smoothstep(0, 0.03, explodeState.value);

    localRef.current.position.set(
      piece.centroid.x +
        direction.x * localExplode * exitMagnitude +
        pointerState.x * parallaxDepth * parallaxAmount,
      piece.centroid.y +
        direction.y * localExplode * exitMagnitude +
        pointerState.y * parallaxDepth * parallaxAmount,
      localExplode * (0.5 + Math.abs(spin) * 0.3) * (1 - distRatio * 0.5) + breathe + zoomZ,
    );
    localRef.current.rotation.set(
      spin * localExplode * 1.1,
      spin * localExplode * 0.7,
      spin * localExplode * 1.6,
    );
    localRef.current.scale.setScalar(entryScale * zoomScale);

    // Opacity still set alongside scale — a no-op on MeshTransmissionMaterial
    // per the above, but the low tier's plain meshPhysicalMaterial DOES
    // respect it correctly, so this is still the real fade for that tier
    // (scale-to-0 also hides it, but a genuine alpha fade looks better than
    // a shrink for a material that actually supports it).
    if (materialRef.current) {
      materialRef.current.opacity = baseOpacity * entryScale * (1 - zoom);
    }
  });

  return (
    <group ref={mergeRefs(localRef, ref)}>
      <mesh geometry={geometry}>
        {quality === "high" ? (
          // `transmissionSampler` is the fix for the "all 11 on high stalls
          // the render loop" problem this file used to warn about — WITHOUT
          // it, each instance does its own state.gl.render(scene, camera)
          // into a private FBO every frame (see drei's
          // MeshTransmissionMaterial.js:333-378), and with `backside` that's
          // TWO full scene re-renders per shard: N high-tier shards = up to
          // 2N extra full-scene renders/frame, each one also re-drawing
          // every other shard's own expensive shader. `transmissionSampler`
          // skips that block entirely and instead sets THREE.js's own
          // `transmission` on the material, which makes the renderer
          // compute ONE shared transmission buffer per frame (WebGLRenderer
          // .transmissionResolutionScale, capped in the Canvas's onCreated)
          // — shared across every transmissive object in the scene, so the
          // cost stops scaling with shard count. Confirmed against drei's
          // source (transmission: transmissionSampler ? transmission : 0)
          // and real-world reports (three.js forum "MeshTransmissionMaterial
          // poor performances" thread) before landing this. `resolution` is
          // still passed small (not omitted) even though transmissionSampler
          // skips rendering into it — the FBO is allocated either way
          // (useFBO(resolution) runs unconditionally), so an unset
          // `resolution` would still reserve a full-viewport texture for
          // nothing. `samples` cut from the default 10 to 4 — this shard's
          // own `chromaticAberration` does 3 dependent texture reads per
          // sample, so 10→4 is a real fragment-cost cut, and at this shard
          // size/roughness the difference reads as identical.
          <MeshTransmissionMaterial
            ref={(instance) => {
              materialRef.current = instance;
            }}
            transmissionSampler
            resolution={64}
            samples={4}
            transparent
            // Thinner (0.35 -> 0.18) and a much longer attenuationDistance
            // (2.4 -> 4.5) — both control how much the transmitted color
            // gets tinted/absorbed traveling through the glass's own
            // thickness; a thicker/shorter-attenuation combo was pushing
            // the transmitted view toward milky-white rather than staying
            // genuinely clear.
            thickness={0.18}
            roughness={0.02}
            transmission={1}
            ior={1.5}
            // Chromatic aberration doubled again (0.09 -> 0.18) — genuine
            // per-channel refraction fringing, strongest right at each
            // shard's own edges (where the displacement is largest), which
            // is exactly the "chromatic in the reflections/edges" ask.
            chromaticAberration={0.18}
            anisotropy={0.15}
            distortion={0.05}
            distortionScale={0.2}
            temporalDistortion={0.03}
            clearcoat={1}
            // clearcoatRoughness eased back up slightly (0.01 -> 0.06) so
            // the surface reflection isn't a razor-flat mirror everywhere
            // — real glass's reflectivity is Fresnel-based (strong at
            // grazing angles, mostly see-through face-on); envMapIntensity
            // dropped hard (4.5 -> 1.6) since that uniform brightness was
            // exactly what was overwhelming the transmission and reading
            // as "whitish" instead of "clear with reflections." (An
            // earlier round of this session cut these much further,
            // chasing a whitish-video report that turned out to be a
            // texture color-space bug, not this material — restored back
            // to the original tuned values now that the real cause is
            // fixed elsewhere.)
            clearcoatRoughness={0.06}
            envMapIntensity={1.6}
            // Iridescence — a real thin-film interference effect (soap-
            // bubble/oil-slick color shift with viewing angle), not just a
            // color tint — added here for the edge/reflection "shine"
            // asked for. thicknessRange widened from the THREE default
            // for a more visibly varied, prismatic sweep of color rather
            // than one fixed hue.
            iridescence={0.7}
            iridescenceIOR={1.4}
            iridescenceThicknessRange={[80, 600]}
            color="#f2faff"
            attenuationColor="#eaf6ff"
            attenuationDistance={4.5}
          />
        ) : (
          // The "cheaper fresnel+envMap fake-glass" AGENTS.md's own spec
          // calls for on background shards — `transmission={0}` (the
          // previous version left this at 1, which is what actually
          // triggers THREE.WebGLRenderer's per-frame transmission pass in
          // the first place; a meshPhysicalMaterial with real transmission
          // is not meaningfully cheaper than MeshTransmissionMaterial, it's
          // the SAME underlying renderer feature). No transmission at all
          // here — the glassy read comes entirely from ordinary PBR
          // reflectance (env-map reflection + built-in Fresnel-based
          // grazing-angle falloff, both essentially free on any GPU) plus
          // plain alpha blending standing in for "you can see through it,"
          // not real per-pixel refraction. `iridescence` adds a faint
          // chromatic shimmer at near-zero extra cost, so it doesn't read
          // as flatly cheaper next to the hero shards.
          <meshPhysicalMaterial
            ref={(instance) => {
              materialRef.current = instance;
            }}
            color="#f2faff"
            // Reflectivity pulled back across the board (metalness,
            // reflectivity, clearcoatRoughness, envMapIntensity below) —
            // the previous, much stronger version combined with 0.55
            // opacity is what read as a uniform whitish haze rather than
            // "mostly transparent, with shine." Roughness stays low (that
            // one still needs to be low for reflections to look sharp/
            // defined instead of a diffuse blur). (An earlier round of
            // this session cut these much further, chasing a whitish-video
            // report that turned out to be a texture color-space bug, not
            // this material — restored back to the original tuned values
            // now that the real cause is fixed elsewhere.)
            roughness={0.03}
            metalness={0.1}
            transmission={0}
            transparent
            opacity={baseOpacity}
            ior={1.5}
            reflectivity={0.6}
            clearcoat={0.7}
            clearcoatRoughness={0.08}
            // No real transmission here means no real chromatic
            // aberration either (that's a per-channel refraction effect,
            // and this tier has no refraction at all) — iridescence is
            // this tier's stand-in "chromatic" read, pushed further (0.6
            // -> 0.85) with an explicit thicknessRange for a wider,
            // more visibly prismatic color sweep across the surface
            // rather than one fixed hue.
            iridescence={0.85}
            iridescenceIOR={1.6}
            iridescenceThicknessRange={[100, 700]}
            envMapIntensity={1.6}
          />
        )}
      </mesh>
    </group>
  );
});

export default GlassShard;
