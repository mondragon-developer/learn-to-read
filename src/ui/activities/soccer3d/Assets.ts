import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Profile } from '@domain/profiles/Profile';
import { keeperRaise } from '@domain/rewards/Soccer3D';

/** Original, locally authored stadium and articulated character meshes; no downloaded art. */
export class MeshBuilder {
  private parts: T.BufferGeometry[] = [];
  add(geometry: T.BufferGeometry, color: T.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(1, 1, 1)));
    const c = new T.Color(color), colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(colors, 3)); this.parts.push(g); geometry.dispose(); return this;
  }
  box(w: number, h: number, d: number, color: T.ColorRepresentation, x: number, y: number, z: number, rz = 0, radius = .025): this {
    return this.add(new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3)), color, x, y, z, 0, 0, rz);
  }
  ellipsoid(w: number, h: number, d: number, color: T.ColorRepresentation, x: number, y: number, z: number): this {
    return this.add(new T.SphereGeometry(1, w > .2 ? 16 : 8, w > .2 ? 10 : 6).scale(w, h, d), color, x, y, z);
  }
  mesh(shadows = true): T.Mesh {
    const combined = mergeGeometries(this.parts)!;
    this.parts.forEach((g) => g.dispose()); this.parts = [];
    const mesh = new T.Mesh(combined, new T.MeshStandardMaterial({ vertexColors: true, roughness: .82 }));
    mesh.castShadow = shadows; mesh.receiveShadow = true; return mesh;
  }
}
export interface Rig {
  root: T.Group; body: T.Group; arms: T.Group[]; forearms: T.Group[]; legs: T.Group[]; knees: T.Group[];
  pose(time: number, motion?: 'idle' | 'run' | 'kick' | 'keeper' | 'celebrate', amount?: number): void;
}
/** Everything that varies between players; the body itself is shared. */
export interface Look { name: string; number: number; shirt: string; shorts: string; cleats: string; skin: string; keeper?: boolean }
export const playerLook = (profile: Pick<Profile, 'firstName' | 'number' | 'color' | 'settings'>): Look => ({
  name: profile.firstName, number: profile.number, shirt: profile.color, skin: '#bd8057',
  shorts: profile.settings.shortsColor ?? '#142e46', cleats: profile.settings.cleatsColor ?? '#f8fafc',
});
/** The child's goalkeeper kit keeps his name and number but never matches his outfield shirt. */
export const keeperLook = (profile: Pick<Profile, 'firstName' | 'number' | 'color' | 'settings'>): Look => ({
  ...playerLook(profile), keeper: true, shirt: profile.color === '#E8A317' ? '#35c47f' : '#f6bc45', shorts: '#153349', cleats: '#ff6842',
});

// Torso silhouette (radius by height); the back print follows the same curve so it sits on the shirt.
const TORSO: [number, number][] = [[.25, .84], [.245, .95], [.255, 1.1], [.275, 1.27], [.292, 1.39], [.272, 1.47], [.2, 1.525], [.09, 1.555], [.001, 1.56]];
const TORSO_DEPTH = .72;
function torsoRadius(y: number): number {
  for (let i = 1; i < TORSO.length; i++) {
    const [r0, y0] = TORSO[i - 1]!, [r1, y1] = TORSO[i]!;
    if (y <= y1) return mix(r0, r1, clamp((y - y0) / (y1 - y0), 0, 1));
  }
  return 0;
}
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** Capsule from the joint (y=0) down to `length`, so neighbouring segments share a round joint and bend without gaps. */
const limb = (radius: number, length: number): T.BufferGeometry => new T.CapsuleGeometry(radius, length, 4, 12).translate(0, -length / 2, 0);

