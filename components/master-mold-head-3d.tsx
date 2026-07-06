"use client";

/**
 * Procedural 3D Master Mold head — a sentinel-style armored helmet composed
 * entirely from cheap primitives (no external models or textures). Rendered
 * with @react-three/fiber; loaded lazily via next/dynamic from sentinel-face
 * so three.js never enters the initial bundle.
 *
 * Look: classic X-Men Sentinel — magenta/crimson armored dome, gold triple-fin
 * crest + gold brow trim + gold ear discs, silver-gray faceplate and cheek
 * guards, a stern dark mouth slit in a silver frame, glowing red eyes.
 *
 * Perf budget (hard constraints):
 * - dpr capped at [1, 1.5], no shadows, no postprocessing.
 * - < 2k triangles total (icosahedron cranium + boxes/prisms).
 * - render loop pauses when the tab is hidden; prefers-reduced-motion SOFTENS
 *   the idle (half amplitude, no cursor tracking) rather than freezing it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import type { SystemState } from "@/components/sentinel-face";

type EyeProfile = {
  /** Base emissive intensity of the eyes. */
  intensity: number;
  /** Pulse speed (rad/s). 0 = dead steady. */
  speed: number;
  /** Eye + glow color. */
  color: string;
  /** Whether the eyes blink at all. */
  blinks: boolean;
};

const EYE_PROFILES: Record<SystemState, EyeProfile> = {
  idle: { intensity: 2.3, speed: 1.6, color: "#ff2a2a", blinks: true },
  thinking: { intensity: 2.7, speed: 4.4, color: "#ff3d2e", blinks: true },
  suggestion: { intensity: 3.0, speed: 2.3, color: "#ff2a2a", blinks: true },
  caution: { intensity: 2.7, speed: 3.1, color: "#ff5a1f", blinks: true },
  alert: { intensity: 3.6, speed: 5.4, color: "#ff1616", blinks: true },
  degraded: { intensity: 1.1, speed: 0.8, color: "#cc2a2a", blinks: true },
  kill: { intensity: 0.12, speed: 0, color: "#5f1414", blinks: false },
};

/** Armor palette — classic Sentinel: magenta helmet, gold crest, silver face. */
const ARMOR = {
  magenta: "#9c3155", // cranium dome + jaw — deep pinkish-crimson
  magentaDeep: "#7c2544", // rear skull plate + neck collar (shadow tone)
  gold: "#c9a13b", // crest fins, brow trim, ear discs
  silver: "#9aa0ad", // faceplate, nose, cheek guards, mouth frame
  dark: "#17101a", // vents, eye sockets, mouth slit recess, neck core
};

function useArmorMaterials() {
  const materials = useMemo(() => {
    const magenta = new THREE.MeshStandardMaterial({
      color: ARMOR.magenta,
      metalness: 0.75,
      roughness: 0.35,
      flatShading: true,
    });
    const magentaDeep = new THREE.MeshStandardMaterial({
      color: ARMOR.magentaDeep,
      metalness: 0.75,
      roughness: 0.4,
      flatShading: true,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: ARMOR.gold,
      metalness: 0.9,
      roughness: 0.25,
      flatShading: true,
    });
    const silver = new THREE.MeshStandardMaterial({
      color: ARMOR.silver,
      metalness: 0.82,
      roughness: 0.3,
      flatShading: true,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: ARMOR.dark,
      metalness: 0.9,
      roughness: 0.5,
    });
    return { magenta, magentaDeep, gold, silver, dark };
  }, []);

  useEffect(() => {
    return () => {
      for (const mat of Object.values(materials)) mat.dispose();
    };
  }, [materials]);

  return materials;
}

