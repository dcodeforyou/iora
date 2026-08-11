/**
 * Real project content only — no invented metrics, no placeholder client
 * names. Each field traces back to something actually found in that
 * project's own source/assets (see the comment on each entry). Where a
 * detail couldn't be confirmed (e.g. the dental client's exact name), it's
 * flagged rather than guessed, since this renders publicly.
 *
 * The deeper fields (challenge/approach/deepDives/impact) match the depth
 * noomoagency.com's own case studies carry — read directly off two of
 * their live project pages before writing these, not guessed at. Every
 * specific claim below (component names, real stats, real quotes, real
 * scroll mechanics) is pulled from that project's own source code, not
 * embellished — see the comment on each block for exactly where.
 */

export type MediaBlock =
  // width/height are each image's REAL intrinsic pixel dimensions (read
  // via `sips`) — the gallery renders each block at its own true aspect
  // ratio instead of force-cropping into a fixed box. Several of these
  // source photos are tall portraits (the dental shots are ~2:3), and a
  // fixed 16:10 landscape crop was cutting them down to an unrecognizable
  // close-up.
  | { type: "image"; src: string; alt: string; width: number; height: number }
  | { type: "video"; src: string; poster?: string };

/** One named, in-depth section of a case study — a challenge statement,
 * a design-philosophy block, or a specific feature/chapter breakdown.
 * `bullets` is optional: philosophy sections use it for stated design
 * principles, feature sections use it for concrete highlights — matches
 * noomo's own pattern of alternating prose with a scannable list. */
