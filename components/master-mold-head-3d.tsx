"use client";

/**
 * Master Mold's head — a classic Sentinel (magenta armored helmet, gold crest
 * and trim, silver faceplate, glowing red eyes) built procedurally from
 * three.js primitives: a lathe-turned dome, beveled extrusions bent to follow
 * the face, rounded boxes, and tube trims. Realism comes from physically
 * based materials (clear-coated candy paint, polished gold and silver) lit by
 * a generated room environment map, not from texture files.
 *
 * Budgets: no shadows, no post-processing, dpr capped, geometry built once
 * per detail level and shared by every canvas, render loop parked while the
 * tab is hidden. prefers-reduced-motion halves the idle and drops cursor
 * tracking rather than freezing the face.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { SystemState } from "@/components/sentinel-face";

// @react-three/fiber (through 9.8) still constructs a THREE.Clock for its
// store, and three r183+ logs a deprecation for every canvas. Route three's
// own logger to drop exactly that message; everything else passes through.
if (typeof window !== "undefined" && !(THREE.getConsoleFunction() as { __mm?: boolean } | null)?.__mm) {
  const route = ((type: "log" | "warn" | "error", message: string, ...params: unknown[]) => {
    if (typeof message === "string" && message.startsWith("THREE.Clock: This module has been deprecated")) return;
    console[type](message, ...params);
  }) as ((type: "log" | "warn" | "error", message: string, ...params: unknown[]) => void) & { __mm?: boolean };
  route.__mm = true;
  THREE.setConsoleFunction(route);
}

type EyeProfile = { intensity: number; speed: number; color: string; blinks: boolean };

const EYE_PROFILES: Record<SystemState, EyeProfile> = {
  idle: { intensity: 3.2, speed: 1.4, color: "#ff2a2a", blinks: true },
  thinking: { intensity: 3.6, speed: 4.2, color: "#ff4430", blinks: true },
  suggestion: { intensity: 4.0, speed: 2.2, color: "#ff3a2a", blinks: true },
  caution: { intensity: 3.6, speed: 3.0, color: "#ff7a1f", blinks: true },
  alert: { intensity: 4.8, speed: 5.2, color: "#ff1414", blinks: true },
  degraded: { intensity: 1.4, speed: 0.8, color: "#c43030", blinks: true },
  kill: { intensity: 0.15, speed: 0, color: "#5f1414", blinks: false },
};

export type HeadDetail = "hero" | "avatar";

// --- geometry -------------------------------------------------------------------

const FACE_FRONT = 0.93;
const FACE_BEND = 0.34;
/** z of the curved face surface at horizontal offset x. */
const faceZ = (x: number) => FACE_FRONT - FACE_BEND * x * x;
/** yaw that makes a part sit flush on the curved face at x. */
const faceYaw = (x: number) => Math.atan(2 * FACE_BEND * x) * -1;

