/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  PerspectiveCamera, 
  OrbitControls, 
  Box, 
  Sphere, 
  Plane, 
  Cylinder, 
  Text,
  Float,
  ContactShadows,
  Environment,
  Sky
} from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Sword, 
  TrendingUp, 
  Users, 
  Map, 
  Play, 
  Pause, 
  RotateCcw, 
  ChevronRight, 
  Info,
  Zap,
  Heart,
  Home,
  Crosshair
} from 'lucide-react';

// --- Types & Constants ---

type GameState = 'START' | 'PLAYING' | 'UPGRADE' | 'GAMEOVER' | 'PAUSED';
type ControlType = 'KEYBOARD' | 'HYBRID';
type GameOverReason = 'BASE_FELL' | 'PLAYER_DIED';

interface Entity {
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  type: 'player' | 'enemy' | 'base';
  speed: number;
  size: number;
}

interface Enemy extends Entity {
  enemyType: 'scout' | 'infantry' | 'heavy' | 'archer' | 'commander';
  damage: number;
  cooldown?: number;
  chargeTimer?: number;
  lungeTimer?: number;
  lungeDir?: { x: number, z: number };
  hitFlash?: number;
  rotation: number;
}

interface Projectile {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  damage: number;
  enemyType?: 'archer' | 'heavy' | 'commander';
}

interface BackgroundElement {
  id: number;
  x: number;
  z: number;
  type: 'grass' | 'rock' | 'flower' | 'bush';
  size: number;
  rotation: number;
  color: string;
}

const WORLD_WIDTH = 80;
const WORLD_DEPTH = 60;
const BASE_X = 0;
const BASE_Z = 0;
const BASE_SIZE = 6;

// --- 3D Components ---

// --- 3D Models ---

function HorseModel({ color, hitFlash, scale = 1 }: { color: string, hitFlash: number, scale?: number }) {
  const materialColor = hitFlash > 0 ? "#ffffff" : color;
  return (
    <group scale={scale}>
      {/* Body */}
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, 0]}>
        <capsuleGeometry args={[0.4, 1, 4, 8]} />
        <meshStandardMaterial color={materialColor} />
      </mesh>
      {/* Neck */}
      <mesh position={[0, 0.8, 0.6]} rotation={[Math.PI / 3, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.25, 0.8, 8]} />
        <meshStandardMaterial color={materialColor} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.2, 0.9]} rotation={[Math.PI / 8, 0, 0]}>
        <boxGeometry args={[0.35, 0.4, 0.6]} />
        <meshStandardMaterial color={materialColor} />
      </mesh>
      {/* Legs */}
      {[[-0.25, -0.4], [0.25, -0.4], [-0.25, 0.4], [0.25, 0.4]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0, z]}>
          <cylinderGeometry args={[0.08, 0.06, 1, 8]} />
          <meshStandardMaterial color={materialColor} />
        </mesh>
      ))}
      {/* Tail */}
      <mesh position={[0, 0.6, -0.6]} rotation={[-Math.PI / 4, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.02, 0.8, 8]} />
        <meshStandardMaterial color={materialColor} />
      </mesh>
    </group>
  );
}

function RiderModel({ color, hitFlash, scale = 1, weaponType = 'spear' }: { color: string, hitFlash: number, scale?: number, weaponType?: 'spear' | 'sword' | 'bow' }) {
  const materialColor = hitFlash > 0 ? "#ffffff" : color;
  const skinColor = "#ffdbac";
  
  return (
    <group position={[0, 1.1 * scale, -0.1 * scale]} scale={scale}>
      {/* Torso */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.25, 0.2, 0.7, 8]} />
        <meshStandardMaterial color={materialColor} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.9, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>
      {/* Nón lá (Traditional Hat) */}
      <mesh position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0, 0.5, 0.2, 16]} />
        <meshStandardMaterial color="#f5deb3" />
      </mesh>
      {/* Arms */}
      <mesh position={[0.35, 0.5, 0.1]} rotation={[0.5, 0, -0.2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.5, 8]} />
        <meshStandardMaterial color={materialColor} />
      </mesh>
      <mesh position={[-0.35, 0.5, 0.1]} rotation={[0.5, 0, 0.2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.5, 8]} />
        <meshStandardMaterial color={materialColor} />
      </mesh>
      
      {/* Weapon */}
      <group position={[0.4, 0.5, 0.3]}>
        {weaponType === 'spear' && (
          <group rotation={[Math.PI / 2, 0, 0]}>
            <mesh>
              <cylinderGeometry args={[0.03, 0.03, 3, 8]} />
              <meshStandardMaterial color="#4b3621" />
            </mesh>
            <mesh position={[0, 1.6, 0]}>
              <cylinderGeometry args={[0, 0.08, 0.4, 8]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.8} roughness={0.2} />
            </mesh>
          </group>
        )}
        {weaponType === 'sword' && (
          <group rotation={[Math.PI / 2, 0, 0]}>
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[0.05, 1.5, 0.2]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.1} />
            </mesh>
          </group>
        )}
        {weaponType === 'bow' && (
          <group rotation={[0, Math.PI / 2, 0]}>
            <mesh>
              <torusGeometry args={[0.4, 0.03, 8, 16, Math.PI]} />
              <meshStandardMaterial color="#4b3621" />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}

function Player({ pos, facing, hitFlash, attackTrigger, shockwaveTrigger, attackRange, hp, maxHp, color = "#e63946" }: { pos: { x: number, z: number }, facing: number, hitFlash: number, attackTrigger: number, shockwaveTrigger: number, attackRange: number, hp: number, maxHp: number, color?: string }) {
  const meshRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const arcRef = useRef<THREE.Mesh>(null);
  
  const lastAttackTime = useRef(0);
  const lastShockwaveTime = useRef(0);
  const prevAttackTrigger = useRef(0);
  const prevShockwaveTrigger = useRef(0);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.set(pos.x, 0.5, pos.z);
      meshRef.current.rotation.y = -facing + Math.PI / 2;
    }

    const time = state.clock.elapsedTime;
    
    if (attackTrigger !== prevAttackTrigger.current) {
      lastAttackTime.current = time;
      prevAttackTrigger.current = attackTrigger;
    }
    if (shockwaveTrigger !== prevShockwaveTrigger.current) {
      lastShockwaveTime.current = time;
      prevShockwaveTrigger.current = shockwaveTrigger;
    }

    // Strike Animation
    const attackElapsed = time - lastAttackTime.current;
    if (attackElapsed < 0.2) {
      const p = attackElapsed / 0.2;
      if (bodyRef.current) {
        bodyRef.current.position.z = Math.sin(p * Math.PI) * 0.5;
      }
      if (arcRef.current) {
        arcRef.current.visible = true;
        const baseScale = attackRange / 4.5;
        const currentScale = baseScale * (0.8 + p * 0.2);
        arcRef.current.scale.set(currentScale, currentScale, 1);
        (arcRef.current.material as THREE.MeshStandardMaterial).opacity = (1 - p) * 0.8;
      }
    } else {
      if (bodyRef.current) bodyRef.current.position.z = 0;
      if (arcRef.current) arcRef.current.visible = false;
    }

    // Shockwave Animation
    const shockwaveElapsed = time - lastShockwaveTime.current;
    if (shockwaveElapsed < 0.4) {
      const p = shockwaveElapsed / 0.4;
      if (bodyRef.current) {
        bodyRef.current.rotation.y = p * Math.PI * 4;
      }
    } else {
      if (bodyRef.current) bodyRef.current.rotation.y = 0;
    }
  });

  return (
    <group ref={meshRef}>
      {/* Shadow Blob */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[1.2, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>

      <group ref={bodyRef}>
        <HorseModel color="#a0522d" hitFlash={hitFlash} />
        <RiderModel color={color} hitFlash={hitFlash} weaponType="spear" />

        {/* Swipe Arc VFX */}
        <mesh ref={arcRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.2, 1.5]} visible={false}>
          <ringGeometry args={[3.5, 4.5, 32, 1, Math.PI, Math.PI]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.8} emissive="#ffffff" emissiveIntensity={4} side={THREE.DoubleSide} />
        </mesh>
      </group>
      
      <pointLight position={[0, 2, 0]} intensity={0.5} color="#ef4444" />

      {/* Health Bar */}
      <group position={[0, 3.5, 0]} rotation={[0, facing - Math.PI / 2, 0]}>
        <Plane args={[2, 0.15]}>
          <meshBasicMaterial color="#000000" transparent opacity={0.5} />
        </Plane>
        <Plane args={[2 * (hp / maxHp), 0.15]} position={[-(1 - (hp / maxHp)), 0, 0.01]}>
          <meshBasicMaterial color={color} />
        </Plane>
      </group>
    </group>
  );
}