export interface ContentBlock {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface ImpactPoint {
  heading: string;
  body: string;
}

export interface Project {
  slug: string;
  title: string;
  client: string;
  tags: string[];
  cardImage: string;
  deliverables: string[];
  involvement: string[];
  results: string;
  gallery: MediaBlock[];
  /** The problem/context the project actually opens on. Optional — a
   * project without confirmed source access (dedic.to's folder, pending)
   * ships without one rather than inventing a challenge statement for it. */
  challenge?: ContentBlock;
  /** The design principles behind the build's specific decisions. */
  approach?: ContentBlock;
  /** Named feature/chapter breakdowns — noomo's own "PATIENT PORTAL:",
   * "PHYSICIAN PORTAL:" pattern: one heading + prose + a highlights list
   * per distinct mechanism, not one undifferentiated paragraph. */
  deepDives?: ContentBlock[];
  /** Structured outcome statements — noomo's own "THE IMPACT" bullet
   * list, each a short heading + one sentence. */
  impact?: ImpactPoint[];
}

export const PROJECTS: Project[] = [
  {
    slug: "ovodont-dental-clinic-website",
    title: "A Dental Site That Doesn't Feel Clinical",
    // Client name read directly off a real patient bib in the source
    // photography ("...VODONT DENTAL CLINIC") — spelling not otherwise
    // confirmed anywhere in the codebase. Flag for the studio to confirm
    // the exact name before this goes live.
    client: "Ovodont Dental Clinic",
    tags: ["Website", "3D / WebGL", "Motion"],
    cardImage: "/work/dental/esthetic.jpg",
    deliverables: ["Website Design", "Front-end Development"],
    // Derived from the project's own component list (GlassTooth,
    // WaterRippleCanvas, ResultsTeeth, TestimonialBurstCanvas,
    // ToothLoader) — a genuine WebGL/GSAP build, same technical register
    // as this studio's own site, not a template.
    involvement: ["UI/UX Design", "3D Design (WebGL)", "Motion Design", "Front-end Development"],
    // Built from real copy pulled from the project's own source: its
    // stated positioning ("Everything we do is built around calm,
    // precision, and care you can feel from the first visit") and its
    // actual service list, not invented.
    results:
      "A calm, precision-first identity for a practice built around AI-assisted diagnostics, laser dentistry, and in-house 3D printing — replacing the usual clinical-website coldness with a 3D glass-tooth centerpiece, a water-ripple background, and real patient testimonials woven straight into the scroll.",
    // Everything below is read directly from HomeExperience.tsx's own
    // ~2,300-line GSAP/ScrollTrigger timeline — the SERVICES/TECHNOLOGIES/
    // RESULTS/TESTIMONIALS arrays, the named animation phases (spiral,
    // sweep, multiply, drop), and the smile-bowl physics system
    // (smileBowlPhysics.ts) are all real, not summarized from memory.
    challenge: {
      heading: "A PERSISTENT OBJECT, NOT A STOCK PHOTO OF A SMILE",
      paragraphs: [
        "Most dental sites solve trust the same way: a stock photo of a smiling patient, a grid of services, a contact form at the bottom. Ovodont's brief asked for the opposite — a practice built around AI-assisted diagnostics, laser dentistry, and in-house 3D printing needed a site with the same precision as the equipment in the operatory.",
        "The answer was a single, persistent 3D object — a real-time WebGL glass tooth — that never leaves the frame for the entire visit. It shrinks, spins, swerves, and eventually multiplies across nine full scroll chapters (hero, details, four services, four technologies, results, six testimonials, contact), carrying the whole page as one continuous performance instead of nine sections stitched together.",
      ],
    },
    approach: {
      heading: "DESIGNED TO FEEL LIKE ONE UNBROKEN GESTURE",
      paragraphs: [
        "Every transition on the site answers to the same rule: nothing simply appears or disappears. The tooth travels between resting spots along a real swerve-and-bulge path (not a straight tween), text materializes out of a scattered dust state rather than fading in, and even the closing stat reveal runs on an actual physics engine instead of a keyframed animation.",
      ],
      bullets: [
        "Persistent, not disposable — the same tooth mesh survives all nine chapters, resizing and repositioning rather than each section mounting its own hero object",
        "Physics over animation — the results chapter's five stat-teeth don't tween into their bowl, they're dropped through a real 2D simulation (gravity, circle-vs-segment collision, damping) run in wall-clock time via requestAnimationFrame",
        "Dust, not fades — every piece of copy scatters in from a blurred, randomly offset state and settles, staggered per word — reads as matter assembling, not a slide advancing",
      ],
    },
    deepDives: [
      {
        heading: "SERVICES, CARRIED BY THE SAME OBJECT",
        paragraphs: [
          "Four services — Esthetic Dentistry, General Dentistry, Orthodontics, Emergency Care — cycle through one shared description panel as the tooth holds its position beside them, each swap bringing its own photo pair, ambient color wash, and picker-label state with it.",
        ],
        bullets: [
          "Editorial mixed-emphasis headlines (styled after aventuradentalarts.com's own convention): the descriptive lead word stays upright ink, the key service term goes italic in that service's own accent color — never both on the same word",
          "Each service carries two real photos — a close detail shot and a wider environment shot — that swap in sync with the tooth's position, not a single generic image reused across all four",
          "Picker labels shift weight and color live as the active service changes: 0.7rem and muted at rest, 1.1rem, bold, and accent-colored the instant it becomes active",
        ],
      },
      {
        heading: "TECH DRIVEN: THE EQUIPMENT BEHIND THE CARE",
        paragraphs: [
          "A second, separate WebGL composition — real 3D equipment on a pedestal, its own Canvas context — introduces the clinical technology (3D Digital Scanning, AI-Assisted Diagnostics, Laser Dentistry, In-House 3D Printing) the same way Services introduced the human side: one description panel, four entries, the same dust-materialize transition language.",
        ],
      },
      {
        heading: "RESULTS: STATS THAT FALL, NOT COUNT UP",
        paragraphs: [
          "Most sites animate a stats section by ticking numbers upward. This one draws an actual smile: the tooth condenses into a glowing point and sweeps a real Bézier curve across the screen, tracing a smile-shaped line as it goes, before multiplying into five tooth-type variants — incisor, canine, premolar, molar, wisdom — each carrying its own stat as a label riding directly on its own mesh: 98% Patient Satisfaction, 15+ Years of Care, 10K+ Smiles Transformed, 3 Convenient Locations, 24/7 Emergency Support.",
          "Gravity is then switched on for real. The five teeth drop and settle into a bowl through an actual physics simulation, not a keyframed landing — scroll back up and they'll drop differently, because it's genuinely being computed, not replayed.",
        ],
      },
      {
        heading: "SIX REAL VOICES, NOT A CAROUSEL WIDGET",
        paragraphs: [
          "The closing chapter cycles six real patient testimonials — six deliberately, not the usual three, since three repeated too visibly across how long this chapter actually runs — underneath the tooth's final resting position, streamed past by a burst of photo sprites radiating outward from that same center point.",
        ],
      },
    ],
    impact: [
      {
        heading: "One persistent hero, zero throwaway sections",
        body: "The same 3D object anchors all nine chapters, so the site reads as one continuous performance rather than nine templates stitched end to end.",
      },
      {
        heading: "Real physics, not motion-graphics tricks",
        body: "The falling stat-teeth and the testimonial photo burst are both driven by actual simulation, not hand-tuned keyframes — which is why they never play back identically twice.",
      },
      {
        heading: "A clinic that looks like its own equipment",
        body: "AI-assisted diagnostics, laser dentistry, and in-house 3D printing now have a site precise enough to actually match them.",
      },
    ],
    gallery: [
      { type: "image", src: "/work/dental/esthetic.jpg", alt: "Esthetic dentistry treatment in progress", width: 4672, height: 7008 },
      { type: "video", src: "/work/dental/dental-vid.mp4", poster: "/work/dental/esthetic.jpg" },
      { type: "image", src: "/work/dental/orthodontic.jpg", alt: "Orthodontic care at the clinic", width: 4480, height: 6720 },
      { type: "image", src: "/work/dental/general.png", alt: "General dentistry check-up", width: 774, height: 1158 },
      { type: "image", src: "/work/dental/emergency.jpg", alt: "Emergency care at the clinic", width: 4000, height: 6000 },
    ],
  },
  {
    slug: "dedicto-song-dedication-app",
    title: "A Song, Dedicated to No One in Particular",
    // Self-initiated product, not client-commissioned work — presented as
    // such rather than invented as a "client."
    client: "dedic.to (self-initiated product)",
    tags: ["Website", "App", "Product Design", "Full-Stack"],
    cardImage: "/work/dedicto/cards.png",
    deliverables: ["Product Design", "Full-Stack Development"],
    involvement: ["UI/UX Design", "Interaction Design", "Front-end Development", "Backend Architecture"],
    // Grounded directly in the product's own brief: the anonymous
    // dedication mechanic, the zero-database URL-state architecture, and
    // the real Instagram-story viral loop it was designed around — not
    // fabricated user/growth numbers, which don't exist to cite honestly.
    results:
      "A two-page, database-free web app for dedicating a song to someone without naming them — built around a single viral loop: dedicate, get a shareable story card, someone taps it, they dedicate their own. The entire dedication state lives in the URL itself, no account, no backend to maintain. Interaction design centers on a discoverable 'song pixel field' — pixels glow, bend, and displace under touch before resolving into the track you're dedicating.",
    // TODO(studio): source folder access wasn't available this pass — the
    // fields above are the confirmed brief; challenge/approach/deepDives/
    // impact deliberately left unset rather than guessed. Fill in once
    // the dedic.to source is reachable.
    gallery: [
      { type: "image", src: "/work/dedicto/cards.png", alt: "The song-pixel-field interaction flow, idle through dedicate", width: 1536, height: 1024 },
      { type: "image", src: "/work/dedicto/hero.png", alt: "dedic.to wordmark", width: 2576, height: 610 },
    ],
  },
];

PROJECTS.push(
  {
    slug: "artisan-coffee-roastery-ecommerce",
    title: "Where Fire Meets Obsession",
    // Real line pulled directly from the project's own hero copy.
    client: "Independent Coffee Roastery",
    tags: ["Website", "E-Commerce", "Brand"],
    cardImage: "/work/coffee-roastry/roaster.jpg",
    deliverables: ["Website Design", "E-Commerce Development", "Brand Voice"],
    involvement: ["UI/UX Design", "Front-end Development", "Copywriting"],
    // Grounded in the project's own real copy and actual page structure
    // (shop, roast, journal, cart, get-in-touch) — a full storefront, not
    // a single-page brochure.
    results:
      "A full storefront for a single-origin coffee roastery — shop, roast-profile journal, and a roaster's-story video, built around one real line of copy: 'Where fire meets obsession.' Every product ships with a brew guide matched to that specific bag's character, not a generic care card.",
    // Read directly from app/page.js: the STATS array, the Marius Veil
    // quote, the MARQUEE_ITEMS list, and the actual featured-product
    // names (Ethiopia Yirgacheffe, FORMA Espresso Blend, Hario V60
    // Ceramic) are all real content pulled from the source, not invented.
    challenge: {
      heading: "A STOREFRONT BUILT AROUND ONE LINE OF COPY",
      paragraphs: [
        "Coffee e-commerce defaults to a predictable shape: a product grid, a subscribe prompt, a paragraph about beans that could belong to any roastery. The brief's own hero line — \"Where fire meets obsession\" — became the filter every other decision on the site had to pass through.",
        "Sourcing became the actual story instead of a footnote: Ethiopia, Colombia, and Kenya are named directly on the page as the roastery's traceable, ethical micro-lot origins, not folded into an unbacked \"ethically sourced\" badge.",
      ],
    },
    approach: {
      heading: "EVERY CLAIM GETS A NUMBER NEXT TO IT",
      paragraphs: [
        "Rather than lean on adjectives, the site backs its positioning with three real counters that animate into view on scroll, sitting directly beside the head roaster's own quote rather than floating above or below it as a separate module.",
      ],
      bullets: [
        "A per-letter hero entrance — each character of \"Where fire meets obsession\" animates in individually, timed against a bean-and-roasting-arch collision effect rather than a single block fade",
        "The head roaster's own voice, quoted directly rather than paraphrased into marketing copy: \"Roasting is not a process. It is a conversation with the bean.\" — Marius Veil, Head Roaster",
        "A running six-word marquee (Single Origin, Hand Roasted, Small Batch, Direct Trade, Ethically Sourced, Specialty Grade) in place of a static trust-badge row",
      ],
    },
    deepDives: [
      {
        heading: "THIS WEEK'S SELECTION, NOT A STATIC CATALOG",
        paragraphs: [
          "The featured-products section is framed as a rotating weekly pick — \"This week's selection.\" — rather than a generic \"Our Products\" heading. Three real items carry it: Ethiopia Yirgacheffe (single origin, light roast), FORMA Espresso Blend (house blend, medium-dark), and the Hario V60 Ceramic dripper — brew gear sitting directly alongside the coffee itself, not siloed into a separate accessories page.",
        ],
      },
      {
        heading: "A ROASTER'S STORY, ON VIDEO",
        paragraphs: [
          "A real embedded video plays inside the roastery's own story section — not a stock b-roll loop — giving the \"conversation with the bean\" quote something to stand next to besides plain text.",
        ],
      },
    ],
    impact: [
      {
        heading: "Positioning backed by numbers, not adjectives",
        body: "14 origins sourced globally, under 48 hours from roast to dispatch, 100% direct trade relationships — stated plainly, not implied.",
      },
      {
        heading: "A brew guide per bag",
        body: "Every product ships with guidance matched to that specific coffee's own character, not one generic care card reused across the whole catalog.",
      },
      {
        heading: "The founder's own words carry the philosophy section",
        body: "A direct quote from the head roaster, not marketing copy ghostwritten in his voice.",
      },
    ],
    gallery: [
      { type: "image", src: "/work/coffee-roastry/roaster.jpg", alt: "Fresh-roasted beans dropping from the roaster", width: 5243, height: 3495 },
      { type: "image", src: "/work/coffee-roastry/ethiopia-yirgacheffe.jpg", alt: "Ethiopia Yirgacheffe single-origin bag", width: 900, height: 900 },
      { type: "image", src: "/work/coffee-roastry/forma-espresso.jpg", alt: "FORMA Espresso Blend, medium-dark house blend", width: 900, height: 900 },
      { type: "image", src: "/work/coffee-roastry/hario-v60-ceramic.png", alt: "Hario V60 Ceramic dripper, brew gear", width: 1254, height: 1254 },
      { type: "image", src: "/work/coffee-roastry/colombia-huila.jpg", alt: "Colombia Huila single-origin bag", width: 900, height: 900 },
      { type: "image", src: "/work/coffee-roastry/sculpture.png", alt: "Roastery interior detail", width: 1130, height: 1392 },
    ],
  },
  {
    slug: "convergence-scroll-scrubbed-video-study",
    title: "A Film You Scroll Through, Not Watch",
    // Genuinely a self-directed technical study, not client work — the
    // repo itself has no client, no brief, no copy beyond the mechanism.
    // Presented honestly as that rather than invented as a commission.
    client: "Self-directed technical study",
    tags: ["Website", "Motion", "R&D"],
    cardImage: "/work/convergence/frame-10.webp",
    deliverables: ["Interaction Prototype"],
    involvement: ["Front-end Development", "Motion Design"],
    results:
      "An experiment in scroll-scrubbed video: scroll position drives playback frame-by-frame (an image sequence, not a passively-playing video element), so the footage plays exactly as fast or slow as you scroll, forward or backward, frame-accurate in both directions — the same underlying technique behind this studio's own scroll-driven scenes.",
    // Read directly from VideoScroll.tsx (the frame-extraction pipeline
    // and its own inline comments) and SectionText.tsx (the exact
    // three-line copy and its per-word/per-letter animation system) —
    // both real source, not summarized secondhand.
    challenge: {
      heading: "SIXTY FRAMES, ZERO VIDEO ELEMENT",
      paragraphs: [
        "Rather than embedding a <video> tag and calling scroll-triggered playback \"cinematic,\" this build extracts 60 individual frames from a source video client-side — through a hidden <video> element, a scratch canvas, and createImageBitmap — caches them as GPU-resident bitmaps, and hands scroll position direct, un-eased control over which one paints.",
        "No video element is ever visible on screen; the canvas is the only output surface. Scroll all the way down, then scroll back up instantly — the footage responds exactly as fast as the scrollbar does, in either direction, because there's no decode latency left to hide.",
      ],
    },
    approach: {
      heading: "BUILT LIKE A RENDERING PIPELINE, NOT A SCROLL EFFECT",
      paragraphs: [
        "Every choice in the canvas setup exists to remove a specific, measured source of latency — not general-purpose optimization, but the exact bottlenecks this particular technique runs into.",
      ],
      bullets: [
        "`desynchronized: true` and `alpha: false` on the canvas context, plus direct frame-index math with zero interpolation — \"no decode, no latency\" by design, not by accident",
        "A real loading screen — an actual count of frames extracted so far out of 60, shown as a genuine progress bar — instead of a generic spinner, since frame extraction really is the bottleneck and hiding that felt dishonest",
        "A three-line thesis typeset like it's being thought in real time: \"Every pixel has a purpose.\" → \"Every project, a reason.\" → \"This is the work.\" — each key word gets its own typography: a literal pixel font for \"pixel,\" italic serif for \"project,\" and an oversized neon-lime \"work.\" that floats and glows once it settles",
      ],
    },
    deepDives: [
      {
        heading: "TEXT THAT SCATTERS INTO PLACE, NOT FADES",
        paragraphs: [
          "Every word — and for the pixel-font moment, every individual letter — animates in from its own randomized offset and rotation. The randomness is deterministic (a seeded pseudo-random function, not Math.random()) specifically so the layout can never mismatch between server and client render. Exiting is faster than entering (0.33s vs 0.58s) and scatters in a different direction than the entrance came from, so the same word never reads as simply rewinding its own animation.",
        ],
      },
      {
        heading: "A SIDE-RAIL THAT ALWAYS KNOWS WHERE YOU ARE",
        paragraphs: [
          "A vertical three-dot progress rail on the right edge tracks which third of the scroll you're currently in, with a pinging ring animating around the active dot — the only persistent UI chrome on an otherwise full-bleed page.",
        ],
      },
    ],
    impact: [
      {
        heading: "Frame-accurate playback in both directions",
        body: "The same underlying scroll-scrubbing technique this studio's own site uses for its scenes — proven out here first, as a standalone study.",
      },
      {
        heading: "A genuinely real loading state",
        body: "The progress bar reflects actual frames extracted, not a disguised timer — because at 60 frames, extraction really is the wait.",
      },
      {
        heading: "Proof \"cinematic scroll\" doesn't need a video element",
        body: "Just the willingness to treat frames as data and let scroll position — not a media element's own clock — be the only thing driving playback.",
      },
    ],
    gallery: [
      { type: "image", src: "/work/convergence/frame-01.webp", alt: "Scroll-scrubbed sequence, frame 1", width: 1344, height: 768 },
      { type: "image", src: "/work/convergence/frame-10.webp", alt: "Scroll-scrubbed sequence, frame 10", width: 1344, height: 768 },
      { type: "image", src: "/work/convergence/frame-20.webp", alt: "Scroll-scrubbed sequence, frame 20", width: 1344, height: 768 },
    ],
  },
  {
    slug: "titli-gifting-ecommerce",
    title: "Five Questions Before Every Gift",
    // Real, live client site (shopattitli.in) built for a friend's
    // business, consent confirmed directly by the studio before this was
    // written up. Every specific below — the five-step guide's exact
    // copy, the loyalty program's three steps, the collaboration form's
    // fields — was read live off the site itself, not summarized from
    // memory.
    client: "TITLI",
    tags: ["Website", "E-Commerce", "Brand"],
    cardImage: "/work/titli/hero.png",
    deliverables: ["Website Design", "E-Commerce Development", "Brand Identity"],
    involvement: ["UI/UX Design", "Front-end Development", "E-Commerce Development", "Brand Identity"],
    results:
      "A full gifting storefront — Rakhi combos, jewelry, hair accessories, keychains, gift boxes — built around a five-step 'Build a Box' mood guide that sits in the primary nav with equal weight to the shop itself, plus a loyalty program, a real customer-moments gallery paired with shoppable product shots, and a collaboration form letting other small brands apply to sell through TITLI's own curated hampers.",
    challenge: {
      heading: "A GIFT SHOP THAT ASKS BEFORE IT SELLS",
      paragraphs: [
        "Most small-brand gifting sites default to the same shape as any other online store: a nav bar of categories, a grid of products, a checkout button. TITLI's brief needed the opposite — a Rakhi-and-jewelry gifting shop that still feels personal even though nobody on the other end knows who the giver is actually shopping for.",
        "The build leads with a question, not a catalog. A five-step mood-and-occasion guide — Build a Box — sits in the primary nav with the same weight as \"Shop Gifts,\" not tucked away as a secondary tool.",
      ],
    },
    approach: {
      heading: "PERSONALIZATION AS THE ACTUAL NAVIGATION, NOT A WIDGET",
      paragraphs: [
        "Rather than bolt a \"gift finder\" quiz onto an existing catalog as an afterthought, the site is organized around narrowing down to a person and a mood before it ever shows a product grid.",
      ],
      bullets: [
        "A five-step, auto-playing guide (recipient, occasion, mood, style, budget) with color-coded pill choices — Cute, Funny, Soft, Premium, Quirky, Self-Care — instead of a plain dropdown filter",
        "A rotating festive-category marquee (Gift Box Drama, Retro Notes, Sweet Memories, Photo Cards, Pure Nostalgia, Made With Pyaar) that reads as a mood board, not a taxonomy",
        "A launch-sale banner and a plainly stated free-delivery threshold (₹199) at the top of every page, not buried in a footer",
      ],
    },
    deepDives: [
      {
        heading: "REAL MOMENTS, PAIRED WITH REAL PRODUCTS",
        paragraphs: [
          "The \"TITLI, Out in the World\" section pairs an actual customer lifestyle photo — tagged by city, Bengaluru, Kolkata, Hyderabad — with a matching clean product shot and its live price, swipeable side by side. Every story genuinely has two frames: the moment, then the exact thing to buy to recreate it, not a generic stock UGC wall.",
        ],
      },
      {
        heading: "A BRAND SHELF, NOT JUST A STORE",
        paragraphs: [
          "A \"Launch With Us\" collaboration form lets other small gifting brands apply directly on the site — name, email, a description of their brand, up to three catalogue documents — to get featured inside TITLI's own curated hampers while keeping their own identity. Turns TITLI from a single-brand storefront into a small platform other brands can apply to join.",
        ],
      },
      {
        heading: "REWARDS THAT COST NOTHING TO JOIN",
        paragraphs: [
          "TITLI Rewards is presented as a three-step, always-free loyalty program — join, share your birthday month and gift preferences, get member-only add-ons and early access — rather than a paid membership tier, so sign-up friction stays at zero.",
        ],
      },
    ],
    impact: [
      {
        heading: "A gift-finder that's the front door, not a sidebar widget",
        body: "The five-step Build a Box guide gets equal nav weight to the shop itself, not buried as a secondary tool.",
      },
      {
        heading: "Real photography married to real customer moments",
        body: "City-tagged lifestyle shots paired with matching shoppable product views, not generic stock UGC.",
      },
      {
        heading: "A collaboration channel built into the site itself",
        body: "Other small gifting brands can apply directly on-site to be featured in TITLI's own hampers.",
      },
    ],
    gallery: [
      { type: "image", src: "/work/titli/hero.png", alt: "TITLI homepage hero — Rakhi combos and launch sale", width: 1440, height: 900 },
      { type: "image", src: "/work/titli/build-a-box.png", alt: "Build a Box — the five-step gift mood guide", width: 1440, height: 900 },
      { type: "image", src: "/work/titli/categories.png", alt: "Shop by category grid", width: 1440, height: 900 },
      { type: "image", src: "/work/titli/product.png", alt: "Product page — Emerald Jagannath Duo Rakhi combo", width: 1440, height: 900 },
      { type: "image", src: "/work/titli/ugc.png", alt: "TITLI, Out in the World — real customer moments paired with products", width: 1440, height: 900 },
    ],
  },
);

export function getProject(slug: string): Project | undefined {
  return PROJECTS.find((p) => p.slug === slug);
}
