import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CYAN, TAU, glowTexture, mulberry32 } from "../lib/three-helpers";

/* ══════════════════════════════════════════════════════════════
   EL NÚCLEO — la pieza 3D de la portada.
   Una esfera negra pulida (el agente) rodeada por tres órbitas finas
   (tus sistemas: CRM, ERP, correo…). Los nodos blancos son las
   herramientas; los destellos cian son tareas que el agente se pasa
   de un sistema a otro.

   Todo depende de `t` (0 → 1 a lo largo del loop) y cada movimiento da
   un número entero de vueltas, así el vídeo enlaza sin costura.
   ══════════════════════════════════════════════════════════════ */

type Ring = {
  r: number;
  tilt: [number, number, number];
  nodes: number[];
  nodeTurns: number;
  pulses: number[];
  pulseTurns: number;
};

const RINGS: Ring[] = [
  { r: 1.55, tilt: [1.22, 0.18, 0], nodes: [0.0, 0.5], nodeTurns: 1, pulses: [0.12], pulseTurns: 2 },
  { r: 1.86, tilt: [0.34, 0.92, 0.28], nodes: [0.16, 0.49, 0.81], nodeTurns: -1, pulses: [0.33, 0.83], pulseTurns: -3 },
  { r: 2.14, tilt: [-0.62, -0.48, 0.82], nodes: [0.06, 0.63], nodeTurns: 1, pulses: [0.57], pulseTurns: 2 },
];

const TRAIL = 14;

const Environment: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.85;
    pmrem.dispose();
  }, [gl, scene]);
  return null;
};

const CameraRig: React.FC<{ t: number; distance: number }> = ({ t, distance }) => {
  const camera = useThree((s) => s.camera);
  camera.position.set(Math.sin(t * TAU) * 0.38, 0.12 + Math.cos(t * TAU) * 0.2, distance);
  camera.lookAt(0, 0, 0);
  return null;
};

const Dust: React.FC = () => {
  const positions = useMemo(() => {
    const rand = mulberry32(7);
    const n = 520;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const phi = rand() * TAU;
      const r = 2.9 + rand() * 3.4;
      const s = Math.sqrt(1 - u * u);
      arr[i * 3] = r * s * Math.cos(phi);
      arr[i * 3 + 1] = r * u * 0.75;
      arr[i * 3 + 2] = r * s * Math.sin(phi) - 1.2;
    }
    return arr;
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        sizeAttenuation
        map={glowTexture()}
        color="#ffffff"
        transparent
        opacity={0.42}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const Shell: React.FC<{ t: number }> = ({ t }) => {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.24, 1)), []);
  return (
    <lineSegments geometry={edges} rotation={[Math.sin(t * TAU) * 0.22, t * TAU, 0]}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.11} depthWrite={false} />
    </lineSegments>
  );
};

const Orbit: React.FC<{ ring: Ring; t: number }> = ({ ring, t }) => {
  const tex = glowTexture();
  const at = (phase: number) => {
    const a = phase * TAU;
    return [Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0] as const;
  };

  return (
    <group rotation={ring.tilt}>
      <mesh>
        <torusGeometry args={[ring.r, 0.0045, 8, 360]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.28} depthWrite={false} />
      </mesh>

      {ring.nodes.map((n, i) => {
        const p = at(n + t * ring.nodeTurns);
        return (
          <group key={"n" + i} position={p as unknown as THREE.Vector3Tuple}>
            <mesh>
              <sphereGeometry args={[0.042, 24, 24]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.55} roughness={0.3} />
            </mesh>
            <sprite scale={[0.36, 0.36, 1]}>
              <spriteMaterial map={tex} color="#ffffff" transparent opacity={0.32} depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
          </group>
        );
      })}

      {ring.pulses.map((pp, i) =>
        Array.from({ length: TRAIL }).map((_, k) => {
          const dir = Math.sign(ring.pulseTurns);
          const phase = pp + t * ring.pulseTurns - dir * k * 0.0042;
          const p = at(phase);
          const fade = 1 - k / TRAIL;
          const s = (k === 0 ? 0.34 : 0.19) * (0.35 + 0.65 * fade);
          return (
            <sprite key={"p" + i + "-" + k} position={p as unknown as THREE.Vector3Tuple} scale={[s, s, 1]}>
              <spriteMaterial
                map={tex}
                color={CYAN}
                transparent
                opacity={(k === 0 ? 1 : 0.55) * fade}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </sprite>
          );
        })
      )}
    </group>
  );
};

export const CoreScene: React.FC<{ t: number; distance?: number }> = ({ t, distance = 8.3 }) => {
  const a = t * TAU;
  return (
    <>
      <color attach="background" args={["#000000"]} />
      <Environment />
      <CameraRig t={t} distance={distance} />

      <ambientLight intensity={0.05} />
      <directionalLight position={[-4, 3, -2]} intensity={1.6} color="#ffffff" />
      {/* Luz cian que orbita por detrás: deja un reflejo azul que recorre la esfera */}
      <pointLight position={[Math.cos(a) * 2.4, 0.6 + Math.sin(a * 2) * 0.4, Math.sin(a) * 2.4 - 1.2]} color={CYAN} intensity={9} distance={8} decay={1.6} />

      <mesh>
        <sphereGeometry args={[1, 160, 160]} />
        <meshPhysicalMaterial
          color="#16161b"
          metalness={1}
          roughness={0.2}
          clearcoat={1}
          clearcoatRoughness={0.06}
        />
      </mesh>

      <Shell t={t} />
      {RINGS.map((ring, i) => (
        <Orbit key={i} ring={ring} t={t} />
      ))}
      <Dust />
    </>
  );
};
