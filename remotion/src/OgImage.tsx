import React from "react";
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { loadFont } from "@remotion/fonts";
import { CoreScene } from "./scenes/CoreScene";

loadFont({ family: "Fraunces", url: staticFile("fonts/fraunces-latin-opsz-normal.woff2"), weight: "100 900" });
loadFont({ family: "Fraunces", url: staticFile("fonts/fraunces-latin-opsz-italic.woff2"), weight: "100 900", style: "italic" });
loadFont({ family: "Inter", url: staticFile("fonts/inter-latin-wght-normal.woff2"), weight: "100 900" });

/* Imagen para compartir en redes (og:image / twitter:image), 1200×630. */
export const OgImage: React.FC = () => {
  const { height } = useVideoConfig();
  const sceneSize = height + 120;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: "Inter" }}>
      <div style={{ position: "absolute", right: -150, top: -60, width: sceneSize, height: sceneSize }}>
        <ThreeCanvas width={sceneSize} height={sceneSize} camera={{ fov: 32, position: [0, 0, 7.4] }} gl={{ antialias: true }}>
          <CoreScene t={0.08} distance={6.6} />
        </ThreeCanvas>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, #000 0%, #000 38%, rgba(0,0,0,0.6) 58%, rgba(0,0,0,0) 76%)",
        }}
      />
      <div style={{ position: "absolute", left: 72, top: 64, display: "flex", alignItems: "center", gap: 14 }}>
        <Img src={staticFile("logo.png")} style={{ width: 46, height: 46 }} />
        <span style={{ color: "#fff", fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>
          Redesia<span style={{ fontWeight: 300 }}>Net</span>
        </span>
      </div>
      <div style={{ position: "absolute", left: 72, top: 178, width: 640 }}>
        <div style={{ fontFamily: "Fraunces", color: "#fff", fontSize: 76, lineHeight: 1.02, letterSpacing: -2, fontWeight: 500 }}>
          Agentes de IA que <span style={{ fontStyle: "italic", color: "#00D4FF" }}>trabajan</span>.
        </div>
        <div style={{ color: "#B4B4BE", fontSize: 28, marginTop: 26, lineHeight: 1.35 }}>
          Automatizaciones y agentes para pymes.
          <br />
          Desde <b style={{ color: "#fff" }}>149 €/mes</b> · Auditoría gratuita
        </div>
      </div>
      <div style={{ position: "absolute", left: 72, bottom: 54, color: "#6E6E78", fontSize: 22, letterSpacing: 1 }}>
        redesianet.com
      </div>
    </AbsoluteFill>
  );
};