function HeadRig({
  state,
  speaking,
  animate,
  track,
  soft = false,
  hovered = false,
}: {
  state: SystemState;
  speaking: boolean;
  animate: boolean;
  /** Cursor tracking (desktop fine-pointer only). */
  track: boolean;
  /** Reduced-motion: keep the idle alive at half amplitude. */
  soft?: boolean;
  /** Pointer is over the head's wrapper: eyes flare + head perks up ~5°. */
  hovered?: boolean;
}) {
  const armor = useArmorMaterials();
  const headRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);
  const pointerTarget = useRef({ x: 0, y: 0 });
  const blink = useRef({ nextAt: 2.6, duration: 0.16 });
  // Smoothed 0..1 amounts for the hover perk-up and the speaking nod.
  const hoverAmt = useRef(0);
  const speakAmt = useRef(0);
  // Occasional idle "glance": every 8–15s the head turns briefly (~0.3 rad)
  // to a random side, holds under a second, then eases back.
  const glance = useRef({ nextAt: 8 + Math.random() * 7, until: 0, dir: 0, offset: 0 });

  const profile = EYE_PROFILES[state];

  const eyeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3a0505",
        emissive: new THREE.Color("#ff2a2a"),
        emissiveIntensity: 2.3,
        metalness: 0.1,
        roughness: 0.4,
        toneMapped: false,
      }),
    [],
  );
  // Mouth slit — near-black at rest, flickers red-orange while he speaks.
  const grilleMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#120a0d",
        emissive: new THREE.Color("#ff4a1f"),
        emissiveIntensity: 0.08,
        metalness: 0.6,
        roughness: 0.45,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      eyeMaterial.dispose();
      grilleMaterial.dispose();
    };
  }, [eyeMaterial, grilleMaterial]);

  // Keep eye color in sync with system state (also poses the static frame).
  useEffect(() => {
    eyeMaterial.emissive.set(profile.color);
    eyeMaterial.emissiveIntensity = profile.intensity;
    if (glowRef.current) {
      glowRef.current.color.set(profile.color);
      glowRef.current.intensity = profile.intensity * 0.4;
    }
  }, [eyeMaterial, profile]);

  // Cursor tracking — clamped small angles, desktop only, skipped entirely
  // under reduced motion.
  const amp = soft ? 0.5 : 1;
  useEffect(() => {
    if (!animate || !track) return;
    const onMove = (event: PointerEvent) => {
      pointerTarget.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerTarget.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [animate, track]);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    const head = headRef.current;

    // Smooth 0..1 envelopes: hover perk-up and speaking nod.
    hoverAmt.current += ((hovered ? 1 : 0) - hoverAmt.current) * 0.12;
    speakAmt.current += ((speaking ? 1 : 0) - speakAmt.current) * 0.08;

    // Idle glance scheduler — pick a side, hold briefly, ease back to center.
    const g = glance.current;
    if (t >= g.nextAt) {
      g.dir = (Math.random() < 0.5 ? -1 : 1) * (0.24 + Math.random() * 0.12);
      g.until = t + 0.9 + Math.random() * 0.5;
      g.nextAt = t + 8 + Math.random() * 7;
    }
    g.offset += ((t < g.until ? g.dir * amp : 0) - g.offset) * 0.08;

    if (head) {
      // Idle sway + breathing, with clamped cursor tracking layered on top.
      // Amplitudes sized to READ at a 40px avatar: a broad slow scan plus
      // breathing bob. (The first cut used ~0.07rad — invisible that small.)
      const trackX = THREE.MathUtils.clamp(pointerTarget.current.x * 0.22, -0.22, 0.22);
      const trackY = THREE.MathUtils.clamp(pointerTarget.current.y * 0.14, -0.14, 0.14);
      // Hover lifts the chin ~5°; speaking adds a subtle nod.
      const lift = hoverAmt.current * 0.09 * amp;
      const nod = speakAmt.current * Math.sin(t * 3.4) * 0.05 * amp;
      head.rotation.y += (Math.sin(t * 0.45) * 0.22 * amp + trackX + g.offset - head.rotation.y) * 0.06;
      head.rotation.x += (Math.sin(t * 0.7) * 0.07 * amp + trackY - lift + nod - head.rotation.x) * 0.06;
      head.rotation.z = Math.sin(t * 0.32) * 0.04 * amp;
      head.position.y = Math.sin(t * 0.9) * 0.06 * amp + hoverAmt.current * 0.04;
    }

    // Eye pulse — stronger swing so the glow visibly breathes at small sizes.
    // Hover flares the eyes brighter on top of the pulse.
    const flare = 1 + hoverAmt.current * 0.7;
    const pulse =
      profile.speed > 0 ? profile.intensity + Math.sin(t * profile.speed) * profile.intensity * 0.45 : profile.intensity;
    eyeMaterial.emissiveIntensity = pulse * flare;
    if (glowRef.current) glowRef.current.intensity = pulse * flare * 0.4;

    // Occasional blink — a fast vertical shutter.
    let eyeScaleY = 1;
    if (profile.blinks && t >= blink.current.nextAt) {
      const p = (t - blink.current.nextAt) / blink.current.duration;
      if (p >= 1) {
        blink.current.nextAt = t + 2.8 + Math.random() * 4.5;
      } else {
        eyeScaleY = Math.max(0.08, 1 - 0.94 * Math.sin(Math.PI * p));
      }
    }
    if (leftEyeRef.current) leftEyeRef.current.scale.y = eyeScaleY;
    if (rightEyeRef.current) rightEyeRef.current.scale.y = eyeScaleY;

    // Mouth slit flicker while he speaks — red-orange, dark at rest.
    grilleMaterial.emissiveIntensity = speaking ? 0.5 + Math.abs(Math.sin(t * 13) * Math.sin(t * 4.7)) * 1.6 : 0.08;
  });

  return (
    <group ref={headRef} position={[0, -0.06, 0]}>
      {/* ——— Cranium: faceted magenta armored dome ——— */}
      <mesh geometry={CRANIUM} material={armor.magenta} position={[0, 0.32, -0.05]} scale={[0.98, 1.02, 0.92]} />
      {/* Rear skull plate */}
      <mesh material={armor.magentaDeep} position={[0, 0.18, -0.55]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[1.3, 1.0, 0.5]} />
      </mesh>

      {/* ——— Crest: gold triple-fin ornament (center tall, two flanking) ——— */}
      <mesh material={armor.gold} position={[0, 1.26, -0.08]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[0.13, 0.6, 1.2]} />
      </mesh>
      <mesh material={armor.gold} position={[-0.24, 1.08, -0.12]} rotation={[-0.1, 0, 0.14]}>
        <boxGeometry args={[0.1, 0.4, 1.0]} />
      </mesh>
      <mesh material={armor.gold} position={[0.24, 1.08, -0.12]} rotation={[-0.1, 0, -0.14]}>
        <boxGeometry args={[0.1, 0.4, 1.0]} />
      </mesh>

      {/* ——— Brow: heavy magenta ridge + thin gold trim strip over the eyes ——— */}
      <mesh material={armor.magenta} position={[0, 0.42, 0.72]} rotation={[0.32, 0, 0]}>
        <boxGeometry args={[1.42, 0.2, 0.42]} />
      </mesh>
      <mesh material={armor.gold} position={[0, 0.32, 0.86]} rotation={[0.38, 0, 0]}>
        <boxGeometry args={[1.24, 0.07, 0.18]} />
      </mesh>

      {/* ——— Eyes: glowing red, slanted inward (menacing) ——— */}
      <mesh ref={leftEyeRef} material={eyeMaterial} position={[-0.36, 0.16, 0.84]} rotation={[0, 0, -0.16]}>
        <boxGeometry args={[0.3, 0.11, 0.1]} />
      </mesh>
      <mesh ref={rightEyeRef} material={eyeMaterial} position={[0.36, 0.16, 0.84]} rotation={[0, 0, 0.16]}>
        <boxGeometry args={[0.3, 0.11, 0.1]} />
      </mesh>
      {/* Eye socket recesses */}
      <mesh material={armor.dark} position={[-0.36, 0.16, 0.78]} rotation={[0, 0, -0.16]}>
        <boxGeometry args={[0.42, 0.2, 0.08]} />
      </mesh>
      <mesh material={armor.dark} position={[0.36, 0.16, 0.78]} rotation={[0, 0, 0.16]}>
        <boxGeometry args={[0.42, 0.2, 0.08]} />
      </mesh>
      {/* Soft red glow cast onto the faceplate */}
      <pointLight ref={glowRef} position={[0, 0.14, 1.35]} color="#ff2a2a" intensity={0.9} distance={3.2} decay={2} />

      {/* ——— Faceplate + nose ridge: silver-gray ——— */}
      <mesh material={armor.silver} position={[0, -0.08, 0.58]} rotation={[0.06, 0, 0]}>
        <boxGeometry args={[1.08, 0.62, 0.5]} />
      </mesh>
      <mesh material={armor.silver} position={[0, 0.06, 0.92]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[0.16, 0.44, 0.18]} />
      </mesh>

      {/* ——— Cheek guards: angled silver plates with dark vent slits ——— */}
      <mesh material={armor.silver} position={[-0.74, -0.16, 0.42]} rotation={[0.05, 0.35, 0.24]}>
        <boxGeometry args={[0.3, 0.66, 0.5]} />
      </mesh>
      <mesh material={armor.silver} position={[0.74, -0.16, 0.42]} rotation={[0.05, -0.35, -0.24]}>
        <boxGeometry args={[0.3, 0.66, 0.5]} />
      </mesh>
      <mesh material={armor.dark} position={[-0.72, -0.14, 0.62]} rotation={[0.05, 0.35, 0.24]}>
        <boxGeometry args={[0.16, 0.06, 0.3]} />
      </mesh>
      <mesh material={armor.dark} position={[-0.76, -0.28, 0.6]} rotation={[0.05, 0.35, 0.24]}>
        <boxGeometry args={[0.16, 0.06, 0.3]} />
      </mesh>
      <mesh material={armor.dark} position={[0.72, -0.14, 0.62]} rotation={[0.05, -0.35, -0.24]}>
        <boxGeometry args={[0.16, 0.06, 0.3]} />
      </mesh>
      <mesh material={armor.dark} position={[0.76, -0.28, 0.6]} rotation={[0.05, -0.35, -0.24]}>
        <boxGeometry args={[0.16, 0.06, 0.3]} />
      </mesh>

      {/* ——— Jaw: tapered magenta prism chin + stern mouth slit ——— */}
      <mesh material={armor.magenta} position={[0, -0.66, 0.4]} rotation={[0.08, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0.62, 0.4, 0.52, 4]} />
      </mesh>
      <mesh material={armor.silver} position={[0, -0.9, 0.52]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.34, 0.14, 0.24]} />
      </mesh>
      {/* Mouth: dark slit grille in a silver frame, sitting proud of the jaw
          prism (whose front face is at z≈0.84) — slit flickers while speaking */}
      <mesh material={armor.silver} position={[0, -0.54, 0.88]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.66, 0.2, 0.08]} />
      </mesh>
      <mesh material={grilleMaterial} position={[0, -0.54, 0.93]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.56, 0.09, 0.05]} />
      </mesh>
      <mesh material={armor.silver} position={[-0.14, -0.54, 0.95]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.03, 0.1, 0.05]} />
      </mesh>
      <mesh material={armor.silver} position={[0.14, -0.54, 0.95]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[0.03, 0.1, 0.05]} />
      </mesh>

      {/* ——— Ear pods (silver) with gold discs + side intake fins ——— */}
      <mesh material={armor.silver} position={[-0.98, 0.08, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.24, 0.24, 0.18, 8]} />
      </mesh>
      <mesh material={armor.silver} position={[0.98, 0.08, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.24, 0.24, 0.18, 8]} />
      </mesh>
      <mesh material={armor.gold} position={[-1.09, 0.08, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.06, 8]} />
      </mesh>
      <mesh material={armor.gold} position={[1.09, 0.08, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.06, 8]} />
      </mesh>
      <mesh material={armor.dark} position={[-0.92, 0.42, -0.12]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.08, 0.3, 0.5]} />
      </mesh>
      <mesh material={armor.dark} position={[0.92, 0.42, -0.12]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.08, 0.3, 0.5]} />
      </mesh>

      {/* ——— Neck: magenta collar ring over a dark core ——— */}
      <mesh material={armor.dark} position={[0, -1.02, -0.02]}>
        <cylinderGeometry args={[0.42, 0.5, 0.5, 8]} />
      </mesh>
      <mesh material={armor.magentaDeep} position={[0, -1.18, -0.02]}>
        <cylinderGeometry args={[0.62, 0.78, 0.3, 8]} />
      </mesh>
    </group>
  );
}

