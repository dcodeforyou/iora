/**
 * AI Films registry.
 *
 * Every record below describes a real file in this repo. Durations, pixel
 * dimensions and aspect ratios are never written here — they are probed
 * from the shipping master by scripts/generate-film-metadata.mjs and
 * attached at read time (see ResolvedFilm). The registry holds only what a
 * human decided; the media holds everything the media knows.
 *
 * ── CLAIM POLICY ──────────────────────────────────────────────────────
 * `status` distinguishes commissioned work from self-initiated work, and
 * only a record with `clientNameVerified` may print a client's name. The
 * UnderRoof films carry that name because it is on screen in the footage
 * and its use was confirmed directly. The three commissioned AI films
 * genuinely are client work, but their clients have not been named to me —
 * so they are marked `client` (no SPEC badge, which would be a lie in the
 * other direction) while showing no client name at all. Guessing one would
 * be inventing a relationship.
 *
 * No metric, result or performance claim appears anywhere in this file.
 * None was supplied, and none can be inferred from footage.
 *
 * ── TITLE RULE (governs every future addition) ────────────────────────
 * On the index, clarity beats cleverness. `title` says WHAT THE WORK IS —
 * the format a prospective client is looking at — and `subtitle` says what
 * makes this particular execution distinct. The poetic name moves to
 * `creativeTitle` and appears only on the detail page.
 *
 * The test a new title has to pass: given only the title and the poster
 * for one second, does a hotel owner or an automotive brand know which
 * capability is being demonstrated? If not, rewrite it.
 *
 * "AI" belongs in a title only when it IS the differentiator — a model-led
 * walkthrough is a format you cannot shoot conventionally, so it earns the
 * prefix. "AI Property Walkthrough" does not: the section is already
 * called AI Films, and Property Walkthrough already tells them everything.
 */

import { FILM_MEDIA } from "./filmMedia.generated";

/** mm:ss, extending to h:mm:ss past an hour. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export type FilmTag = "Hospitality & Property" | "Automotive" | "Campaign Films" | "Craft & Restoration";

export type FilmStatus = "client" | "spec" | "experimental";

/** Pill order on the index. "All" is never stored on a record — it is the
 *  absence of a filter, so it cannot fall out of sync with this union. */
export const FILM_TAGS: readonly FilmTag[] = [
  "Hospitality & Property",
  "Automotive",
  "Campaign Films",
  "Craft & Restoration",
];

export interface Film {
  slug: string;
  /** What the work IS — the scannable format name. See the title rule. */
  title: string;
  /** Trailing words of `title`, rendered coral on the detail page. */
  titleAccent: string;
  /** The campaign/concept name. Kept because it carries the creative
   *  thinking, demoted because it does not survive a one-second scan.
   *  Detail page only. */
  creativeTitle?: string;
  /** What makes THIS execution distinct, in plain English. */
  subtitle: string;
  /** The kind of film, in plain language. */
  type: string;
  status: FilmStatus;
  year: number;
  tags: FilmTag[];
  /** Named only where confirmed — see the claim policy above. */
  client?: string;
  clientNameVerified?: boolean;
  role: string;
  goal: string;
  /** Editorial statement; line 2 renders coral. */
  statement: [string, string];
  body: string[];
  /** The one shot that stays with you, and why it earns its place. */
  memoryShot: { timestamp: number; description: string; whyItStays: string };
  gallery: { src: string; purpose: string }[];
  featured?: boolean;
}

/** Assets follow one convention per film, so paths are derived, not typed. */
const dir = (slug: string) => `/films/${slug}`;

