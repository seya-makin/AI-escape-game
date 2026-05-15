import * as THREE from 'three';
import { PointerLockControls }         from 'three/addons/controls/PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject }  from 'three/addons/renderers/CSS2DRenderer.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════════════
let   INTERACT_RANGE = 4.0;          // adjusted per difficulty level
const PLAYER_HEIGHT  = 1.7;
const PLAYER_SPEED   = 7.5;
const STEP_DELAY_MS  = 1600;

const AREA_POS = {
  start_area:   new THREE.Vector3( 0.0, 0, -7.5),
  desk_area:    new THREE.Vector3( 0.5, 0, -4.5),
  cabinet_area: new THREE.Vector3( 7.0, 0,  3.0),
  safe_area:    new THREE.Vector3(-7.0, 0,  0.0),
  exit_area:    new THREE.Vector3( 0.0, 0,  8.5),
};

// ── Difficulty levels ──────────────────────────────────────────────────────────
// KEY_SCALE: upright so raycasts always land on the key regardless of direction
const KEY_SCALE = [0.08, 0.45, 0.25];

const LEVELS = {
  easy: {
    label: 'Easy',
    keyPos: [0.6, 1.35, -6.0],       // on the desk — obvious
    interactRange: 4.0,
    hint: 'Key is on the desk.',
  },
  medium: {
    label: 'Medium',
    keyPos: [5.0, 0.32, -9.5],       // floor near the bookshelf — less obvious
    interactRange: 3.2,
    hint: 'Key is hidden somewhere in the room…',
  },
  hard: {
    label: 'Hard',
    keyPos: [-7.8, 0.32, 7.5],       // far corner near the exit — easy to miss
    interactRange: 2.2,
    hint: 'Good luck.',
  },
};

let currentLevel = 'easy';

// ── GA integration ─────────────────────────────────────────────────────────────
// Maps GA area names → 3-D key drop positions (mirrors AREA_POS centers)
const GA_KEY_AREA_POSITIONS = {
  desk_area:    [0.6,  1.35, -6.0],   // on the desk (easy / visible)
  cabinet_area: [8.5,  0.32,  4.0],   // floor beside the cabinet
  safe_area:    [-7.0, 0.32, -0.5],   // floor beside the safe
};

let gaResult = null;   // last GA response { puzzle, ga_stats }
let ceilingMesh = null;   // set in buildRoom — hidden during AI mode

// GA puzzle runtime state (set when a GA puzzle is loaded into the room)
let gaActive      = false;
const gaObjects   = {};    // dynamic Interactables keyed by 'gaKey_N' / 'gaLock_N'
let gaStagesState = [];    // [{ keyTaken, lockOpen }, ...] per stage

// ── Hiding-spot catalog: each spot hides a key, has an open animation ─────────
function _makeBox(w, h, d, col, rough, metal, x, y, z) {
  const mat = new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: metal ?? 0 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const HIDING_SPOTS = {
  desk_area: [
    { id: 'drawer', label: 'Desk Drawer',
      make: () => _makeBox(0.9, 0.22, 0.55, 0x6e4620, 0.72, 0.1, -0.6, 0.62, -5.15),
      keyPos: [-0.6, 0.75, -4.8],
      openAnim: (m, t) => { m.position.z = -5.15 + t * 0.55; } },
    { id: 'papers', label: 'Stack of Papers',
      make: () => _makeBox(0.35, 0.05, 0.5, 0xf5f0dc, 0.9, 0, -1.2, 1.08, -5.8),
      keyPos: [-1.2, 1.18, -5.8],
      openAnim: (m, t) => { m.rotation.z = t * Math.PI * 0.35; m.position.y = 1.08 + t * 0.12; } },
    { id: 'book_desk', label: 'Old Book',
      make: () => _makeBox(0.22, 0.14, 0.28, 0x5a3518, 0.7, 0, 0.9, 1.12, -5.5),
      keyPos: [0.9, 1.25, -5.5],
      openAnim: (m, t) => { m.position.y = 1.12 + t * 0.18; m.rotation.x = t * Math.PI * 0.25; } },
  ],
  cabinet_area: [
    { id: 'cabinet_door', label: 'Cabinet',
      make: () => _makeBox(1.45, 2.85, 0.18, 0x50321e, 0.72, 0, 8.5, 1.5, 2.05),
      keyPos: [8.0, 1.5, 1.4],
      openAnim: (m, t) => {
        const ang = -t * Math.PI * 0.55;                 // swing toward player
        const px = 7.77, pz = 2.05;
        const dx = 8.5 - px, dz = 2.05 - pz;
        m.position.x = px + dx * Math.cos(ang) - dz * Math.sin(ang);
        m.position.z = pz + dx * Math.sin(ang) + dz * Math.cos(ang);
        m.rotation.y = ang;
      } },
    { id: 'plant_pot', label: 'Side-Table Vase',
      make: () => _makeBox(0.35, 0.5, 0.35, 0x3a5a3a, 0.9, 0, 6.5, 0.80, 6.5),
      keyPos: [6.5, 1.15, 6.5],
      openAnim: (m, t) => { m.position.y = 0.80 + Math.abs(Math.sin(t * Math.PI * 5)) * 0.07 * (1 - t); } },
    { id: 'books_shelf', label: 'Books on Shelf',
      make: () => _makeBox(0.8, 0.5, 0.22, 0x7a2020, 0.65, 0, 5.0, 2.40, -9.7),
      keyPos: [5.0, 2.40, -9.5],
      openAnim: (m, t) => { m.position.x = 5.0 + t * 0.6; m.rotation.y = t * Math.PI * 0.3; } },
  ],
  safe_area: [
    { id: 'safe_door', label: 'Safe',
      make: () => _makeBox(1.45, 1.45, 0.18, 0x2d2d2d, 0.3, 0.75, -8.5, 1.5, -0.72),
      keyPos: [-8.0, 1.5, -0.5],
      openAnim: (m, t) => {
        const ang = -t * Math.PI * 0.55;
        const px = -7.77, pz = -0.72;
        const dx = -8.5 - px, dz = -0.72 - pz;
        m.position.x = px + dx * Math.cos(ang) - dz * Math.sin(ang);
        m.position.z = pz + dx * Math.sin(ang) + dz * Math.cos(ang);
        m.rotation.y = ang;
      } },
    { id: 'side_painting', label: 'Side Painting',
      make: () => _makeBox(1.2, 0.9, 0.04, 0x4a3a6e, 0.65, 0, -6.8, 2.4, -9.77),
      keyPos: [-6.8, 2.4, -9.4],
      openAnim: (m, t) => {
        const ang = t * Math.PI * 0.4;
        m.rotation.y = ang;
        m.position.x = -6.8 - Math.sin(ang) * 0.3;
        m.position.z = -9.77 + Math.sin(ang) * 0.3;
      } },
    { id: 'corner_rug', label: 'Corner Rug',
      make: () => _makeBox(1.4, 0.03, 1.4, 0x3a3a8a, 0.95, 0, -5.5, 0.03, 2.0),
      keyPos: [-5.5, 0.2, 2.0],
      openAnim: (m, t) => { m.position.y = 0.03 + t * 0.4; m.rotation.z = t * Math.PI * 0.3; } },
  ],
  exit_area: [
    { id: 'doormat', label: 'Doormat',
      make: () => _makeBox(1.2, 0.04, 0.8, 0x2a3e78, 0.9, 0, 0.0, 0.025, 9.0),
      keyPos: [0.0, 0.18, 9.0],
      openAnim: (m, t) => { m.position.y = 0.025 + t * 0.3; m.rotation.x = t * Math.PI * 0.3; } },
  ],
};

// ── Lock-fixture catalog: real lock visuals per area (stack index for repeats) ──
const LOCK_FIXTURES = {
  desk_area: {
    label: 'Drawer Padlock',
    make: (s) => _makeBox(0.14, 0.16, 0.08, 0xffc840, 0.3, 0.75, -0.6 + s * 0.35, 0.62, -4.86),
    openAnim: (m, t) => { m.position.y += t * 0.002; m.rotation.z = t * Math.PI * 0.4; },
  },
  cabinet_area: {
    label: 'Cabinet Keyhole',
    make: (s) => _makeBox(0.18, 0.22, 0.10, 0xffc840, 0.4, 0.65, 8.4, 1.8 - s * 0.5, 1.96),
    openAnim: (m, t) => { m.rotation.z = t * Math.PI; },
  },
  safe_area: {
    label: 'Safe Dial',
    make: (s) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.06, 20),
        new THREE.MeshStandardMaterial({ color: 0xffc840, roughness: 0.3, metalness: 0.85 }),
      );
      mesh.position.set(-8.4, 1.5 - s * 0.45, -0.62);
      mesh.rotation.x = Math.PI / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    },
    openAnim: (m, t) => { m.rotation.z = t * Math.PI * 2.5; },
  },
  exit_area: {
    label: 'EXIT',
    make: (s) => _makeBox(2.8, 3.0, 0.18, 0xc83232, 0.55, 0, 0, 1.5, 10.08),
    openAnim: (m, t) => {
      m.material.color.setRGB(0.78 - t * 0.58, 0.20 + t * 0.58, 0.20 + t * 0.10);
      m.position.x = -t * 0.7;
      m.rotation.y = t * Math.PI * 0.45;
    },
  },
};

