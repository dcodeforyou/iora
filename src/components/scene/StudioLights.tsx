"use client";

import { Lightformer } from "@react-three/drei";

/**
 * Fully procedural stand-in for an HDRI studio preset — six soft panels
 * boxing the shards in from every side, rendered into a cubemap on the GPU
 * by <Environment>'s children-render mode. No file, no network fetch, so it
 * can never be the thing that hangs first paint. A faint ice-blue tint
 * (matches --color-glass-glow) instead of pure white keeps the glass reading
 * pristine rather than flat/dull.
 */
export default function StudioLights() {
  return (
    <>
      <Lightformer intensity={2.2} color="#eaf6ff" position={[0, 6, 0]} scale={[10, 10, 1]} rotation={[Math.PI / 2, 0, 0]} />
      <Lightformer intensity={1.4} color="#eaf6ff" position={[0, -6, 0]} scale={[10, 10, 1]} rotation={[-Math.PI / 2, 0, 0]} />
      <Lightformer intensity={1.6} color="#ffffff" position={[-6, 0, 0]} scale={[10, 10, 1]} rotation={[0, Math.PI / 2, 0]} />
      <Lightformer intensity={1.6} color="#ffffff" position={[6, 0, 0]} scale={[10, 10, 1]} rotation={[0, -Math.PI / 2, 0]} />
      <Lightformer intensity={1.1} color="#ffffff" position={[0, 0, 6]} scale={[10, 10, 1]} />
      <Lightformer intensity={1.1} color="#eaf6ff" position={[0, 0, -6]} scale={[10, 10, 1]} rotation={[0, Math.PI, 0]} />
    </>
  );
}