const EnemyMesh = React.memo(({ enemy }: { enemy: Enemy }) => {
  const meshRef = useRef<THREE.Group>(null);
  const isCharging = enemy.chargeTimer! > 0;

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.set(enemy.x, 0, enemy.z);
      meshRef.current.rotation.y = enemy.rotation;
      
      if (isCharging) {
        meshRef.current.position.x += Math.sin(state.clock.elapsedTime * 50) * 0.05;
      }
    }
  });

  const color = enemy.enemyType === 'commander' ? '#7f1d1d' :
                enemy.enemyType === 'heavy' ? '#44403c' :
                enemy.enemyType === 'archer' ? '#92400e' : '#57534e';

  const s = enemy.size || 1;
  const weaponType = enemy.enemyType === 'archer' ? 'bow' : 
                     enemy.enemyType === 'heavy' ? 'sword' : 'spear';

  return (
    <group ref={meshRef}>
      {/* Shadow Blob */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[s * 1.2, 8]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>

      <HorseModel color="#5d4037" hitFlash={enemy.hitFlash || 0} scale={s} />
      <RiderModel color={color} hitFlash={enemy.hitFlash || 0} scale={s} weaponType={weaponType} />
      
      {/* Health Bar */}
      <group position={[0, 3 * s, 0]}>
        <Plane args={[2 * s, 0.15 * s]}>
          <meshBasicMaterial color="#000000" transparent opacity={0.5} />
        </Plane>
        <Plane args={[2 * s * (enemy.hp / enemy.maxHp), 0.15 * s]} position={[-(s - s * (enemy.hp / enemy.maxHp)), 0, 0.01]}>
          <meshBasicMaterial color="#ef4444" />
        </Plane>
      </group>
    </group>
  );
});

function Banner({ position, color }: { position: [number, number, number], color: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 4, 8]} />
        <meshStandardMaterial color="#4b3621" />
      </mesh>
      <mesh position={[0.5, 3.5, 0]}>
        <boxGeometry args={[1, 0.8, 0.05]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function Outpost({ hp, hitFlash, maxHp = 500 }: { hp: number, hitFlash: number, maxHp?: number }) {
  const materialColor = hitFlash > 0 ? "#ffffff" : "#8b4513";
  
  return (
    <group position={[0, 0, 0]}>
      {/* Stone Foundation */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[8, 0.5, 8]} />
        <meshStandardMaterial color="#44403c" />
      </mesh>

      {/* Main Structure */}
      <group position={[0, 0.5, 0]}>
        {/* Pillars */}
        {[[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]].map(([x, z], i) => (
          <mesh key={i} position={[x, 2, z]}>
            <cylinderGeometry args={[0.4, 0.5, 4, 8]} />
            <meshStandardMaterial color="#7f1d1d" />
          </mesh>
        ))}
        
        {/* Walls */}
        <mesh position={[0, 2, -2.8]}>
          <boxGeometry args={[5.6, 4, 0.4]} />
          <meshStandardMaterial color={materialColor} />
        </mesh>
        <mesh position={[0, 2, 2.8]}>
          <boxGeometry args={[5.6, 4, 0.4]} />
          <meshStandardMaterial color={materialColor} />
        </mesh>
        <mesh position={[-2.8, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[5.6, 4, 0.4]} />
          <meshStandardMaterial color={materialColor} />
        </mesh>
        <mesh position={[2.8, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[5.6, 4, 0.4]} />
          <meshStandardMaterial color={materialColor} />
        </mesh>

        {/* Multi-tiered Roof (Vietnamese Style) */}
        <group position={[0, 4, 0]}>
          {/* Lower Roof */}
          <mesh rotation={[0, Math.PI / 4, 0]}>
            <cylinderGeometry args={[0, 6.5, 1.5, 4]} />
            <meshStandardMaterial color="#991b1b" />
          </mesh>
          {/* Upper Roof */}
          <mesh position={[0, 1.5, 0]} rotation={[0, Math.PI / 4, 0]}>
            <cylinderGeometry args={[0, 4, 1.2, 4]} />
            <meshStandardMaterial color="#991b1b" />
          </mesh>
          
          {/* Decorative curved corners */}
          {[[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]].map(([x, z], i) => (
            <mesh key={i} position={[x, -0.2, z]} rotation={[0, Math.atan2(z, x), 0.6]}>
              <boxGeometry args={[1.5, 0.15, 0.15]} />
              <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.5} />
            </mesh>
          ))}
        </group>
      </group>
      
      {/* Banners */}
      <Banner position={[-3, 0.5, -3]} color="#991b1b" />
      <Banner position={[3, 0.5, -3]} color="#991b1b" />
      <Banner position={[-3, 0.5, 3]} color="#facc15" />
      <Banner position={[3, 0.5, 3]} color="#facc15" />
      
      {/* Spikes / Defenses */}
      {[[-4, -4], [4, -4], [-4, 4], [4, 4]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.5, z]} rotation={[0.2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.2, 2, 8]} />
          <meshStandardMaterial color="#57534e" />
        </mesh>
      ))}
      
      {/* Health Bar */}
      <group position={[0, 8, 0]}>
        <Plane args={[8, 0.4]}>
          <meshBasicMaterial color="#000000" transparent opacity={0.5} />
        </Plane>
        <Plane args={[8 * (hp / maxHp), 0.4]} position={[-(4 - 4 * (hp / maxHp)), 0, 0.01]}>
          <meshBasicMaterial color="#ef4444" />
        </Plane>
      </group>
      
      <pointLight position={[0, 4, 0]} intensity={1} color="#facc15" />
    </group>
  );
}

const ProjectileMesh = React.memo(({ p }: { p: Projectile }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.set(p.x, 1, p.z);
      meshRef.current.rotation.y = -Math.atan2(p.vz, p.vx) + Math.PI / 2;
    }
  });

  const isArrow = p.enemyType === 'archer';

  return (
    <mesh ref={meshRef}>
      {isArrow ? (
        <Cylinder args={[0.05, 0.05, 1, 8]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#fb923c" emissive="#fb923c" emissiveIntensity={0.5} />
        </Cylinder>
      ) : (
        <Sphere args={[0.2, 6, 6]}>
          <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={1} />
        </Sphere>
      )}
    </mesh>
  );
});function Background({ elements }: { elements: BackgroundElement[] }) {
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const treeTrunkRef = useRef<THREE.InstancedMesh>(null);
  const treeLeavesRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const flowerStemRef = useRef<THREE.InstancedMesh>(null);
  const flowerHeadRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const grass = elements.filter(el => el.type === 'grass');
    const trees = elements.filter(el => el.type === 'bush'); // Mapping bush to tree
    const rocks = elements.filter(el => el.type === 'rock');
    const flowers = elements.filter(el => el.type === 'flower');

    const dummy = new THREE.Object3D();

    // Grass
    if (grassRef.current) {
      grass.forEach((el, i) => {
        dummy.position.set(el.x, 0.1, el.z);
        dummy.rotation.set(0, el.rotation, 0);
        dummy.scale.set(el.size * 0.5, el.size * 1.5, el.size * 0.5);
        dummy.updateMatrix();
        grassRef.current!.setMatrixAt(i, dummy.matrix);
        grassRef.current!.setColorAt(i, new THREE.Color(el.color));
      });
      grassRef.current.instanceMatrix.needsUpdate = true;
      if (grassRef.current.instanceColor) grassRef.current.instanceColor.needsUpdate = true;
    }

    // Trees - Trunk
    if (treeTrunkRef.current) {
      trees.forEach((el, i) => {
        dummy.position.set(el.x, el.size * 1.5, el.z);
        dummy.rotation.set(0, el.rotation, 0);
        dummy.scale.set(el.size * 0.4, el.size * 3, el.size * 0.4);
        dummy.updateMatrix();
        treeTrunkRef.current!.setMatrixAt(i, dummy.matrix);
      });
      treeTrunkRef.current.instanceMatrix.needsUpdate = true;
    }

    // Trees - Leaves
    if (treeLeavesRef.current) {
      trees.forEach((el, i) => {
        dummy.position.set(el.x, el.size * 4, el.z);
        dummy.rotation.set(0, el.rotation, 0);
        dummy.scale.set(el.size * 2, el.size * 2.5, el.size * 2);
        dummy.updateMatrix();
        treeLeavesRef.current!.setMatrixAt(i, dummy.matrix);
        treeLeavesRef.current!.setColorAt(i, new THREE.Color(el.color));
      });
      treeLeavesRef.current.instanceMatrix.needsUpdate = true;
      if (treeLeavesRef.current.instanceColor) treeLeavesRef.current.instanceColor.needsUpdate = true;
    }

    // Rocks
    if (rockRef.current) {
      rocks.forEach((el, i) => {
        dummy.position.set(el.x, el.size * 0.2, el.z);
        dummy.rotation.set(el.rotation, el.rotation, el.rotation);
        dummy.scale.set(el.size * 1.5, el.size * 1.2, el.size * 1.5);
        dummy.updateMatrix();
        rockRef.current!.setMatrixAt(i, dummy.matrix);
        rockRef.current!.setColorAt(i, new THREE.Color(el.color));
      });
      rockRef.current.instanceMatrix.needsUpdate = true;
      if (rockRef.current.instanceColor) rockRef.current.instanceColor.needsUpdate = true;
    }

    // Flowers
    if (flowerHeadRef.current) {
      flowers.forEach((el, i) => {
        dummy.position.set(el.x, el.size * 0.5, el.z);
        dummy.rotation.set(0, el.rotation, 0);
        dummy.scale.set(el.size * 0.4, el.size * 0.4, el.size * 0.4);
        dummy.updateMatrix();
        flowerHeadRef.current!.setMatrixAt(i, dummy.matrix);
        flowerHeadRef.current!.setColorAt(i, new THREE.Color(el.color));
      });
      flowerHeadRef.current.instanceMatrix.needsUpdate = true;
      if (flowerHeadRef.current.instanceColor) flowerHeadRef.current.instanceColor.needsUpdate = true;
    }

    if (flowerStemRef.current) {
      flowers.forEach((el, i) => {
        dummy.position.set(el.x, el.size * 0.2, el.z);
        dummy.rotation.set(0, el.rotation, 0);
        dummy.scale.set(el.size * 0.1, el.size * 0.5, el.size * 0.1);
        dummy.updateMatrix();
        flowerStemRef.current!.setMatrixAt(i, dummy.matrix);
      });
      flowerStemRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [elements]);

  const grassCount = elements.filter(el => el.type === 'grass').length;
  const treeCount = elements.filter(el => el.type === 'bush').length;
  const rockCount = elements.filter(el => el.type === 'rock').length;
  const flowerCount = elements.filter(el => el.type === 'flower').length;

  return (
    <group>
      {/* Grass Tufts */}
      <instancedMesh ref={grassRef} args={[undefined, undefined, grassCount]} frustumCulled={false}>
        <cylinderGeometry args={[0.1, 0.2, 0.5, 5]} />
        <meshStandardMaterial />
      </instancedMesh>

      {/* Trees */}
      <instancedMesh ref={treeTrunkRef} args={[undefined, undefined, treeCount]} frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.7, 1, 8]} />
        <meshStandardMaterial color="#4a3728" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={treeLeavesRef} args={[undefined, undefined, treeCount]} frustumCulled={false}>
        <coneGeometry args={[1, 1.5, 8]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>

      {/* Rocks & Boulders */}
      <instancedMesh ref={rockRef} args={[undefined, undefined, rockCount]} frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>

      {/* Flowers */}
      <instancedMesh ref={flowerStemRef} args={[undefined, undefined, flowerCount]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 4]} />
        <meshStandardMaterial color="#2d6a4f" />
      </instancedMesh>
      <instancedMesh ref={flowerHeadRef} args={[undefined, undefined, flowerCount]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshStandardMaterial />
      </instancedMesh>
    </group>
  );
}

