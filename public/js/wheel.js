// ═══════════════════════════════════════
//  3D WHEEL (Three.js + Predetermined Physics)
// ═══════════════════════════════════════
import { WHEEL_ORDER, RED_NUMBERS } from './shared.js';
import { sndTick, sndBallDrop } from './audio.js';

const N_SEG = WHEEL_ORDER.length;
const SEG_ARC = 2 * Math.PI / N_SEG;
const W_R = 4.8, W_IR = 3.0, TRACK_R = 5.5, TRACK_H = 1.2;
const DIV_H = 0.35, BALL_R = 0.13, RIM_R = 5.9;

let scene3d, camera3d, renderer3d, wheelGrp, ballMesh3d;
let wheelAngle = 0, wheelOmega = 0;
let ballSt = null, physActive = false, settleCount = 0, lastPocket = -1, spinStart = 0;
let targetPocket = -1; // server-determined target
let onSpinComplete = null; // callback when ball settles

export function initWheel(container) {
  scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color(0x1a1a2e);
  camera3d = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera3d.position.set(0, 10, 7);
  camera3d.lookAt(0, 0, 0);
  renderer3d = new THREE.WebGLRenderer({ antialias: true });
  renderer3d.setSize(500, 500);
  renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer3d.shadowMap.enabled = true;
  renderer3d.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer3d.domElement);

  scene3d.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(5, 12, 5); dl.castShadow = true;
  dl.shadow.mapSize.set(1024, 1024);
  scene3d.add(dl);
  const pl = new THREE.PointLight(0xf0c040, 0.4, 20);
  pl.position.set(0, 6, 0); scene3d.add(pl);

  buildWheel3D();
  createBall3D();
  render3DLoop();
}

function buildWheel3D() {
  wheelGrp = new THREE.Group();
  scene3d.add(wheelGrp);
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 });

  for (let i = 0; i < N_SEG; i++) {
    const n = WHEEL_ORDER[i];
    const col = n === 0 ? 0x0a8a3a : RED_NUMBERS.has(n) ? 0xb5172e : 0x1a1a1a;
    const sg = new THREE.RingGeometry(W_IR, W_R, 12, 1, i * SEG_ARC, SEG_ARC);
    const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
    sm.rotation.x = -Math.PI / 2; sm.position.y = 0.001 * i; sm.receiveShadow = true;
    wheelGrp.add(sm);

    const midA = (i + 0.5) * SEG_ARC, midR2 = (W_IR + W_R) / 2;
    const nc = document.createElement('canvas'); nc.width = 64; nc.height = 64;
    const nx = nc.getContext('2d');
    nx.fillStyle = '#fff'; nx.font = 'bold 36px Arial';
    nx.textAlign = 'center'; nx.textBaseline = 'middle';
    nx.fillText(String(n), 32, 32);
    const numMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(nc), transparent: true, side: THREE.DoubleSide, depthWrite: false })
    );
    numMesh.position.set(Math.cos(midA) * midR2, 0.02, Math.sin(midA) * midR2);
    numMesh.rotation.x = -Math.PI / 2; numMesh.rotation.z = -midA - Math.PI / 2;
    wheelGrp.add(numMesh);
  }

  for (let i = 0; i < N_SEG; i++) {
    const a = i * SEG_ARC, midR2 = (W_IR + W_R) / 2;
    const dm = new THREE.Mesh(new THREE.BoxGeometry(W_R - W_IR, DIV_H, 0.025), goldMat);
    dm.position.set(Math.cos(a) * midR2, DIV_H / 2, Math.sin(a) * midR2);
    dm.rotation.y = -a; dm.castShadow = true;
    wheelGrp.add(dm);
  }

  const hub = new THREE.Mesh(
    new THREE.ConeGeometry(W_IR * 0.8, 1.5, 32),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.3 })
  );
  hub.position.y = 0.6; wheelGrp.add(hub);

  const ir = new THREE.Mesh(new THREE.TorusGeometry(W_IR, 0.06, 8, 64), goldMat);
  ir.rotation.x = Math.PI / 2; ir.position.y = 0.06; wheelGrp.add(ir);

  const opr = new THREE.Mesh(new THREE.TorusGeometry(W_R, 0.08, 8, 64), goldMat);
  opr.rotation.x = Math.PI / 2; opr.position.y = 0.08; wheelGrp.add(opr);

  // Static parts
  const trackMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(TRACK_R, W_R + 0.12, TRACK_H, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 0.85, side: THREE.DoubleSide })
  );
  trackMesh.position.y = TRACK_H / 2; scene3d.add(trackMesh);

  const rimMesh = new THREE.Mesh(
    new THREE.TorusGeometry(RIM_R, 0.3, 16, 64),
    new THREE.MeshStandardMaterial({ color: 0x8B7500, metalness: 0.8, roughness: 0.2 })
  );
  rimMesh.rotation.x = Math.PI / 2; rimMesh.position.y = TRACK_H + 0.05; scene3d.add(rimMesh);

  const tableMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(RIM_R + 0.5, RIM_R + 0.5, 0.4, 64),
    new THREE.MeshStandardMaterial({ color: 0x0d0500, roughness: 0.9 })
  );
  tableMesh.position.y = -0.3; tableMesh.receiveShadow = true; scene3d.add(tableMesh);

  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, dr = (TRACK_R + W_R + 0.12) / 2;
    const df = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), goldMat);
    df.position.set(Math.cos(a) * dr, TRACK_H * 0.55, Math.sin(a) * dr);
    df.scale.set(1, 0.5, 0.7); df.rotation.y = -a;
    scene3d.add(df);
  }
}