function shape(points: Array<[number, number]>) {
  const s = new THREE.Shape();
  points.forEach(([x, y], index) => (index === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

/** Extrude toward +z, then curve the slab around the face (z -= k·x²). */
function bentExtrusion(points: Array<[number, number]>, depth: number, bevel: number, curve: number, frontAt: number, bend = FACE_BEND) {
  const geometry = new THREE.ExtrudeGeometry(shape(points), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: curve > 8 ? 4 : 2,
    curveSegments: curve,
    steps: 1,
  });
  geometry.translate(0, 0, frontAt - depth - bevel);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    position.setZ(i, position.getZ(i) - bend * x * x);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function finGeometry(points: Array<[number, number]>, thickness: number, curve: number) {
  // Profile drawn in (front→back, up); extruded sideways across x.
  const geometry = new THREE.ExtrudeGeometry(shape(points.map(([z, y]) => [-z, y])), {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.35,
    bevelSize: thickness * 0.3,
    bevelSegments: 3,
    curveSegments: curve,
  });
  geometry.translate(0, 0, -thickness / 2);
  geometry.rotateY(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

type HeadGeometry = ReturnType<typeof buildGeometry>;
const geometryCache = new Map<HeadDetail, HeadGeometry>();

function buildGeometry(detail: HeadDetail) {
  const hi = detail === "hero";
  const radial = hi ? 72 : 40;
  const curve = hi ? 16 : 8;

  // Helmet dome: a lathe profile with a soft brow flare and tucked base.
  const domeProfile = [
    [0.001, 1.3], [0.3, 1.28], [0.56, 1.2], [0.77, 1.05], [0.92, 0.84], [1.01, 0.6], [1.05, 0.34],
    [1.05, 0.08], [1.0, -0.18], [0.93, -0.38], [0.86, -0.5], [0.8, -0.56],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const dome = new THREE.LatheGeometry(domeProfile, radial);

  const faceplate = bentExtrusion(
    [[-0.6, 0.3], [0.6, 0.3], [0.69, 0.08], [0.62, -0.32], [0.38, -0.68], [0.14, -0.86], [-0.14, -0.86], [-0.38, -0.68], [-0.62, -0.32], [-0.69, 0.08]],
    0.46, 0.05, curve, FACE_FRONT,
  );
  const brow = bentExtrusion(
    [[-0.8, 0.27], [-0.3, 0.25], [0, 0.15], [0.3, 0.25], [0.8, 0.27], [0.84, 0.37], [0.3, 0.42], [0, 0.46], [-0.3, 0.42], [-0.84, 0.37]],
    0.2, 0.035, curve, FACE_FRONT + 0.07,
  );
  const visor = bentExtrusion(
    [[-0.62, 0.02], [-0.22, 0.04], [0, 0.1], [0.22, 0.04], [0.62, 0.02], [0.66, 0.26], [0.26, 0.24], [0, 0.2], [-0.26, 0.24], [-0.66, 0.26]],
    0.12, 0.02, curve, FACE_FRONT + 0.02,
  );
  const eye = new THREE.ExtrudeGeometry(shape([[-0.15, -0.03], [0.14, 0.0], [0.16, 0.06], [-0.13, 0.05]]), {
    depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 4,
  });
  const nose = bentExtrusion([[-0.06, 0.12], [0.06, 0.12], [0.1, -0.22], [0, -0.3], [-0.1, -0.22]], 0.12, 0.025, curve, FACE_FRONT + 0.1);
  const cheek = new THREE.ExtrudeGeometry(shape([[-0.16, 0.2], [0.16, 0.16], [0.18, -0.34], [0.02, -0.48], [-0.16, -0.36]]), {
    depth: 0.18, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 3, curveSegments: curve,
  });
  const crestCenter = finGeometry([[0.92, 0.98], [0.4, 1.46], [-0.3, 1.58], [-0.95, 1.36], [-1.05, 1.08], [-0.5, 1.12], [0.3, 1.12]], 0.13, curve);
  const crestSide = finGeometry([[0.6, 1.0], [0.18, 1.32], [-0.45, 1.36], [-0.82, 1.14], [-0.4, 1.02]], 0.08, curve);
  const trimCurve = new THREE.CatmullRomCurve3(
    [-0.86, -0.28, 0, 0.28, 0.86].map((x) => new THREE.Vector3(x, x === 0 ? 0.13 : Math.abs(x) < 0.5 ? 0.225 : 0.255, faceZ(x) + 0.16 - (x === 0 ? 0 : 0))),
  );
  const trim = new THREE.TubeGeometry(trimCurve, hi ? 64 : 24, 0.022, hi ? 10 : 6, false);
  const grilleBar = new RoundedBoxGeometry(0.46, 0.034, 0.05, hi ? 3 : 2, 0.014);
  const grilleFrame = new RoundedBoxGeometry(0.6, 0.26, 0.08, hi ? 4 : 2, 0.04);
  const vent = new RoundedBoxGeometry(0.2, 0.035, 0.06, 2, 0.014);
  const chin = new RoundedBoxGeometry(0.46, 0.2, 0.34, hi ? 4 : 2, 0.07);
  const earPod = new THREE.CylinderGeometry(0.26, 0.28, 0.2, radial / 2);
  const earRing = new THREE.TorusGeometry(0.2, 0.028, hi ? 12 : 8, radial / 2);
  const earCore = new THREE.CylinderGeometry(0.1, 0.1, 0.06, radial / 3);
  const collar = new THREE.LatheGeometry(
    [[0.46, -0.72], [0.62, -0.84], [0.8, -1.02], [0.84, -1.14], [0.7, -1.2]].map(([r, y]) => new THREE.Vector2(r, y)),
    radial,
  );
  const collarBand = new THREE.TorusGeometry(0.72, 0.035, hi ? 12 : 8, radial);
  const halo = makeHaloTexture();

  return { dome, faceplate, brow, visor, eye, nose, cheek, crestCenter, crestSide, trim, grilleBar, grilleFrame, vent, chin, earPod, earRing, earCore, collar, collarBand, halo };
}

function makeHaloTexture() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function useHeadGeometry(detail: HeadDetail) {
  return useMemo(() => {
    let geometry = geometryCache.get(detail);
    if (!geometry) {
      geometry = buildGeometry(detail);
      geometryCache.set(detail, geometry);
    }
    return geometry;
  }, [detail]);
}

// --- materials ------------------------------------------------------------------

function useMaterials() {
  const materials = useMemo(() => {
    const paint = new THREE.MeshPhysicalMaterial({
      color: "#a11d5f",
      metalness: 0.55,
      roughness: 0.36,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    });
    const paintDeep = paint.clone();
    paintDeep.color.set("#5c1036");
    const gold = new THREE.MeshPhysicalMaterial({ color: "#d6a13c", metalness: 1, roughness: 0.26, clearcoat: 0.3, clearcoatRoughness: 0.25 });
    const silver = new THREE.MeshPhysicalMaterial({ color: "#aeb4c0", metalness: 1, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.3 });
    const gunmetal = new THREE.MeshStandardMaterial({ color: "#2a2230", metalness: 0.9, roughness: 0.42 });
    const recess = new THREE.MeshStandardMaterial({ color: "#0c070a", metalness: 0.5, roughness: 0.7 });
    return { paint, paintDeep, gold, silver, gunmetal, recess };
  }, []);
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);
  return materials;
}

/** Studio-style reflections from a generated room, so metal reads as metal. */
function Environment({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const texture = pmrem.fromScene(room, 0.03).texture;
    scene.environment = texture;
    scene.environmentIntensity = intensity;
    room.dispose();
    return () => {
      scene.environment = null;
      texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

// --- rig ------------------------------------------------------------------------

function HeadRig({
  state,
  speaking,
  track,
  soft,
  hovered,
  detail,
}: {
  state: SystemState;
  speaking: boolean;
  track: boolean;
  soft: boolean;
  hovered: boolean;
  detail: HeadDetail;
}) {
  const g = useHeadGeometry(detail);
  const m = useMaterials();
  const headRef = useRef<THREE.Group>(null);
  const eyesRef = useRef<THREE.Group>(null);
  const jawRef = useRef<THREE.Group>(null);
  const haloRefs = useRef<Array<THREE.Sprite | null>>([]);
  const glowRef = useRef<THREE.PointLight>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const blink = useRef({ nextAt: 2.4, duration: 0.14 });
  const glance = useRef({ nextAt: 7 + Math.random() * 6, until: 0, dir: 0, offset: 0 });
  const hoverAmt = useRef(0);
  const speakAmt = useRef(0);
  const profile = EYE_PROFILES[state];

  const eyeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2a0202", emissive: new THREE.Color("#ff2a2a"), emissiveIntensity: 3, toneMapped: false, roughness: 0.3 }),
    [],
  );
  const slotMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0c0608", emissive: new THREE.Color("#ff5a24"), emissiveIntensity: 0.05, toneMapped: false }),
    [],
  );
  const haloMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: g.halo ?? undefined,
        color: "#ff2a2a",
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.8,
        toneMapped: false,
      }),
    [g.halo],
  );
  useEffect(() => () => [eyeMaterial, slotMaterial, haloMaterial].forEach((material) => material.dispose()), [eyeMaterial, slotMaterial, haloMaterial]);

  useEffect(() => {
    eyeMaterial.emissive.set(profile.color);
    haloMaterial.color.set(profile.color);
    glowRef.current?.color.set(profile.color);
  }, [eyeMaterial, haloMaterial, profile]);

  useEffect(() => {
    if (!track) return;
    const onMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [track]);

  const amp = soft ? 0.5 : 1;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    hoverAmt.current += ((hovered ? 1 : 0) - hoverAmt.current) * 0.12;
    speakAmt.current += ((speaking ? 1 : 0) - speakAmt.current) * 0.1;

    const glanceState = glance.current;
    if (t >= glanceState.nextAt) {
      glanceState.dir = (Math.random() < 0.5 ? -1 : 1) * (0.22 + Math.random() * 0.12);
      glanceState.until = t + 0.8 + Math.random() * 0.5;
      glanceState.nextAt = t + 7 + Math.random() * 7;
    }
    glanceState.offset += ((t < glanceState.until ? glanceState.dir * amp : 0) - glanceState.offset) * 0.08;

    const head = headRef.current;
    if (head) {
      const trackX = THREE.MathUtils.clamp(pointer.current.x * 0.35, -0.35, 0.35);
      const trackY = THREE.MathUtils.clamp(pointer.current.y * 0.18, -0.18, 0.18);
      const lift = hoverAmt.current * 0.1 * amp;
      const nod = speakAmt.current * Math.sin(t * 3.2) * 0.045 * amp;
      head.rotation.y += (Math.sin(t * 0.4) * 0.18 * amp + trackX + glanceState.offset - head.rotation.y) * 0.06;
      head.rotation.x += (Math.sin(t * 0.63) * 0.05 * amp + trackY - lift + nod - head.rotation.x) * 0.06;
      head.rotation.z = Math.sin(t * 0.3) * 0.03 * amp;
      head.position.y = Math.sin(t * 0.85) * 0.045 * amp + hoverAmt.current * 0.04;
    }

    const flare = 1 + hoverAmt.current * 0.6 + speakAmt.current * 0.25;
    const pulse = profile.speed > 0 ? profile.intensity * (1 + Math.sin(t * profile.speed) * 0.3) : profile.intensity;
    eyeMaterial.emissiveIntensity = pulse * flare;
    const haloScale = (0.34 + pulse * 0.035) * flare;
    for (const halo of haloRefs.current) halo?.scale.set(haloScale * 1.6, haloScale, 1);
    haloMaterial.opacity = Math.min(0.95, 0.35 + pulse * 0.12);
    if (glowRef.current) glowRef.current.intensity = pulse * flare * 0.35;

    let eyeScaleY = 1;
    if (profile.blinks && t >= blink.current.nextAt) {
      const p = (t - blink.current.nextAt) / blink.current.duration;
      if (p >= 1) blink.current.nextAt = t + 2.6 + Math.random() * 4.5;
      else eyeScaleY = Math.max(0.06, 1 - 0.94 * Math.sin(Math.PI * p));
    }
    eyesRef.current?.scale.set(1, eyeScaleY, 1);

    // Jaw drops and the slot glows in a speech-like rhythm while talking.
    const syllable = speaking ? Math.abs(Math.sin(t * 11) * Math.sin(t * 4.3)) : 0;
    if (jawRef.current) jawRef.current.position.y += (-syllable * 0.05 - jawRef.current.position.y) * 0.35;
    slotMaterial.emissiveIntensity = 0.05 + syllable * 2.4;
  });

  const eyeX = 0.33;
  const eyeY = 0.155;

  return (
    <group position={[0, -0.16, 0]} scale={0.9}>
    <group ref={headRef}>
      {/* Helmet dome + deep-magenta rear plate */}
      <mesh geometry={g.dome} material={m.paint} position={[0, 0.02, -0.12]} scale={[1, 1, 0.94]} />
      <mesh geometry={g.dome} material={m.paintDeep} position={[0, -0.02, -0.2]} scale={[0.9, 0.86, 0.84]} />

      {/* Gold triple crest */}
      <mesh geometry={g.crestCenter} material={m.gold} position={[0, 0.02, -0.12]} />
      <mesh geometry={g.crestSide} material={m.gold} position={[-0.27, -0.06, -0.12]} rotation={[0, 0, 0.16]} />
      <mesh geometry={g.crestSide} material={m.gold} position={[0.27, -0.06, -0.12]} rotation={[0, 0, -0.16]} />

      {/* Brow, gold trim, dark visor band */}
      <mesh geometry={g.brow} material={m.paint} />
      <mesh geometry={g.trim} material={m.gold} />
      <mesh geometry={g.visor} material={m.recess} />

      {/* Silver faceplate and nose ridge */}
      <mesh geometry={g.faceplate} material={m.silver} />
      <mesh geometry={g.nose} material={m.silver} position={[0, -0.02, 0.01]} />

      {/* Eyes: slanted inward, emissive, with additive halos */}
      <group ref={eyesRef} position={[0, eyeY, 0]}>
        <mesh geometry={g.eye} material={eyeMaterial} position={[-eyeX, 0, faceZ(eyeX) + 0.075]} rotation={[0, -faceYaw(eyeX), -0.2]} scale={[-1, 1, 1]} />
        <mesh geometry={g.eye} material={eyeMaterial} position={[eyeX, 0, faceZ(eyeX) + 0.075]} rotation={[0, faceYaw(eyeX), 0.2]} />
      </group>
      {g.halo ? (
        <>
          <sprite ref={(node) => { haloRefs.current[0] = node; }} material={haloMaterial} position={[-eyeX, eyeY + 0.02, faceZ(eyeX) + 0.2]} />
          <sprite ref={(node) => { haloRefs.current[1] = node; }} material={haloMaterial} position={[eyeX, eyeY + 0.02, faceZ(eyeX) + 0.2]} />
        </>
      ) : null}
      <pointLight ref={glowRef} position={[0, 0.1, 1.12]} color="#ff2a2a" intensity={1} distance={0.9} decay={2} />

      {/* Cheek plates with silver vents */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.7, -0.16, faceZ(0.7) - 0.16]} rotation={[0.04, side * 0.82, side * -0.1]}>
          <mesh geometry={g.cheek} material={m.paint} scale={[side, 1, 1]} />
          {[0, 1, 2].map((row) => (
            <mesh key={row} geometry={g.vent} material={m.silver} position={[side * 0.01, -0.02 - row * 0.09, 0.24]} />
          ))}
        </group>
      ))}

      {/* Mouth: silver frame, dark glowing slot, grille bars, magenta chin */}
      <group ref={jawRef}>
        <mesh geometry={g.grilleFrame} material={m.gunmetal} position={[0, -0.5, faceZ(0) + 0.04]} rotation={[0.1, 0, 0]} />
        <mesh position={[0, -0.5, faceZ(0) + 0.085]} rotation={[0.1, 0, 0]} material={slotMaterial}>
          <planeGeometry args={[0.5, 0.16]} />
        </mesh>
        {[0, 1, 2].map((row) => (
          <mesh key={row} geometry={g.grilleBar} material={m.silver} position={[0, -0.45 - row * 0.05, faceZ(0) + 0.1]} rotation={[0.1, 0, 0]} />
        ))}
        <mesh geometry={g.chin} material={m.paintDeep} position={[0, -0.8, faceZ(0) - 0.2]} rotation={[0.3, 0, 0]} scale={[0.9, 0.8, 0.8]} />
      </group>

      {/* Ear pods: silver drum, gold ring, glowing core */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.04, 0.06, -0.08]} rotation={[0, 0, Math.PI / 2]}>
          <mesh geometry={g.earPod} material={m.silver} />
          <mesh geometry={g.earRing} material={m.gold} position={[0, side * -0.11, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={g.earCore} material={m.gold} position={[0, side * -0.12, 0]} />
        </group>
      ))}

      {/* Neck collar */}
      <mesh geometry={g.collar} material={m.gunmetal} position={[0, -0.02, -0.16]} scale={[0.92, 1, 0.9]} />
      <mesh geometry={g.collarBand} material={m.gold} position={[0, -1.02, -0.16]} rotation={[Math.PI / 2, 0, 0]} scale={[1.07, 0.97, 1]} />
    </group>
    </group>
  );
}

