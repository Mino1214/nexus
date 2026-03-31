import { useEffect, useMemo, useRef } from 'react';
import { RigidBody, type RapierRigidBody } from '@react-three/rapier';

function rand(seed: number) {
  // deterministic-ish
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function BouncingBalls({
  count = 14,
  boxSize = [3.6, 2.4, 3.2],
  cycleSeed = 1,
  nudge = 0,
  yOffset = 0,
}: {
  count?: number;
  boxSize?: [number, number, number];
  cycleSeed?: number;
  nudge?: number; // 0..1
  yOffset?: number;
}) {
  const [sx, sy, sz] = boxSize;
  const bodies = useRef<Array<RapierRigidBody | null>>([]);

  const balls = useMemo(() => {
    const out: Array<{ key: string; p: [number, number, number]; c: string; r: number }> = [];
    for (let i = 0; i < count; i++) {
      const s = cycleSeed * 0.000001 + i * 13.37;
      const r = 0.12 + rand(s * 9.3) * 0.05;
      const px = (rand(s * 3.1) - 0.5) * (sx * 0.75);
      const py = (rand(s * 7.7) - 0.5) * (sy * 0.55) + 0.2 + yOffset;
      const pz = (rand(s * 5.9) - 0.5) * (sz * 0.75);
      const c = i % 2 === 0 ? '#eaf7ff' : '#bfe7ff';
      out.push({ key: `b-${i}`, p: [px, py, pz], c, r });
    }
    return out;
  }, [count, sx, sy, sz, cycleSeed, yOffset]);

  useEffect(() => {
    // initial kick so it doesn't look like "a bunch of balls falling" on entry
    for (let i = 0; i < bodies.current.length; i++) {
      const rb = bodies.current[i];
      if (!rb) continue;
      const k = (cycleSeed ^ (i * 2654435761)) >>> 0;
      const fx = (((k & 1023) / 1023) - 0.5) * 2;
      const fz = ((((k >>> 10) & 1023) / 1023) - 0.5) * 2;
      rb.applyImpulse({ x: fx * 0.65, y: 0.55, z: fz * 0.65 }, true);
      rb.applyTorqueImpulse({ x: fz * 0.28, y: fx * 0.22, z: 0.22 }, true);
    }
  }, [cycleSeed]);

  useEffect(() => {
    if (!nudge) return;
    // extra chaos on trigger
    for (let i = 0; i < bodies.current.length; i++) {
      const rb = bodies.current[i];
      if (!rb) continue;
      const k = (cycleSeed ^ (i * 2246822519)) >>> 0;
      const fx = (((k & 1023) / 1023) - 0.5) * 2;
      const fz = ((((k >>> 10) & 1023) / 1023) - 0.5) * 2;
      rb.applyImpulse({ x: fx * 0.45 * nudge, y: 0.25 * nudge, z: fz * 0.45 * nudge }, true);
    }
  }, [nudge, cycleSeed]);

  return (
    <group>
      {balls.map((b, idx) => (
        <RigidBody
          key={b.key}
          ref={(rb) => {
            bodies.current[idx] = rb;
          }}
          colliders="ball"
          position={b.p}
          restitution={0.985}
          friction={0.03}
          linearDamping={0.01}
          angularDamping={0.03}
        >
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[b.r, 32, 32]} />
            <meshStandardMaterial
              color={b.c}
              roughness={0.25}
              metalness={0.05}
              emissive="#2d8cff"
              emissiveIntensity={0.08 + (idx % 3) * 0.03}
            />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}