// ── Simple animation system — stepped each frame in animate() ─────────────────
const _anims = [];
function pushAnim(mesh, duration, update, onDone) {
  _anims.push({ mesh, duration, elapsed: 0, update, onDone });
}
function stepAnims(delta) {
  for (let i = _anims.length - 1; i >= 0; i--) {
    const a = _anims[i];
    a.elapsed += delta;
    const t = Math.min(1, a.elapsed / a.duration);
    a.update(a.mesh, t);
    if (t >= 1) {
      if (a.onDone) a.onDone();
      _anims.splice(i, 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Renderer & scene
// ═══════════════════════════════════════════════════════════════════════════════
const canvas = document.getElementById('c');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:4;';
document.body.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0b13);
scene.fog = new THREE.FogExp2(0x0d0b13, 0.028);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 80);
camera.position.set(0, PLAYER_HEIGHT, -7.5);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Controls
// ═══════════════════════════════════════════════════════════════════════════════
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

// ═══════════════════════════════════════════════════════════════════════════════
//  Game state  (mirrors Python GameState)
// ═══════════════════════════════════════════════════════════════════════════════
function freshState() {
  return {
    playerLocation:      'start_area',
    inventory:           new Set(),
    drawerLocked:        true,
    cabinetLocked:       true,
    safeLocked:          true,
    exitLocked:          true,
    smallKeyCollected:   false,
    cabinetKeyCollected: false,
    codeKnown:           false,
    masterKeyCollected:  false,
  };
}

let gs        = freshState();
let gameMode  = 'human';   // 'human' | 'ai'
let complete  = false;
let selAlgo   = 'A*';

// ═══════════════════════════════════════════════════════════════════════════════
//  Lighting
// ═══════════════════════════════════════════════════════════════════════════════
function setupLighting() {
  // Soft warm ambient
  scene.add(new THREE.AmbientLight(0xffe8c8, 0.35));

  // Main overhead directional
  const sun = new THREE.DirectionalLight(0xfff5e6, 1.4);
  sun.position.set(4, 9, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far  = 40;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
  sun.shadow.bias = -0.0003;
  scene.add(sun);

  // Warm ceiling lamp glow
  const lamp = new THREE.PointLight(0xffeedd, 2.2, 18, 1.4);
  lamp.position.set(0, 3.65, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  scene.add(lamp);

  // Cool fill from left
  const fill = new THREE.PointLight(0xc8d8ff, 0.45, 22);
  fill.position.set(-8, 2.5, 2);
  scene.add(fill);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Room geometry
// ═══════════════════════════════════════════════════════════════════════════════
function mat(col, rough = 0.75, metal = 0, emit = 0, emitCol = 0x000000) {
  return new THREE.MeshStandardMaterial({
    color: col, roughness: rough, metalness: metal,
    emissive: emitCol, emissiveIntensity: emit,
  });
}

function box(w, h, d, material, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.receiveShadow = shadow;
  if (shadow) m.castShadow = true;
  scene.add(m);
  return m;
}

function buildRoom() {
  const t = 0.3;
  const M = {
    floor:   mat(0x4a2e12, 0.92),
    wall:    mat(0xc4b09c, 0.80),
    ceiling: mat(0xe8e4dc, 0.70),
    desk:    mat(0x7a4e22, 0.72),
    cabinet: mat(0x5a3518, 0.72),
    safe:    mat(0x383838, 0.30, 0.75),
    rug:     mat(0x6e2020, 0.95),
    chair:   mat(0x1c1c1c, 0.82, 0.10),
    lamp:    mat(0x282828, 0.50, 0.40),
    globe:   mat(0xfffadc, 0.30, 0.05, 0.35, 0xfffadc),
    frame:   mat(0x3a2208, 0.70),
    canvas:  mat(0x4a6e96, 0.65),
    shelf:   mat(0x5c3a10, 0.72),
    mat_doormat: mat(0x2a3e78, 0.90),
  };

  // Floor & ceiling
  box(20, t, 20, M.floor,   0, -t/2, 0);
  ceilingMesh = box(20, t, 20, M.ceiling, 0, 4+t/2, 0, false);

  // Walls
  box(20, 4+t, t, M.wall,  0, 2, -10);          // back
  box(t, 4+t, 20, M.wall, -10, 2, 0);           // left
  box(t, 4+t, 20, M.wall,  10, 2, 0);           // right
  box(8.5, 4+t, t, M.wall, -5.75, 2, 10);       // front-left
  box(8.5, 4+t, t, M.wall,  5.75, 2, 10);       // front-right
  box(3.0, 1.0, t, M.wall,  0, 3.5, 10);        // above door

  // Desk
  box(3.5, 1.0, 1.8, M.desk,  0, 0.50, -6);
  box(3.5, 0.08, 1.8, M.desk, 0, 1.04, -6);

  // Cabinet body (right wall)
  box(1.5, 3.0, 2.0, M.cabinet, 8.5, 1.5, 3);

  // Safe body (left wall)
  box(1.5, 1.5, 1.5, M.safe, -8.5, 1.5, 0);

  // ── Decorative details ───────────────────────────────────────────────────────
  const det = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
  };

  det(5.0, 0.02, 4.0, M.rug,  0, 0.01, -5.5);                   // rug
  det(0.75, 0.08, 0.75, M.chair, 2.2, 0.46, -5.2);               // chair seat
  det(0.72, 0.70, 0.08, M.chair, 2.2, 0.82, -5.57);              // chair back
  det(0.08, 0.46, 0.08, M.chair, 2.2, 0.23, -5.2);               // chair pedestal
  det(0.45, 0.08, 0.45, M.lamp,  0, 3.90, 0);                     // lamp mount
  det(0.30, 0.22, 0.30, M.globe, 0, 3.75, 0);                     // lamp globe
  det(1.8, 1.4, 0.04, M.frame,  -3.5, 2.4, -9.82);               // painting frame
  det(1.4, 1.0, 0.04, M.canvas, -3.5, 2.4, -9.78);               // painting canvas

  // ── AUD logo picture (back wall, right side) ─────────────────────────────────
  // Blue border frame
  det(2.6, 1.35, 0.04, mat(0x1a3580, 0.55, 0.15), 3.6, 2.4, -9.82);
  // White mat
  det(2.2, 1.0, 0.04, mat(0xf8f8f8, 0.70), 3.6, 2.4, -9.80);
  // Canvas texture
  {
    const cvs = document.createElement('canvas');
    cvs.width = 480; cvs.height = 220;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 480, 220);
    // Big "AUD" letters
    ctx.fillStyle = '#1a3580';
    ctx.font = 'bold 92px Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('AUD', 16, 110);
    // Double vertical divider
    ctx.strokeStyle = '#1a3580'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(190, 22); ctx.lineTo(190, 198); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(200, 22); ctx.lineTo(200, 198); ctx.stroke();
    // Right-side text block
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.fillText('AMERICAN',   218, 78);
    ctx.fillText('UNIVERSITY', 218, 112);
    ctx.fillText('IN DUBAI',   218, 148);
    const audMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(cvs), roughness: 0.45,
    });
    const audMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.92, 0.04), audMat);
    audMesh.position.set(3.6, 2.4, -9.78);
    scene.add(audMesh);
  }
  det(1.5, 3.0, 0.35, M.shelf,   5.0, 1.5, -9.8);                 // bookshelf
  det(2.5, 0.02, 1.5, M.mat_doormat, 0, 0.01, 9.0);               // doormat

  // Books
  const bkColors = [0xa02828, 0x2864b4, 0x9e8020, 0x287a2e, 0x782878, 0xc87820, 0x28287a, 0x7a2020];
  bkColors.forEach((c, i) => {
    const bx = 4.7 + (i % 4) * 0.22;
    const by = i < 4 ? 2.40 : 1.55;
    det(0.18, i < 4 ? 0.50 : 0.45, 0.22, mat(c, 0.65), bx, by, -9.7);
  });

  // Wall sconce (left wall)
  det(0.08, 0.35, 0.25, mat(0x2d2d2d, 0.4, 0.5), -9.95, 2.5,  4);
  det(0.10, 0.12, 0.10, mat(0xffeecc, 0.3, 0, 0.6, 0xffeecc), -9.9, 2.7, 4);
  const sconce = new THREE.PointLight(0xffe0a0, 0.8, 8);
  sconce.position.set(-9.6, 2.6, 4);
  scene.add(sconce);

  // ── Sofa — center-left lounge area ───────────────────────────────────────────
  det(2.8, 0.45, 1.2,  mat(0x2a2a2a, 0.85),         -3.0, 0.225, 5.5);  // seat base
  det(2.8, 0.55, 0.25, mat(0x252525, 0.85),          -3.0, 0.525, 6.05); // back rest
  det(0.25, 0.75, 1.2, mat(0x252525, 0.85),          -4.25, 0.375, 5.5); // left arm
  det(0.25, 0.75, 1.2, mat(0x252525, 0.85),          -1.75, 0.375, 5.5); // right arm
  det(2.8, 0.08, 1.2,  mat(0x1e1e1e, 0.90),          -3.0, 0.46, 5.5);  // seat panel

  // ── Coffee table — in front of sofa ──────────────────────────────────────────
  det(1.4, 0.06, 0.75, mat(0x4a2e12, 0.72),          -3.0, 0.38, 4.2);  // top
  det(0.06, 0.38, 0.06, mat(0x3a2208, 0.80),         -3.6, 0.19, 4.5);  // leg FL
  det(0.06, 0.38, 0.06, mat(0x3a2208, 0.80),         -2.4, 0.19, 4.5);  // leg FR
  det(0.06, 0.38, 0.06, mat(0x3a2208, 0.80),         -3.6, 0.19, 3.9);  // leg BL
  det(0.06, 0.38, 0.06, mat(0x3a2208, 0.80),         -2.4, 0.19, 3.9);  // leg BR

  // ── Filing cabinet — right wall near z=-4 (adds visual clutter for hard mode) ─
  det(0.85, 1.2, 0.65, mat(0x4a4a4a, 0.35, 0.65),    8.2, 0.6,  -4.0); // body
  det(0.75, 0.06, 0.55, mat(0x5c5c5c, 0.30, 0.70),   8.2, 1.23, -4.0); // top
  det(0.55, 0.04, 0.04, mat(0x888888, 0.25, 0.80),    8.2, 0.55, -3.73); // handle low
  det(0.55, 0.04, 0.04, mat(0x888888, 0.25, 0.80),    8.2, 0.90, -3.73); // handle high

  // ── Computer monitor — on desk, right of center (clear of easy key at x=0.6) ──
  det(0.05, 0.55, 0.85, mat(0x1a1a1a, 0.40, 0.45),   1.2, 1.355, -6.0); // screen panel
  det(0.02, 0.48, 0.78, mat(0x1c3a5f, 0.50, 0, 0.15, 0x1c3a5f), 1.17, 1.355, -6.0); // screen glow
  det(0.05, 0.08, 0.32, mat(0x1a1a1a, 0.40, 0.45),   1.2, 1.12,  -6.0); // stand neck
  det(0.05, 0.04, 0.55, mat(0x1a1a1a, 0.40, 0.45),   1.2, 1.10,  -5.8); // stand base

  // ── Floor lamp — left side of room ───────────────────────────────────────────
  det(0.30, 0.05, 0.30, mat(0x1a1a1a, 0.50, 0.50),  -6.5, 0.04, -3.0); // base plate
  det(0.07, 1.80, 0.07, mat(0x1a1a1a, 0.50, 0.60),  -6.5, 0.90, -3.0); // pole
  det(0.42, 0.30, 0.42, mat(0xf5e8d0, 0.60, 0.05, 0.25, 0xffe0a0), -6.5, 1.95, -3.0); // shade
  const floorLamp = new THREE.PointLight(0xffe0a0, 0.6, 7);
  floorLamp.position.set(-6.5, 1.85, -3.0);
  scene.add(floorLamp);

  // ── Potted plant — corner near bookshelf ─────────────────────────────────────
  det(0.30, 0.35, 0.30, mat(0x8b4513, 0.80),         6.5, 0.175, -9.0); // pot
  det(0.55, 0.55, 0.55, mat(0x1a4a1a, 0.90),         6.5, 0.625, -9.0); // foliage
  det(0.35, 0.40, 0.35, mat(0x143214, 0.90),         6.5, 0.75,  -9.0); // top

  // ── Side table — right-front area ────────────────────────────────────────────
  det(0.70, 0.06, 0.70, mat(0x5c3a10, 0.72),         6.5, 0.52,  6.5); // top
  det(0.06, 0.52, 0.06, mat(0x3a2208, 0.80),         6.2, 0.26,  6.2); // leg FL
  det(0.06, 0.52, 0.06, mat(0x3a2208, 0.80),         6.8, 0.26,  6.2); // leg FR
  det(0.06, 0.52, 0.06, mat(0x3a2208, 0.80),         6.2, 0.26,  6.8); // leg BL
  det(0.06, 0.52, 0.06, mat(0x3a2208, 0.80),         6.8, 0.26,  6.8); // leg BR

  // ── Whiteboard — hung on right wall ──────────────────────────────────────────
  det(0.04, 1.20, 2.40, mat(0x2c2c2c, 0.55, 0.30),  9.82, 2.2, -2.0); // frame
  det(0.02, 1.05, 2.20, mat(0xf0f0f0, 0.75),         9.80, 2.2, -2.0); // surface
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Interactable objects
// ═══════════════════════════════════════════════════════════════════════════════
const objects   = {};
const pickables = [];    // meshes to raycast against

