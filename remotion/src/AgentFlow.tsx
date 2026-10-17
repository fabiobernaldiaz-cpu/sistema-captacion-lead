import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { FlowScene } from "./scenes/FlowScene";

/* Vídeo panorámico en bucle para la cabecera de metodo.html. */
export const AgentFlow: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ fov: 30, near: 0.1, far: 60, position: [0, 1.35, 9.2] }}
        gl={{ antialias: true }}
      >
        <FlowScene t={t} />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
