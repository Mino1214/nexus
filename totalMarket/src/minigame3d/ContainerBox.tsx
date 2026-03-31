import { useMemo } from 'react';
import { Edges, MeshTransmissionMaterial } from '@react-three/drei';

export function ContainerBox({
  size = [3.6, 2.4, 3.2],
  releaseOpen = 0,
  triggerStrength = 0,
}: {
  size?: [number, number, number];
  releaseOpen: number; // 0..1
  triggerStrength: number; // 0..1
}) {
  const [sx, sy, sz] = size;

  // 상자는 관람용으로 항상 "투명하게 보이도록" 유지
  // release 때는 사라지는 대신, 왜곡/크로마틱/림 발광으로 이벤트감을 줌
  const opacity = useMemo(() => {
    const base = 0.14; // 더 투명
    const min = 0.10;
    return Math.max(min, base - releaseOpen * 0.02);
  }, [releaseOpen]);

  const chrom = 0.02 + triggerStrength * 0.08;
  const distort = 0.05 + triggerStrength * 0.25;

  return (
    <group>
      {/* Glass container */}
      <mesh>
        <boxGeometry args={[sx, sy, sz]} />
        <MeshTransmissionMaterial
          transmission={1}
          thickness={0.28}
          roughness={0.12}
          ior={1.42}
          chromaticAberration={chrom}
          anisotropy={0.35}
          distortion={distort}
          distortionScale={0.25}
          temporalDistortion={0.12}
          attenuationColor="#4aa3ff"
          attenuationDistance={0.85}
          transparent
          opacity={opacity}
        />
        {/* edges help viewers perceive "transparent box" */}
        <Edges color="#7cc7ff" opacity={0.42} transparent />
      </mesh>

      {/* Subtle inner rim */}
      <mesh>
        <boxGeometry args={[sx * 0.995, sy * 0.995, sz * 0.995]} />
        <meshStandardMaterial
          color="#7cc7ff"
          transparent
          opacity={0.06}
          emissive="#1b6bff"
          emissiveIntensity={0.35 + triggerStrength * 0.85}
        />
      </mesh>
    </group>
  );
}

