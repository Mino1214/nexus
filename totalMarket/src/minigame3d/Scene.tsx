import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Html, OrbitControls, Text } from '@react-three/drei';
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier';
import { ContainerBox } from './ContainerBox';
import { BouncingBalls } from './BouncingBalls';
import { SpecialBalls } from './SpecialBalls';
import type { Phase } from './GameController';

function Walls({ boxSize = [3.6, 2.4, 3.2], releaseOpen = 0 }: { boxSize?: [number, number, number]; releaseOpen: number }) {
  const [sx, sy, sz] = boxSize;
  const yOffset = 0.8; // lift the whole container so it is visible
  const t = 0.12;
  const wallMat = (
    <meshStandardMaterial color="#0a1222" roughness={0.9} metalness={0.12} emissive="#0b2a66" emissiveIntensity={0.22} />
  );

  // floor exists, then gets REMOVED (not just moved) when release starts
  const floorClosed = releaseOpen < 0.12;
  const doorOffset = yOffset - sy / 2 - t / 2;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const ht = t / 2;

  return (
    <group>
      {/* floor/door */}
      {floorClosed ? (
        <RigidBody type="fixed" colliders={false} name="closed-floor">
          <mesh position={[0, doorOffset, 0]} receiveShadow>
            <boxGeometry args={[sx, t, sz]} />
            {wallMat}
          </mesh>
          <CuboidCollider args={[hx, ht, hz]} position={[0, doorOffset, 0]} />
        </RigidBody>
      ) : null}

      {/* walls */}
      <RigidBody type="fixed" colliders={false}>
        <mesh position={[sx / 2 + t / 2, yOffset, 0]}>
          <boxGeometry args={[t, sy, sz]} />
          {wallMat}
        </mesh>
        <CuboidCollider args={[ht, hy, hz]} position={[sx / 2 + t / 2, yOffset, 0]} />
        <mesh position={[-sx / 2 - t / 2, yOffset, 0]}>
          <boxGeometry args={[t, sy, sz]} />
          {wallMat}
        </mesh>
        <CuboidCollider args={[ht, hy, hz]} position={[-sx / 2 - t / 2, yOffset, 0]} />
        <mesh position={[0, yOffset, sz / 2 + t / 2]}>
          <boxGeometry args={[sx, sy, t]} />
          {wallMat}
        </mesh>
        <CuboidCollider args={[hx, hy, ht]} position={[0, yOffset, sz / 2 + t / 2]} />
        <mesh position={[0, yOffset, -sz / 2 - t / 2]}>
          <boxGeometry args={[sx, sy, t]} />
          {wallMat}
        </mesh>
        <CuboidCollider args={[hx, hy, ht]} position={[0, yOffset, -sz / 2 - t / 2]} />
      </RigidBody>
    </group>
  );
}

