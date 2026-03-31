import { useEffect, useMemo, useRef } from 'react';
import { Trail } from '@react-three/drei';
import { RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

export function SpecialBalls({
  enabled,
  boxSize = [3.6, 2.4, 3.2],
  cycleSeed = 1,
  onWin,
  yOffset = 0,
}: {
  enabled: boolean;
  boxSize?: [number, number, number];
  cycleSeed?: number;
  onWin?: (color: string) => void;
  yOffset?: number;
}) {
  const [sx, sy, sz] = boxSize;
  const bodies = useRef<Array<RapierRigidBody | null>>([]);

  const seeds = useMemo(() => [0, 1, 2], []);
  // 색상은 3가지만 고정: 빨/파/노
  const palette = useMemo(() => ['#ef4444', '#3b82f6', '#eab308'], []);
  const colors = useMemo(() => {
    // cycleSeed에 따라 3색의 순서만 바뀌게(항상 3색 모두 등장)
    const a = palette[0];
    const b = palette[1];
    const c = palette[2];
    const m = ((cycleSeed >>> 0) % 6) | 0;
    if (m === 0) return [a, b, c];
    if (m === 1) return [a, c, b];
    if (m === 2) return [b, a, c];
    if (m === 3) return [b, c, a];
    if (m === 4) return [c, a, b];
    return [c, b, a];
  }, [cycleSeed, palette]);

  useEffect(() => {
    if (!enabled) return;
    // punch the special balls downward/outward on enable
    for (let i = 0; i < bodies.current.length; i++) {
      const b = bodies.current[i];
      if (!b) continue;
      const k = (cycleSeed ^ (i * 2654435761)) >>> 0;
      const rx = (((k & 1023) / 1023) - 0.5) * 2;
      const rz = ((((k >>> 10) & 1023) / 1023) - 0.5) * 2;
      b.setLinvel({ x: rx * 1.2, y: -3.6 - i * 0.4, z: rz * 1.0 }, true);
      b.setAngvel({ x: 1.2 + rz, y: 1.6 + rx, z: 0.8 }, true);
    }
  }, [enabled, cycleSeed]);

  if (!enabled) return null;

  return (
    <group>
      {seeds.map((s, i) => (
        <RigidBody
          key={`sp-${s}`}
          ref={(rb) => {
            bodies.current[i] = rb;
          }}
          name={`special-${i}`}
          colliders="ball"
          position={[
            ((i - 1) * sx) / 6 + ((((cycleSeed >>> (i * 5)) & 255) / 255) - 0.5) * 0.6,
            sy / 4 + yOffset,
            ((i - 1) * sz) / 8 + ((((cycleSeed >>> (i * 7)) & 255) / 255) - 0.5) * 0.6,
          ]}
          restitution={0.99}
          friction={0.01}
          linearDamping={0.01}
          angularDamping={0.02}
          gravityScale={1.35}
          onCollisionEnter={(e) => {
            if (!onWin) return;
            const otherName = (e.other?.rigidBodyObject as any)?.name || '';
            if (otherName === 'win-floor') onWin(colors[i]);
          }}
        >
          <Trail
            width={0.22}
            length={10}
            color={new THREE.Color(colors[i])}
            attenuation={(t) => t * t}
          >
            <group>
              <mesh castShadow>
                <sphereGeometry args={[0.16, 48, 48]} />
                <meshStandardMaterial
                  color="#05070f"
                  roughness={0.16}
                  metalness={0.7}
                  emissive={new THREE.Color(colors[i])}
                  emissiveIntensity={2.2}
                />
              </mesh>

              {/* glow shell */}
              <mesh>
                <sphereGeometry args={[0.20, 32, 32]} />
                <meshBasicMaterial color={new THREE.Color(colors[i])} transparent opacity={0.32} />
              </mesh>
            </group>
          </Trail>
        </RigidBody>
      ))}
    </group>
  );
}