function backPrint(look: Look): T.Mesh {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const write = (text: string, y: number, size: number, maxWidth: number, outline: number): void => {
    ctx.font = `900 ${size}px system-ui, -apple-system, "Arial Black", sans-serif`;
    const fit = Math.min(1, maxWidth / Math.max(1, ctx.measureText(text).width));
    ctx.font = `900 ${Math.floor(size * fit)}px system-ui, -apple-system, "Arial Black", sans-serif`;
    // A dark outline keeps white lettering readable on every shirt colour, yellow included.
    ctx.lineWidth = outline; ctx.strokeStyle = 'rgba(8, 22, 36, .9)'; ctx.strokeText(text, 256, y);
    ctx.fillStyle = '#ffffff'; ctx.fillText(text, 256, y);
  };
  write(look.name.toUpperCase(), 110, 108, 440, 16);
  write(String(look.number), 430, 310, 400, 22);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  const geometry = new T.PlaneGeometry(.44, .46, 18, 12).rotateY(Math.PI).translate(0, 1.205, 0);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), r = torsoRadius(position.getY(i));
    position.setZ(i, -(TORSO_DEPTH * Math.sqrt(Math.max(0, r * r - x * x)) + .01));
  }
  geometry.computeVertexNormals();
  return new T.Mesh(geometry, new T.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: .6, transparent: true, depthWrite: false, roughness: .8, polygonOffset: true, polygonOffsetFactor: -2 }));
}

