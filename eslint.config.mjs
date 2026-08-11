import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The scene/motion layer (WebGL + GSAP scroll timelines) intentionally
    // mutates plain objects returned from useMemo/useRef outside of React's
    // render cycle — a scroll timeline or a useFrame loop writes `.value`
    // every frame, deliberately bypassing React state so driving 60fps
    // camera/shard motion never triggers a re-render. See AGENTS.md and
    // dental-website's GlassTooth.tsx for the precedent this follows.
    // React Compiler's mutability rules assume plain hook-returned values are
    // never written to after render, which this pattern violates by design —
    // scoped off here rather than disabled project-wide.
    files: [
      "src/components/scene/**/*.{ts,tsx}",
      "src/lib/scroll/**/*.{ts,tsx}",
      // DOM-side scroll orchestration (ScrollTrigger onUpdate callbacks
      // writing into shared progress state) follows the same pattern —
      // add new beat/section directories here as they're built, per the
      // convention documented in AGENTS.md.
      "src/components/hero/**/*.{ts,tsx}",
      // ProofSection's WebGL glass layer: mesh.position/uniforms written
      // every useFrame from a plain state object GSAP's onUpdate mutates.
      "src/components/proof/**/*.{ts,tsx}",
    ],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
]);

export default eslintConfig;