// Shared cranium geometry (80 faceted triangles) — module scope so every
// instance (top bar, launcher, drawer) reuses one buffer.
const CRANIUM = new THREE.IcosahedronGeometry(1, 1);

export type MasterMoldHead3DProps = {
  state?: SystemState;
  speaking?: boolean;
  /** Pointer is over the head's wrapper — eyes flare, head perks up. */
  hovered?: boolean;
  /** Optional fixed pixel size; defaults to filling the parent element. */
  size?: number;
  /** Rendered while WebGL is unavailable. */
  fallback?: React.ReactNode;
  className?: string;
};

export default function MasterMoldHead3D({
  state = "idle",
  speaking = false,
  hovered = false,
  size,
  fallback,
  className,
}: MasterMoldHead3DProps) {
  // Reduced motion SOFTENS the idle (half amplitude, no cursor tracking)
  // rather than freezing — a frozen mascot reads as broken, and a gentle
  // 40px sway is not vestibular-scale motion.
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [finePointer] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches,
  );
  // "always" for the idle animation; "demand" poses one static frame under
  // reduced motion; "never" fully parks the loop while the tab is hidden.
  const [frameloop, setFrameloop] = useState<"always" | "demand" | "never">("always");

  useEffect(() => {
    const onVisibility = () => {
      setFrameloop(document.visibilityState === "hidden" ? "never" : "always");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <Canvas
      className={className}
      style={size ? { width: size, height: size } : { width: "100%", height: "100%" }}
      dpr={[1, 1.5]}
      frameloop={frameloop}
      camera={{ position: [0, 0.1, 4.9], fov: 34 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      fallback={fallback}
    >
      {/* Neutral-warm rig so the magenta reads crimson (not purple) and the
          gold reads gold: warm key, pink rim, warm bounce from below. */}
      <ambientLight intensity={0.95} color="#d8c4c4" />
      <directionalLight position={[2.5, 3.5, 4]} intensity={2.4} color="#fff1e2" />
      <directionalLight position={[-3, 1.2, -2.5]} intensity={1.5} color="#ff5a7a" />
      <directionalLight position={[0, -2, 3]} intensity={0.9} color="#e0b25f" />
      <HeadRig
        state={state}
        speaking={speaking}
        hovered={hovered}
        animate
        track={finePointer && !reducedMotion}
        soft={reducedMotion}
      />
    </Canvas>
  );
}