function createBall3D() {
  ballMesh3d = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.7, roughness: 0.15 })
  );
  ballMesh3d.castShadow = true; ballMesh3d.visible = false;
  scene3d.add(ballMesh3d);
}

// ═══════════════════════════════════════
//  SPIN WITH PREDETERMINED RESULT
// ═══════════════════════════════════════
export function spinWheel(params, callback) {
  // params: { targetPocketIdx, wheelOmega, ballOmega, ballTheta }
  targetPocket = params.targetPocketIdx;
  wheelOmega = params.wheelOmega;
  onSpinComplete = callback;
  ballSt = {
    theta: params.ballTheta,
    r: TRACK_R,
    h: TRACK_H + BALL_R,
    omega: params.ballOmega,
    vr: 0, vh: 0,
    onTrack: true, settled: false,
    _lseg: -1, _localA: 0
  };
  settleCount = 0; lastPocket = -1;
  spinStart = performance.now();
  physActive = true;
  ballMesh3d.visible = true;
}

// ═══════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════
let lastFT = 0;
function render3DLoop(t) {
  requestAnimationFrame(render3DLoop);
  const now = t || 0;
  const dt = Math.min((now - (lastFT || now)) / 1000, 0.05);
  lastFT = now;

  if (physActive && ballSt) {
    const steps = 5;
    let result = null;
    for (let s = 0; s < steps; s++) {
      result = stepPhysics(dt / steps);
      if (result !== null) break;
    }
    // Safety timeout
    if (physActive && performance.now() - spinStart > 15000) {
      physActive = false; ballSt.settled = true;
      result = WHEEL_ORDER[targetPocket >= 0 ? targetPocket : 0];
    }
    wheelGrp.rotation.y = wheelAngle;
    if (ballSt) {
      ballMesh3d.position.set(Math.cos(ballSt.theta) * ballSt.r, ballSt.h, Math.sin(ballSt.theta) * ballSt.r);
      ballMesh3d.visible = true;
    }
    if (result !== null) {
      physActive = false;
      if (onSpinComplete) onSpinComplete(result);
    }
  } else {
    wheelAngle += 0.003 * (dt * 60);
    wheelGrp.rotation.y = wheelAngle;
    if (ballSt && ballSt.settled) {
      ballSt.theta = wheelAngle + ballSt._localA;
      ballMesh3d.position.set(Math.cos(ballSt.theta) * ballSt.r, ballSt.h, Math.sin(ballSt.theta) * ballSt.r);
    }
  }
  if (renderer3d) renderer3d.render(scene3d, camera3d);
}

