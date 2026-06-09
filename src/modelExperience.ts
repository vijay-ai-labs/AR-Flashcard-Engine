import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { CardConfig } from "./cards";

// Set true to log bounding box + transform per letter — helps tune scale/position on-device
const DEBUG_TUNING = false;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");
dracoLoader.preload(); // compile WASM decoder now, not on first model load

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
const LIGHTING_FLAG = "__arLightingAdded";

// Soft whoosh on spawn — silently skip if file missing
let spawnAudioReady = false;
const spawnAudio = new Audio();
spawnAudio.volume = 0.25;
spawnAudio.addEventListener("canplaythrough", () => { spawnAudioReady = true; }, { once: true });
spawnAudio.addEventListener("error", () => { /* spawn.mp3 missing — no-op */ });
spawnAudio.src = "/audio/spawn.mp3";

// Vivid rainbow palette for multi-color burst
const BURST_PALETTE = [
  "#ff4757", "#ffa502", "#2ed573", "#1e90ff", "#ff6b81",
  "#eccc68", "#7bed9f", "#70a1ff", "#ff6b9d", "#ff4500",
  "#00d2d3", "#ff9ff3", "#ffffff", "#ffdd59", "#c44dff",
  "#ff5e57", "#0be881", "#f8b500", "#ef5777", "#575fcf",
];

// Particle tier config: [count, radius, speedMult, upMult]
const TIERS: [number, number, number, number][] = [
  [8,  0.060, 0.75, 1.3],  // large confetti
  [12, 0.038, 1.05, 1.0],  // medium sprinkle
  [10, 0.022, 1.45, 0.8],  // small fast sparks
];
const TOTAL_PARTICLES = TIERS.reduce((s, t) => s + t[0], 0); // 30

export class ModelExperience {
  root: THREE.Group;
  contentRoot: THREE.Group;
  model: THREE.Group;

  private scene: THREE.Scene;
  private card: CardConfig;
  private mixer: THREE.AnimationMixer | null = null;
  private gltfAnimations: THREE.AnimationClip[] = [];
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private idleTime = 0;
  private hasAnimations = false;
  private currentScale: number;
  private baseY = 0;
  private nbMinY = 0;
  private revealFromY = 0;
  private offsetX = 0;
  private offsetY = 0;

  isPlaced = false;

  // Reveal animation
  private isRevealing = false;
  private revealTime = 0;
  private readonly revealDuration = 0.65;
  private revealTargetScale = 1.0;

  // Tap bounce
  private isBouncing = false;
  private bounceTime = 0;
  private readonly bounceDuration = 0.5;
  private bounceBaseScale = 1.0;

  // Multi-color particle burst
  private particleMeshes: THREE.Mesh[] = [];
  private particleGeos: THREE.SphereGeometry[] = [];
  private particleVelocities: THREE.Vector3[] = [];
  private particleLifeRates: number[] = [];   // per-particle speed multiplier
  private particleLife = 0;
  private isParticling = false;
  private readonly particleMaxLife = 1.3;

  // Expanding burst ring
  private burstRing: THREE.Mesh | null = null;
  private burstRingLife = 0;
  private readonly burstRingDuration = 0.5;
  private isBurstRinging = false;

  // Grounding meshes
  private shadowDisc: THREE.Mesh | null = null;
  private glowRing: THREE.Mesh | null = null;
  private groundingGroup: THREE.Group | null = null;

  get isLoaded(): boolean { return this.loaded; }
  getDefaultScale(): number { return this.card.scale; }
  getMinScale(): number { return this.card.minScale ?? 0.35; }
  getMaxScale(): number { return this.card.maxScale ?? 2.2; }

  constructor(scene: THREE.Scene, card: CardConfig) {
    this.scene = scene;
    this.card = card;
    this.currentScale = card.scale;
    this.revealTargetScale = card.scale;

    this.root = new THREE.Group();
    this.root.visible = false;

    this.contentRoot = new THREE.Group();
    this.root.add(this.contentRoot);

    this.model = new THREE.Group();
    this.contentRoot.add(this.model);

    this._buildGrounding();
    this.ensureLighting();
  }