class Interactable {
  constructor({ id, label, color, pos, scale, onInteract, meshFactory, labelOffset }) {
    this.id        = id;
    this._label    = label;
    this.baseColor = color;
    this.onInteract = onInteract;

    if (meshFactory) {
      this.mesh = meshFactory();
      this.mat  = this.mesh.material;
    } else {
      const geo = new THREE.BoxGeometry(...scale);
      this.mat  = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25 });
      this.mesh = new THREE.Mesh(geo, this.mat);
      this.mesh.position.set(...pos);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
    }
    this.mesh.userData.iid = id;
    scene.add(this.mesh);
    pickables.push(this.mesh);

    // Snapshot initial pose so AI mode can reset an already-played GA puzzle
    this.initPos   = this.mesh.position.clone();
    this.initRot   = this.mesh.rotation.clone();
    this.initColor = this.mat.color ? this.mat.color.getHex() : 0xffffff;

    // CSS2D floating label
    this.div = document.createElement('div');
    this.div.className = 'obj-label';
    this.div.textContent = label;
    this.css2d = new CSS2DObject(this.div);
    const ly = labelOffset ?? ((scale ? scale[1] : 1.0) / 2 + 0.42);
    this.css2d.position.set(0, ly, 0);
    this.mesh.add(this.css2d);
  }

  get label() { return this._label; }

  setLabel(text) {
    this._label = text;
    this.div.textContent = text;
  }

  setColor(hex) {
    this.baseColor = hex;
    this.mat.color.setHex(hex);
    this.mat.emissive.setHex(0x000000);
  }

  resetPose() {
    this.mesh.position.copy(this.initPos);
    this.mesh.rotation.copy(this.initRot);
    if (this.mat.color) this.mat.color.setHex(this.initColor);
  }

  highlight() {
    this.mat.emissive.setHex(0x332200);
    this.div.classList.add('lit');
  }

  unhighlight() {
    this.mat.emissive.setHex(0x000000);
    this.div.classList.remove('lit');
  }

  hide() {
    this.mesh.visible = false;
    this.div.style.display = 'none';
    const i = pickables.indexOf(this.mesh);
    if (i !== -1) pickables.splice(i, 1);
  }

  show() {
    this.mesh.visible = true;
    this.div.style.display = '';
    if (!pickables.includes(this.mesh)) pickables.push(this.mesh);
  }
}

