import * as T from 'three';
import { character, football, keeperLook, labelTexture, MeshBuilder, playerLook, turf, type Look, type Rig } from './Assets';
import { BALL_RADIUS, GOAL, ball3, kick3, keeper3, wall3, target3, clamp3, mix, type Aim3, type Impact3, type Keeper3, type Kick3, type Mode3, type Vec3 } from '@domain/rewards/Soccer3D';
import type { Profile } from '@domain/profiles/Profile';

export interface Frame3 {
  mode: Mode3; round: number; origin: Vec3; phase: 'invite' | 'aim' | 'flight' | 'result' | 'done';
  now: number; keeperX: number; shot?: Kick3; move?: Keeper3; impact?: Impact3; elapsed: number; scored: boolean; aim?: Aim3; aimPower?: number;
  /** Keeper mode: where the child tapped to dive. */
  dive?: Aim3;
}
export const RUNUP_MS = 680;
const UNITED: Look = { name: 'UNITED', number: 4, shirt: '#d95a50', shorts: '#f6e9d5', cleats: '#26364d', skin: '#bd8057' };
/** Renderer owns GPU resources, but no animation loop or game timers. */
export class SoccerScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: T.WebGLRenderer;
  private world = new T.Scene();
  private camera = new T.PerspectiveCamera(44, 1, .1, 110);
  private kicker: Rig; private keeper: Rig; private defenders: Rig[];
  /** Keeper mode swaps in a computer striker and the child's own goalkeeper. */
  private striker: Rig; private myKeeper: Rig;
  private ball = football();
  private sun = new T.DirectionalLight('#fff1c7', 3.1);
  private net: T.LineSegments; private netRest: Float32Array;
  private target: T.Mesh; private crosshair: T.Mesh;
  /** Keeper mode: a glowing ring under the striker's ball so a child can find it. */
  private spot: T.Mesh;
  private arc: T.Line;
  private confetti: T.InstancedMesh;
  private crowd: T.Group[] = [];
  private shadows: T.Mesh[] = [];
  private resizeObserver: ResizeObserver;
  private ray = new T.Raycaster(); private goalPlane = new T.Plane(new T.Vector3(0, 0, 1), 0);
  private width = 1; private height = 1; private closed = false; private lost = false;
  private quality: 'auto' | 'low' = 'auto'; private scale = 1.25;
  private frames = 0; private slow = 0; private previous = 0;
  private matrix = new T.Object3D(); private point = new T.Vector3();
  private onLost: (event: Event) => void;
  private onRestore: () => void;
  constructor(private host: HTMLElement, profile: Profile, private reduced: boolean, onContextLost: () => void, private requestFrame: () => void) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.canvas = this.renderer.domElement; this.canvas.className = 'soccer-field soccer-field-3d'; this.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(this.canvas);
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFShadowMap;
    this.world.background = new T.Color('#b9dde4'); this.world.fog = new T.Fog('#b9dde4', 38, 85);
    this.world.add(new T.HemisphereLight('#e7f6ff', '#4a6543', 2));
    this.sun.position.set(-12, 20, 9); this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -13, right: 13, top: 18, bottom: -8, near: 1, far: 55 });
    this.sun.target.position.set(0, 0, 5); this.sun.shadow.bias = -.0005; this.sun.shadow.normalBias = .035;
    this.world.add(this.sun, this.sun.target);
    this.stadium();
    this.net = this.goal(); this.netRest = new Float32Array(this.net.geometry.getAttribute('position').array);
    this.kicker = character(playerLook(profile));
    this.keeper = character({ name: 'KEEPER', number: 1, shirt: '#f6bc45', shorts: '#153349', cleats: '#ff6842', skin: '#956342', keeper: true });
    this.defenders = [character(UNITED), character({ ...UNITED, number: 6, skin: '#8c5c42' })];
    this.striker = character({ ...UNITED, number: 9, skin: '#a86f4c' }); this.myKeeper = character(keeperLook(profile));
    this.world.add(this.ball, this.kicker.root, this.keeper.root, this.striker.root, this.myKeeper.root, ...this.defenders.map((d) => d.root));
    for (let i = 0; i < 5; i++) {
      const shadow = new T.Mesh(new T.CircleGeometry(1, 24), new T.MeshBasicMaterial({ color: '#0b3528', transparent: true, opacity: .16, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = .015; this.shadows.push(shadow); this.world.add(shadow);
    }
    const ringMaterial = new T.MeshBasicMaterial({ color: '#ffd275', transparent: true, opacity: .95, depthTest: true });
    this.target = new T.Mesh(new T.TorusGeometry(.53, .045, 6, 48), ringMaterial); this.target.position.z = .08;
    this.crosshair = new T.Mesh(new T.TorusGeometry(.2, .025, 5, 28), new T.MeshBasicMaterial({ color: '#fff8bc', transparent: true, opacity: .85 })); this.crosshair.position.z = .15;
    this.spot = new T.Mesh(new T.RingGeometry(.3, .4, 32).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: .9, depthWrite: false }));
    this.spot.position.y = .02; this.world.add(this.target, this.crosshair, this.spot);
    this.arc = new T.Line(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(new Float32Array(75), 3)), new T.LineDashedMaterial({ color: '#fff7b5', dashSize: .18, gapSize: .16, transparent: true, opacity: .65 }));
    this.world.add(this.arc);
    this.confetti = new T.InstancedMesh(new T.PlaneGeometry(.08, .19), new T.MeshBasicMaterial({ side: T.DoubleSide }), 70);
    this.confetti.frustumCulled = false; const palette = ['#ffe28a', '#f37560', '#effaf6', '#8ce5ce'];
    for (let i = 0; i < 70; i++) this.confetti.setColorAt(i, new T.Color(palette[i % 4]));
    this.world.add(this.confetti);
    this.onLost = (event) => { event.preventDefault(); this.lost = true; onContextLost(); };
    this.onRestore = () => { this.lost = false; };
    this.canvas.addEventListener('webglcontextlost', this.onLost); this.canvas.addEventListener('webglcontextrestored', this.onRestore);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host); this.resize();
  }
  private stadium(): void {
    const field = new T.Mesh(new T.PlaneGeometry(48, 48), new T.MeshStandardMaterial({ map: turf(), roughness: 1 }));
    field.rotation.x = -Math.PI / 2; field.position.z = 10; field.receiveShadow = true; this.world.add(field);
    const architecture = new MeshBuilder();
    architecture.box(47, .4, 47, '#233f40', 0, -.28, 9, 0, .01);
    for (let row = 0; row < 7; row++) {
      architecture.box(43, .62, 1.35, row % 2 ? '#285469' : '#326075', 0, .3 + row * .62, -6 - row * 1.12);
      // The far end is only seen from behind the goal in keeper mode.
      architecture.box(43, .62, 1.35, row % 2 ? '#285469' : '#326075', 0, .3 + row * .62, 26 + row * 1.12);
      for (const side of [-1, 1]) architecture.box(1.35, .62, 33, '#2c576b', side * (18 + row * 1.12), .3 + row * .62, 6);
    }
    architecture.box(46, .24, 4, '#e1d8bc', 0, 5.8, -12.3).box(46, .18, .2, '#ffca76', 0, 5.69, -10.3);
    for (const x of [-20, -10, 10, 20]) architecture.box(.18, 6, .18, '#31566a', x, 2.8, -13.4);
    for (const side of [-1, 1]) {
      architecture.box(.2, 11, .2, '#d3d6c2', side * 14, 5.5, -8.5)
        .box(3.2, 1.1, .3, '#173343', side * 14, 10.7, -8.5)
        .box(2.9, .8, .06, '#fff1be', side * 14, 10.7, -8.29);
      // Tunnel openings and banner rails anchor the scene without extra geometry per spectator.
      architecture.box(2, 2.4, .12, '#102f3b', side * 12, 1.2, -5.28);
    }
    this.world.add(architecture.mesh(false));
    const banner = new T.Mesh(new T.PlaneGeometry(22, .8), new T.MeshBasicMaterial({ map: labelTexture('PLAY BRAVE.  DREAM BIG.  HAVE FUN.') }));
    banner.position.set(0, .58, -4.6); this.world.add(banner);
    const scoreboard = new T.Mesh(new T.PlaneGeometry(10, 1.25), new T.MeshBasicMaterial({ map: labelTexture('GOAL READER  ★  DREAM ARENA', '#0d293d', '#f5e5b7') }));
    scoreboard.position.set(0, 5.15, -10.55); this.world.add(scoreboard);
    for (let section = 0; section < 6; section++) {
      const people = new T.Group(); const count = 126, far = section >= 3;
      const bodies = new T.InstancedMesh(new T.CapsuleGeometry(.16, .22, 2, 6), new T.MeshLambertMaterial(), count);
      const heads = new T.InstancedMesh(new T.SphereGeometry(.12, 6, 4), new T.MeshLambertMaterial(), count);
      const colors = ['#d1c795', '#5da6ac', '#f7b257', '#edf0d2', '#db745b', '#283a56'];
      let n = 0; const temp = new T.Object3D();
      for (let row = 0; row < 6; row++) for (let col = 0; col < 21; col++) {
        const x = -19.4 + (section % 3) * 13 + col * .6, y = 1.02 + row * .62, z = far ? 26.1 + row * 1.12 : -6.1 - row * 1.12;
        temp.position.set(x, y, z); temp.updateMatrix(); bodies.setMatrixAt(n, temp.matrix); bodies.setColorAt(n, new T.Color(colors[(col * 7 + row * 3 + section) % colors.length]));
        temp.position.y += .32; temp.updateMatrix(); heads.setMatrixAt(n, temp.matrix); heads.setColorAt(n, new T.Color(['#c78f67', '#8e6048', '#e0b28c'][(row + col) % 3])); n++;
      }
      bodies.computeBoundingSphere(); heads.computeBoundingSphere(); people.add(bodies, heads); this.crowd.push(people); this.world.add(people);
    }
    const distant = new MeshBuilder();
    for (let i = 0; i < 9; i++) distant.ellipsoid(10, 6 + i % 3 * 2, 9, i % 2 ? '#77a8a1' : '#8eb7aa', -48 + i * 12, -1, -30 - i % 3 * 4);
    this.world.add(distant.mesh(false));
  }
  private goal(): T.LineSegments {
    const posts = new MeshBuilder();
    const beam = (a: T.Vector3, b: T.Vector3, radius: number, color: string): void => {
      const delta = b.clone().sub(a), e = new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.clone().normalize()));
      const mid = a.clone().add(b).multiplyScalar(.5); posts.add(new T.CylinderGeometry(radius, radius, delta.length(), 10), color, mid.x, mid.y, mid.z, e.x, e.y, e.z);
    };
    for (const x of [-GOAL.halfWidth, GOAL.halfWidth]) {
      beam(new T.Vector3(x, 0, 0), new T.Vector3(x, GOAL.height, 0), GOAL.post, '#f9f5df');
      beam(new T.Vector3(x, GOAL.height, 0), new T.Vector3(x, GOAL.height, -GOAL.depth), .035, '#bcd2cc');
      beam(new T.Vector3(x, GOAL.height, -GOAL.depth), new T.Vector3(x, 0, -GOAL.depth), .035, '#bcd2cc');
      beam(new T.Vector3(x, .035, 0), new T.Vector3(x, .035, -GOAL.depth), .035, '#bcd2cc');
    }
    beam(new T.Vector3(-GOAL.halfWidth, GOAL.height, 0), new T.Vector3(GOAL.halfWidth, GOAL.height, 0), GOAL.post, '#f9f5df');
    beam(new T.Vector3(-GOAL.halfWidth, GOAL.height, -GOAL.depth), new T.Vector3(GOAL.halfWidth, GOAL.height, -GOAL.depth), .035, '#c8d7ca');
    this.world.add(posts.mesh());
    const points: number[] = []; const line = (...v: number[]): void => { points.push(...v); };
    for (let x = -GOAL.halfWidth; x <= GOAL.halfWidth + .01; x += GOAL.halfWidth * 2 / 30) {
      line(x, 0, -GOAL.depth, x, GOAL.height, -GOAL.depth); line(x, GOAL.height, -GOAL.depth, x, GOAL.height, 0);
    }
    for (let y = 0; y <= GOAL.height + .01; y += GOAL.height / 11) {
      line(-GOAL.halfWidth, y, -GOAL.depth, GOAL.halfWidth, y, -GOAL.depth);
      for (const x of [-GOAL.halfWidth, GOAL.halfWidth]) line(x, y, -GOAL.depth, x, y, 0);
    }
    for (let z = -GOAL.depth; z < 0; z += .25) {
      for (const x of [-GOAL.halfWidth, GOAL.halfWidth]) line(x, 0, z, x, GOAL.height, z);
      line(-GOAL.halfWidth, GOAL.height, z, GOAL.halfWidth, GOAL.height, z);
    }
    const net = new T.LineSegments(new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(points, 3)), new T.LineBasicMaterial({ color: '#eff6db', transparent: true, opacity: .55 }));
    this.world.add(net); return net;
  }
  private resize(): void {
    if (this.closed) return;
    const rect = this.host.getBoundingClientRect(); this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.scale));
    this.renderer.setSize(this.width, this.height, false); this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix(); this.requestFrame();
  }
  setQuality(low: boolean): void {
    this.quality = low ? 'low' : 'auto'; this.scale = low ? .85 : 1.25; this.renderer.shadowMap.enabled = !low; this.resize();
  }
  project(p: Vec3): { x: number; y: number } {
    const v = this.point.set(p.x, p.y, p.z).project(this.camera); return { x: (v.x + 1) * .5 * this.width, y: (1 - v.y) * .5 * this.height };
  }
  aimAt(clientX: number, clientY: number): Aim3 {
    const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new T.Vector2((clientX - rect.left) / this.width * 2 - 1, -(clientY - rect.top) / this.height * 2 + 1), this.camera);
    const hit = this.ray.ray.intersectPlane(this.goalPlane, this.point);
    return hit ? { x: clamp3(hit.x, -6, 6), y: clamp3(hit.y, .18, 4.3) } : { x: 0, y: 1.2 };
  }
  draw(f: Frame3): void {
    if (this.closed || this.lost) return;
    const time = f.now / 1000, flight = f.phase === 'flight', result = f.phase === 'result' || f.phase === 'done';
    const progress = f.shot ? clamp3((f.elapsed - RUNUP_MS) / f.shot.flightMs, 0, f.impact?.t ?? 1) : 0;
    const run = clamp3(f.elapsed / RUNUP_MS, 0, 1), after = result ? clamp3(f.elapsed / 1000, 0, 1) : 0;
    // Camera stays still throughout aiming, so finger position and the target agree.
    const keeperMode = f.mode === 'keeper', portrait = this.camera.aspect < .85;
    const shooter = keeperMode ? this.striker : this.kicker, goalie = keeperMode ? this.myKeeper : this.keeper;
    // In keeper mode a goal belongs to the striker, so only the child's own player celebrates.
    const celebrate = result && f.scored && !keeperMode;
    const fov = keeperMode ? (portrait ? 80 : 50) : (portrait ? 55 : 44);
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    if (keeperMode) {
      // Behind the child's goalkeeper, far enough back that both posts fit, but in front of the crowd behind the goal.
      const distance = clamp3(4.3 / (Math.tan(T.MathUtils.degToRad(fov / 2)) * this.camera.aspect), 5.2, 7.6);
      this.camera.position.set(0, 1.75 + distance * .3, -distance); this.camera.lookAt(0, 1.05, 6);
    } else {
      // Camera stays still throughout aiming, so finger position and the target agree.
      const push = this.reduced ? 0 : flight ? progress * .9 : celebrate ? 1.5 * after : 0;
      this.camera.position.set(f.origin.x * .65 + (portrait ? .8 : 1.5), portrait ? 5.2 : 4.4, f.origin.z + (portrait ? 10 : 7.6) - push);
      this.camera.lookAt(f.origin.x * .17, .85, f.origin.z * .42 - push * .7);
    }
    this.camera.updateMatrixWorld();
    this.kicker.root.visible = !keeperMode; this.striker.root.visible = keeperMode;
    this.keeper.root.visible = f.mode !== 'targets' && !keeperMode; this.myKeeper.root.visible = keeperMode;
    shooter.root.position.set(f.origin.x - .22, 0, f.origin.z + 1.5 - (flight ? run * 1.02 : result ? 1.02 : 0));
    shooter.root.rotation.set(0, Math.PI + (celebrate ? Math.PI * after : 0), 0);
    if (flight && run < .78) shooter.pose(time, 'run');
    else if (flight) shooter.pose(time, 'kick', f.elapsed < RUNUP_MS ? mix(.8, -.6, (run - .78) / .22) : -(.6 + .6 * Math.sin(clamp3((f.elapsed - RUNUP_MS) / 450, 0, 1) * Math.PI)) * (1 - clamp3((f.elapsed - RUNUP_MS) / 500, 0, 1)));
    else shooter.pose(time, celebrate ? 'celebrate' : 'idle');
    // After the shot the keeper keeps moving: he holds the stretch, then lands on the grass.
    const keeperPose = f.move && f.shot && (flight || result)
      ? keeper3(f.move, flight ? Math.max(0, f.elapsed - RUNUP_MS) : f.shot.flightMs * (f.impact?.t ?? 1) + f.elapsed)
      : { x: f.keeperX, y: 0, angle: 0, dive: 0 };
    goalie.root.position.set(keeperPose.x, keeperPose.y, .2); goalie.root.rotation.z = keeperPose.angle;
    goalie.pose(time, 'keeper', keeperPose.dive);
    const wall = wall3(f.round, f.mode);
    this.defenders.forEach((rig, i) => { const p = wall[i]; rig.root.visible = !!p; if (p) { rig.root.position.set(p.x, flight ? Math.sin(Math.PI * progress) * .22 : 0, p.z); rig.pose(time, 'idle'); } });
    let position: Vec3 = f.origin;
    if (flight && f.shot) position = ball3(f.shot, progress);
    else if (result && f.impact) {
      const impact = f.impact.point;
      if (f.impact.outcome === 'goal') position = { x: impact.x, y: Math.max(BALL_RADIUS, impact.y * (1 - after)), z: -Math.sin(after * Math.PI * .65) * 1.35 };
      else if (f.impact.outcome === 'saved') position = { x: impact.x, y: Math.max(BALL_RADIUS, impact.y * (1 - after)), z: impact.z + after * 1.2 };
      else position = { x: impact.x + (impact.x > 0 ? -.4 : .4) * after, y: Math.max(BALL_RADIUS, impact.y * (1 - after) + Math.sin(after * Math.PI) * .5), z: impact.z + after * 2 };
    }
    this.ball.position.set(position.x, position.y, position.z); this.ball.rotation.set(progress * 22 + after * 4, progress * 8, progress * 3);
    const roots = [shooter.root, goalie.root, ...this.defenders.map((d) => d.root), this.ball];
    this.shadows.forEach((s, i) => { const object = roots[i]!; s.visible = object.visible && !this.renderer.shadowMap.enabled; s.position.set(object.position.x, .018, object.position.z); const size = i === 4 ? .23 : .55; s.scale.set(size, size * .65, 1); });
    this.spot.visible = keeperMode && (f.phase === 'aim' || (flight && f.elapsed < RUNUP_MS));
    if (this.spot.visible) { this.spot.position.set(f.origin.x, .02, f.origin.z); this.spot.scale.setScalar(this.reduced ? 1 : 1 + Math.sin(time * 5) * .12); }
    const target = target3(f.round); this.target.visible = f.mode === 'targets'; this.target.position.set(target.x, target.y, .08);
    this.target.scale.setScalar(this.reduced ? 1 : 1 + Math.sin(time * 3) * .05);
    this.crosshair.visible = (!!f.aim && f.phase === 'aim') || (!!f.dive && flight); this.arc.visible = !!f.aim && f.phase === 'aim';
    if (f.dive && flight) this.crosshair.position.set(f.dive.x, f.dive.y, -.05);
    if (f.aim && this.arc.visible) {
      this.crosshair.position.set(f.aim.x, f.aim.y, .15);
      const attribute = this.arc.geometry.getAttribute('position');
      const preview = kick3(f.origin, f.aim, f.aimPower ?? .85);
      for (let i = 0; i < 25; i++) { const p = ball3(preview, i / 24 * preview.range); attribute.setXYZ(i, p.x, p.y, p.z); }
      attribute.needsUpdate = true; this.arc.computeLineDistances(); this.arc.geometry.computeBoundingSphere();
    }
    const net = this.net.geometry.getAttribute('position');
    for (let i = 0; i < net.count; i++) {
      const x = this.netRest[i * 3]!, y = this.netRest[i * 3 + 1]!, z = this.netRest[i * 3 + 2]!;
      const ripple = !this.reduced && result && f.impact?.outcome === 'goal' && z < -1.6
        ? Math.sin(after * 18 + x * 3 + y * 2) * .18 * (1 - after) * Math.exp(-Math.abs(x - f.impact.point.x) * .35) : 0;
      net.setXYZ(i, x, y, z - ripple);
    }
    net.needsUpdate = true;
    this.crowd.forEach((group, i) => { group.position.y = this.reduced ? 0 : Math.sin(time * (f.scored && result ? 10 : 2) + i * 2) * (f.scored && result ? .13 : .018); });
    this.confetti.visible = !this.reduced && result && f.scored && after < 1;
    if (this.confetti.visible) {
      for (let i = 0; i < 70; i++) {
        const n = i * 2.399; this.matrix.position.set(f.impact!.point.x + Math.cos(n) * after * (1 + i % 4), 1 + after * 6 - after * after * 6 + (i % 7) * .12, -.1 + Math.sin(n) * after * 2);
        this.matrix.rotation.set(n + after * 5, after * 8, n); this.matrix.updateMatrix(); this.confetti.setMatrixAt(i, this.matrix.matrix);
      } this.confetti.instanceMatrix.needsUpdate = true;
    }
    this.renderer.render(this.world, this.camera); this.frames++;
    const dt = this.previous ? f.now - this.previous : 0; this.previous = f.now;
    if (this.quality === 'auto' && dt > 25 && dt < 150 && !this.reduced) this.slow++; else this.slow = Math.max(0, this.slow - .3);
    if (this.slow > 45 && this.scale > .7) { this.scale = this.scale > .85 ? .85 : .7; this.renderer.shadowMap.enabled = false; this.resize(); this.slow = 0; }
    if (this.frames % 30 === 0 || this.frames === 1) {
      this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls); this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
      this.canvas.dataset.renderScale = String(this.scale); this.canvas.dataset.frames = String(this.frames);
    }
  }
  resetClock(): void { this.previous = 0; }
  dispose(): void {
    if (this.closed) return; this.closed = true; this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onLost); this.canvas.removeEventListener('webglcontextrestored', this.onRestore);
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
    this.world.traverse((object) => {
      const mesh = object as T.Mesh; if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { materials.add(material); Object.values(material).forEach((v: unknown) => { if (v instanceof T.Texture) textures.add(v); }); }
      if (object instanceof T.InstancedMesh) object.dispose();
    });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
    this.sun.shadow.map?.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.canvas.remove();
  }
}