  private _buildGrounding() {
    const rs = this.card.ringScale ?? 1.0;
    const group = new THREE.Group();
    group.scale.setScalar(rs);
    this.groundingGroup = group;

    const discGeo = new THREE.CircleGeometry(0.22, 32);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false,
    });
    this.shadowDisc = new THREE.Mesh(discGeo, discMat);
    this.shadowDisc.rotation.x = -Math.PI / 2;
    this.shadowDisc.position.y = 0.001;
    group.add(this.shadowDisc);

    const ringGeo = new THREE.RingGeometry(0.17, 0.26, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x88ccff, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.glowRing = new THREE.Mesh(ringGeo, ringMat);
    this.glowRing.rotation.x = -Math.PI / 2;
    this.glowRing.position.y = 0.002;
    group.add(this.glowRing);

    const accentGeo = new THREE.TorusGeometry(0.18, 0.007, 8, 48);
    const accentMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.28,
    });
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.rotation.x = -Math.PI / 2;
    accent.position.y = 0.003;
    group.add(accent);

    this.contentRoot.add(group);
  }

  private _anchorPos(): [number, number, number] {
    // Default: bottom-half of portrait card in anchor-local space.
    // XZ = card surface plane; Y = height above card surface.
    // Negative Z = toward bottom of card; positive Z = toward top.
    // Flip sign or adjust magnitude to tune on-device.
    return this.card.anchorPosition ?? [0, 0, -0.5];
  }

  private ensureLighting() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((this.scene.userData as any)[LIGHTING_FLAG]) return;
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    const dir = new THREE.DirectionalLight(0xffffff, 2.0);
    dir.position.set(1.5, 3, 2);
    this.scene.add(ambient, dir);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.scene.userData as any)[LIGHTING_FLAG] = true;
  }

  load(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const gltf = await loader.loadAsync(this.card.modelPath);
      const gltfScene = gltf.scene;

      const box = new THREE.Box3().setFromObject(gltfScene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      console.log(`[AR] ${this.card.letter} raw size:`, size, "maxDim:", maxDim);

      if (maxDim > 0) gltfScene.scale.setScalar(1 / maxDim);

      // Center all 3 axes — without this, GLBs with off-center origins appear shifted on X/Z
      const center = box.getCenter(new THREE.Vector3());
      gltfScene.position.set(-center.x / maxDim, -center.y / maxDim, -center.z / maxDim);

      const nb = new THREE.Box3().setFromObject(gltfScene);
      this.nbMinY = nb.min.y;

      this.model.add(gltfScene);
      this.model.scale.setScalar(this.card.scale);

      // card.position[1] is an additional Y offset above the auto-computed floor
      this.baseY = 0.05 + this.card.position[1] - nb.min.y * this.card.scale;
      this.model.position.set(this.card.position[0], this.baseY, this.card.position[2]);

      // Place contentRoot at the object-area anchor so ring + model sit over the printed object
      const ap = this._anchorPos();
      this.contentRoot.position.set(ap[0], ap[1], ap[2]);

      if (DEBUG_TUNING) {
        const ns = new THREE.Vector3();
        nb.getSize(ns);
        console.log(
          `[TUNE] ${this.card.letter} | normalizedSize: ${ns.x.toFixed(3)}×${ns.y.toFixed(3)}×${ns.z.toFixed(3)}` +
          ` | scale: ${this.card.scale} | baseY: ${this.baseY.toFixed(4)}` +
          ` | pos: [${this.card.position}] | rot: [${this.card.rotation}]` +
          ` | anchorPos: [${ap}] | ringScale: ${this.card.ringScale ?? 1.0}`
        );
      }

      const [rx, ry, rz] = this.card.rotation;
      this.model.rotation.set(rx, ry, rz);

      if (gltf.animations.length > 0) {
        this.gltfAnimations = gltf.animations;
        this.mixer = new THREE.AnimationMixer(gltfScene);
        const action = this.mixer.clipAction(gltf.animations[0]);
        action.play();
        this.hasAnimations = true;
      }

      this.loaded = true;
    })();

    return this.loadPromise;
  }

  show() {
    this.root.visible = true;
    if (this.mixer) this.mixer.timeScale = 1;
  }

  showWithReveal() {
    this.root.visible = true;
    if (this.mixer) this.mixer.timeScale = 1;
    if (!this.loaded) return;

    const fromScale = this.card.revealScale ?? 0.15;
    this.revealTargetScale = this.currentScale;
    // Include card.position[1] so reveal starts relative to the card's tuned height
    this.revealFromY = 0.002 + this.card.position[1] - this.nbMinY * fromScale;
    this.isRevealing = true;
    this.revealTime = 0;
    this.isBouncing = false;
    this.model.position.set(this.card.position[0], this.revealFromY, this.card.position[2]);
    this.model.scale.setScalar(fromScale);

    if (spawnAudioReady) {
      spawnAudio.currentTime = 0;
      spawnAudio.play().catch(() => {});
    }
  }

  hide() {
    this.root.visible = false;
    if (this.mixer) this.mixer.timeScale = 0;
    this.isRevealing = false;
    this.isBouncing = false;
    this._clearParticles();
  }

  move(dx: number, dy: number) {
    const sensitivity = 0.003;
    this.offsetX = THREE.MathUtils.clamp(this.offsetX + dx * sensitivity, -0.45, 0.45);
    this.offsetY = THREE.MathUtils.clamp(this.offsetY - dy * sensitivity, -0.8, 0.8);
    const ap = this._anchorPos();
    // Move contentRoot so ring and model travel together across the card
    this.contentRoot.position.x = ap[0] + this.offsetX;
    this.contentRoot.position.y = ap[1] + this.offsetY;
  }

  rotate(dx: number, dy: number) {
    this.model.rotation.y += dx * 0.012;
    this.model.rotation.x = THREE.MathUtils.clamp(
      this.model.rotation.x + dy * 0.008, -1.15, 0.8
    );
  }

  zoom(s: number) { this.setScale(s); }

  setScale(s: number) {
    this.currentScale = THREE.MathUtils.clamp(s, this.getMinScale(), this.getMaxScale());
    this.model.scale.setScalar(this.currentScale);
  }

  reset() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.currentScale = this.card.scale;
    this.model.scale.setScalar(this.currentScale);
    this.model.rotation.set(this.card.rotation[0], this.card.rotation[1], this.card.rotation[2]);
    this.model.position.set(this.card.position[0], this.baseY, this.card.position[2]);
    const ap = this._anchorPos();
    this.contentRoot.position.set(ap[0], ap[1], ap[2]);
    this.idleTime = 0;
    this.isRevealing = false;
    this.isBouncing = false;
    this._clearParticles();
  }

  /**
   * Rainbow burst: 30 spheres in 3 size tiers, vivid multi-color palette,
   * plus an expanding accent-colored ring. All self-clean after ~1.3s.
   */
  playDetectionBurst(accentColor: string) {
    this._clearParticles();

    this.particleMeshes = [];
    this.particleGeos = [];
    this.particleVelocities = [];
    this.particleLifeRates = [];

    let idx = 0;
    for (const [count, radius, speedMult, upMult] of TIERS) {
      const geo = new THREE.SphereGeometry(radius, 6, 6);
      this.particleGeos.push(geo);

      for (let i = 0; i < count; i++) {
        // Weave accent color in every 4th particle, rest from rainbow palette
        const hex = idx % 4 === 0 ? accentColor : BURST_PALETTE[idx % BURST_PALETTE.length];
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(hex),
          transparent: true,
          opacity: 1.0,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, this.baseY, 0);
        mesh.scale.setScalar(0.05); // pop-in from tiny
        this.contentRoot.add(mesh);
        this.particleMeshes.push(mesh);

        // Spread evenly around full circle with slight random jitter
        const angle = (idx / TOTAL_PARTICLES) * Math.PI * 2 + Math.random() * 0.5;
        const speed = (0.3 + Math.random() * 0.5) * speedMult;
        this.particleVelocities.push(new THREE.Vector3(
          Math.cos(angle) * speed,
          (0.45 + Math.random() * 0.9) * speed * upMult,
          Math.sin(angle) * speed,
        ));

        // Each particle lives at its own pace (0.75–1.25× global time)
        this.particleLifeRates.push(0.75 + Math.random() * 0.5);

        idx++;
      }
    }

    // Expanding flat ring in accent color
    this._spawnBurstRing(accentColor);

    this.particleLife = 0;
    this.isParticling = true;
    console.log(`[AR] burst: ${this.particleMeshes.length} particles`);
  }

  private _spawnBurstRing(accentColor: string) {
    const geo = new THREE.RingGeometry(0.01, 0.07, 36);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(accentColor),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.burstRing = new THREE.Mesh(geo, mat);
    this.burstRing.rotation.x = -Math.PI / 2;
    this.burstRing.position.y = this.baseY + 0.01;
    this.contentRoot.add(this.burstRing);
    this.burstRingLife = 0;
    this.isBurstRinging = true;
  }

  playTapAction() {
    if (!this.loaded) return;

    if (this.hasAnimations && this.mixer && this.gltfAnimations.length > 0) {
      this.mixer.stopAllAction();
      const action = this.mixer.clipAction(this.gltfAnimations[0]);
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      const resumeMs = this.gltfAnimations[0].duration * 1000 + 100;
      setTimeout(() => {
        if (!this.loaded || !this.mixer || this.gltfAnimations.length === 0) return;
        this.mixer.stopAllAction();
        const loop = this.mixer.clipAction(this.gltfAnimations[0]);
        loop.reset();
        loop.play();
      }, resumeMs);
    } else {
      this.isBouncing = true;
      this.bounceTime = 0;
      this.bounceBaseScale = this.currentScale;
    }
  }

  getInteractiveObjects(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    this.model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) meshes.push(child);
    });
    return meshes;
  }

  update(delta: number) {
    if (!this.root.visible || !this.loaded) return;

    // ── Burst ring expand & fade ──────────────────────────────────────────────
    if (this.isBurstRinging && this.burstRing) {
      this.burstRingLife += delta;
      const rt = Math.min(this.burstRingLife / this.burstRingDuration, 1);
      this.burstRing.scale.setScalar(1 + rt * 7);  // expands 8× radius
      (this.burstRing.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - rt);
      if (rt >= 1) {
        this.contentRoot.remove(this.burstRing);
        this.burstRing.geometry.dispose();
        (this.burstRing.material as THREE.Material).dispose();
        this.burstRing = null;
        this.isBurstRinging = false;
      }
    }

    // ── Multi-color particle burst ────────────────────────────────────────────
    if (this.isParticling && this.particleMeshes.length > 0) {
      this.particleLife += delta;
      const globalT = this.particleLife / this.particleMaxLife;

      for (let i = 0; i < this.particleMeshes.length; i++) {
        const localT = Math.min(globalT * this.particleLifeRates[i], 1);

        // Scale pop-in: 0→full over first 18% of life using ease-out-back
        const scaleT = Math.min(localT / 0.18, 1);
        this.particleMeshes[i].scale.setScalar(Math.max(0.01, this._easeOutBack(scaleT)));

        // Physics
        this.particleMeshes[i].position.x += this.particleVelocities[i].x * delta;
        this.particleMeshes[i].position.y += this.particleVelocities[i].y * delta;
        this.particleMeshes[i].position.z += this.particleVelocities[i].z * delta;
        this.particleVelocities[i].y -= delta * 0.55; // gravity

        // Fade: hold full opacity until 45% life, then fade to 0
        const fadeStart = 0.45;
        const opacity = localT < fadeStart
          ? 1.0
          : Math.max(0, 1 - (localT - fadeStart) / (1 - fadeStart));
        (this.particleMeshes[i].material as THREE.MeshBasicMaterial).opacity = opacity;
      }

      if (globalT >= 1) this._clearParticles();
    }

    // ── Reveal animation ──────────────────────────────────────────────────────
    if (this.isRevealing) {
      this.revealTime += delta;
      const t = Math.min(this.revealTime / this.revealDuration, 1);
      const ease = this._easeOutBack(t);
      const fromScale = this.card.revealScale ?? 0.15;
      this.model.scale.setScalar(fromScale + (this.revealTargetScale - fromScale) * ease);
      this.model.position.y = this.revealFromY + (this.baseY - this.revealFromY) * ease;
      if (t >= 1) {
        this.isRevealing = false;
        this.model.scale.setScalar(this.revealTargetScale);
        this.model.position.y = this.baseY;
      }
      if (this.mixer) this.mixer.update(delta);
      return;
    }

    // ── Bounce delight ────────────────────────────────────────────────────────
    if (this.isBouncing) {
      this.bounceTime += delta;
      const t = Math.min(this.bounceTime / this.bounceDuration, 1);
      const pulse = 1 + Math.sin(t * Math.PI * 2.5) * 0.13 * (1 - t);
      this.model.scale.setScalar(this.bounceBaseScale * pulse);
      this.model.position.y = this.baseY + Math.sin(t * Math.PI) * 0.07;
      if (t >= 1) {
        this.isBouncing = false;
        this.model.scale.setScalar(this.bounceBaseScale);
        this.model.position.y = this.baseY;
      }
      if (this.mixer) this.mixer.update(delta);
      return;
    }

    // ── Normal idle ───────────────────────────────────────────────────────────
    this.idleTime += delta;
    if (this.mixer) {
      this.mixer.update(delta);
    } else if (!this.isPlaced) {
      this.model.position.y = this.baseY + Math.sin(this.idleTime * 1.2) * 0.04;
      this.model.rotation.y += delta * 0.5;
    }

    if (this.glowRing && !this.isPlaced) {
      const mat = this.glowRing.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.12 + Math.sin(this.idleTime * 2.0) * 0.06;
    }
  }

  private _clearParticles() {
    for (const m of this.particleMeshes) {
      this.contentRoot.remove(m);
      (m.material as THREE.Material).dispose();
    }
    this.particleMeshes = [];
    this.particleVelocities = [];
    this.particleLifeRates = [];
    for (const g of this.particleGeos) g.dispose();
    this.particleGeos = [];
    this.isParticling = false;

    if (this.burstRing) {
      this.contentRoot.remove(this.burstRing);
      this.burstRing.geometry.dispose();
      (this.burstRing.material as THREE.Material).dispose();
      this.burstRing = null;
      this.isBurstRinging = false;
    }
  }

  private _easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
}
