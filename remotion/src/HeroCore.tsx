import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { CoreScene } from "./scenes/CoreScene";

/* Vídeo cuadrado en bucle para la portada (index.html). Fondo negro puro
   para fundirse con el hero: en la web se pinta con mix-blend-mode: screen. */
export const HeroCore: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ fov: 32, near: 0.1, far: 60, position: [0, 0, 7.4] }}
        gl={{ antialias: true }}
      >
        <CoreScene t={t} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
