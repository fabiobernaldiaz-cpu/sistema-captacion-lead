import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CYAN, TAU, glowTexture, smoothstep } from "../lib/three-helpers";

/* ══════════════════════════════════════════════════════════════
   EL MÉTODO — una cinta de cubos que atraviesa un anillo.
   A la izquierda, cubos de alambre girando cada uno a su aire: el
   proceso tal y como está hoy. Al cruzar el anillo (el agente) salen
   sólidos, alineados y con un filo cian: el mismo trabajo, ordenado y
   medido. Cada cubo avanza exactamente tres huecos por loop.
   ══════════════════════════════════════════════════════════════ */

const N = 11;
const GAP = 1.35;
const SPAN = N * GAP;
const SHIFT_PER_LOOP = 3;

const Environment: React.FC = () => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;
    pmrem.dispose();
  }, [gl, scene]);
  return null;
};

const Camera: React.FC<{ t: number }> = ({ t }) => {
  const camera = useThree((s) => s.camera);
  // plano oblicuo: la cinta entra en profundidad y el anillo se lee como anillo
  camera.position.set(3.3 + Math.sin(t * TAU) * 0.35, 1.55 + Math.cos(t * TAU) * 0.1, 8.2);
  camera.lookAt(0.4, 0.22, 0);
  return null;
};

const Cube: React.FC<{ x: number }> = ({ x }) => {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.62, 0.62, 0.62)), []);

  // 0 = desordenado (antes del anillo) · 1 = ordenado (después)
  const k = smoothstep(-0.35, 0.35, x);
  // aparece por la izquierda y se desvanece por la derecha: el salto del bucle no se ve
  const life = smoothstep(-SPAN / 2, -SPAN / 2 + 2.2, x) * (1 - smoothstep(SPAN / 2 - 2.2, SPAN / 2, x));
  // El giro depende solo de la posición, no del cubo: al cerrar el loop otro cubo
  // ocupa exactamente ese hueco con exactamente ese giro, y no hay salto.
  const wobble = 1 - k;
  const rx = (x * 0.9 + Math.sin(x * 0.7) * 1.2) * wobble;
  const ry = (x * 0.6 + Math.cos(x * 0.5) * 1.4) * wobble + k * 0.62;
  const rz = Math.sin(x * 1.1) * 0.8 * wobble;
  const y = Math.sin(x * 1.7) * 0.22 * wobble;
  const s = Math.max(0.0001, life);

  return (
    <group position={[x, y, 0]} rotation={[rx, ry, rz]} scale={[s, s, s]}>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={k > 0.5 ? CYAN : "#ffffff"} transparent opacity={k > 0.5 ? 0.22 + 0.5 * (k - 0.5) * 2 : 0.22 + 0.3 * (0.5 - k) * 2} depthWrite={false} />
      </lineSegments>
      <mesh scale={[k, k, k].map((v) => Math.max(0.0001, v)) as [number, number, number]}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshPhysicalMaterial color="#f4f4f6" metalness={0.15} roughness={0.28} clearcoat={0.6} clearcoatRoughness={0.2} />
      </mesh>
    </group>
  );
};

export const FlowScene: React.FC<{ t: number }> = ({ t }) => {
  const tex = glowTexture();
  const xs = Array.from({ length: N }).map((_, i) => {
    let x = -SPAN / 2 + i * GAP + t * GAP * SHIFT_PER_LOOP;
    x = ((((x + SPAN / 2) % SPAN) + SPAN) % SPAN) - SPAN / 2;
    return x;
  });
  // el anillo se enciende cuando un cubo lo atraviesa
  const near = xs.reduce((m, x) => Math.max(m, 1 - smoothstep(0, 0.7, Math.abs(x))), 0);

  const lineDots = useMemo(() => Array.from({ length: 26 }).map((_, i) => i / 26), []);

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <Environment />
      <Camera t={t} />
      <ambientLight intensity={0.08} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      <directionalLight position={[-5, 2, -3]} intensity={0.8} />

      {/* El anillo: el agente */}
      <group rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <torusGeometry args={[0.95, 0.018, 16, 200]} />
          <meshBasicMaterial color={CYAN} transparent opacity={0.55 + 0.45 * near} />
        </mesh>
        <sprite scale={[3.6, 3.6, 1]}>
          <spriteMaterial map={tex} color={CYAN} transparent opacity={0.12 + 0.28 * near} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>

      {/* La cinta */}
      <mesh position={[0, -0.62, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.004, 0.004, SPAN, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.2} />
      </mesh>
      {lineDots.map((d, i) => {
        let x = -SPAN / 2 + (d + t * 2) * SPAN;
        x = ((((x + SPAN / 2) % SPAN) + SPAN) % SPAN) - SPAN / 2;
        const on = smoothstep(0, 0.6, x) * (1 - smoothstep(SPAN / 2 - 2, SPAN / 2, x));
        return (
          <sprite key={i} position={[x, -0.62, 0]} scale={[0.16, 0.16, 1]}>
            <spriteMaterial map={tex} color={CYAN} transparent opacity={on * 0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        );
      })}

      {xs.map((x, i) => (
        <Cube key={i} x={x} />
      ))}
    </>
  );
};