function Ground() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      {/* Grass */}
      <Plane args={[400, 400]}>
        <meshStandardMaterial color="#606c38" roughness={0.6} />
      </Plane>
      
      {/* Sandy Paths */}
      <Plane args={[400, 12]} position={[0, 0, 0.01]}>
        <meshStandardMaterial 
          color="#dda15e" 
          transparent 
          opacity={0.3} 
          polygonOffset 
          polygonOffsetFactor={-1} 
        />
      </Plane>
      <Plane args={[12, 400]} position={[0, 0, 0.01]}>
        <meshStandardMaterial 
          color="#dda15e" 
          transparent 
          opacity={0.3} 
          polygonOffset 
          polygonOffsetFactor={-1} 
        />
      </Plane>
      
      {/* Dirt variation */}
      <Plane args={[400, 400]} position={[0, 0, -0.01]}>
        <meshStandardMaterial color="#283618" />
      </Plane>

      <gridHelper args={[400, 80, "#ffffff", "#ffffff"]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]}>
        <meshBasicMaterial 
          transparent 
          opacity={0.1} 
          polygonOffset 
          polygonOffsetFactor={-2} 
        />
      </gridHelper>
    </group>
  );
}

function ResizeHandler() {
  const { gl, camera, size } = useThree();
  
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      gl.setSize(width, height);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    // Initial sync
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [gl, camera]);

  return null;
}

function GameScene({ 
  playerPos, 
  playerFacing, 
  playerHitFlash, 
  attackTrigger,
  shockwaveTrigger,
  enemies, 
  projectiles, 
  baseHp, 
  playerHp,
  baseHitFlash,
  screenShakeRef,
  controlType,
  cameraAngleRef,
  requestLock,
  upgrades,
  backgroundElementsRef,
  handleAttack,
  handleShockwave,
  gameStateRef,
  remotePlayers,
  socketRef,
  allPlayers,
  myId,
  gameMode,
  respawnTimer
}: any) {
  const { camera, gl } = useThree();
  const cameraDistance = 55;
  const cameraHeight = 40;

  // Handle Mouse Rotation (Pointer Lock)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === gl.domElement && controlType === 'HYBRID') {
        cameraAngleRef.current -= e.movementX * 0.005;
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (gameStateRef.current !== 'PLAYING' || playerHp <= 0 || respawnTimer > 0) return;
      if (controlType === 'HYBRID') {
        if (e.button === 0) handleAttack();
        if (e.button === 2) handleShockwave();
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (controlType === 'HYBRID') e.preventDefault();
    };
    const handleClick = () => {
      if (playerHp <= 0 || respawnTimer > 0) return;
      if (controlType === 'HYBRID' && !document.pointerLockElement) {
        requestLock();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', handleContextMenu);
    gl.domElement.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      gl.domElement.removeEventListener('click', handleClick);
    };
  }, [controlType, gl, handleAttack, handleShockwave, gameStateRef, playerHp]);

  useFrame((state) => {
    // Both modes now use the same manual follow logic for consistency
    const angle = cameraAngleRef.current;
    const targetX = playerPos.x + Math.sin(angle) * cameraDistance;
    const targetZ = playerPos.z + Math.cos(angle) * cameraDistance;
    const targetY = cameraHeight;

    const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
    
    if (screenShakeRef.current > 0) {
      const shake = screenShakeRef.current * 0.1;
      targetPos.x += (Math.random() - 0.5) * shake;
      targetPos.y += (Math.random() - 0.5) * shake;
      targetPos.z += (Math.random() - 0.5) * shake;
    }
    
    camera.position.lerp(targetPos, 0.1);
    camera.lookAt(playerPos.x, 0, playerPos.z);

    // Emit movement to server
    if (socketRef.current && gameStateRef.current === 'PLAYING' && playerHp > 0 && respawnTimer <= 0) {
      socketRef.current.emit('move', {
        x: playerPos.x,
        z: playerPos.z,
        facing: playerFacing
      });
    }
  });

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight 
        position={[50, 50, 25]} 
        intensity={1.5} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
      />
      <Environment preset="park" />
      <Sky sunPosition={[100, 50, 100]} />
      <fog attach="fog" args={["#f0f9ff", 100, 300]} />

      <Background elements={backgroundElementsRef.current} />
      <Ground />
      <Outpost hp={baseHp} hitFlash={baseHitFlash} maxHp={500} />
      
      {playerHp > 0 && (
        <Player 
          pos={playerPos} 
          facing={playerFacing} 
          hitFlash={playerHitFlash} 
          attackTrigger={attackTrigger}
          shockwaveTrigger={shockwaveTrigger}
          attackRange={10 + (upgrades.reach - 1) * 2}
          hp={playerHp}
          maxHp={100 + (upgrades.playerMaxHp - 1) * 20}
          color={allPlayers[myId]?.team === 'attacker' ? "#ef4444" : "#e63946"}
        />
      )}

      {Object.values(remotePlayers).map((p: any) => (
        p.hp > 0 && (
          <Player 
            key={p.id}
            pos={{ x: p.x, z: p.z }}
            facing={p.facing}
            hitFlash={p.hitFlash || 0}
            attackTrigger={p.attackTrigger || 0}
            shockwaveTrigger={p.shockwaveTrigger || 0}
            attackRange={10} // Default for others for now
            hp={p.hp ?? 100}
            maxHp={100 + (upgrades.playerMaxHp - 1) * 20}
            color={p.team === 'attacker' ? "#ef4444" : "#457b9d"}
          />
        )
      ))}

      {enemies.map((enemy: any) => (
        <EnemyMesh key={enemy.id} enemy={enemy} />
      ))}

      {projectiles.map((p: any) => (
        <ProjectileMesh key={p.id} p={p} />
      ))}

      <ContactShadows opacity={0.4} scale={200} blur={2} far={10} resolution={128} color="#000000" />
    </>
  );
}

// --- Main App ---