export function character(look: Look): Rig {
  const root = new T.Group(), body = new T.Group(); root.add(body);
  const { shirt, shorts, skin, keeper } = look, trim = keeper ? '#173a52' : '#f7f4ea', hair = '#1f2731', shoes = look.cleats;
  const torso = new T.LatheGeometry(TORSO.map(([r, y]) => new T.Vector2(r, y)), 22).scale(1, 1, TORSO_DEPTH);
  const pelvis = new T.LatheGeometry([[.001, .7], [.2, .705], [.235, .76], [.238, .84], [.215, .9]].map(([r, y]) => new T.Vector2(r!, y!)), 20).scale(1, 1, TORSO_DEPTH);
  const b = new MeshBuilder()
    .add(torso, shirt).add(pelvis, shorts)
    .add(new T.TorusGeometry(.083, .022, 6, 20).rotateX(Math.PI / 2).scale(1, 1, .85), trim, 0, 1.548, 0)
    .add(new T.CylinderGeometry(.068, .075, .18, 12), skin, 0, 1.6, 0)
    .ellipsoid(.045, .045, .012, '#ffd36b', -.13, 1.33, .205)
    // Head: face, ears, eyes with a highlight, brows, small nose and a smile.
    .ellipsoid(.25, .27, .235, skin, 0, 1.84, .01)
    .ellipsoid(.05, .075, .04, skin, -.245, 1.82, 0).ellipsoid(.05, .075, .04, skin, .245, 1.82, 0)
    .ellipsoid(.05, .058, .02, '#fffef6', -.088, 1.85, .222).ellipsoid(.05, .058, .02, '#fffef6', .088, 1.85, .222)
    .ellipsoid(.027, .034, .012, '#1a2433', -.085, 1.846, .24).ellipsoid(.027, .034, .012, '#1a2433', .085, 1.846, .24)
    .ellipsoid(.009, .009, .005, '#ffffff', -.076, 1.858, .251).ellipsoid(.009, .009, .005, '#ffffff', .094, 1.858, .251)
    .box(.085, .02, .022, hair, -.09, 1.925, .214, -.08).box(.085, .02, .022, hair, .09, 1.925, .214, .08)
    .ellipsoid(.034, .03, .03, '#b0704b', 0, 1.79, .244)
    .add(new T.TorusGeometry(.048, .011, 6, 14, Math.PI).rotateZ(Math.PI), '#7a3b2c', 0, 1.752, .222)
    // Short hair: a cap with a soft fringe instead of a separate bun.
    .add(new T.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * .56).scale(.264, .25, .254), hair, 0, 1.87, -.008);
  for (const x of [-.13, -.045, .045, .13]) b.ellipsoid(.07, .045, .05, hair, x, 2.02, .175 - Math.abs(x) * .3);
  body.add(b.mesh(), backPrint(look));
  const arms: T.Group[] = [], forearms: T.Group[] = [], legs: T.Group[] = [], knees: T.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new T.Group(); arm.position.set(side * .32, 1.44, 0); body.add(arm); arms.push(arm);
    arm.add(new MeshBuilder().ellipsoid(.105, .1, .1, shirt, 0, -.01, 0)
      .add(new T.CylinderGeometry(.1, .09, .17, 14), shirt, 0, -.08, 0)
      .add(new T.TorusGeometry(.09, .014, 6, 16).rotateX(Math.PI / 2), trim, 0, -.162, 0)
      .add(limb(.066, .3), skin).mesh());
    const elbow = new T.Group(); elbow.position.y = -.3; arm.add(elbow); forearms.push(elbow);
    const lower = new MeshBuilder().add(limb(.06, .2), skin);
    if (keeper) {
      lower.add(new T.CylinderGeometry(.075, .07, .07, 14), '#ff714a', 0, -.19, 0)
        .box(.18, .2, .11, '#f6f7ef', 0, -.28, .01, 0, .045)
        .box(.05, .1, .07, '#f6f7ef', -side * .085, -.24, .05, -side * .5, .022);
    } else {
      lower.ellipsoid(.062, .078, .052, skin, 0, -.272, 0).ellipsoid(.024, .04, .024, skin, -side * .04, -.25, .035);
    }
    elbow.add(lower.mesh());
    const hip = new T.Group(); hip.position.set(side * .12, .8, 0); body.add(hip); legs.push(hip);
    hip.add(new MeshBuilder().add(new T.CylinderGeometry(.13, .128, .22, 14), shorts, 0, -.05, 0)
      .add(limb(.083, .36), skin).mesh());
    const knee = new T.Group(); knee.position.y = -.36; hip.add(knee); knees.push(knee);
    knee.add(new MeshBuilder().add(limb(.074, .3), skin)
      .add(new T.CylinderGeometry(.085, .077, .26, 14), '#f7f4ea', 0, -.2, 0)
      .add(new T.CylinderGeometry(.087, .087, .045, 14), shirt, 0, -.09, 0)
      .box(.155, .11, .3, shoes, 0, -.35, .06, 0, .05)
      .box(.16, .028, .31, '#152332', 0, -.405, .06, 0, .012)
      .box(.1, .012, .12, '#f4eddf', 0, -.292, .1, 0, .005).mesh());
  }
  const rig: Rig = { root, body, arms, forearms, legs, knees, pose(time, motion = 'idle', amount = 1) {
    const wave = Math.sin(time * 9), breath = Math.sin(time * 2.4);
    body.position.y = motion === 'run' ? Math.abs(wave) * .055 : motion === 'celebrate' ? Math.abs(Math.sin(time * 7)) * .24 : breath * .012;
    body.rotation.set(0, 0, 0);
    arms.forEach((arm, i) => { arm.rotation.set(0, 0, (i ? 1 : -1) * .14); forearms[i]!.rotation.x = -.22; });
    legs.forEach((leg, i) => { leg.rotation.set(0, 0, 0); knees[i]!.rotation.x = 0; });
    if (motion === 'run') {
      legs.forEach((leg, i) => { leg.rotation.x = wave * (i ? 1 : -1) * .7 * amount; knees[i]!.rotation.x = Math.max(0, -wave * (i ? 1 : -1)) * .9; arms[i]!.rotation.x = -leg.rotation.x * .65; forearms[i]!.rotation.x = -.9; });
      body.rotation.x = .1;
    } else if (motion === 'kick') {
      legs[0]!.rotation.x = amount; knees[0]!.rotation.x = Math.max(0, amount) * .8;
      arms[0]!.rotation.z = -.75; arms[1]!.rotation.z = .6; body.rotation.x = -.1;
    } else if (motion === 'keeper') {
      // Ready stance at 0: knees bent, gloves out in front. At 1: both arms straight up past the head.
      const ready = 1 - amount;
      arms.forEach((arm, i) => { arm.rotation.z = (i ? 1 : -1) * keeperRaise(amount); forearms[i]!.rotation.x = -1.1 * ready; });
      legs.forEach((leg, i) => { leg.rotation.set(-.25 * ready, 0, (i ? 1 : -1) * mix(.05, .2, ready)); knees[i]!.rotation.x = .5 * ready; });
      body.position.y -= .05 * ready; body.rotation.x = .08 * ready;
    } else if (motion === 'celebrate') {
      arms[0]!.rotation.z = -2.7; arms[1]!.rotation.z = 2.7; body.rotation.y = Math.sin(time * 2) * .18;
    }
  } };
  rig.pose(0); return rig;
}