// ═══════════════════════════════════════
//  BALL PHYSICS (with steering toward target)
// ═══════════════════════════════════════
function stepPhysics(dt) {
  const b = ballSt;
  if (!b || b.settled) return null;

  wheelOmega *= (1 - 0.02 * dt);
  wheelAngle += wheelOmega * dt;

  if (b.onTrack) {
    b.omega *= (1 - 0.5 * dt);
    b.theta += b.omega * dt;

    const la = ((b.theta - wheelAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const sn = Math.floor(la / SEG_ARC);
    if (sn !== b._lseg) { b._lseg = sn; sndTick(); }

    for (let d = 0; d < 8; d++) {
      const da = d * Math.PI / 4;
      const angDist = ((b.theta - da) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      if (Math.min(angDist, 2 * Math.PI - angDist) * TRACK_R < 0.25) b.omega *= 0.92;
    }

    if (Math.abs(b.omega) < 3.5) {
      b.onTrack = false;
      b.vr = -1.5 - Math.random() * 0.8;
      b.vh = -0.8 - Math.random() * 0.5;
      sndBallDrop();
    }
  } else {
    b.vh -= 9.8 * dt;
    b.h += b.vh * dt;
    b.r += b.vr * dt;
    b.theta += b.omega * dt;
    b.omega *= (1 - 0.6 * dt);
    b.vr *= (1 - 0.4 * dt);

    // Floor
    if (b.h < BALL_R) {
      b.h = BALL_R; b.vh = Math.abs(b.vh) * 0.3;
      b.vr *= 0.85; b.omega = b.omega * 0.85 + wheelOmega * 0.15;
      if (b.vh < 0.12) b.vh = 0;
    }
    // Outer pocket wall
    if (b.r > W_R - BALL_R && b.h < 0.5) { b.r = W_R - BALL_R; b.vr = -Math.abs(b.vr) * 0.3; }
    // Track slope
    if (b.r > W_R + 0.1) { b.vr = -Math.abs(b.vr) * 0.4 - 0.4; b.r = W_R + 0.1; }
    // Inner wall
    if (b.r < W_IR + BALL_R) { b.r = W_IR + BALL_R; b.vr = Math.abs(b.vr) * 0.3; }

    // Divider collision
    if (b.r >= W_IR + BALL_R && b.r <= W_R - BALL_R && b.h < DIV_H) {
      const lt = ((b.theta - wheelAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const nd = Math.round(lt / SEG_ARC);
      const angDist = lt - nd * SEG_ARC;
      const linDist = Math.abs(angDist) * b.r;
      if (linDist < BALL_R + 0.018) {
        const relOmega = b.omega - wheelOmega;
        b.omega = -relOmega * 0.3 + wheelOmega;
        b.theta += (angDist > 0 ? 1 : -1) * (BALL_R + 0.025) / b.r;
        sndTick();
      }
    }

    // Gentle steering toward target pocket when ball is slow
    if (targetPocket >= 0 && b.h <= BALL_R + 0.1) {
      const speed = Math.abs(b.omega - wheelOmega) * b.r + Math.abs(b.vr) + Math.abs(b.vh);
      if (speed < 1.5) {
        const lt = ((b.theta - wheelAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const targetA = (targetPocket + 0.5) * SEG_ARC;
        let diff = targetA - lt;
        // Normalize to [-PI, PI]
        diff = ((diff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        // Apply gentle correction (stronger as ball slows)
        const strength = Math.max(0, 1 - speed) * 0.15;
        b.omega += diff * strength * dt * 60;
      }
    }

    // Check settled
    const speed = Math.abs(b.omega - wheelOmega) * b.r + Math.abs(b.vr) + Math.abs(b.vh);
    if (speed < 0.15 && b.h <= BALL_R + 0.02) {
      const lt = ((b.theta - wheelAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const pi = Math.floor(lt / SEG_ARC) % N_SEG;
      if (pi === lastPocket) {
        settleCount++;
        if (settleCount > 80) {
          b.settled = true; b.omega = wheelOmega; b._localA = lt;
          return WHEEL_ORDER[pi];
        }
      } else { lastPocket = pi; settleCount = 0; }
      b.omega = b.omega * 0.92 + wheelOmega * 0.08;
    }
  }
  return null;
}