export const FILMS: Film[] = [
  {
    slug: "the-future-can-wait",
    title: "Hospitality Campaign Film",
    titleAccent: "Campaign Film",
    creativeTitle: "The Future Can Wait",
    subtitle: "An offbeat mountain retreat argued against a fully automated life.",
    type: "Hospitality Film",
    status: "spec",
    year: 2026,
    tags: ["Hospitality & Property", "Campaign Films"],
    role: "Concept, direction, AI production, edit",
    goal: "Give a remote property a reason to be chosen that a rate card cannot argue with.",
    statement: ["Everything can be delivered.", "Almost nothing can be arrived at."],
    body: [
      "Remote properties are usually sold on what they have — the view, the suite count, the drive time from the nearest airport. The problem is that every other remote property has a view too, and a list of features is an invitation to compare on price.",
      "So this one is not sold on what it has. It is sold against something: a life so completely serviced that there is nothing left to go and find. The film opens inside that life — white rooms, glass walls, a companion that is a face in a lit panel rather than a person — and holds there long enough for it to stop looking aspirational and start looking airless.",
      "The turn is deliberately small. Bare feet on wet grass, then a hand on a carved wooden door. After a minute of surfaces that cannot be felt, texture does the arguing on its own, and the rest of the film simply keeps giving her things to touch: timber, stained glass, a hot cup, cold mountain air.",
      "The smart band stays on her wrist through every one of those shots, and that is the point rather than an oversight. This is not a film about rejecting the future. It is about choosing where you meet it — which is a proposition a property can actually deliver on, unlike switching off.",
      "Made without a shoot, which is the only reason a spec film gets to open on a fully realised automated interior and close on Himalayan light at dusk. Neither location is bookable; both are load-bearing.",
    ],
    memoryShot: {
      timestamp: 22,
      description:
        "Bare feet stepping onto real grass at dusk, cutting straight out of the sealed glass interior.",
      whyItStays:
        "It is the first thing in the film with a texture, and it arrives without a word of explanation. The cut does the whole argument in under a second — everything before it was looked at through glass, and this is the first thing anyone actually stands on.",
    },
    gallery: [
      {
        src: `${dir("the-future-can-wait")}/frame-01.webp`,
        purpose: "The automated life, stated plainly before it is argued with",
      },
      {
        src: `${dir("the-future-can-wait")}/frame-02.webp`,
        purpose: "Carved timber — the first surface worth touching",
      },
      {
        src: `${dir("the-future-can-wait")}/frame-03.webp`,
        purpose: "The evening the stay is actually sold on",
      },
    ],
  },
  {
    slug: "the-rain-stays-outside",
    title: "AI Model Walkthrough",
    titleAccent: "Walkthrough",
    creativeTitle: "The Rain Stays Outside",
    subtitle: "Luxury hospitality walkthrough with a model-led guest journey.",
    type: "Hospitality Film",
    status: "client",
    year: 2026,
    tags: ["Hospitality & Property", "Campaign Films"],
    role: "Concept, direction, AI production, edit",
    goal: "Turn destination interest into direct enquiries before a rate is ever discussed.",
    statement: ["Weather you watch,", "not weather you're in."],
    body: [
      "Nobody books a retreat on its square footage. They book a version of themselves that exists there — warmer, slower, further from whatever they are leaving. The film's whole job is to make that version specific enough to want.",
      "So it opens in rain rather than sunshine. Glass, woodsmoke and a lit interior read as shelter only when there is something to be sheltered from, and the property's real argument is that the weather becomes something you watch rather than something you are in.",
      "Made without a shoot, which is what makes it possible at all — no crew flown out, no weather window to wait for, no closing a property to paying guests in order to film it empty.",
    ],
    memoryShot: {
      timestamp: 26,
      description: "A hand breaking the surface of the indoor pool, mist and forest held behind glass beyond it.",
      whyItStays:
        "It is the only moment in the film where someone touches the place. Everything else is looked at; this is felt, and it lands exactly where the viewer is deciding whether they can picture themselves there.",
    },
    gallery: [
      {
        src: `${dir("the-rain-stays-outside")}/frame-01.webp`,
        purpose: "Arrival — the property read as shelter, in weather",
      },
      {
        src: `${dir("the-rain-stays-outside")}/frame-02.webp`,
        purpose: "Interior warmth against the cold outside",
      },
      {
        src: `${dir("the-rain-stays-outside")}/frame-03.webp`,
        purpose: "The evening the stay is actually sold on",
      },
    ],
    featured: true,
  },
  {
    slug: "nobody-has-arrived-yet",
    title: "Property Walkthrough",
    titleAccent: "Walkthrough",
    creativeTitle: "Nobody Has Arrived Yet",
    subtitle: "Architecture, interiors and views presented as a premium guest journey.",
    type: "Property Film",
    status: "client",
    year: 2026,
    tags: ["Hospitality & Property"],
    role: "Concept, direction, AI production, edit",
    goal: "Let a high-value property qualify its own enquiries before a viewing is scheduled.",
    statement: ["An empty house", "is an invitation."],
    body: [
      "Populate a villa with actors and you have told the viewer whose holiday this is. Leave it empty and it stays theirs. At this end of the market that restraint is the pitch: the buyer is not shopping for a lifestyle to copy, they are looking for room to put their own life down.",
      "The camera moves the way someone actually moves through a house they are considering — the approach, the threshold, the light in the main room, then the view that decides it. Nothing is hurried, because hurry reads as selling.",
    ],
    memoryShot: {
      timestamp: 26,
      description: "The living room at sunset, doors open, the sea filling the gap where a wall would be.",
      whyItStays:
        "It answers the only question that matters for a property at this price — what does the good hour here look like — and it answers it without a word of narration.",
    },
    gallery: [
      {
        src: `${dir("nobody-has-arrived-yet")}/frame-01.webp`,
        purpose: "The setting, established before the building",
      },
      {
        src: `${dir("nobody-has-arrived-yet")}/frame-02.webp`,
        purpose: "Threshold and material — what the house is made of",
      },
      { src: `${dir("nobody-has-arrived-yet")}/frame-03.webp`, purpose: "The view the decision gets made on" },
    ],
  },
  {
    slug: "built-for-the-dark",
    title: "Automotive Commercial",
    titleAccent: "Commercial",
    creativeTitle: "Built for the Dark",
    subtitle: "A cinematic car film focused on design, presence and controlled light.",
    type: "Automotive Film",
    status: "client",
    year: 2026,
    tags: ["Automotive", "Campaign Films"],
    role: "Concept, direction, AI production, edit",
    goal: "Hold attention in the first second, on a feed where the second one is never guaranteed.",
    statement: ["Short enough to finish.", "Loud enough to stay."],
    body: [
      "A fourteen-second film has no second act to recover in. Everything is spent on the opening: dust and dark resolving into a shape, the shape resolving into a car, the car already gone.",
      "The palette is a single decision — no daylight anywhere — because a car shot in the dark is described entirely by its own light. Underglow, tunnel strips and the streaks they leave do the work a location would otherwise have to do.",
    ],
    memoryShot: {
      timestamp: 9.5,
      description: "The car arriving inside its own light streaks, the road reading as speed rather than as surface.",
      whyItStays:
        "It is the single frame where the film stops being atmosphere and becomes a product shot, and it arrives late enough that the viewer has already committed to watching.",
    },
    gallery: [
      { src: `${dir("built-for-the-dark")}/frame-01.webp`, purpose: "The build — before there is a car to see" },
      { src: `${dir("built-for-the-dark")}/frame-02.webp`, purpose: "The reveal, at speed" },
      { src: `${dir("built-for-the-dark")}/frame-03.webp`, purpose: "The exit — colour without a subject" },
    ],
  },
  {
    slug: "the-city-owes-you-nothing",
    title: "Fashion Campaign Film",
    titleAccent: "Campaign Film",
    creativeTitle: "The City Owes You Nothing",
    subtitle: "A fashion-led campaign built for mood, recall and social-first attention.",
    type: "Campaign Film",
    status: "spec",
    year: 2026,
    tags: ["Campaign Films"],
    role: "Concept, direction, AI production, edit",
    goal: "Show a garment as something worn somewhere, rather than photographed on someone.",
    statement: ["Clothes photograph flat.", "People don't."],
    body: [
      "Product shots of streetwear tend to fail the same way: the garment is perfectly lit and completely inert. Nobody buys a jacket to stand still in.",
      "So the film is built from movement that would be expensive to stage — a drop to the ground mid-spin, a run through standing water, a look held a beat too long. The clothes stay legible throughout, but they are never the subject on their own.",
      "Self-initiated. It exists to prove a production standard for fashion clients, not to represent a commission.",
    ],
    memoryShot: {
      timestamp: 11,
      description: "The dancer inverted on wet ground, red and blue light splitting across the asphalt.",
      whyItStays:
        "It is the one frame that could not have been a photograph. The whole argument of the piece is compressed into a shot that only works because it is moving.",
    },
    gallery: [
      {
        src: `${dir("the-city-owes-you-nothing")}/frame-01.webp`,
        purpose: "Setting and palette established in one shot",
      },
      {
        src: `${dir("the-city-owes-you-nothing")}/frame-02.webp`,
        purpose: "Movement the garment has to survive",
      },
      {
        src: `${dir("the-city-owes-you-nothing")}/frame-03.webp`,
        purpose: "The held look — product legible, person first",
      },
    ],
  },
  {
    slug: "underroof-written-off",
    title: "Automotive Restoration Film",
    titleAccent: "Restoration Film",
    creativeTitle: "Written Off. Then Not",
    subtitle: "Restoration craftsmanship shaped into a clear transformation story.",
    type: "Restoration Film",
    status: "client",
    year: 2026,
    client: "UnderRoof Autobody Collision",
    clientNameVerified: true,
    tags: ["Craft & Restoration", "Automotive"],
    role: "Direction, edit, colour",
    goal: "Make the quality of a repair legible to someone who will never see the workshop.",
    statement: ["Anyone can show the finish.", "The proof is the before."],
    body: [
      "Collision work has an evidence problem: the better it is, the less there is to see. A perfect repair looks like nothing happened, which is indistinguishable from nothing having happened.",
      "So the film refuses to start at the end. It opens on dashcam timecode and a wrecked shell being dragged in — suspension folded, panels on the floor — and only then earns the right to show clean paint. The restored car means something because the ruin was shown first.",
      "Filmed in the shop, on the real repair. Nothing here is a recreation.",
    ],
    memoryShot: {
      timestamp: 30,
      description: "Gloved hands smoothing the UnderRoof decal onto finished paint.",
      whyItStays:
        "It is the moment the car stops being a job and becomes signed work. A logo applied by hand to a surface someone rebuilt reads as a claim the shop is willing to put its name on.",
    },
    gallery: [
      { src: `${dir("underroof-written-off")}/frame-01.webp`, purpose: "The before — damage, unedited" },
      { src: `${dir("underroof-written-off")}/frame-02.webp`, purpose: "Detail that proves the extent of the work" },
      { src: `${dir("underroof-written-off")}/frame-03.webp`, purpose: "The finish, earned rather than asserted" },
    ],
    featured: true,
  },
  {
    slug: "underroof-detail-bay",
    title: "Automotive Workshop Walkthrough",
    titleAccent: "Workshop Walkthrough",
    creativeTitle: "Under the Hex Light",
    subtitle: "A workshop film built around process, detail and credibility.",
    type: "Workshop Film",
    status: "client",
    year: 2026,
    client: "UnderRoof Autobody Collision",
    clientNameVerified: true,
    tags: ["Craft & Restoration", "Automotive"],
    role: "Direction, edit, colour",
    goal: "Give a workshop the visual credibility its results already have.",
    statement: ["Good light is not decoration.", "It is the inspection."],
    body: [
      "Hex lighting exists in these bays for a working reason: broad, even, and hard to hide behind. A panel that looks right under it is right. The film treats that as the subject rather than as set dressing.",
      "Shot as a walk through the bay rather than as a highlight reel — the cars are the ones that happened to be in, which is the point. A shop that only looks good on its best day is not showing you a shop.",
    ],
    memoryShot: {
      timestamp: 6,
      description: "The hex array reflected whole across a black bonnet, unbroken.",
      whyItStays:
        "An unbroken reflection is the oldest proof of a flat panel there is. The shot is simultaneously the most beautiful thing in the film and its hardest technical claim.",
    },
    gallery: [
      { src: `${dir("underroof-detail-bay")}/frame-01.webp`, purpose: "The light itself, as the working condition" },
      { src: `${dir("underroof-detail-bay")}/frame-02.webp`, purpose: "Reflection as evidence of finish" },
      { src: `${dir("underroof-detail-bay")}/frame-03.webp`, purpose: "The bay as it actually runs" },
    ],
  },
  {
    slug: "underroof-highway-run",
    title: "Automotive Motion Film",
    titleAccent: "Motion Film",
    creativeTitle: "The Long Way Back",
    subtitle: "Motion, road and scale used to give the vehicle cinematic presence.",
    type: "Automotive Film",
    status: "client",
    year: 2026,
    client: "UnderRoof Autobody Collision",
    clientNameVerified: true,
    tags: ["Automotive"],
    role: "Direction, edit, colour",
    goal: "Close the loop between a repair bay and the reason anyone owns the car.",
    statement: ["The shop is the middle", "of the story."],
    body: [
      "A workshop film that ends in the workshop has stopped one beat early. The car was never the point — the road was, and the repair only matters because it puts someone back on it.",
      "Shot in daylight on open highway, deliberately against the register of the other two films. Where the collision piece is close, dark and forensic, this is wide and unhurried. Same client, opposite end of the same sentence.",
    ],
    memoryShot: {
      timestamp: 4,
      description: "The yellow car held steady in frame while the road blurs past underneath it.",
      whyItStays:
        "Everything moves except the subject. It is the visual definition of a car being driven properly rather than merely photographed fast.",
    },
    gallery: [
      { src: `${dir("underroof-highway-run")}/frame-01.webp`, purpose: "The car in its actual context" },
      { src: `${dir("underroof-highway-run")}/frame-02.webp`, purpose: "Scale and speed without a speedometer" },
      { src: `${dir("underroof-highway-run")}/frame-03.webp`, purpose: "The road, which is the real subject" },
    ],
  },
];