export default function App() {
  const nextIdRef = useRef(1);
  const getNextId = () => {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    return id;
  };

  const [gameState, setGameState] = useState<GameState>('START');
  const [gameMode, setGameMode] = useState<'PVE' | 'PVP'>('PVE');
  const [pvpTimer, setPvpTimer] = useState(30);
  const [controlType, setControlType] = useState<ControlType>('KEYBOARD');
  const [countdown, setCountdown] = useState<number | null>(null);

  // Multiplayer State
  const [remotePlayers, setRemotePlayers] = useState<Record<string, any>>({});
  const [allPlayers, setAllPlayers] = useState<Record<string, any>>({});
  const socketRef = useRef<Socket | null>(null);
  const myIdRef = useRef<string | null>(null);
  const lastStateChangeTimeRef = useRef(0);
  const lastUpgradeTimeRef = useRef(0);
  const [isMobile, setIsMobile] = useState(false);
  const joystickPos = useRef({ x: 0, y: 0 });
  const touchStartPos = useRef<{ x: number, y: number } | null>(null);
  const [showMobileControls, setShowMobileControls] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(isTouch);
      if (window.location.search.includes('mobile=true')) setShowMobileControls(true);
      else setShowMobileControls(isTouch);
      
      // Force a window resize event to ensure R3F Canvas updates
      // Use requestAnimationFrame to ensure the DOM has updated dimensions
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    window.addEventListener('orientationchange', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('orientationchange', checkMobile);
    };
  }, []);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('init', (data) => {
      myIdRef.current = data.id;
      const others = { ...data.players };
      delete others[data.id];
      setRemotePlayers(others);
    });

    socket.on('playerJoined', (player) => {
      if (player.id !== myIdRef.current) {
        setRemotePlayers(prev => ({ ...prev, [player.id]: player }));
      }
    });

    socket.on('playerMoved', (player) => {
      if (player.id !== myIdRef.current) {
        setRemotePlayers(prev => ({ ...prev, [player.id]: player }));
      }
    });

    socket.on('playerAttacked', (data) => {
      if (data.id !== myIdRef.current) {
        setRemotePlayers(prev => {
          if (!prev[data.id]) return prev;
          return {
            ...prev,
            [data.id]: { ...prev[data.id], attackTrigger: (prev[data.id].attackTrigger || 0) + 1 }
          };
        });
      }
    });

    socket.on('playerShockwaved', (data) => {
      if (data.id !== myIdRef.current) {
        setRemotePlayers(prev => {
          if (!prev[data.id]) return prev;
          return {
            ...prev,
            [data.id]: { ...prev[data.id], shockwaveTrigger: (prev[data.id].shockwaveTrigger || 0) + 1 }
          };
        });
      }
    });

    socket.on('gameStateUpdate', (data) => {
      setWave(data.wave);
      setGameMode(data.gameMode || 'PVE');
      setPvpTimer(data.pvpTimer || 30);
      setBaseHp(data.baseHp);
      setEnemiesToSpawn(data.enemiesToSpawn);
      setEnemiesSpawned(data.enemiesSpawned);
      setCountdown(data.countdown);
      setAllPlayers(data.players || {});
      
      // Prevent rubberbanding for honor and upgrades
      if (Date.now() - lastUpgradeTimeRef.current > 1000) {
        if (myIdRef.current && data.players && data.players[myIdRef.current]) {
          setHonor(data.players[myIdRef.current].honor || 0);
          honorRef.current = data.players[myIdRef.current].honor || 0;
          
          const myUpgrades = data.players[myIdRef.current].upgrades || {};
          const mergedUpgrades = {
            ...myUpgrades,
            baseDefense: data.upgrades.baseDefense,
            baseRegen: data.upgrades.baseRegen
          };
          setUpgrades(mergedUpgrades);
          upgradesRef.current = mergedUpgrades;
        }
      }
      
      enemiesRef.current = data.enemies;
      projectilesRef.current = data.projectiles;
      baseHpRef.current = data.baseHp;

      // Sync player HP and Position
      if (myIdRef.current && data.players && data.players[myIdRef.current]) {
        const myData = data.players[myIdRef.current];
        const newHp = myData.hp ?? 0;
        
        // Sync position if:
        // 1. Player is dead (keep in purgatory)
        // 2. Player just respawned (move to spawn point)
        // 3. Game just started (move to initial spawn point)
        // 4. We are in the lobby (START state) - sync to team spawn
        const isRespawning = newHp > 0 && playerHpRef.current <= 0;
        const isGameStarting = data.status === 'PLAYING' && gameStateRef.current !== 'PLAYING';
        const isInLobby = data.status === 'START';
        
        if (newHp <= 0 || isRespawning || isGameStarting || isInLobby) {
          // Only sync if the server position is significantly different or we are dead/respawning
          const dx = myData.x - playerPosRef.current.x;
          const dz = myData.z - playerPosRef.current.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          
          if (dist > 1 || newHp <= 0 || isRespawning || isGameStarting) {
            playerPosRef.current = { x: myData.x, z: myData.z };
            playerVelRef.current = { x: 0, z: 0 };
          }
        }

        setPlayerHp(newHp);
        playerHpRef.current = newHp;
        setPlayerHitFlash(myData.hitFlash || 0);
        setRespawnTimer(myData.respawnTimer || 0);
        setKilledBy(myData.killedBy || null);
      }

      // Sync remote players
      const others = { ...data.players };
      if (myIdRef.current) delete others[myIdRef.current];
      setRemotePlayers(others);
      
      // State synchronization - Server is source of truth
      if (data.status !== gameStateRef.current) {
        if (data.status === 'GAMEOVER') {
          setGameOverReason(data.gameOverReason || 'BASE_FELL');
        }
        setGameState(data.status);
        gameStateRef.current = data.status;
        lastStateChangeTimeRef.current = Date.now();
      }
    });

    socket.on('playerLeft', (id) => {
      setRemotePlayers(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const toggleReady = () => {
    const currentReady = allPlayers[myIdRef.current!]?.ready || false;
    socketRef.current?.emit('setReady', !currentReady);
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    // Simple visual feedback could be added here
  };
  const updateGameState = (newState: GameState) => {
    setGameState(newState);
    gameStateRef.current = newState;
    lastStateChangeTimeRef.current = Date.now();
    
    if (newState === 'PAUSED') {
      socketRef.current?.emit('pauseGame');
    } else if (newState === 'PLAYING') {
      socketRef.current?.emit('resumeGame');
    }
  };
  const [wave, setWave] = useState(1);
  const [honor, setHonor] = useState(0);
  const [playerHp, setPlayerHp] = useState(100);
  const [respawnTimer, setRespawnTimer] = useState(0);
  const [killedBy, setKilledBy] = useState<string | null>(null);
  const [baseHp, setBaseHp] = useState(500);
  const [enemiesToSpawn, setEnemiesToSpawn] = useState(10);
  const [enemiesSpawned, setEnemiesSpawned] = useState(0);
  const [enemiesKilled, setEnemiesKilled] = useState(0);
  const [playerHitFlash, setPlayerHitFlash] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [gameOverReason, setGameOverReason] = useState<GameOverReason>('BASE_FELL');
  const [upgrades, setUpgrades] = useState({
    damage: 1,
    speed: 1,
    baseDefense: 1,
    shockwave: 1,
    reach: 1,
    playerRegen: 1,
    baseRegen: 1,
    playerMaxHp: 1,
  });

  const playerPosRef = useRef({ x: -10, z: 0 });
  const playerVelRef = useRef({ x: 0, z: 0 });
  const playerFacingRef = useRef(0);
  const cameraAngleRef = useRef(0); // Angle in radians
  
  const enemiesRef = useRef<Enemy[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<any[]>([]);
  
  const enemiesSpawnedCountRef = useRef(0);
  const enemiesKilledCountRef = useRef(0);
  const baseHpRef = useRef(500);
  const playerHpRef = useRef(100);
  const honorRef = useRef(0);
  const waveRef = useRef(1);
  const upgradesRef = useRef(upgrades);
  const gameStateRef = useRef<GameState>('START');
  const enemiesToSpawnRef = useRef(10);
  const shockwaveCooldownRef = useRef(0);
  const attackCooldownRef = useRef(0);
  const screenShakeRef = useRef(0);
  const playerHitFlashRef = useRef(0);
  const baseHitFlashRef = useRef(0);

  const backgroundElementsRef = useRef<BackgroundElement[]>([]);

  const [renderTick, setRenderTick] = useState(0);

  // Initialize background elements once
  useEffect(() => {
    const elements: BackgroundElement[] = [];
    const types: ('grass' | 'rock' | 'flower' | 'bush')[] = ['grass', 'rock', 'flower', 'bush'];
    const colors = {
      grass: ['#386641', '#6a994e', '#a7c957'],
      rock: ['#4a4e69', '#9a8c98', '#c9ada7'],
      flower: ['#e63946', '#f1faee', '#a8dadc'],
      bush: ['#1b4332', '#2d6a4f', '#40916c']
    };

    for (let i = 0; i < 250; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const x = (Math.random() - 0.5) * WORLD_WIDTH * 2;
      const z = (Math.random() - 0.5) * WORLD_DEPTH * 2;
      
      // Don't spawn on paths or base
      const distToBase = Math.sqrt(x*x + z*z);
      if (distToBase < BASE_SIZE + 3) continue;
      if (Math.abs(x) < 10 || Math.abs(z) < 10) continue;

      // Randomize size based on type
      let size = 0.2 + Math.random() * 0.8;
      if (type === 'rock' && Math.random() > 0.8) size *= 3; // Boulders
      if (type === 'bush') size = 0.8 + Math.random() * 1.2; // Trees

      elements.push({
        id: i,
        x,
        z,
        type,
        size,
        rotation: Math.random() * Math.PI * 2,
        color: colors[type][Math.floor(Math.random() * colors[type].length)]
      });
    }
    backgroundElementsRef.current = elements;
  }, []);

  useEffect(() => { upgradesRef.current = upgrades; }, [upgrades]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { waveRef.current = wave; }, [wave]);

  const keysPressed = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed.current.add(key);
      
      if (key === 'escape') {
        if (gameStateRef.current === 'PLAYING') {
          updateGameState('PAUSED');
        } else if (gameStateRef.current === 'PAUSED') {
          updateGameState('PLAYING');
          requestLock();
        }
        return;
      }

      if (gameStateRef.current === 'PLAYING') {
        if (key === 'j') handleAttack();
        if (key === 'k') handleShockwave();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.key.toLowerCase());
    const handlePointerLockChange = () => {
      if (!document.pointerLockElement) {
        lastExitTimeRef.current = performance.now();
        // Only pause if we were playing and lost lock in HYBRID mode
        if (gameStateRef.current === 'PLAYING' && controlType === 'HYBRID') {
          updateGameState('PAUSED');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [controlType]);

  const [attackTrigger, setAttackTrigger] = useState(0);
  const [shockwaveTrigger, setShockwaveTrigger] = useState(0);

  const handleAttack = () => {
    if (gameStateRef.current !== 'PLAYING' || attackCooldownRef.current > 0 || playerHpRef.current <= 0 || respawnTimer > 0) return;
    initAudio();
    attackCooldownRef.current = 10;
    setAttackTrigger(t => t + 1);
    socketRef.current?.emit('attack');
    
    const ATTACK_RANGE = 10 + (upgradesRef.current.reach - 1) * 2;
    const CONE_ANGLE = (Math.PI * 120) / 180;
    const facing = playerFacingRef.current;

    enemiesRef.current = enemiesRef.current.filter(enemy => {
      const dx = enemy.x - playerPosRef.current.x;
      const dz = enemy.z - playerPosRef.current.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < ATTACK_RANGE) {
        const angleToEnemy = Math.atan2(dz, dx);
        let diff = angleToEnemy - facing;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        if (Math.abs(diff) < CONE_ANGLE / 2) {
          const damage = 15 * upgradesRef.current.damage;
          enemy.hp -= damage;
          enemy.hitFlash = 5;
          screenShakeRef.current = 5;
          
          if (enemy.hp <= 0) {
            enemiesKilledCountRef.current += 1;
            honorRef.current += enemy.enemyType === 'commander' ? 500 : (enemy.enemyType === 'heavy' ? 100 : 50);
            return false;
          }
        }
      }
      return true;
    });
  };

  const handleShockwave = () => {
    if (gameStateRef.current !== 'PLAYING' || shockwaveCooldownRef.current > 0 || upgradesRef.current.shockwave < 1 || playerHpRef.current <= 0 || respawnTimer > 0) return;
    initAudio();
    shockwaveCooldownRef.current = 600;
    screenShakeRef.current = 15;
    setShockwaveTrigger(t => t + 1);
    socketRef.current?.emit('shockwave');
    
    const RANGE = 20 + upgradesRef.current.shockwave * 5;
    enemiesRef.current = enemiesRef.current.filter(enemy => {
      const dx = enemy.x - playerPosRef.current.x;
      const dz = enemy.z - playerPosRef.current.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < RANGE) {
        enemy.hp -= 50 * upgradesRef.current.shockwave;
        enemy.hitFlash = 10;
        if (enemy.hp <= 0) {
          enemiesKilledCountRef.current += 1;
          honorRef.current += 50;
          return false;
        }
      }
      return true;
    });
  };

  const lastExitTimeRef = useRef(0);

  const requestLock = () => {
    if (controlType === 'HYBRID') {
      // Browser restriction: cannot re-lock immediately after exit
      if (performance.now() - lastExitTimeRef.current < 1000) return;

      const canvas = document.querySelector('canvas');
      if (canvas && document.pointerLockElement !== canvas) {
        try {
          canvas.requestPointerLock();
        } catch (e) {
          console.warn("Pointer lock request failed:", e);
        }
      }
    }
  };

  const startNextWave = () => {
    socketRef.current?.emit('startGame');
    requestLock();
  };

  // Handle automatic unlocking when entering menus
  useEffect(() => {
    if (gameState === 'PAUSED' || gameState === 'GAMEOVER' || gameState === 'UPGRADE' || gameState === 'START') {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
  }, [gameState]);

  const buyUpgrade = (type: keyof typeof upgrades) => {
    let cost = 100 * upgrades[type];
    if (type === 'playerRegen' || type === 'baseRegen') cost = 150 * upgrades[type];
    if (type === 'playerMaxHp') cost = 120 * upgrades[type];

    if (honor >= cost) {
      lastUpgradeTimeRef.current = Date.now();
      socketRef.current?.emit('buyUpgrade', { type, cost });
      
      if (type === 'baseDefense') {
        baseHpRef.current += 100;
        setBaseHp(baseHpRef.current);
      }
      if (type === 'playerMaxHp') {
        playerHpRef.current += 20;
        setPlayerHp(playerHpRef.current);
      }
      
      setHonor(prev => prev - cost);
      setUpgrades(prev => ({ ...prev, [type]: prev[type] + 1 }));
      upgradesRef.current = { ...upgradesRef.current, [type]: upgradesRef.current[type] + 1 };
    }
  };

  const restartWave = () => {
    baseHpRef.current = 500 + (upgradesRef.current.baseDefense - 1) * 100;
    playerHpRef.current = 100 + (upgradesRef.current.playerMaxHp - 1) * 20;
    enemiesRef.current = [];
    enemiesSpawnedCountRef.current = 0;
    enemiesKilledCountRef.current = 0;
    setBaseHp(baseHpRef.current);
    setPlayerHp(playerHpRef.current);
    setEnemiesSpawned(0);
    setEnemiesKilled(0);
    updateGameState('PLAYING');
    socketRef.current?.emit('restartWave');
  };

  const quitToMenu = () => {
    baseHpRef.current = 500;
    playerHpRef.current = 100;
    enemiesRef.current = [];
    enemiesSpawnedCountRef.current = 0;
    enemiesKilledCountRef.current = 0;
    enemiesToSpawnRef.current = 10;
    setBaseHp(500);
    setPlayerHp(100);
    setEnemiesSpawned(0);
    setEnemiesKilled(0);
    setEnemiesToSpawn(10);
    setWave(1);
    setHonor(0);
    honorRef.current = 0;
    waveRef.current = 1;
    setUpgrades({ 
      damage: 1, 
      speed: 1, 
      baseDefense: 1, 
      shockwave: 1, 
      reach: 1,
      playerRegen: 1,
      baseRegen: 1,
      playerMaxHp: 1
    });
    updateGameState('START');
    socketRef.current?.emit('quitGame');
  };

  // Game Loop
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    let frameId: number;
    let lastTime = performance.now();
    let frameCount = 0;

    const tick = (time: number) => {
      frameCount++;
      const dt = (time - lastTime) / 16.66;
      lastTime = time;

      // Use the closure's gameState to ensure we don't return early on the first frame
      if (gameState !== 'PLAYING') return;
      if (gameStateRef.current !== 'PLAYING') return;

      // Player Movement
      if (playerHpRef.current > 0) {
        const speed = 0.4 * upgradesRef.current.speed * dt;
        let moved = false;
        let nx = playerPosRef.current.x + playerVelRef.current.x * dt;
        let nz = playerPosRef.current.z + playerVelRef.current.z * dt;

        let dx = 0;
        let dz = 0;

        // Joystick Input (Mobile)
        if (showMobileControls && (joystickPos.current.x !== 0 || joystickPos.current.y !== 0)) {
          dx = joystickPos.current.x;
          dz = joystickPos.current.y;
          moved = true;
        } else {
          // Keyboard Input
          if (keysPressed.current.has('w')) { dz -= 1; moved = true; }
          if (keysPressed.current.has('s')) { dz += 1; moved = true; }
          if (keysPressed.current.has('a')) { dx -= 1; moved = true; }
          if (keysPressed.current.has('d')) { dx += 1; moved = true; }
        }

        if (moved) {
          const A = cameraAngleRef.current;
          const fx = -Math.sin(A);
          const fz = -Math.cos(A);
          const rx = Math.cos(A);
          const rz = -Math.sin(A);

          const moveX = rx * dx + fx * -dz;
          const moveZ = rz * dx + fz * -dz;
          
          nx += moveX * speed;
          nz += moveZ * speed;
          playerFacingRef.current = Math.atan2(moveZ, moveX);
        }

        nx = Math.max(-WORLD_WIDTH/2, Math.min(WORLD_WIDTH/2, nx));
        nz = Math.max(-WORLD_DEPTH/2, Math.min(WORLD_DEPTH/2, nz));
        playerPosRef.current = { x: nx, z: nz };

        playerVelRef.current = {
          x: playerVelRef.current.x * Math.pow(0.9, dt),
          z: playerVelRef.current.z * Math.pow(0.9, dt)
        };
      }

      // Camera Rotation (Keyboard)
      if (gameStateRef.current === 'PLAYING') {
        if (controlType === 'KEYBOARD') {
          if (keysPressed.current.has('u')) cameraAngleRef.current += 0.03 * dt;
          if (keysPressed.current.has('i')) cameraAngleRef.current -= 0.03 * dt;
        }
      }

      // Enemy and Projectile logic is now handled by the server
      enemiesRef.current.forEach(enemy => {
        if (enemy.hitFlash && enemy.hitFlash > 0) enemy.hitFlash -= dt;
      });

      if (shockwaveCooldownRef.current > 0) shockwaveCooldownRef.current -= dt;
      if (attackCooldownRef.current > 0) attackCooldownRef.current -= dt;
      if (screenShakeRef.current > 0) screenShakeRef.current -= dt;
      if (playerHitFlashRef.current > 0) playerHitFlashRef.current -= dt;
      if (baseHitFlashRef.current > 0) baseHitFlashRef.current -= dt;

      // Game Over Checks
      if (baseHpRef.current <= 0) {
        setGameOverReason('BASE_FELL');
        updateGameState('GAMEOVER');
        return;
      }

      if (playerHpRef.current <= 0 && gameMode === 'PVE') {
        setGameOverReason('PLAYER_DIED');
        updateGameState('GAMEOVER');
        return;
      }

      if (enemiesSpawnedCountRef.current >= enemiesToSpawnRef.current && enemiesRef.current.length === 0) {
        updateGameState('UPGRADE');
        return;
      }

      // Regeneration Logic
      if (playerHpRef.current > 0 && upgradesRef.current.playerRegen > 0) {
        const maxPlayerHp = 100 + (upgradesRef.current.playerMaxHp - 1) * 20;
        playerHpRef.current = Math.min(maxPlayerHp, playerHpRef.current + (upgradesRef.current.playerRegen * 0.01) * dt);
      }
      if (baseHpRef.current > 0 && upgradesRef.current.baseRegen > 0) {
        const maxBaseHp = 500 + (upgradesRef.current.baseDefense - 1) * 100;
        baseHpRef.current = Math.min(maxBaseHp, baseHpRef.current + (upgradesRef.current.baseRegen * 0.02) * dt);
      }

      // Throttled UI updates (every 2nd frame)
      if (frameCount % 2 === 0) {
        setPlayerHp(playerHpRef.current);
        setBaseHp(baseHpRef.current);
        setEnemiesSpawned(enemiesSpawnedCountRef.current);
        setEnemiesKilled(enemiesKilledCountRef.current);
        setHonor(honorRef.current);
        setRenderTick(t => t + 1);
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [gameState]);

  const getKilledByDisplayName = (killer: string) => {
    const mapping: Record<string, string> = {
      'scout': 'Trinh sát',
      'infantry': 'Bộ binh',
      'heavy': 'Trọng binh',
      'archer': 'Cung thủ',
      'commander': 'Chỉ huy',
      'contact': 'Va chạm',
      'projectile': 'Đạn lạc'
    };
    return mapping[killer] || killer;
  };

  // Touch Handlers for Joystick and Swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX < window.innerWidth / 2) {
        // Left side: Joystick
        // We don't need to do much here, the Joystick component handles its own state
      } else {
        // Right side: Camera Rotation Start
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX >= window.innerWidth / 2 && touchStartPos.current) {
        const dx = touch.clientX - touchStartPos.current.x;
        cameraAngleRef.current -= dx * 0.005;
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX >= window.innerWidth / 2) {
        touchStartPos.current = null;
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-[#0a0a0a] text-stone-200 font-sans selection:bg-red-900 selection:text-white overflow-hidden touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* HUD Overlay */}
      <div 
        className="fixed inset-0 pointer-events-none z-50 flex flex-col justify-between p-1.5 sm:p-10"
        style={{
          paddingTop: 'calc(var(--sat) + 0.5rem)',
          paddingBottom: 'calc(var(--sab) + 5rem)',
          paddingLeft: 'calc(var(--sal) + 0.5rem)',
          paddingRight: 'calc(var(--sar) + 0.5rem)',
        }}
      >
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3 bg-stone-900/80 backdrop-blur-md p-3 rounded-2xl border border-stone-800 shadow-2xl">
              <div className="w-10 h-10 bg-red-950 rounded-xl flex items-center justify-center border border-red-900/50">
                <Shield className="text-red-500" size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Độ bền Căn cứ</p>
                <div className="flex items-center gap-3">
                  <div className="w-32 md:w-40 h-2 bg-stone-800 rounded-full overflow-hidden border border-stone-700">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-red-600 to-red-400"
                      initial={{ width: '100%' }}
                      animate={{ width: `${(baseHp / (500 + (upgrades.baseDefense - 1) * 100)) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-white">{Math.floor(baseHp)}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 bg-stone-900/80 backdrop-blur-md p-3 rounded-2xl border border-stone-800 shadow-2xl">
              <div className="w-10 h-10 bg-blue-950 rounded-xl flex items-center justify-center border border-blue-900/50">
                <Heart className="text-blue-500" size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Máu Chỉ huy</p>
                <div className="flex items-center gap-3">
                  <div className="w-32 md:w-40 h-2 bg-stone-800 rounded-full overflow-hidden border border-stone-700">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-blue-600 to-blue-400"
                      initial={{ width: '100%' }}
                      animate={{ width: `${(playerHp / (100 + (upgrades.playerMaxHp - 1) * 20)) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-white">{Math.floor(playerHp)}</span>
                </div>
              </div>
            </div>

            {/* Combat Stats Mini-HUD */}
            <div className="flex flex-col gap-2 bg-stone-900/60 backdrop-blur-md p-3 rounded-2xl border border-stone-800/50 shadow-xl w-fit">
              <div className="flex items-center gap-2">
                <Sword size={12} className="text-red-400" />
                <span className="text-[10px] font-black text-white">{25 * upgrades.damage} DMG</span>
              </div>
              <div className="flex items-center gap-2">
                <Map size={12} className="text-stone-400" />
                <span className="text-[10px] font-black text-white">{10 + (upgrades.reach - 1) * 2}m</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap size={12} className="text-yellow-400" />
                <span className="text-[10px] font-black text-white">{15 + (upgrades.shockwave - 1) * 4}m</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="bg-stone-900/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-stone-800 shadow-2xl flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Danh dự</p>
                <p className="text-2xl font-black text-yellow-500 tracking-tighter">{Math.floor(honor)}</p>
              </div>
              <div className="w-10 h-10 bg-yellow-950/50 rounded-full flex items-center justify-center border border-yellow-900/30">
                <Zap className="text-yellow-500" size={20} />
              </div>
            </div>
            <div className="bg-red-900/80 backdrop-blur-md px-4 py-2 rounded-xl border border-red-800 shadow-2xl">
              <p className="text-[10px] font-bold text-red-200 uppercase tracking-widest">
                {gameMode === 'PVP' ? `PVP: ${Math.ceil(pvpTimer)}s` : `Đợt ${wave}`}
              </p>
            </div>

            {/* Shockwave Cooldown */}
            {upgrades.shockwave > 0 && (
              <div className="bg-stone-900/80 backdrop-blur-md p-3 rounded-2xl border border-stone-800 shadow-2xl flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${shockwaveCooldownRef.current > 0 ? 'bg-stone-800 border-stone-700' : 'bg-yellow-950 border-yellow-900'}`}>
                  <TrendingUp size={16} className={shockwaveCooldownRef.current > 0 ? 'text-stone-600' : 'text-yellow-500'} />
                </div>
                <div className="flex flex-col">
                  <div className="w-24 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-yellow-500"
                      animate={{ width: `${Math.max(0, 100 - (shockwaveCooldownRef.current / 600) * 100)}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Controls Overlay */}
        {showMobileControls && gameState === 'PLAYING' && (
          <div className="flex justify-between items-end w-full pointer-events-none px-4 md:px-12">
            <div className="pointer-events-auto ml-6 md:ml-16 mb-24 md:mb-40">
              <VirtualJoystick onMove={(v) => joystickPos.current = v} />
            </div>
            
            <div className="flex flex-row-reverse items-center gap-8 pointer-events-auto mr-6 md:mr-16 mb-24 md:mb-40">
              <button 
                className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center border-4 shadow-2xl active:scale-90 transition-transform ${shockwaveCooldownRef.current > 0 ? 'bg-stone-800 border-stone-700 opacity-50' : 'bg-yellow-600/80 border-yellow-400/50'}`}
                onTouchStart={(e) => { e.stopPropagation(); handleShockwave(); }}
              >
                <Zap size={20} className="text-white" />
              </button>
              <button 
                className="w-20 h-20 md:w-24 md:h-24 bg-red-600/80 backdrop-blur-md rounded-full flex items-center justify-center border-4 border-red-400/50 shadow-2xl active:scale-90 transition-transform"
                onTouchStart={(e) => { e.stopPropagation(); handleAttack(); }}
              >
                <Sword size={32} className="text-white" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3D Game Canvas */}
      <div className="fixed inset-0 z-0 w-full h-full overflow-hidden">
        <Canvas 
          shadows={{ type: THREE.PCFShadowMap }} 
          gl={{ antialias: true, logarithmicDepthBuffer: true }}
          dpr={[1, 2]}
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, touchAction: 'none' }}
        >
          <ResizeHandler />
          <PerspectiveCamera makeDefault position={[0, 40, 40]} fov={45} far={2000} />
          
          <GameScene 
            playerPos={playerPosRef.current}
            playerFacing={playerFacingRef.current}
            playerHitFlash={playerHitFlashRef.current}
            attackTrigger={attackTrigger}
            shockwaveTrigger={shockwaveTrigger}
            enemies={enemiesRef.current}
            projectiles={projectilesRef.current}
            baseHp={baseHp}
            playerHp={playerHp}
            respawnTimer={respawnTimer}
            baseHitFlash={baseHitFlashRef.current}
            screenShakeRef={screenShakeRef}
            controlType={controlType}
            cameraAngleRef={cameraAngleRef}
            requestLock={requestLock}
            upgrades={upgrades}
            backgroundElementsRef={backgroundElementsRef}
            handleAttack={handleAttack}
            handleShockwave={handleShockwave}
            gameStateRef={gameStateRef}
            remotePlayers={remotePlayers}
            socketRef={socketRef}
            allPlayers={allPlayers}
            myId={myIdRef.current}
            gameMode={gameMode}
          />
        </Canvas>
      </div>

      {/* Respawn Overlay */}
      <AnimatePresence>
        {playerHp <= 0 && gameState === 'PLAYING' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-[150]"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center space-y-4"
            >
              <div className="w-20 h-20 bg-red-950 rounded-full flex items-center justify-center border-2 border-red-500 mx-auto mb-6">
                <Sword className="text-red-500" size={40} />
              </div>
              <h2 className="text-4xl font-black text-white italic tracking-tighter">BỊ ĐÁNH BẠI</h2>
              {killedBy && (
                <p className="text-stone-400 text-lg">
                  <span className="text-red-500 font-bold">{getKilledByDisplayName(killedBy)}</span> đã hạ gục bạn.
                </p>
              )}
              <div className="pt-8">
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">Hồi sinh sau</p>
                <p className="text-6xl font-black text-white tabular-nums">{Math.ceil(respawnTimer)}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Menus */}
      <AnimatePresence>
        {gameState === 'START' && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
            style={{
              paddingTop: 'var(--sat)',
              paddingBottom: 'var(--sab)',
              paddingLeft: 'var(--sal)',
              paddingRight: 'var(--sar)',
            }}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-4 md:space-y-8 w-full max-w-2xl p-4 md:p-12 bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl max-h-full overflow-y-auto"
            >
              <h1 className="text-4xl md:text-6xl font-black text-white italic tracking-tighter">THIÊN TRƯỜNG</h1>
              <p className="text-stone-400 text-sm md:text-base">Bảo vệ cửa ngõ Đại Việt. Năm 1285.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div className="space-y-4 md:space-y-6 text-left">
                  <p className="text-[10px] md:text-xs font-bold text-stone-500 uppercase tracking-widest">Phòng chờ</p>
                  <div className="space-y-2 max-h-48 md:max-h-64 overflow-y-auto pr-2">
                    {Object.values(allPlayers).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between bg-stone-950 p-3 rounded-xl border border-stone-800">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${p.ready ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-white">{p.name} {p.id === myIdRef.current && "(Bạn)"}</span>
                            {gameMode === 'PVP' && (
                              <span className={`text-[8px] font-black uppercase ${p.team === 'attacker' ? 'text-red-500' : 'text-blue-500'}`}>
                                {p.team === 'attacker' ? 'TẤN CÔNG' : 'PHÒNG THỦ'}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`text-[10px] font-black uppercase ${p.ready ? 'text-green-500' : 'text-stone-600'}`}>
                          {p.ready ? 'Sẵn sàng' : 'Đang chờ'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {gameMode === 'PVP' && (
                    <div className="flex gap-2 p-1 bg-stone-950 rounded-xl border border-stone-800">
                      <button 
                        onClick={() => socketRef.current?.emit('switchTeam', 'defender')}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${allPlayers[myIdRef.current!]?.team === 'defender' ? 'bg-blue-900 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                      >
                        PHÒNG THỦ
                      </button>
                      <button 
                        onClick={() => socketRef.current?.emit('switchTeam', 'attacker')}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${allPlayers[myIdRef.current!]?.team === 'attacker' ? 'bg-red-900 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                      >
                        TẤN CÔNG
                      </button>
                    </div>
                  )}
                  <button 
                    onClick={copyInviteLink}
                    className="w-full py-2 rounded-xl text-[10px] font-bold bg-stone-800 text-stone-400 hover:bg-stone-700 transition-all border border-stone-700"
                  >
                    SAO CHÉP LIÊN KẾT MỜI
                  </button>
                </div>

                <div className="space-y-4 md:space-y-6 text-left">
                  <p className="text-[10px] md:text-xs font-bold text-stone-500 uppercase tracking-widest">Cài đặt</p>
                  <div className="flex flex-col gap-4 md:gap-6">
                    {myIdRef.current === Object.keys(allPlayers)[0] && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-bold text-stone-600 uppercase">Chế độ chơi</p>
                        <div className="flex gap-2 p-1 bg-stone-950 rounded-xl border border-stone-800">
                          <button 
                            onClick={() => socketRef.current?.emit('switchMode', 'PVE')}
                            className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${gameMode === 'PVE' ? 'bg-stone-700 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                          >
                            PVE
                          </button>
                          <button 
                            onClick={() => socketRef.current?.emit('switchMode', 'PVP')}
                            className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${gameMode === 'PVP' ? 'bg-stone-700 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                          >
                            PVP
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <p className="text-[9px] font-bold text-stone-600 uppercase">Kiểu điều khiển</p>
                      <div className="flex gap-2 p-1 bg-stone-950 rounded-xl border border-stone-800">
                        <button 
                          onClick={() => setControlType('KEYBOARD')}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${controlType === 'KEYBOARD' ? 'bg-red-900 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                        >
                          BÀN PHÍM
                        </button>
                        <button 
                          onClick={() => setControlType('HYBRID')}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${controlType === 'HYBRID' ? 'bg-red-900 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                        >
                          CHUỘT
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 pt-2 opacity-50">
                    <p className="text-[9px] text-white uppercase tracking-widest font-black">
                      WASD để Di chuyển • {controlType === 'HYBRID' ? 'Chuột trái để Tấn công' : 'J để Tấn công'}
                    </p>
                    <p className="text-[9px] text-white uppercase tracking-widest font-black">
                      {controlType === 'KEYBOARD' ? 'U/I để Xoay Camera' : 'Chuột để Xoay'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 md:pt-8">
                <button 
                  onClick={() => { 
                    initAudio(); 
                    toggleReady();
                  }}
                  className={`w-full py-4 md:py-6 rounded-2xl font-black text-xl md:text-3xl transition-all shadow-xl flex items-center justify-center gap-3 ${
                    allPlayers[myIdRef.current!]?.ready 
                    ? 'bg-green-700 text-white shadow-green-900/40' 
                    : 'bg-red-700 hover:bg-red-600 text-white shadow-red-900/40'
                  }`}
                >
                  {allPlayers[myIdRef.current!]?.ready ? <RotateCcw size={24} /> : <Play size={24} fill="white" />}
                  {allPlayers[myIdRef.current!]?.ready ? 'HỦY SẴN SÀNG' : 'SẴN SÀNG'}
                </button>
                
                {countdown !== null && (
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="mt-6"
                  >
                    <p className="text-stone-500 text-[10px] font-bold uppercase tracking-[0.3em] mb-1">Bắt đầu sau</p>
                    <p className="text-5xl font-black text-white tabular-nums">{Math.ceil(countdown)}</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {gameState === 'PAUSED' && (
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4"
            style={{
              paddingTop: 'var(--sat)',
              paddingBottom: 'var(--sab)',
              paddingLeft: 'var(--sal)',
              paddingRight: 'var(--sar)',
            }}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-stone-900 border-2 border-stone-800 p-6 md:p-10 rounded-3xl shadow-2xl text-center space-y-6 md:space-y-8 w-full max-w-md max-h-full overflow-y-auto"
            >
              <h4 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter">ĐÃ TẠM DỪNG</h4>
              
              <div className="space-y-4 text-left">
                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">Kiểu điều khiển</p>
                <div className="flex gap-3 p-1.5 bg-stone-950 rounded-xl border border-stone-800">
                  <button 
                    onClick={() => setControlType('KEYBOARD')}
                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${controlType === 'KEYBOARD' ? 'bg-red-900 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                  >
                    BÀN PHÍM
                  </button>
                  <button 
                    onClick={() => setControlType('HYBRID')}
                    className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${controlType === 'HYBRID' ? 'bg-red-900 text-white' : 'text-stone-500 hover:text-stone-300'}`}
                  >
                    CHUỘT
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <button 
                  onClick={() => {
                    updateGameState('PLAYING');
                    requestLock();
                  }} 
                  className="w-full bg-red-700 hover:bg-red-600 text-white py-6 rounded-2xl font-black text-xl flex items-center justify-center gap-4 transition-all shadow-xl shadow-red-900/20"
                >
                  <Play size={24} fill="white" /> TIẾP TỤC
                </button>
                <button 
                  onClick={() => {
                    restartWave();
                    requestLock();
                  }} 
                  className="w-full bg-stone-800 hover:bg-stone-700 text-white py-6 rounded-2xl font-black text-xl flex items-center justify-center gap-4 transition-all border border-stone-700 shadow-xl"
                >
                  <RotateCcw size={24} /> CHƠI LẠI ĐỢT
                </button>
                <button onClick={quitToMenu} className="w-full bg-transparent hover:bg-red-900/20 text-stone-400 hover:text-red-400 py-4 rounded-xl font-bold transition-all text-lg">
                  THOÁT RA MENU
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {gameState === 'UPGRADE' && (
          <div 
            className="fixed inset-0 bg-stone-900/95 backdrop-blur-md flex items-center justify-center z-[100] p-4"
            style={{
              paddingTop: 'var(--sat)',
              paddingBottom: 'var(--sab)',
              paddingLeft: 'var(--sal)',
              paddingRight: 'var(--sar)',
            }}
          >
            <div className="text-center space-y-4 md:space-y-8 w-full max-w-5xl max-h-full overflow-y-auto p-4">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 mb-4 md:mb-8">
                <div className="flex flex-wrap justify-center gap-3 md:gap-6">
                  <div className="bg-stone-800 p-4 md:p-6 rounded-2xl border border-stone-700 text-left min-w-[140px] md:min-w-[180px]">
                    <p className="text-[10px] md:text-xs font-bold text-stone-500 uppercase tracking-widest">Căn cứ</p>
                    <p className="text-lg md:text-2xl font-black text-white">{Math.floor(baseHp)}</p>
                  </div>
                  <div className="bg-stone-800 p-4 md:p-6 rounded-2xl border border-stone-700 text-left min-w-[140px] md:min-w-[180px]">
                    <p className="text-[10px] md:text-xs font-bold text-stone-500 uppercase tracking-widest">Chỉ huy</p>
                    <p className="text-lg md:text-2xl font-black text-white">{Math.floor(playerHp)}</p>
                  </div>
                </div>
                <div className="bg-stone-800 px-6 md:px-10 py-4 md:py-6 rounded-2xl border border-stone-700 flex items-center gap-4 md:gap-6">
                  <div className="text-right">
                    <p className="text-[10px] md:text-xs font-bold text-stone-500 uppercase tracking-widest">Danh dự</p>
                    <p className="text-2xl md:text-4xl font-black text-yellow-500">{honor}</p>
                  </div>
                  <Zap className="text-yellow-500" size={24} />
                </div>
              </div>

              <h4 className="text-3xl md:text-4xl font-black text-white italic tracking-tighter">ĐÃ VƯỢT QUA ĐỢT {wave}</h4>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                <UpgradeButton icon={<Sword size={20} />} label="Sức mạnh" level={upgrades.damage} cost={100 * upgrades.damage} info="+20% Sát thương Tấn công" canAfford={honor >= 100 * upgrades.damage} onClick={() => buyUpgrade('damage')} />
                <UpgradeButton icon={<Zap size={20} />} label="Tốc độ" level={upgrades.speed} cost={100 * upgrades.speed} info="+10% Tốc độ Di chuyển" canAfford={honor >= 100 * upgrades.speed} onClick={() => buyUpgrade('speed')} />
                <UpgradeButton icon={<Shield size={20} />} label="Củng cố" level={upgrades.baseDefense} cost={100 * upgrades.baseDefense} info="+100 Máu Căn cứ" canAfford={honor >= 100 * upgrades.baseDefense} onClick={() => buyUpgrade('baseDefense')} />
                <UpgradeButton icon={<TrendingUp size={20} />} label="Sóng xung kích" level={upgrades.shockwave} cost={100 * upgrades.shockwave} info="+25% Bán kính Sóng xung kích" canAfford={honor >= 100 * upgrades.shockwave} onClick={() => buyUpgrade('shockwave')} />
                <UpgradeButton icon={<Map size={20} />} label="Tầm đánh" level={upgrades.reach} cost={100 * upgrades.reach} info="+20% Tầm đánh" canAfford={honor >= 100 * upgrades.reach} onClick={() => buyUpgrade('reach')} />
                <UpgradeButton icon={<Heart size={20} />} label="Sinh lực" level={upgrades.playerRegen} cost={150 * upgrades.playerRegen} info="+0.5 Hồi máu/giây" canAfford={honor >= 150 * upgrades.playerRegen} onClick={() => buyUpgrade('playerRegen')} />
                <UpgradeButton icon={<Home size={20} />} label="Phục hồi" level={upgrades.baseRegen} cost={150 * upgrades.baseRegen} info="+1.0 Sửa chữa/giây" canAfford={honor >= 150 * upgrades.baseRegen} onClick={() => buyUpgrade('baseRegen')} />
                <UpgradeButton icon={<Users size={20} />} label="Bền bỉ" level={upgrades.playerMaxHp} cost={120 * upgrades.playerMaxHp} info="+20 Máu tối đa Chỉ huy" canAfford={honor >= 120 * upgrades.playerMaxHp} onClick={() => buyUpgrade('playerMaxHp')} />
              </div>
              <div className="flex flex-col items-center gap-6">
                <div className="flex items-center gap-4 bg-stone-800 p-4 rounded-2xl border border-stone-700">
                  <div className="flex -space-x-2">
                    {Object.values(allPlayers).map((p: any) => (
                      <div 
                        key={p.id} 
                        className={`w-8 h-8 rounded-full border-2 border-stone-900 flex items-center justify-center text-[10px] font-bold ${p.ready ? 'bg-green-500 text-white' : 'bg-stone-700 text-stone-500'}`}
                        title={`${p.name}: ${p.ready ? 'Sẵn sàng' : 'Đang chờ'}`}
                      >
                        {p.name.slice(0, 1)}
                      </div>
                    ))}
                  </div>
                  <span className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">
                    {Object.values(allPlayers).filter((p: any) => p.ready).length} / {Object.values(allPlayers).length} Người chơi đã sẵn sàng
                  </span>
                </div>

                <button 
                  onClick={toggleReady} 
                  className={`px-12 py-4 rounded-full font-bold text-xl shadow-xl transition-all active:scale-95 flex items-center gap-3 mx-auto ${
                    allPlayers[myIdRef.current!]?.ready 
                    ? 'bg-green-700 text-white shadow-green-900/40' 
                    : 'bg-red-700 hover:bg-red-600 text-white shadow-red-900/40'
                  }`}
                >
                  {allPlayers[myIdRef.current!]?.ready ? <RotateCcw size={20} /> : <ChevronRight />}
                  {allPlayers[myIdRef.current!]?.ready ? 'HỦY SẴN SÀNG' : `SẴN SÀNG CHO ĐỢT ${wave + 1}`}
                </button>

                {countdown !== null && (
                  <div className="text-3xl font-black text-white animate-pulse">
                    Đợt tiếp theo sau {Math.ceil(countdown)}...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {gameState === 'GAMEOVER' && (
          <div 
            className="fixed inset-0 bg-red-950/90 backdrop-blur-md flex items-center justify-center z-[100] p-4"
            style={{
              paddingTop: 'var(--sat)',
              paddingBottom: 'var(--sab)',
              paddingLeft: 'var(--sal)',
              paddingRight: 'var(--sar)',
            }}
          >
            <div className="text-center space-y-4 md:space-y-6 w-full max-w-2xl max-h-full overflow-y-auto p-4">
              <h4 className="text-4xl md:text-6xl font-black text-white">
                {gameOverReason === 'BASE_FELL' ? 'CĂN CỨ ĐÃ THẤT THỦ' : 
                 gameOverReason === 'PLAYER_DIED' ? 'CHỈ HUY ĐÃ HY SINH' :
                 gameOverReason === 'PVP_ATTACKERS_WIN' ? 'PHE TẤN CÔNG CHIẾN THẮNG' :
                 'PHE PHÒNG THỦ CHIẾN THẮNG'}
              </h4>
              <p className="text-stone-300">
                {gameOverReason === 'BASE_FELL' ? 'Cửa ngõ Đại Việt đã bị chọc thủng.' : 
                 gameOverReason === 'PLAYER_DIED' ? 'Vị chỉ huy dũng cảm đã hy sinh trên chiến trường.' :
                 gameOverReason === 'PVP_ATTACKERS_WIN' ? 'Căn cứ đã bị quân xâm lược phá hủy.' :
                 'Phe phòng thủ đã giữ vững trận địa thành công.'}
              </p>
              {gameMode === 'PVE' && <p className="text-stone-400 text-sm">Bạn đã trụ vững được {wave} đợt.</p>}
              <div className="flex flex-col gap-4 max-w-xs mx-auto">
                <div className="flex items-center justify-center gap-2 mb-2">
                  {Object.values(allPlayers).map((p: any) => (
                    <div 
                      key={p.id} 
                      className={`w-3 h-3 rounded-full ${p.ready ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-stone-700'}`}
                    />
                  ))}
                </div>
                <button 
                  onClick={toggleReady} 
                  className={`px-10 py-5 rounded-full font-black text-xl transition-all shadow-xl ${
                    allPlayers[myIdRef.current!]?.ready 
                    ? 'bg-green-700 text-white shadow-green-900/40' 
                    : 'bg-white text-red-900 hover:bg-stone-200 shadow-white/10'
                  }`}
                >
                  {allPlayers[myIdRef.current!]?.ready ? 'HỦY SẴN SÀNG' : 'SẴN SÀNG CHƠI LẠI'}
                </button>
                
                {countdown !== null && (
                  <p className="text-white font-black text-3xl animate-bounce">Khởi động lại sau {Math.ceil(countdown)}...</p>
                )}
                
                <button onClick={quitToMenu} className="bg-transparent text-stone-400 hover:text-white px-8 py-3 rounded-full font-bold text-lg transition-all">
                  THOÁT RA MENU
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VirtualJoystick({ onMove }: { onMove: (v: { x: number, y: number }) => void }) {
  const [touch, setTouch] = useState<{ x: number, y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouch = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const t = e.touches[0];
    let dx = t.clientX - centerX;
    let dy = t.clientY - centerY;
    
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = rect.width / 2;
    
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    
    setTouch({ x: dx, y: dy });
    onMove({ x: dx / maxDist, y: dy / maxDist });
  };

  const handleEnd = () => {
    setTouch(null);
    onMove({ x: 0, y: 0 });
  };

  return (
    <div 
      ref={containerRef}
      className="w-24 h-24 md:w-32 md:h-32 bg-white/10 backdrop-blur-sm rounded-full border-2 border-white/20 relative flex items-center justify-center"
      onTouchMove={handleTouch}
      onTouchStart={handleTouch}
      onTouchEnd={handleEnd}
    >
      <div 
        className="w-8 h-8 md:w-12 md:h-12 bg-white/40 rounded-full shadow-xl absolute transition-transform duration-75"
        style={{ 
          transform: touch ? `translate(${touch.x}px, ${touch.y}px)` : 'translate(0, 0)' 
        }}
      />
    </div>
  );
}

function UpgradeButton({ icon, label, level, cost, info, canAfford, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      disabled={!canAfford}
      className={`p-3 md:p-8 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 md:gap-4 ${
        canAfford ? 'bg-stone-800 border-stone-700 hover:border-red-600 hover:bg-stone-700' : 'bg-stone-900 border-stone-800 opacity-50 cursor-not-allowed'
      }`}
    >
      <div className="p-3 md:p-4 bg-stone-950 rounded-xl md:rounded-2xl text-red-500">{icon}</div>
      <div className="text-center">
        <p className="text-xs md:text-sm font-bold text-stone-500 uppercase">{label}</p>
        <p className="text-lg md:text-2xl font-black text-white">CẤP {level}</p>
        <p className="text-[10px] md:text-xs text-stone-400 mt-1 hidden sm:block">{info}</p>
      </div>
      <div className={`px-4 md:px-6 py-1 md:py-2 rounded-full text-xs md:text-sm font-bold ${canAfford ? 'bg-yellow-900/30 text-yellow-500' : 'bg-stone-800 text-stone-500'}`}>
        {cost} DANH DỰ
      </div>
    </button>
  );
}