export function Minigame3DScene({
  phase,
  triggerStrength,
  releaseOpen,
  specialOn,
  cycleSeed,
  onWin,
}: {
  phase: Phase;
  triggerStrength: number;
  releaseOpen: number;
  specialOn: boolean;
  cycleSeed: number;
  onWin?: (color: string) => void;
}) {
  void phase;
  // slightly smaller so it fits view at first glance
  const boxSize: [number, number, number] = [3.1, 2.1, 2.8];
  const yOffset = 0.8;
  const winGap = 1.05; // distance between box bottom and win floor
  const [winColor, setWinColor] = useState<string | null>(null);
  const winSentRef = useRef(false);

  useEffect(() => {
    setWinColor(null);
    winSentRef.current = false;
  }, [cycleSeed]);

  const labels = useMemo(() => {
    const [sx, sy, sz] = boxSize;
    const o = 0.03;
    const txt = { fontSize: 0.22, color: '#dff2ff' as const };
    return [
      { n: '1', p: [0, yOffset, sz / 2 + o] as [number, number, number], r: [0, 0, 0] as [number, number, number] }, // front
      { n: '2', p: [0, yOffset, -sz / 2 - o] as [number, number, number], r: [0, Math.PI, 0] as [number, number, number] }, // back
      { n: '3', p: [sx / 2 + o, yOffset, 0] as [number, number, number], r: [0, -Math.PI / 2, 0] as [number, number, number] }, // right
      { n: '4', p: [-sx / 2 - o, yOffset, 0] as [number, number, number], r: [0, Math.PI / 2, 0] as [number, number, number] }, // left
      { n: '5', p: [0, yOffset + sy / 2 + o, 0] as [number, number, number], r: [-Math.PI / 2, 0, 0] as [number, number, number] }, // top
      { n: '6', p: [0, yOffset - sy / 2 - o, 0] as [number, number, number], r: [Math.PI / 2, 0, 0] as [number, number, number] }, // bottom
    ].map((x) => ({ ...x, ...txt }));
  }, [boxSize]);

  return (
    <div className="page-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 560, background: '#03050b' }}>
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          camera={{ position: [5.8, 3.8, 5.8], fov: 38 }}
          onCreated={({ gl }) => {
            // make low-light scenes pop a bit
            gl.toneMappingExposure = 1.75;
          }}
        >
          <color attach="background" args={['#050812']} />
          <fog attach="fog" args={['#050812', 6, 14]} />

          {/* camera fixed: allow tiny orbit only for debugging */}
          <OrbitControls enableZoom={false} enablePan={false} maxPolarAngle={Math.PI / 2.1} minPolarAngle={Math.PI / 3.2} />

          {/* lights */}
          <ambientLight intensity={0.75} />
          <hemisphereLight intensity={0.55} color="#e8f6ff" groundColor="#041836" />
          <directionalLight
            position={[4, 6, 4]}
            intensity={3.1}
            color="#d7ecff"
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <spotLight
            position={[0, 4.3, 0]}
            angle={0.55}
            penumbra={0.8}
            intensity={4.6}
            color="#e8f6ff"
            distance={14}
            castShadow
          />
          <pointLight position={[0, -1.4, 0]} intensity={6.0 + triggerStrength * 4.0} color="#2a7bff" distance={11} />
          <pointLight position={[0, 0.9, 0]} intensity={1.6} color="#7cc7ff" distance={12} />
          <pointLight position={[2.8, 0.2, -2.2]} intensity={1.2} color="#2a7bff" distance={14} />
          <pointLight position={[-2.6, 0.1, 2.6]} intensity={1.0} color="#2a7bff" distance={14} />

          <Environment preset="night" environmentIntensity={1.4} />

          <Physics gravity={[0, -9.81, 0]}>
            <Walls boxSize={boxSize} releaseOpen={releaseOpen} />
            <group position={[0, yOffset, 0]}>
              <ContainerBox size={boxSize} releaseOpen={releaseOpen} triggerStrength={triggerStrength} />
            </group>
            <BouncingBalls count={10} boxSize={boxSize} cycleSeed={cycleSeed} nudge={triggerStrength} yOffset={yOffset} />
            {/* win floor: right below opening door */}
            <RigidBody type="fixed" name="win-floor" colliders={false}>
              <mesh position={[0, yOffset - boxSize[1] / 2 - winGap, 0]} receiveShadow>
                <boxGeometry args={[boxSize[0] * 0.95, 0.08, boxSize[2] * 0.95]} />
                <meshStandardMaterial color="#061226" roughness={0.85} metalness={0.08} emissive="#0b2a66" emissiveIntensity={0.25} />
              </mesh>
              <CuboidCollider
                args={[boxSize[0] * 0.475, 0.04, boxSize[2] * 0.475]}
                position={[0, yOffset - boxSize[1] / 2 - winGap, 0]}
              />
            </RigidBody>

            <SpecialBalls
              enabled={specialOn}
              boxSize={boxSize}
              cycleSeed={cycleSeed}
              yOffset={yOffset}
              onWin={(c) => {
                setWinColor((prev) => prev || c);
                if (!winSentRef.current) {
                  winSentRef.current = true;
                  onWin?.(c);
                }
              }}
            />
          </Physics>

          <ContactShadows
            position={[0, yOffset - boxSize[1] / 2 - 0.05, 0]}
            opacity={0.55}
            blur={2.2}
            far={5.5}
            scale={8}
            color="#000000"
          />

          {/* face numbers */}
          {labels.map((l) => (
            <Text
              key={l.n}
              position={l.p}
              rotation={l.r}
              fontSize={l.fontSize}
              color={l.color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.012}
              outlineColor="#061226"
            >
              {l.n}
            </Text>
          ))}

          {winColor ? (
            <Html center>
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: 'rgba(3,8,18,0.72)',
                  border: '1px solid rgba(124,199,255,0.35)',
                  color: '#e8f6ff',
                  minWidth: 180,
                  textAlign: 'center',
                  backdropFilter: 'blur(6px)',
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 6 }}>WIN</div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      background: winColor,
                      boxShadow: `0 0 18px ${winColor}`,
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontWeight: 800 }}>{winColor.toUpperCase()}</span>
                </div>
              </div>
            </Html>
          ) : null}
        </Canvas>
      </div>
    </div>
  );
}

