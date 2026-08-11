// Shared between ImpactSection (owns the marble's condense/spawn from the
// glow) and ProofSection (owns the glass cards it falls onto and hops
// between) so the marble's landing point and the card's geometry can't
// drift apart.

// Card's top edge, as a fraction of viewport height from the top — kept
// LOW (well above center) so most of the card is visible, per feedback
// that the original 62vh placement left barely a third of it on screen.
// This is a FALLBACK/initial value only — ProofSection measures the
// card's real top edge from the DOM (getBoundingClientRect) once
// mounted and uses that measured value for the marble's actual resting
// position, rather than trusting this constant to stay in sync with
// whatever the card's real rendered position happens to be.
export const PROOF_CARD_TOP_VH = 0.36;
