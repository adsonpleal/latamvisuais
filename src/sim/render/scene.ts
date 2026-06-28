// Build the tra_fild world as a three.js scene graph from the extracted assets.
// Everything is assembled in RO coordinate space and parented to a root group
// scaled (1,-1,1) so RO's "down is up" becomes three.js Y-up. Materials are
// double-sided (the flip inverts winding) and magenta-keyed transparency is
// handled by the PNGs' alpha + alphaTest.

import {
  AmbientLight,
  BufferGeometry,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import { Gat } from "../format/gat";
import { Gnd, GROUND_STRIDE } from "../format/gnd";
import { Rsw } from "../format/rsw";
import { Rsm } from "../format/rsm";
import { buildModelGeometries } from "./model";

/** An animated mouse cursor: PNG frames + a playback sequence indexing them. */
export interface CursorAnim {
  frames: string[]; // map-relative PNG paths
  seq: number[]; // frame index per animation step
  hotspot: [number, number]; // active pixel (x, y) from the image top-left
  fps: number;
  fallback: string; // CSS keyword if the image fails to load
}

export interface MapManifest {
  map: string;
  files: { gat: string; gnd: string; rsw: string };
  models: Record<string, string>;
  textures: Record<string, string>;
  water: { type: number; frames: string[] };
  ui?: {
    grid?: string;
    cursor?: CursorAnim;
    cursorRotate?: CursorAnim;
  };
}

export interface World {
  root: Group;
  gat: Gat;
  /** Invisible GAT-altitude mesh — the click/hover cell-picking raycast target
   *  (the walkable surface, incl. the raised bridge, unlike the visual ground). */
  picker: Mesh;
  /** GND→GAT cell scale: a GAT cell spans this many world units. */
  cellSize: number;
  spawn: { gx: number; gy: number };
  /** Advance time-based animation (water frames). */
  update(dt: number): void;
  /** Show the hovered-cell selector at GAT cell (gx, gy). */
  setSelector(gx: number, gy: number): void;
  /** Hide the cell selector (pointer left the ground). */
  hideSelector(): void;
  /** Free every GPU resource (geometries, materials, textures) this world owns.
   *  Call after removing `root` from the scene when switching maps, so nothing
   *  leaks. The world is unusable afterwards. */
  dispose(): void;
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

function loadTexture(loader: TextureLoader, url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        tex.wrapS = tex.wrapT = RepeatWrapping;
        tex.magFilter = NearestFilter; // crisp retro pixels
        resolve(tex);
      },
      undefined,
      () => reject(new Error(`texture ${url}`)),
    );
  });
}

// Find a walkable GAT cell nearest the map centre to spawn the character on.
function findSpawn(gat: Gat): { gx: number; gy: number } {
  const cx = gat.width >> 1;
  const cy = gat.height >> 1;
  for (let r = 0; r < Math.max(gat.width, gat.height); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (gat.isWalkable(cx + dx, cy + dy)) return { gx: cx + dx, gy: cy + dy };
      }
    }
  }
  return { gx: cx, gy: cy };
}