/**
 * A film with its real media facts attached.
 *
 * Everything the UI shows about duration or shape comes from here and here
 * only — the registry above deliberately has no runtime string and no
 * aspect ratio to get out of step with the file it describes.
 */
export interface ResolvedFilm extends Film {
  width: number;
  height: number;
  aspectRatio: number;
  durationSeconds: number;
  durationLabel: string;
  /** Card metadata line, composed — never stored. */
  metaLine: string;
  poster: string;
  /** The full film, used by the detail-page player. */
  videoSrc: string;
  /** Short silent loop for card hover. Never required for layout. */
  preview: string;
}

function resolveFilm(film: Film): ResolvedFilm {
  const videoSrc = `${dir(film.slug)}/master.mp4`;
  const media = FILM_MEDIA[videoSrc];
  if (!media) {
    // Loud on purpose: a film whose master has no probed metadata would
    // otherwise render with a guessed shape.
    throw new Error(`No media metadata for ${videoSrc}. Run \`npm run film:meta\` after adding the film folder.`);
  }
  const durationLabel = formatDuration(media.durationSeconds);
  return {
    ...film,
    width: media.width,
    height: media.height,
    aspectRatio: media.width / media.height,
    durationSeconds: media.durationSeconds,
    durationLabel,
    metaLine: `${film.type} / ${durationLabel} / ${film.status === "spec" ? "SPEC" : film.year}`,
    poster: `${dir(film.slug)}/poster.webp`,
    videoSrc,
    preview: `${dir(film.slug)}/preview.mp4`,
  };
}

export const RESOLVED_FILMS: ResolvedFilm[] = FILMS.map(resolveFilm);

export function getFilm(slug: string): ResolvedFilm | undefined {
  return RESOLVED_FILMS.find((f) => f.slug === slug);
}

/** Source order is never re-ranked by filtering — a film simply appears
 *  under every tab whose tag it holds, from the one record. */
export function filmsForTag(tag: FilmTag | "All"): ResolvedFilm[] {
  return tag === "All" ? RESOLVED_FILMS : RESOLVED_FILMS.filter((f) => f.tags.includes(tag));
}