export type MasterMoldHead3DProps = {
  state?: SystemState;
  speaking?: boolean;
  hovered?: boolean;
  size?: number;
  fallback?: React.ReactNode;
  className?: string;
  /** "hero" = smoother geometry and sharper render for big placements. */
  detail?: HeadDetail;
};

export default function MasterMoldHead3D({
  state = "idle",
  speaking = false,
  hovered = false,
  size,
  fallback,
  className,
  detail = "avatar",
}: MasterMoldHead3DProps) {
  const [reducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [finePointer] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches);
  const [frameloop, setFrameloop] = useState<"always" | "never">("always");

  useEffect(() => {
    const onVisibility = () => setFrameloop(document.visibilityState === "hidden" ? "never" : "always");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const hero = detail === "hero";

  return (
    <Canvas
      className={className}
      style={size ? { width: size, height: size } : { width: "100%", height: "100%" }}
      dpr={hero ? [1, 2] : [1.5, 2]}
      frameloop={frameloop}
      camera={{ position: [0, 0.1, 5.6], fov: 32 }}
      gl={{ antialias: true, alpha: true, powerPreference: hero ? "default" : "low-power" }}
      fallback={fallback}
    >
      <Environment intensity={0.75} />
      <hemisphereLight args={["#ffe9f1", "#2a0a18", 0.5]} />
      <directionalLight position={[2.6, 3.4, 4]} intensity={2.2} color="#fff2e6" />
      <directionalLight position={[-3.2, 1.4, -2.6]} intensity={2.4} color="#ff4f8f" />
      <directionalLight position={[0.5, -2.6, 2.4]} intensity={0.7} color="#e8b35c" />
      <HeadRig state={state} speaking={speaking} hovered={hovered} track={finePointer && !reducedMotion} soft={reducedMotion} detail={detail} />
    </Canvas>
  );
}
