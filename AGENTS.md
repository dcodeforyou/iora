<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Visual System — Studio Portfolio (AI Ads & Websites)

- Genre: Creative Agency / Design Studio Portfolio (Awwwards tier — Noomo/Porto Rocha/Basement Studio reference class), not a generic SaaS/AI landing page.
- One emotion: intrigue building to power/confidence. The site enacts "we break through the noise" rather than describing it.
- One memorable object/motif: a shattered CRT screen. A recurring glass-shard + crack-line motif threads every section (card borders, dividers, cursor trail), plus one throughline object (a paint-can ball) carried across scroll beats via named scene states.
- DOM text stays semantic, selectable, accessible — never render copy as canvas/WebGL text.
- One full-viewport canvas owns the hero: CRT static shader → scroll-scrubbed kick/shatter → shard viewfinder. It is not used for text.
- One motion authority: GSAP ScrollTrigger, driven by a single Lenis smooth-scroll instance. Do not mix in Framer Motion on the same element. Update Three.js state through refs/uniforms — no React re-renders per frame (see dental-website's GlassTooth.tsx pattern: scaleState/spinState as plain mutable objects, not React state).
- Mobile is NOT a simplified fallback. One scene graph, one choreography, shipped everywhere. Differences are performance/interaction adaptations only:
  - Quality resolved from actual GPU capability (tiered), never from viewport width.
  - Touch gets full interaction parity: word-repulsion game uses touchmove with the same vector math as mousemove; work cards use tap-to-reveal (not a stripped tap-to-navigate).
  - Full transmission material stays on the 1-2 shards nearest camera; background shards use a cheaper fresnel+envMap fake-glass. Never a blanket "mobile = low quality" branch.
- Palette — tokens live in src/app/globals.css, do not invent ad-hoc colors in components:
  - --color-ink (#0b0c10) base, --color-chalk (#f4f4f2) text, --color-chalk-muted secondary.
  - --color-accent (#ff4e32) is EARNED as a full-environment wash at the Impact/splat beat (a color flooding the frame) — the site stays near-monochrome in that sense before that moment. Revised: single-keyword text-color emphasis (one word in a headline, à la notionlabs.in) is allowed earlier — see Attention's "Attention"/"Until now." — that's linguistic emphasis, a different move from an environmental color wash, and it deliberately threads into Impact's "the mark" (same glow treatment, shared narrative line). Don't confuse the two: still never flood a background/blob/large-area fill with accent before Impact.
  - --color-glass-glow is a material-light value for glass refraction only, not a brand color.
- Typography: --font-display (Bricolage Grotesque) for statements/wordmark, --font-mono-kicker (Space Mono) for eyebrows/labels/stats — mirrors notionlabs.in's Azeret Mono kicker convention — --font-body (Inter) for body copy. One bold statement per screen; resist stacking multiple headlines in one section (notionlabs.in discipline).
- Motion character: punchy but eased for kick/shatter/drop; controlled for everything else. No elastic/bouncy easing anywhere. Cursor/touch-repulsion uses inverse-distance repel, not spring physics. One deliberate, documented exception: the Impact→Proof handoff, where the glow blob condenses into a marble that physically drops and bounces (GSAP's real `bounce.out`, scrubbed against scroll — see ImpactSection's second ScrollTrigger). It's a literal falling object, not a UI element being animated for flourish — don't treat this as precedent for bounce/elastic eases anywhere else.
- Never add: generic AI-purple gradient orb, standard 3-column card grid, "About/Services/Work/Contact" nav without personality, carousel for portfolio work, stock photography, rapid flashing >3/sec anywhere (accessibility hazard — WCAG general flash threshold), safe/centered/predictable hero.
- Respect `prefers-reduced-motion`: disable pin/scrub/particle-assembly, show final states directly.
- Cap renderer DPR at 1.5-2 (never drop to 1 on high-density mobile panels — reads as blurry/budget).
- IntersectionObserver-gate every canvas: pause its render loop entirely when scrolled off-screen (battery/thermal, and lets multiple canvases coexist).
- Canvas/WebGL failure must show a meaningful poster (gradient/blur placeholder), never a blank box.
- Use `100svh`/`100dvh`, never bare `100vh` (iOS Safari dynamic toolbar).

## Flexbox breaks GSAP pin-spacer height — never wrap a pinned section in a flex ancestor
`body`/`main`/any ancestor of a `pin: true` ScrollTrigger section must be plain block layout, not `display: flex`. A flex ancestor corrupts the pin-spacer's computed height — confirmed by direct isolation testing (reproducible from the flex container alone, independent of Lenis, React StrictMode, `overflow-hidden`, or absolutely-positioned children; `flex-shrink: 0` on the pinned element does NOT fix it). Symptom: the pin releases far too early — the pin-spacer ends up sized to roughly the `end` duration alone rather than (natural height + duration), and downstream sections crowd up underneath a still-active pin. Use plain stacked block sections (the default) for any page containing a pinned/scrubbed section; use Grid or inline-block if you need layout control that isn't flex.

## Lint scoping for the motion layer
`react-hooks/immutability` and `react-hooks/refs` (React Compiler-aware ESLint rules) are scoped off in eslint.config.mjs for `src/components/scene/**`, `src/lib/scroll/**`, and `src/components/hero/**` — these directories intentionally mutate plain useMemo-returned objects outside render (GSAP ScrollTrigger callbacks, useFrame loops) by design, see the comment in eslint.config.mjs. Add new beat/section directories to that same override list as they're built, rather than disabling the rules project-wide.

## Verification per phase
- `npm run lint` and `npx tsc --noEmit` before considering a phase done.
- Test at 1440x900, 768x1024, and 390x844. No horizontal overflow at any width.
- Confirm no console errors/hydration warnings in the dev server.
- Scene-lab routes (under src/app/lab/) are dev-only inspection tools — never linked from the real site nav.
