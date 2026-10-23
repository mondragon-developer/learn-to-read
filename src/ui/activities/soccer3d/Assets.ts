import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Profile } from '@domain/profiles/Profile';

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
export function character(profile: Pick<Profile, 'firstName' | 'number' | 'color' | 'settings'>, keeper = false, skin = '#bd8057'): Rig {
  const root = new T.Group(), body = new T.Group(); root.add(body);
  const shirt = keeper ? '#f6bc45' : profile.color, shorts = keeper ? '#153349' : profile.settings.shortsColor ?? '#142e46';
  const shoes = keeper ? '#ff6842' : profile.settings.cleatsColor ?? '#f8fafc';
  const b = new MeshBuilder();
  b.ellipsoid(.31, .38, .2, shirt, 0, 1.2, 0).box(.54, .2, .32, shirt, 0, .99, 0)
    .box(.52, .23, .34, shorts, 0, .82, 0)
    .ellipsoid(.09, .15, .09, skin, 0, 1.57, 0)
    .ellipsoid(.255, .29, .235, skin, 0, 1.82, .015)
    .ellipsoid(.055, .085, .045, skin, -.25, 1.82, 0).ellipsoid(.055, .085, .045, skin, .25, 1.82, 0)
    .ellipsoid(.045, .05, .048, '#cd9168', 0, 1.79, .244)
    .ellipsoid(.045, .055, .017, '#fffef4', -.087, 1.845, .227).ellipsoid(.045, .055, .017, '#fffef4', .087, 1.845, .227)
    .ellipsoid(.021, .032, .012, '#162437', -.084, 1.843, .243).ellipsoid(.021, .032, .012, '#162437', .084, 1.843, .243)
    .box(.08, .018, .025, '#2c252b', -.09, 1.922, .217, -.09).box(.08, .018, .025, '#2c252b', .09, 1.922, .217, .09)
    .box(.075, .018, .018, '#784533', 0, 1.703, .229)
    .add(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * .52).scale(.268, .24, .246), '#232b36', 0, 1.9, -.015)
    .ellipsoid(.16, .09, .13, '#232b36', -.08, 2.09, .09)
    .box(.12, .12, .027, '#ffe2a2', -.15, 1.34, .185, .1)
    .box(.045, .38, .024, '#ffffff', -.24, 1.2, .13).box(.045, .38, .024, '#ffffff', .24, 1.2, .13);
  body.add(b.mesh());
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.font = `bold ${Math.min(28, 205 / Math.max(1, profile.firstName.length))}px sans-serif`;
  ctx.fillText(keeper ? 'KEEPER' : profile.firstName.toUpperCase(), 128, 42);
  ctx.font = 'bold 142px sans-serif'; ctx.fillText(keeper ? '1' : String(profile.number), 128, 199);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  const print = new T.Mesh(new T.PlaneGeometry(.38, .41), new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: T.DoubleSide }));
  print.position.set(0, 1.2, -.199); print.rotation.y = Math.PI; body.add(print);
  const arms: T.Group[] = [], forearms: T.Group[] = [], legs: T.Group[] = [], knees: T.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new T.Group(); arm.position.set(side * .32, 1.44, 0); body.add(arm); arms.push(arm);
    arm.add(new MeshBuilder().ellipsoid(.115, .16, .12, shirt, 0, -.085, 0)
      .ellipsoid(.082, .18, .085, skin, 0, -.2, 0).mesh());
    const elbow = new T.Group(); elbow.position.y = -.3; arm.add(elbow); forearms.push(elbow);
    const lower = new MeshBuilder().ellipsoid(.071, .15, .075, skin, 0, -.13, 0);
    if (keeper) lower.box(.2, .19, .12, '#f3f5e9', 0, -.27, .015, 0, .05).box(.14, .055, .15, '#ff714a', 0, -.2, .015);
    else lower.ellipsoid(.073, .09, .075, skin, 0, -.28, 0);
    elbow.add(lower.mesh());
    const hip = new T.Group(); hip.position.set(side * .155, .8, 0); body.add(hip); legs.push(hip);
    hip.add(new MeshBuilder().box(.23, .19, .32, shorts, 0, -.07, 0)
      .ellipsoid(.096, .19, .1, skin, 0, -.24, 0).mesh());
    const knee = new T.Group(); knee.position.y = -.36; hip.add(knee); knees.push(knee);
    knee.add(new MeshBuilder().ellipsoid(.079, .16, .09, '#f8f5e8', 0, -.14, 0)
      .box(.164, .045, .185, shirt, 0, -.025, 0)
      .box(.205, .13, .36, shoes, 0, -.34, .07, 0, .055)
      .box(.21, .035, .36, '#152332', 0, -.398, .07)
      .box(.12, .018, .14, '#f4eddf', 0, -.268, .09).mesh());
  }
  const rig: Rig = { root, body, arms, forearms, legs, knees, pose(time, motion = 'idle', amount = 1) {
    const wave = Math.sin(time * 9), breath = Math.sin(time * 2.4);
    body.position.y = motion === 'run' ? Math.abs(wave) * .055 : motion === 'celebrate' ? Math.abs(Math.sin(time * 7)) * .24 : breath * .012;
    body.rotation.set(0, 0, 0);
    arms.forEach((arm, i) => { arm.rotation.set(0, 0, (i ? 1 : -1) * .12); forearms[i]!.rotation.x = -.15; });
    legs.forEach((leg, i) => { leg.rotation.set(0, 0, 0); knees[i]!.rotation.x = 0; });
    if (motion === 'run') {
      legs.forEach((leg, i) => { leg.rotation.x = wave * (i ? 1 : -1) * .7 * amount; knees[i]!.rotation.x = Math.max(0, -wave * (i ? 1 : -1)) * .65; arms[i]!.rotation.x = -leg.rotation.x * .65; });
      body.rotation.x = .1;
    } else if (motion === 'kick') {
      legs[0]!.rotation.x = amount; knees[0]!.rotation.x = Math.max(0, amount) * .65;
      arms[0]!.rotation.z = -.75; arms[1]!.rotation.z = .6; body.rotation.x = -.1;
    } else if (motion === 'keeper') {
      arms[0]!.rotation.z = -(.45 + .8 * amount); arms[1]!.rotation.z = .45 + .8 * amount;
      forearms.forEach((elbow) => { elbow.rotation.x = -.4 * (1 - amount); });
      legs[0]!.rotation.z = -.16; legs[1]!.rotation.z = .16;
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