function createObjects() {
  objects.small_key = new Interactable({
    id: 'small_key', label: 'Small Key [E]',
    color: 0xffd700, pos: LEVELS[currentLevel].keyPos, scale: KEY_SCALE,
    onInteract() {
      if (!gs.smallKeyCollected) {
        applyAction('pick_up_small_key');
        objects.small_key.hide();
        toast('Picked up the Small Key.');
      }
    },
  });

  objects.drawer = new Interactable({
    id: 'drawer', label: 'Desk Drawer [LOCKED]',
    color: 0x6e4620, pos: [-0.6, 0.62, -5.15], scale: [0.9, 0.22, 0.55],
    onInteract() {
      if (gs.drawerLocked) {
        if (gs.inventory.has('small_key')) {
          applyAction('unlock_drawer');
          objects.drawer.setLabel('Desk Drawer [OPEN]');
          objects.drawer.setColor(0xa06e37);
          objects.cabinet_key.show();
          toast('Drawer unlocked!  Cabinet Key found inside.');
        } else { toast('Locked — you need a small key.'); }
      } else { toast('Already open.'); }
    },
  });

  objects.cabinet_key = new Interactable({
    id: 'cabinet_key', label: 'Cabinet Key [E]',
    color: 0x3296ff, pos: [-0.6, 0.74, -5.15], scale: [0.25, 0.06, 0.45],
    onInteract() {
      if (!gs.cabinetKeyCollected) {
        applyAction('pick_up_cabinet_key');
        objects.cabinet_key.hide();
        toast('Picked up the Cabinet Key.');
      }
    },
  });
  objects.cabinet_key.hide();

  objects.cabinet = new Interactable({
    id: 'cabinet', label: 'Cabinet [LOCKED]',
    color: 0x50321e, pos: [8.5, 1.5, 2.05], scale: [1.45, 2.85, 0.18],
    onInteract() {
      if (gs.cabinetLocked) {
        if (gs.inventory.has('cabinet_key')) {
          applyAction('unlock_cabinet');
          objects.cabinet.setLabel('Cabinet [OPEN]');
          objects.cabinet.setColor(0x8c5f2d);
          objects.code_paper.show();
          toast("Cabinet unlocked!  There's a paper inside...");
        } else { toast('Locked — you need the cabinet key.'); }
      } else { toast('Already open.'); }
    },
  });

  objects.code_paper = new Interactable({
    id: 'code_paper', label: 'Paper: code 4821 [E]',
    // Vertical (0.5 tall) and in front of the cabinet door so raycasts land on it
    color: 0xf5f0dc, pos: [8.5, 2.1, 1.88], scale: [0.35, 0.5, 0.02],
    onInteract() {
      if (!gs.codeKnown) {
        applyAction('read_code');
        toast('Noted the safe code: 4821');
      } else { toast('You already know the code: 4821'); }
    },
  });
  objects.code_paper.hide();

  objects.safe = new Interactable({
    id: 'safe', label: 'Safe [LOCKED]',
    color: 0x2d2d2d, pos: [-8.5, 1.5, -0.72], scale: [1.45, 1.45, 0.18],
    onInteract() {
      if (gs.safeLocked) {
        if (gs.codeKnown) {
          applyAction('enter_code_safe');
          objects.safe.setLabel('Safe [OPEN]');
          objects.safe.setColor(0x646464);
          objects.master_key.show();
          toast('Safe opened!  Found the Master Key!');
        } else { toast('Locked — you need the safe code.'); }
      } else { toast('Already open.'); }
    },
  });

  objects.master_key = new Interactable({
    id: 'master_key', label: 'Master Key [E]',
    // Vertical (0.55 tall) so the player's horizontal ray hits it easily
    color: 0xffc800, pos: [-8.5, 1.65, -0.52], scale: [0.28, 0.55, 0.07],
    onInteract() {
      if (!gs.masterKeyCollected) {
        applyAction('pick_up_master_key');
        objects.master_key.hide();
        toast('Picked up the Master Key.');
      }
    },
  });
  objects.master_key.hide();

  objects.exit_door = new Interactable({
    id: 'exit_door', label: 'EXIT [LOCKED]',
    color: 0xc83232, pos: [0, 1.5, 10.08], scale: [2.8, 3.0, 0.18],
    onInteract() {
      if (gs.exitLocked) {
        if (gs.inventory.has('master_key')) {
          applyAction('unlock_exit');
          objects.exit_door.setLabel('EXIT [OPEN] — Press E to escape!');
          toast('Exit unlocked!  Press E again to escape!');
        } else { toast('Locked — you need the master key.'); }
      } else { triggerWin(); }
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  State transitions  (mirrors Python actions.py)
// ═══════════════════════════════════════════════════════════════════════════════
function applyAction(name) {
  switch (name) {
    case 'pick_up_small_key':
      gs.smallKeyCollected = true; gs.inventory.add('small_key');
      break;

    case 'unlock_drawer':
      gs.drawerLocked = false;
      pushAnim(objects.drawer.mesh, 0.55, (m, t) => {
        m.position.z = -5.15 + t * 0.55;
      }, () => {
        // Slide opened — remove from raycaster so cabinet_key is reachable
        const i = pickables.indexOf(objects.drawer.mesh);
        if (i !== -1) pickables.splice(i, 1);
      });
      break;

    case 'pick_up_cabinet_key':
      gs.cabinetKeyCollected = true; gs.inventory.add('cabinet_key');
      break;

    case 'unlock_cabinet':
      gs.cabinetLocked = false;
      pushAnim(objects.cabinet.mesh, 0.65, (m, t) => {
        const ang = -t * Math.PI * 0.55;                 // swing toward player
        const px = 7.77, pz = 2.05, dx = 0.73, dz = 0;
        m.position.x = px + dx * Math.cos(ang) - dz * Math.sin(ang);
        m.position.z = pz + dx * Math.sin(ang) + dz * Math.cos(ang);
        m.rotation.y = ang;
      }, () => {
        const i = pickables.indexOf(objects.cabinet.mesh);
        if (i !== -1) pickables.splice(i, 1);
      });
      break;

    case 'read_code':
      gs.codeKnown = true;
      break;

    case 'enter_code_safe':
      gs.safeLocked = false;
      pushAnim(objects.safe.mesh, 0.65, (m, t) => {
        const ang = -t * Math.PI * 0.55;
        const px = -7.77, pz = -0.72, dx = -0.73, dz = 0;
        m.position.x = px + dx * Math.cos(ang) - dz * Math.sin(ang);
        m.position.z = pz + dx * Math.sin(ang) + dz * Math.cos(ang);
        m.rotation.y = ang;
      }, () => {
        const i = pickables.indexOf(objects.safe.mesh);
        if (i !== -1) pickables.splice(i, 1);
      });
      break;

    case 'pick_up_master_key':
      gs.masterKeyCollected = true; gs.inventory.add('master_key');
      break;

    case 'unlock_exit':
      gs.exitLocked = false;
      pushAnim(objects.exit_door.mesh, 0.9, (m, t) => {
        m.material.color.setRGB(0.78 - t * 0.58, 0.20 + t * 0.58, 0.20 + t * 0.10);
        m.position.x = -t * 0.8;
        m.rotation.y = t * Math.PI * 0.5;
      });
      break;
  }
  updateHUD();
}

function syncToState() {
  if (gs.smallKeyCollected && objects.small_key.mesh.visible)   objects.small_key.hide();
  if (!gs.drawerLocked) {
    objects.drawer.setLabel('Desk Drawer [OPEN]');
    objects.drawer.setColor(0xa06e37);
    if (!gs.cabinetKeyCollected) objects.cabinet_key.show();
  }
  if (gs.cabinetKeyCollected && objects.cabinet_key.mesh.visible) objects.cabinet_key.hide();
  if (!gs.cabinetLocked) {
    objects.cabinet.setLabel('Cabinet [OPEN]');
    objects.cabinet.setColor(0x8c5f2d);
    if (!gs.codeKnown) objects.code_paper.show();
  }
  if (!gs.safeLocked) {
    objects.safe.setLabel('Safe [OPEN]');
    objects.safe.setColor(0x646464);
    if (!gs.masterKeyCollected) objects.master_key.show();
  }
  if (gs.masterKeyCollected && objects.master_key.mesh.visible) objects.master_key.hide();
  if (!gs.exitLocked) {
    objects.exit_door.setLabel('EXIT [OPEN] — Press E to escape!');
  }
  updateHUD();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Player movement
// ═══════════════════════════════════════════════════════════════════════════════
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

function blocked(x, z) {
  if (x < -9.3 || x > 9.3)  return true;
  if (z < -9.5)              return true;
  if (z > 9.5 && (x < -1.4 || x > 1.4)) return true;
  if (z > 10.2)              return true;
  // Desk footprint + margin
  if (x > -2.3 && x < 2.3 && z > -7.4 && z < -4.6) return true;
  // Cabinet (right wall)
  if (x > 7.45 && z > 1.6 && z < 4.4)  return true;
  // Safe (left wall)
  if (x < -7.45 && z > -1.2 && z < 1.2) return true;
  // Sofa (center-left lounge)
  if (x > -4.55 && x < -1.45 && z > 4.85 && z < 6.45) return true;
  // Filing cabinet (right wall, near z=-4)
  if (x > 7.55 && z > -4.55 && z < -3.45) return true;
  return false;
}

let prevTime = performance.now();

function processMovement() {
  if (gameMode !== 'human' || !controls.isLocked) return;

  const now   = performance.now();
  const delta = Math.min((now - prevTime) / 1000, 0.05);
  prevTime = now;

  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();

  // Derive right directly from camera quaternion so it's always correct regardless
  // of how the camera has been rotated (fixes mirrored strafe with 180° Y rotation).
  const rgt = new THREE.Vector3(1, 0, 0);
  rgt.applyQuaternion(camera.quaternion);
  rgt.y = 0; rgt.normalize();

  const move = new THREE.Vector3();
  if (keys['KeyW']) move.addScaledVector(fwd,  PLAYER_SPEED * delta);
  if (keys['KeyS']) move.addScaledVector(fwd, -PLAYER_SPEED * delta);
  if (keys['KeyA']) move.addScaledVector(rgt, -PLAYER_SPEED * delta);
  if (keys['KeyD']) move.addScaledVector(rgt,  PLAYER_SPEED * delta);

  const obj = controls.getObject();
  if (!blocked(obj.position.x + move.x, obj.position.z)) obj.position.x += move.x;
  if (!blocked(obj.position.x, obj.position.z + move.z)) obj.position.z += move.z;
  obj.position.y = PLAYER_HEIGHT;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Raycasting — hover highlight & interact
// ═══════════════════════════════════════════════════════════════════════════════
const raycaster   = new THREE.Raycaster();
const screenCentre = new THREE.Vector2(0, 0);
let   hoveredObj  = null;

function checkHover() {
  if (gameMode !== 'human' || !controls.isLocked) {
    if (hoveredObj) { hoveredObj.unhighlight(); hoveredObj = null; }
    hidePrompt();
    return;
  }

  raycaster.setFromCamera(screenCentre, camera);
  const hits = raycaster.intersectObjects(pickables);

  if (hits.length && hits[0].distance < INTERACT_RANGE) {
    const iid = hits[0].object.userData.iid;
    const obj = objects[iid] || gaObjects[iid];
    if (obj && obj !== hoveredObj) {
      if (hoveredObj) hoveredObj.unhighlight();
      obj.highlight();
      hoveredObj = obj;
    }
    showPrompt(hoveredObj.label);
  } else {
    if (hoveredObj) { hoveredObj.unhighlight(); hoveredObj = null; }
    hidePrompt();
  }
}

function doInteract() {
  if (gameMode !== 'human' || !controls.isLocked || complete) return;
  if (hoveredObj) hoveredObj.onInteract();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AI agent
// ═══════════════════════════════════════════════════════════════════════════════
let agentMesh      = null;
let agentTargetPos = new THREE.Vector3();
const aiCamPos     = new THREE.Vector3();
let aiSessionId    = 0;   // incremented on every reset — async flows compare to abort

function removeAgent() {
  if (!agentMesh) return;
  // Remove label's DOM element explicitly
  agentMesh.traverse(obj => {
    if (obj.element && obj.element.parentNode) {
      obj.element.parentNode.removeChild(obj.element);
    }
  });
  scene.remove(agentMesh);
  agentMesh = null;
}

function spawnAgent() {
  removeAgent();

  const geo = new THREE.BoxGeometry(0.5, 1.7, 0.5);
  const mat_ = new THREE.MeshStandardMaterial({
    color: 0xff7020, roughness: 0.45, metalness: 0.15,
    emissive: 0xff7020, emissiveIntensity: 0.08,
  });
  agentMesh = new THREE.Mesh(geo, mat_);
  agentMesh.position.copy(AREA_POS.start_area);
  agentMesh.position.y = 0.85;
  agentMesh.castShadow = true;
  scene.add(agentMesh);

  agentTargetPos.copy(agentMesh.position);

  const div = document.createElement('div');
  div.className = 'agent-label';
  div.textContent = 'AI Agent';
  const lbl = new CSS2DObject(div);
  lbl.position.set(0, 1.3, 0);
  agentMesh.add(lbl);
}

function updateAgent(delta) {
  if (!agentMesh) return;
  agentMesh.position.lerp(agentTargetPos, Math.min(1, 5 * delta));
  // Smooth camera follow
  const tgt = new THREE.Vector3(
    agentMesh.position.x,
    agentMesh.position.y + 5.5,
    agentMesh.position.z - 8,
  );
  camera.position.lerp(tgt, Math.min(1, 4 * delta));
  camera.lookAt(agentMesh.position.x, agentMesh.position.y + 0.85, agentMesh.position.z);
}

async function startAIMode() {
  if (gameMode === 'ai') return;
  gameMode = 'ai';
  const mySession = aiSessionId;     // snapshot — if user resets, this won't match
  controls.unlock();

  if (ceilingMesh) ceilingMesh.visible = false;   // top-down view for AI

  setModeBadge('ai');
  setActionLabel(`Running ${selAlgo}…`);
  document.getElementById('metrics-card').classList.add('hidden');

  try {
    const inGA = gaActive && gaResult && gaResult.puzzle;
    const res  = await fetch(inGA ? '/api/solve_ga' : '/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inGA
        ? { puzzle: gaResult.puzzle, algorithm: selAlgo }
        : { algorithm: selAlgo }),
    });
    const data = await res.json();

    // Abort if the user pressed R / switched difficulty while the fetch was in flight
    if (mySession !== aiSessionId || gameMode !== 'ai') return;

    if (!data.plan || data.plan.length === 0) {
      setActionLabel('No solution found!');
      return;
    }

    showMetrics(data.stats);

    if (inGA) {
      // Reset GA runtime state so the AI plays from a clean slate
      _anims.length = 0;
      gaStagesState = gaStagesState.map(() =>
        ({ spotOpen: false, keyTaken: false, lockOpen: false }));
      gs.inventory.clear();
      updateHUD();

      const N = gaStagesState.length;
      for (let i = 0; i < N; i++) {
        const isFinal = (i === N - 1);
        const spot = gaObjects[`gaSpot_${i}`];
        const key  = gaObjects[`gaKey_${i}`];
        const lock = gaObjects[`gaLock_${i}`];
        if (spot) {
          spot.resetPose();
          spot.setLabel(`${spot._spotDef.label} [search]`);
          spot.show();
          if (!pickables.includes(spot.mesh)) pickables.push(spot.mesh);
        }
        if (key)  { key.resetPose(); key.hide(); }
        if (lock) {
          lock.resetPose();
          lock.setLabel(isFinal ? 'EXIT [LOCKED]' : `${lock._lockDef.label} ${i + 1} [LOCKED]`);
          lock.show();
        }
      }
      spawnAgent();
      await delay(600);
      if (mySession !== aiSessionId) return;
      await executePlanGA(data.plan, mySession);
    } else {
      gs = freshState();
      resetVisuals();
      spawnAgent();
      await delay(600);
      if (mySession !== aiSessionId) return;
      await executePlan(data.plan, mySession);
    }

  } catch (err) {
    setActionLabel('Server error — is Flask running?');
    console.error(err);
  }
}

async function executePlanGA(plan, mySession) {
  const N = gaStagesState.length;

  for (const actionName of plan) {
    if (mySession !== aiSessionId) return;
    setActionLabel(actionName.replaceAll('_', ' '));

    if (actionName.startsWith('move_to_')) {
      const area = actionName.slice('move_to_'.length);
      const dest = AREA_POS[area];
      if (dest) agentTargetPos.set(dest.x, 0.85, dest.z);
      await delay(STEP_DELAY_MS);
      continue;
    }

    // Pick-up action — either 'pick_up_key_<i>' or 'pick_up_master_key'
    let idx = -1, isUnlock = false;
    if (actionName === 'pick_up_master_key')          { idx = N - 1; }
    else if (actionName === 'unlock_exit')            { idx = N - 1; isUnlock = true; }
    else if (actionName.startsWith('pick_up_key_'))   { idx = parseInt(actionName.slice('pick_up_key_'.length), 10); }
    else if (actionName.startsWith('unlock_lock_'))   { idx = parseInt(actionName.slice('unlock_lock_'.length), 10); isUnlock = true; }

    if (idx < 0) { await delay(STEP_DELAY_MS); continue; }

    if (isUnlock) {
      gaUnlockLock(idx);
    } else {
      if (!gaStagesState[idx].spotOpen) gaOpenSpot(idx);
      await delay(750);
      if (mySession !== aiSessionId) return;
      gaPickupKey(idx);
    }
    await delay(STEP_DELAY_MS);
  }
  if (mySession !== aiSessionId) return;
  triggerWin();
  setActionLabel('DONE — Escaped!');
}

async function executePlan(plan, mySession) {
  for (const actionName of plan) {
    if (mySession !== aiSessionId) return;
    applyAction(actionName);
    syncToState();
    setActionLabel(actionName.replaceAll('_', ' '));

    if (actionName.startsWith('move_to_')) {
      const area = actionName.slice('move_to_'.length);
      const dest = AREA_POS[area];
      if (dest) agentTargetPos.set(dest.x, 0.85, dest.z);
    }

    await delay(STEP_DELAY_MS);
  }
  if (mySession !== aiSessionId) return;
  triggerWin();
  setActionLabel('DONE — Escaped!');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════════════════════
//  Win & Reset
// ═══════════════════════════════════════════════════════════════════════════════
function triggerWin() {
  if (complete) return;
  complete = true;
  const sub = gameMode === 'ai' ? `Solved with ${selAlgo}`
            : gaActive ? `Escaped GA puzzle (${gaStagesState.length} stages)`
            : 'Human escape!';
  document.getElementById('win-sub').textContent = sub;
  document.getElementById('win-overlay').classList.remove('hidden');
  controls.unlock();
}

function resetGame() {
  complete  = false;
  gameMode  = 'human';
  gs        = freshState();
  aiSessionId++;                           // invalidate any in-flight AI async work

  removeAgent();

  controls.getObject().position.set(0, PLAYER_HEIGHT, -7.5);
  camera.quaternion.setFromEuler(new THREE.Euler(0, Math.PI, 0, 'YXZ'));

  if (ceilingMesh) ceilingMesh.visible = true;

  _anims.length = 0;            // cancel any in-flight animations
  clearGAPuzzle();
  resetVisuals();
  updateHUD();
  setModeBadge('human');
  setActionLabel('');
  document.getElementById('win-overlay').classList.add('hidden');
  document.getElementById('metrics-card').classList.add('hidden');
  document.getElementById('ga-card').classList.add('hidden');
  document.getElementById('benchmark-card').classList.add('hidden');
  document.getElementById('start-overlay').classList.remove('hidden');
}

function resetVisuals() {
  // Re-show every classic interactable and reset its pose (in case a GA puzzle
  // hid them, or a prior play animated them open)
  ['small_key', 'drawer', 'cabinet', 'safe', 'exit_door'].forEach(k => {
    objects[k].show();
    objects[k].resetPose();
  });

  objects.small_key.mesh.position.set(...LEVELS[currentLevel].keyPos);
  objects.small_key.setColor(0xffd700);
  objects.drawer.setLabel('Desk Drawer [LOCKED]');   objects.drawer.setColor(0x6e4620);
  objects.cabinet_key.hide();                        objects.cabinet_key.resetPose();
  objects.cabinet.setLabel('Cabinet [LOCKED]');      objects.cabinet.setColor(0x50321e);
  objects.code_paper.hide();                         objects.code_paper.resetPose();
  objects.safe.setLabel('Safe [LOCKED]');            objects.safe.setColor(0x2d2d2d);
  objects.master_key.hide();                         objects.master_key.resetPose();
  objects.exit_door.setLabel('EXIT [LOCKED]');       objects.exit_door.setColor(0xc83232);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GA dynamic puzzle — hidden keys in real containers + animated lock fixtures
// ═══════════════════════════════════════════════════════════════════════════════
function clearGAPuzzle() {
  for (const id in gaObjects) {
    const o = gaObjects[id];
    if (o.css2d) o.mesh.remove(o.css2d);
    scene.remove(o.mesh);
    const i = pickables.indexOf(o.mesh);
    if (i !== -1) pickables.splice(i, 1);
  }
  Object.keys(gaObjects).forEach(k => delete gaObjects[k]);
  gaStagesState = [];
  gaActive = false;
  _anims.length = 0;
}

function hideHardcodedObjects() {
  ['small_key', 'drawer', 'cabinet_key', 'cabinet',
   'code_paper', 'safe', 'master_key', 'exit_door'].forEach(k => {
    if (objects[k]) objects[k].hide();
  });
}

// Pick `count` distinct hiding spots from an area's pool (falls back to reuse if short)
function pickSpots(area, count) {
  const pool = HIDING_SPOTS[area] || HIDING_SPOTS.desk_area;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picks = [];
  for (let i = 0; i < count; i++) picks.push(shuffled[i % shuffled.length]);
  return picks;
}

function buildGAPuzzle(stages) {
  clearGAPuzzle();
  hideHardcodedObjects();
  gaActive      = true;
  gaStagesState = stages.map(() => ({ spotOpen: false, keyTaken: false, lockOpen: false }));

  // Count items/locks per area, then pick that many distinct hiding spots per area
  const areaItemCounts = {}, areaLockCounts = {};
  stages.forEach(s => {
    areaItemCounts[s.item_area] = (areaItemCounts[s.item_area] || 0) + 1;
    areaLockCounts[s.lock_area] = (areaLockCounts[s.lock_area] || 0) + 1;
  });
  const areaSpots = {}, areaSpotIdx = {};
  for (const a in areaItemCounts) {
    areaSpots[a]    = pickSpots(a, areaItemCounts[a]);
    areaSpotIdx[a]  = 0;
  }
  const lockSlot = {};

  stages.forEach((stage, i) => {
    const isFinal  = (i === stages.length - 1);
    const spotDef  = areaSpots[stage.item_area][areaSpotIdx[stage.item_area]++];
    const lockDef  = LOCK_FIXTURES[stage.lock_area] || LOCK_FIXTURES.exit_area;
    const lSlot    = lockSlot[stage.lock_area] = (lockSlot[stage.lock_area] ?? -1) + 1;

    // ── Hiding spot (container) ────────────────────────────────────────────────
    const spotId = `gaSpot_${i}`;
    const spotObj = new Interactable({
      id: spotId,
      label: `${spotDef.label} [search]`,
      color: 0,
      meshFactory: spotDef.make,
      labelOffset: 0.8,
      onInteract() { gaOpenSpot(i); },
    });
    spotObj._spotDef = spotDef;
    gaObjects[spotId] = spotObj;

    // ── Hidden key inside the spot ─────────────────────────────────────────────
    const keyId = `gaKey_${i}`;
    const keyObj = new Interactable({
      id: keyId,
      label: `Key ${i + 1} [E]`,
      color: 0xffd700,
      pos: spotDef.keyPos,
      scale: [0.22, 0.34, 0.08],
      onInteract() { gaPickupKey(i); },
    });
    keyObj.mat.emissive.setHex(0x664400);
    keyObj.mat.emissiveIntensity = 0.4;
    gaObjects[keyId] = keyObj;
    keyObj.hide();    // hidden until the spot is searched

    // ── Lock fixture ───────────────────────────────────────────────────────────
    const lockId  = `gaLock_${i}`;
    const lockMesh = lockDef.make(lSlot);
    const lockObj = new Interactable({
      id: lockId,
      label: isFinal ? 'EXIT [LOCKED]' : `${lockDef.label} ${i + 1} [LOCKED]`,
      color: 0,
      meshFactory: () => lockMesh,
      labelOffset: isFinal ? 1.6 : 0.3,
      onInteract() { gaUnlockLock(i); },
    });
    lockObj._lockDef = lockDef;
    gaObjects[lockId] = lockObj;
  });

  updateHUD();
}

function gaOpenSpot(i) {
  const st = gaStagesState[i];
  if (st.spotOpen) { toast('Already searched.'); return; }
  if (i > 0 && !gaStagesState[i - 1].lockOpen) {
    toast(`Open Lock ${i} first.`);
    return;
  }

  st.spotOpen = true;
  const spotObj = gaObjects[`gaSpot_${i}`];
  const spotDef = spotObj._spotDef;
  spotObj.setLabel(`${spotDef.label} [searched]`);

  pushAnim(spotObj.mesh, 0.65, spotDef.openAnim, () => {
    // Opened container still renders, but should not block raycasts to the key
    const idx = pickables.indexOf(spotObj.mesh);
    if (idx !== -1) pickables.splice(idx, 1);
    gaObjects[`gaKey_${i}`].show();
    toast(`Found Key ${i + 1} in the ${spotDef.label.toLowerCase()}!`);
  });
}

function gaPickupKey(i) {
  const st = gaStagesState[i];
  if (!st.spotOpen) { toast('Search the container first.'); return; }
  if (st.keyTaken)  return;

  st.keyTaken = true;
  gs.inventory.add(`ga_key_${i}`);
  gaObjects[`gaKey_${i}`].hide();
  toast(`Picked up Key ${i + 1}.`);
  updateHUD();
}

function gaUnlockLock(i) {
  const st      = gaStagesState[i];
  const isFinal = (i === gaStagesState.length - 1);

  if (st.lockOpen) {
    if (isFinal) triggerWin();
    return;
  }
  if (!st.keyTaken) {
    toast(`You need Key ${i + 1}.`);
    return;
  }

  st.lockOpen = true;
  const obj = gaObjects[`gaLock_${i}`];
  obj.setLabel(isFinal ? 'EXIT [OPEN] — press E to escape!' : `Lock ${i + 1} [OPEN]`);

  pushAnim(obj.mesh, isFinal ? 0.9 : 0.6, obj._lockDef.openAnim);

  if (isFinal) {
    toast('Exit unlocked! Press E again to escape.');
  } else {
    toast(`Lock ${i + 1} unlocked.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HUD helpers
// ═══════════════════════════════════════════════════════════════════════════════
function updateHUD() {
  const list = document.getElementById('inv-list');
  if (gs.inventory.size === 0) {
    list.innerHTML = '<span class="inv-empty">Empty</span>';
  } else {
    const labels = { small_key: 'Small Key', cabinet_key: 'Cabinet Key', master_key: 'Master Key' };
    list.innerHTML = [...gs.inventory].map(k => {
      if (labels[k]) return `<div class="inv-item">${labels[k]}</div>`;
      if (k.startsWith('ga_key_')) {
        const n = parseInt(k.slice('ga_key_'.length), 10) + 1;
        return `<div class="inv-item">Key ${n}</div>`;
      }
      return `<div class="inv-item">${k}</div>`;
    }).join('');
  }
}

let _toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.opacity = '1';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.classList.add('hidden'), 320);
  }, 2800);
}

function showPrompt(text) {
  const bar = document.getElementById('prompt-bar');
  document.getElementById('prompt-text').textContent = text;
  bar.classList.remove('hidden');
}
function hidePrompt() {
  document.getElementById('prompt-bar').classList.add('hidden');
}

function setActionLabel(text) {
  const bar = document.getElementById('action-bar');
  document.getElementById('action-text').textContent = text;
  bar.classList.toggle('hidden', !text);
}

function setModeBadge(mode) {
  const b = document.getElementById('mode-badge');
  if (mode === 'ai') {
    b.textContent = `AI MODE — ${selAlgo}`;
    b.className = 'badge badge-ai';
  } else {
    b.textContent = 'HUMAN MODE';
    b.className = 'badge badge-human';
  }
}

function showMetrics(stats) {
  const card = document.getElementById('metrics-card');
  document.getElementById('metrics-body').innerHTML = `
    <div class="metric-row"><span class="metric-label">Algorithm</span>  <span class="metric-value">${stats.algorithm}</span></div>
    <hr class="metric-divider">
    <div class="metric-row"><span class="metric-label">Nodes expanded</span><span class="metric-value">${stats.nodes_expanded}</span></div>
    <div class="metric-row"><span class="metric-label">Plan length</span>   <span class="metric-value">${stats.plan_length}</span></div>
    <div class="metric-row"><span class="metric-label">Time</span>          <span class="metric-value">${stats.time_ms} ms</span></div>
  `;
  card.classList.remove('hidden');
}

function showGAPanel(stats, puzzle) {
  const card = document.getElementById('ga-card');
  const body = document.getElementById('ga-body');
  if (!card || !body) return;

  body.innerHTML = `
    <div class="metric-row"><span class="metric-label">Difficulty</span>    <span class="metric-value">${stats.difficulty}</span></div>
    <div class="metric-row"><span class="metric-label">Generations</span>   <span class="metric-value">${stats.generations}</span></div>
    <div class="metric-row"><span class="metric-label">Population</span>    <span class="metric-value">${stats.population_size}</span></div>
    <hr class="metric-divider">
    <div class="metric-row"><span class="metric-label">Best fitness</span>  <span class="metric-value">${stats.best_fitness}</span></div>
    <div class="metric-row"><span class="metric-label">Plan length</span>   <span class="metric-value">${stats.plan_length} steps</span></div>
    <div class="metric-row"><span class="metric-label">Nodes expanded</span><span class="metric-value">${stats.nodes_expanded}</span></div>
    <div class="metric-row"><span class="metric-label">Stages</span>        <span class="metric-value">${stats.num_stages}</span></div>
    <div class="metric-row"><span class="metric-label">Found at gen</span>  <span class="metric-value">${stats.generation_found}</span></div>
    <div class="metric-row"><span class="metric-label">GA time</span>       <span class="metric-value">${stats.time_ms} ms</span></div>
  `;

  // Evolved puzzle chain
  const struct = document.getElementById('ga-structure');
  if (struct && puzzle && puzzle.stages) {
    const chain = puzzle.stages.map((s, i) => {
      const area = s.lock_area.replace('_area', '');
      return `<span>${area}</span>`;
    }).join('<span class="ga-stage-arrow">→</span>');
    struct.innerHTML = `start <span class="ga-stage-arrow">→</span> ${chain}`;
  }

  drawFitnessChart(stats.fitness_history || []);
  card.classList.remove('hidden');
}

function drawFitnessChart(history) {
  const cvs = document.getElementById('ga-chart');
  if (!cvs || !history.length) return;
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;
  ctx.clearRect(0, 0, W, H);

  const pad = 18;
  const maxF = Math.max(...history, 1);
  const minF = Math.min(...history, 0);
  const span = Math.max(1, maxF - minF);

  // Grid (two faint horizontal lines)
  ctx.strokeStyle = 'rgba(255, 200, 80, 0.08)';
  ctx.lineWidth = 1;
  for (let k = 0; k <= 2; k++) {
    const y = pad + (H - 2 * pad) * (k / 2);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - 4, y); ctx.stroke();
  }

  // Fitness line
  ctx.strokeStyle = '#ffc840';
  ctx.lineWidth = 2;
  ctx.beginPath();
  history.forEach((f, i) => {
    const x = pad + (W - pad - 4) * (i / Math.max(1, history.length - 1));
    const y = H - pad - (H - 2 * pad) * ((f - minF) / span);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Labels
  ctx.fillStyle = '#7a7088';
  ctx.font = '9px "Segoe UI", sans-serif';
  ctx.fillText(maxF.toFixed(0), 2, pad + 4);
  ctx.fillText(minF.toFixed(0), 2, H - pad + 4);
  ctx.fillText(`gen 1`, pad, H - 3);
  ctx.textAlign = 'right';
  ctx.fillText(`gen ${history.length}`, W - 4, H - 3);
  ctx.textAlign = 'left';
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Input
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  switch (e.code) {
    case 'KeyE':
      doInteract();
      break;

    case 'Tab':
      e.preventDefault();
      if (gameMode === 'human') startAIMode();
      else resetGame();
      break;

    case 'KeyR':
      resetGame();
      break;

    case 'Digit1': setAlgo('BFS'); break;
    case 'Digit2': setAlgo('DFS'); break;
    case 'Digit3': setAlgo('UCS'); break;
    case 'Digit4': setAlgo('A*');  break;

    case 'Escape':
      if (controls.isLocked) controls.unlock();
      break;
  }
});

function setAlgo(name) {
  selAlgo = name;
  document.querySelectorAll('.algo-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.algo === name);
  });
  setModeBadge(gameMode);
}

document.querySelectorAll('.algo-btn').forEach(b => {
  b.addEventListener('click', () => setAlgo(b.dataset.algo));
});

// ── Benchmark: run all four algorithms on the current GA puzzle ────────────────
async function benchmarkAll() {
  if (!gaActive || !gaResult || !gaResult.puzzle) {
    toast('Benchmark needs an active GA puzzle.');
    return;
  }
  const btn = document.getElementById('benchmark-btn');
  btn.disabled = true;
  btn.textContent = 'Running…';

  const algos = ['BFS', 'DFS', 'UCS', 'A*'];
  try {
    const responses = await Promise.all(algos.map(algo =>
      fetch('/api/solve_ga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzle: gaResult.puzzle, algorithm: algo }),
      }).then(r => r.json())
    ));

    const rows = responses.map((data, i) => ({
      algo:  algos[i],
      nodes: data.stats ? data.stats.nodes_expanded : 0,
      plan:  data.stats ? data.stats.plan_length   : 0,
      time:  data.stats ? data.stats.time_ms       : 0,
    }));

    // Highlight best/worst per column (lower = better for nodes).
    // Time is not colored — sub-ms measurements are interpreter noise.
    const minOf = k => Math.min(...rows.map(r => r[k]).filter(v => v > 0));
    const maxOf = k => Math.max(...rows.map(r => r[k]));
    const mins = { nodes: minOf('nodes'), plan: minOf('plan') };
    const maxs = { nodes: maxOf('nodes'), plan: maxOf('plan') };

    const cell = (v, key) => {
      const cls = v === mins[key] ? 'winner' : (v === maxs[key] && mins[key] !== maxs[key]) ? 'bad' : '';
      return `<td class="${cls}">${v}</td>`;
    };

    const html = `
      <table>
        <thead>
          <tr><th>Algo</th><th>Nodes</th><th>Plan</th><th>Time(ms)</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${r.algo}</td>
              ${cell(r.nodes, 'nodes')}
              ${cell(r.plan,  'plan')}
              <td>${r.time}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="card-hint" style="margin-top:8px;">
        <span style="color:var(--success)">green</span> = best,
        <span style="color:var(--danger)">red</span> = worst
      </div>
    `;

    document.getElementById('benchmark-body').innerHTML = html;
    document.getElementById('benchmark-card').classList.remove('hidden');
  } catch (err) {
    toast('Benchmark failed — is Flask running?');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Benchmark All 4';
  }
}

document.getElementById('benchmark-btn').addEventListener('click', benchmarkAll);

// ── Difficulty levels ──────────────────────────────────────────────────────────
function setLevel(name) {
  currentLevel   = name;
  INTERACT_RANGE = LEVELS[name].interactRange;
  gaResult = null;
  const statusEl = document.getElementById('ga-status');
  if (statusEl) statusEl.textContent = '';
  document.querySelectorAll('.level-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.level === name);
  });
  const hintEl = document.getElementById('level-hint');
  if (hintEl) hintEl.textContent = LEVELS[name].hint;
  const lb = document.getElementById('level-badge');
  if (lb) {
    lb.textContent = LEVELS[name].label.toUpperCase();
    lb.className = `badge badge-level${name !== 'easy' ? ' ' + name : ''}`;
  }
  resetGame();
}

document.querySelectorAll('.level-btn').forEach(b => {
  b.addEventListener('click', () => setLevel(b.dataset.level));
});

// Start overlay — click to lock pointer (calls GA first to generate the puzzle)
document.getElementById('start-btn').addEventListener('click', async () => {
  const btn      = document.getElementById('start-btn');
  const statusEl = document.getElementById('ga-status');
  btn.disabled = true;
  if (statusEl) statusEl.textContent = 'Generating puzzle with GA…';

  // Defensive: always clear any lingering AI agent/state when entering a new session
  removeAgent();
  aiSessionId++;
  gameMode = 'human';
  complete = false;
  if (ceilingMesh) ceilingMesh.visible = true;

  try {
    const res  = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: currentLevel }),
    });
    const data = await res.json();
    if (!data.error && data.puzzle && data.ga_stats) {
      gaResult = data;
      // Build the full GA-evolved dependency chain in the room
      buildGAPuzzle(data.puzzle.stages);
      showGAPanel(data.ga_stats, data.puzzle);
    }
  } catch (err) {
    console.warn('GA unavailable — using default key placement.');
  }

  if (statusEl) statusEl.textContent = '';
  btn.disabled = false;
  document.getElementById('start-overlay').classList.add('hidden');
  controls.lock();
});

controls.addEventListener('unlock', () => {
  if (!complete && gameMode === 'human')
    document.getElementById('start-overlay').classList.remove('hidden');
});

document.getElementById('win-reset').addEventListener('click', resetGame);

// ═══════════════════════════════════════════════════════════════════════════════
//  Animation loop
// ═══════════════════════════════════════════════════════════════════════════════
let lastFrame = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now   = performance.now();
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  processMovement();
  checkHover();
  stepAnims(delta);

  // Defensive: the AI agent should only exist during AI mode (or the win scene).
  if (agentMesh && gameMode !== 'ai' && !complete) removeAgent();
  if (agentMesh) updateAgent(delta);

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Bootstrap
// ═══════════════════════════════════════════════════════════════════════════════
setupLighting();
buildRoom();
createObjects();
updateHUD();
// Face into the room (+z) on first load
camera.quaternion.setFromEuler(new THREE.Euler(0, Math.PI, 0, 'YXZ'));
animate();