export async function buildWorld(baseUrl: string, manifest: MapManifest): Promise<World> {
  const [gatBuf, gndBuf, rswBuf] = await Promise.all([
    fetchBuffer(baseUrl + manifest.files.gat),
    fetchBuffer(baseUrl + manifest.files.gnd),
    fetchBuffer(baseUrl + manifest.files.rsw),
  ]);
  const gat = new Gat(gatBuf);
  const gnd = new Gnd(gndBuf);
  const rsw = new Rsw(rswBuf);

  // Preload every texture PNG referenced by the manifest, keyed by name.
  const loader = new TextureLoader();
  const texEntries = await Promise.all(
    Object.entries(manifest.textures).map(async ([name, file]) => {
      try {
        return [name, await loadTexture(loader, baseUrl + file)] as const;
      } catch {
        return [name, null] as const;
      }
    }),
  );
  const textures = new Map<string, Texture | null>(texEntries);

  type Mat = MeshBasicMaterial | MeshLambertMaterial;
  const groundMatCache = new Map<string, Mat>();
  const modelMatCache = new Map<string, Mat>();
  // Ground is unlit (lit=false): RO bakes lighting into the lightmap, so dynamic
  // per-face lighting would just facet the flat-shaded GND mesh and darken it.
  // Models keep Lambert shading.
  const material = (cache: Map<string, Mat>, name: string, vertexColors: boolean, lit: boolean) => {
    let m = cache.get(name);
    if (!m) {
      const map = textures.get(name) ?? null;
      const opts = {
        map: map ?? null,
        color: map ? 0xffffff : 0x888888,
        vertexColors,
        side: DoubleSide,
        alphaTest: 0.5,
      };
      m = lit ? new MeshLambertMaterial(opts) : new MeshBasicMaterial(opts);
      cache.set(name, m);
    }
    return m;
  };

  const root = new Group();
  // RO → three.js: flip Y (RO's "down" is up) and X (RO renders mirrored vs a
  // naive +X build — roBrowser negates the camera's world X). The character's
  // world X and click→cell mapping negate X to stay consistent (see Simulator).
  root.scale.set(-1, -1, 1);

  // --- Ground ---------------------------------------------------------------
  // RO bakes per-pixel shadows (incl. those cast by the 3D objects) into the GND
  // lightmap. Feed it to the material's lightMap (sampled via uv1) so it darkens
  // shadowed ground — the same effect as roBrowser, but via three's lightMap.
  const lmAtlas = gnd.lightmapAtlas();
  let lightMap: DataTexture | null = null;
  if (lmAtlas) {
    lightMap = new DataTexture(lmAtlas.data as Uint8Array<ArrayBuffer>, lmAtlas.width, lmAtlas.height, RGBAFormat);
    lightMap.minFilter = lightMap.magFilter = LinearFilter;
    lightMap.channel = 1; // sample via the uv1 attribute, not the texture uv
    lightMap.needsUpdate = true;
  }

  const { ground, water } = gnd.compile(rsw.water.level, rsw.water.waveHeight);
  for (const grp of ground) {
    const n = grp.vertices.length / GROUND_STRIDE;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const col = new Float32Array(n * 3);
    const uv1 = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const s = i * GROUND_STRIDE;
      pos[i * 3] = grp.vertices[s]; pos[i * 3 + 1] = grp.vertices[s + 1]; pos[i * 3 + 2] = grp.vertices[s + 2];
      uv[i * 2] = grp.vertices[s + 3]; uv[i * 2 + 1] = grp.vertices[s + 4];
      col[i * 3] = grp.vertices[s + 5]; col[i * 3 + 1] = grp.vertices[s + 6]; col[i * 3 + 2] = grp.vertices[s + 7];
      uv1[i * 2] = grp.vertices[s + 8]; uv1[i * 2 + 1] = grp.vertices[s + 9];
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geo.setAttribute("color", new Float32BufferAttribute(col, 3));
    geo.setAttribute("uv1", new Float32BufferAttribute(uv1, 2));
    geo.computeVertexNormals();
    // No vertex (tile) colour: RO's ground shader lights purely by the lightmap
    // (texture × (ambient+diffuse) × lightmap), so multiplying by the per-tile
    // colour too (avg ~0.79) just dimmed everything. Drop it when we have a
    // lightmap; fall back to it otherwise.
    const mat = material(groundMatCache, grp.texture, !lightMap, false);
    if (lightMap) {
      mat.lightMap = lightMap;
      // >1 so lit ground reads bright (mimics RO's ambient+diffuse multiplier,
      // which exceeds 1); shadowed cells stay relatively darker.
      mat.lightMapIntensity = 2.5;
    }
    const mesh = new Mesh(geo, mat);
    root.add(mesh);
  }

  // --- Water (animated 32-frame texture) ------------------------------------
  const waterFrames: Texture[] = [];
  let waterMaterial: MeshBasicMaterial | null = null;
  if (water.vertices.length) {
    const n = water.vertices.length / 5;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = water.vertices[i * 5];
      pos[i * 3 + 1] = water.vertices[i * 5 + 1];
      pos[i * 3 + 2] = water.vertices[i * 5 + 2];
      uv[i * 2] = water.vertices[i * 5 + 3];
      uv[i * 2 + 1] = water.vertices[i * 5 + 4];
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    for (const [, tex] of await Promise.all(
      manifest.water.frames.map(async (f) => [f, await loadTexture(loader, baseUrl + f).catch(() => null)] as const),
    )) {
      if (tex) waterFrames.push(tex);
    }
    waterMaterial = new MeshBasicMaterial({
      map: waterFrames[0] ?? null,
      color: waterFrames.length ? 0xffffff : 0x4a80c0,
      transparent: true,
      opacity: 0.6,
      side: DoubleSide,
      depthWrite: false,
    });
    root.add(new Mesh(geo, waterMaterial));
  }

  // --- Models ---------------------------------------------------------------
  const rsmCache = new Map<string, Rsm | null>();
  for (const placement of rsw.models) {
    let rsm = rsmCache.get(placement.filename);
    if (rsm === undefined) {
      const file = manifest.models[placement.filename];
      try {
        rsm = file ? new Rsm(await fetchBuffer(baseUrl + file)) : null;
      } catch {
        rsm = null;
      }
      rsmCache.set(placement.filename, rsm);
    }
    if (!rsm) continue;
    for (const { texture, geometry } of buildModelGeometries(rsm, placement, gnd.width, gnd.height)) {
      root.add(new Mesh(geometry, material(modelMatCache, texture, false, true)));
    }
  }

  // --- Lighting (from RSW) --------------------------------------------------
  const [ar, ag, ab] = rsw.light.ambient;
  const ambient = new AmbientLight(0xffffff, 1);
  ambient.color.setRGB(Math.max(ar, 0.2), Math.max(ag, 0.2), Math.max(ab, 0.2));
  const sun = new DirectionalLight(0xffffff, 1);
  const [dr, dg, db] = rsw.light.diffuse;
  sun.color.setRGB(dr, dg, db);
  // Direction from longitude/latitude (degrees), pointing down into the map.
  const lat = (rsw.light.latitude * Math.PI) / 180;
  const lon = (rsw.light.longitude * Math.PI) / 180;
  sun.position.set(Math.sin(lon) * Math.cos(lat), Math.cos(lat) + 0.5, Math.sin(lat)).multiplyScalar(100);
  // Lights live outside the flipped group so they shine from above in view space.
  const lightGroup = new Group();
  lightGroup.add(ambient, sun);

  const spawn = findSpawn(gat);
  const cellSize = (gnd.width * 2) / gat.width;

  // --- Pick mesh (invisible GAT altitude surface) ---------------------------
  // One quad per GAT cell at its walkable height. Picking against this instead of
  // the visual ground means the hovered/clicked cell is right even on the raised
  // bridge (the GND ground there is the riverbed below it).
  const pickPos: number[] = [];
  for (let gy = 0; gy < gat.height; gy++) {
    for (let gx = 0; gx < gat.width; gx++) {
      const x0 = gx * cellSize;
      const x1 = (gx + 1) * cellSize;
      const z0 = gy * cellSize;
      const z1 = (gy + 1) * cellSize;
      const h00 = gat.heightAt(gx, gy, 0, 0);
      const h10 = gat.heightAt(gx, gy, 1, 0);
      const h01 = gat.heightAt(gx, gy, 0, 1);
      const h11 = gat.heightAt(gx, gy, 1, 1);
      pickPos.push(x0, h00, z0, x1, h10, z0, x1, h11, z1, x1, h11, z1, x0, h01, z1, x0, h00, z0);
    }
  }
  const pickGeo = new BufferGeometry();
  pickGeo.setAttribute("position", new Float32BufferAttribute(pickPos, 3));
  const picker = new Mesh(pickGeo, new MeshBasicMaterial({ side: DoubleSide }));
  picker.visible = false; // raycast target only — never rendered
  root.add(picker);

  // --- Hovered-cell selector (grid.tga quad snapped to the GAT cell) --------
  const selectorGeo = new BufferGeometry();
  selectorGeo.setAttribute("position", new Float32BufferAttribute(new Float32Array(18), 3));
  selectorGeo.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0], 2));
  let selectorTex: Texture | null = null;
  if (manifest.ui?.grid) selectorTex = await loadTexture(loader, baseUrl + manifest.ui.grid).catch(() => null);
  // The client's grid.tga cell cursor, green-tinted. depthTest off + a late
  // renderOrder so the target cell always shows on top of the ground and the
  // (large, toward-camera) character billboard, at any zoom.
  const selectorMesh = new Mesh(
    selectorGeo,
    new MeshBasicMaterial({ map: selectorTex, color: 0x66ff66, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: DoubleSide }),
  );
  selectorMesh.visible = false;
  selectorMesh.renderOrder = 10;
  // We move the selector by rewriting its geometry each frame; three.js caches
  // the geometry's boundingSphere on first use and never refreshes it, so frustum
  // culling would intermittently hide the quad once it drifts past that stale
  // sphere. Disable culling — it's a single tiny quad.
  selectorMesh.frustumCulled = false;
  root.add(selectorMesh);

  const out = new Group();
  out.add(root, lightGroup);

  // Water cycles its 32 frames at ~20 fps (≈1.6s loop), like the client.
  const WATER_FPS = 20;
  let waterClock = 0;
  const update = (dt: number) => {
    if (!waterMaterial || waterFrames.length < 2) return;
    waterClock += dt;
    const frame = Math.floor(waterClock * WATER_FPS) % waterFrames.length;
    if (waterMaterial.map !== waterFrames[frame]) {
      waterMaterial.map = waterFrames[frame];
      waterMaterial.needsUpdate = true;
    }
  };

  // Snap the selector quad to a GAT cell's four corner heights (lifted slightly
  // toward the camera so it doesn't z-fight the ground). RO-space coords; the
  // mesh is under `root`, so its X is mirrored to match the ground.
  const LIFT = 0.3;
  const setSelector = (gx: number, gy: number) => {
    // Only over walkable cells — like the client, hovering a blocked cell shows
    // no target marker (and clicking it wouldn't move you there anyway).
    if (!gat.isWalkable(gx, gy)) {
      selectorMesh.visible = false;
      return;
    }
    const x0 = gx * cellSize;
    const x1 = (gx + 1) * cellSize;
    const z0 = gy * cellSize;
    const z1 = (gy + 1) * cellSize;
    const sw = gat.heightAt(gx, gy, 0, 0) - LIFT;
    const se = gat.heightAt(gx, gy, 1, 0) - LIFT;
    const nw = gat.heightAt(gx, gy, 0, 1) - LIFT;
    const ne = gat.heightAt(gx, gy, 1, 1) - LIFT;
    const pos = selectorGeo.getAttribute("position") as Float32BufferAttribute;
    pos.copyArray([
      x0, sw, z0, x1, se, z0, x1, ne, z1,
      x1, ne, z1, x0, nw, z1, x0, sw, z0,
    ]);
    pos.needsUpdate = true;
    selectorMesh.visible = true;
  };
  const hideSelector = () => {
    selectorMesh.visible = false;
  };

  // Release every GPU resource on map switch. Geometries + materials are disposed
  // by walking the scene graph; the textures (which Material.dispose() does NOT
  // free) are disposed from the collections that own them. Texture.dispose() is
  // safe to call once per texture even though several materials share one.
  const dispose = () => {
    out.traverse((obj) => {
      const mesh = obj as Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (mat) for (const m of Array.isArray(mat) ? mat : [mat]) m.dispose();
    });
    for (const tex of textures.values()) tex?.dispose();
    for (const tex of waterFrames) tex.dispose();
    lightMap?.dispose();
    selectorTex?.dispose();
  };

  return { root: out, gat, picker, cellSize, spawn, update, setSelector, hideSelector, dispose };
}