export function football(): T.Group {
  const group = new T.Group();
  group.add(new T.Mesh(new T.SphereGeometry(.18, 24, 16), new T.MeshStandardMaterial({ color: '#fff9e9', roughness: .55 })));
  const ico = new T.IcosahedronGeometry(1, 0), pos = ico.getAttribute('position');
  const centers: T.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) { const v = new T.Vector3().fromBufferAttribute(pos, i).normalize(); if (!centers.some((p) => p.distanceTo(v) < .01)) centers.push(v); }
  const vertices: number[] = [];
  for (const normal of centers) {
    const u = new T.Vector3(0, 1, 0).cross(normal).normalize(); if (u.lengthSq() < .1) u.set(1, 0, 0);
    const v = normal.clone().cross(u).normalize();
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * .4, b = (i + 1) * Math.PI * .4;
      const p = normal.clone().addScaledVector(u, Math.cos(a) * .36).addScaledVector(v, Math.sin(a) * .36).normalize().multiplyScalar(.181);
      const q = normal.clone().addScaledVector(u, Math.cos(b) * .36).addScaledVector(v, Math.sin(b) * .36).normalize().multiplyScalar(.181);
      vertices.push(...normal.clone().multiplyScalar(.182).toArray(), ...p.toArray(), ...q.toArray());
    }
  }
  ico.dispose(); const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); g.computeVertexNormals();
  group.add(new T.Mesh(g, new T.MeshStandardMaterial({ color: '#142c40', side: T.DoubleSide, roughness: .7 })));
  group.children.forEach((m) => { m.castShadow = true; }); return group;
}

export function labelTexture(text: string, background = '#143b52', foreground = '#ffdc85'): T.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const ctx = c.getContext('2d')!;
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = foreground; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 64px sans-serif'; ctx.fillText(text, 512, 68);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

export function turf(): T.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#39865a'; ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#438f60' : '#388258'; ctx.fillRect(0, i * 64, 1024, 64); }
  let seed = 7309; const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 46000; i++) { ctx.fillStyle = random() > .5 ? '#c3d98b16' : '#103d2a16'; ctx.fillRect(random() * 1024, random() * 1024, 1, random() * 4 + 1); }
  // World field covers x -24..24, z -14..34; keep regulation-like markings centred on the goal.
  const x = (v: number): number => (v + 24) / 48 * 1024, z = (v: number): number => (v + 14) / 48 * 1024;
  ctx.strokeStyle = '#e4ead0'; ctx.lineWidth = 2.6;
  ctx.strokeRect(x(-16), z(0), x(16) - x(-16), z(32) - z(0));
  ctx.strokeRect(x(-10), z(0), x(10) - x(-10), z(10) - z(0));
  ctx.strokeRect(x(-5.5), z(0), x(5.5) - x(-5.5), z(4) - z(0));
  ctx.beginPath(); ctx.arc(x(0), z(10), 3 * 1024 / 48, 0, Math.PI); ctx.stroke();
  ctx.fillStyle = '#f0eddb'; ctx.beginPath(); ctx.arc(x(0), z(8), 2.5, 0, Math.PI * 2); ctx.fill();
  const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
