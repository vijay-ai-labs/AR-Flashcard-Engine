import { MindARThree } from "./vendor/mindar-image-three.prod.js";
import * as THREE from "three";
import { CARDS, type CardConfig } from "./cards";
import { ModelExperience } from "./modelExperience";
import { PlacementManager } from "./placementManager";
import "./styles.css";

const container    = document.querySelector<HTMLElement>("#ar-container")!;
const startButton  = document.querySelector<HTMLButtonElement>("#start-button")!;
const resetButton  = document.querySelector<HTMLButtonElement>("#reset-button")!;
const statusDot    = document.querySelector<HTMLElement>("#status-dot")!;
const statusTitle  = document.querySelector<HTMLElement>("#status-title")!;
const statusDetail = document.querySelector<HTMLElement>("#status-detail")!;
const statusLetter = document.querySelector<HTMLElement>("#status-letter");
const audioButton  = document.querySelector<HTMLButtonElement>("#audio-button")!;
const placeBtn     = document.querySelector<HTMLButtonElement>("#place-button")!;
const returnBtn    = document.querySelector<HTMLButtonElement>("#return-button")!;
const scanOverlay  = document.querySelector<HTMLElement>("#scan-overlay");
const modelLoader  = document.querySelector<HTMLElement>("#model-loader");
const loaderText   = document.querySelector<HTMLElement>("#loader-text");

if (!container || !startButton || !resetButton || !statusDot || !statusTitle || !statusDetail || !placeBtn || !returnBtn) {
  throw new Error("Required AR app elements are missing.");
}

type Status = "loading" | "scanning" | "found" | "lost" | "error";

function setStatus(status: Status, title: string, detail: string, letter = "", accent = "") {
  statusDot.className = `status-dot${status === "found" ? " ready" : ""}${
    status === "lost" || status === "error" ? " lost" : ""
  }`;
  statusTitle.textContent  = title;
  statusDetail.textContent = detail;
  if (statusLetter) {
    statusLetter.textContent = letter;
    statusLetter.classList.toggle("visible", letter.length > 0);
  }
  if (accent && status === "found") {
    statusDot.style.background = accent;
    statusDot.style.boxShadow  = `0 0 18px ${accent}b0`;
    if (statusLetter) (statusLetter as HTMLElement).style.color = accent;
  } else {
    statusDot.style.background = "";
    statusDot.style.boxShadow  = "";
    if (statusLetter) (statusLetter as HTMLElement).style.color = "";
  }
}

function showLoader(text: string, accent = "") {
  if (!modelLoader || !loaderText) return;
  loaderText.textContent = text;
  if (accent) modelLoader.style.setProperty("--loader-accent", accent);
  else        modelLoader.style.removeProperty("--loader-accent");
  modelLoader.classList.remove("hidden");
}

function hideLoader() {
  modelLoader?.classList.add("hidden");
}

const mindarThree = new MindARThree({
  container,
  imageTargetSrc: "/targets/alphabet.mind",
  maxTrack: 1,
  filterMinCF: 0.0001,
  filterBeta: 0.001,
  warmupTolerance: 5,
  missTolerance: 8,
});

const { renderer, scene, camera } = mindarThree;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

// --- Audio ---
const audio = new Audio();
audio.preload = "auto";

function stopAudio() {
  audio.pause();
  audio.currentTime = 0;
}

function setAudioButtonState(enabled: boolean) {
  audioButton.disabled = !enabled;
}

async function playActiveAudio() {
  try {
    await audio.play();
  } catch {
    // Autoplay blocked — speaker button is enabled, user can tap to play
  }
}

// --- Raycaster for tap detection ---
const raycaster = new THREE.Raycaster();

// --- AR Placement (3DOF world-space pinning) ---
const placementManager = new PlacementManager();
const experienceAnchors = new Map<ModelExperience, THREE.Group>();

function getModelHit(clientX: number, clientY: number, exp: ModelExperience): boolean {
  const rect = container.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(exp.getInteractiveObjects(), false).length > 0;
}

// --- State ---
let isStarted                             = false;
let activeExp: ModelExperience | null     = null;
let activeCard: CardConfig | null         = null;
let currentScale                          = 0.9;
let lastPointer: { x: number; y: number } | null = null;
let pinchStartDist                        = 0;
let pinchStartScale                       = 0.9;

// Long-press move mode
const LONG_PRESS_DELAY     = 500;
const LONG_PRESS_THRESHOLD = 10;
let isMoveMode             = false;
let longPressTimer: number | null = null;
let longPressOrigin: { x: number; y: number } | null = null;

// Tap detection — fire tap only when pointer/touch barely moved
const TAP_MOVE_THRESHOLD = 10;
let touchStartPos: { x: number; y: number } | null = null;
let touchHasMoved = false;
let touchWasPinch = false;
let mouseDownPos: { x: number; y: number } | null = null;
let mouseHasMoved = false;

function showActiveStatus() {
  if (activeCard) {
    setStatus("found", `${activeCard.letter} for ${activeCard.word}`,
      "",
      activeCard.letter, activeCard.accentColor);
  }
}

function enterMoveMode() {
  isMoveMode = true;
  longPressTimer = null;
  if (activeCard) {
    setStatus("found", `${activeCard.letter} for ${activeCard.word}`,
      "Move mode  •  Drag to reposition", activeCard.letter, activeCard.accentColor);
  }
}

function exitMoveMode() {
  isMoveMode = false;
  showActiveStatus();
}

function fireTap(clientX: number, clientY: number) {
  if (!activeExp || !activeCard) return;
  // Try raycasting; fall back to any tap when model is active
  const hit = activeExp.isLoaded ? getModelHit(clientX, clientY, activeExp) : false;
  if (hit || activeExp.isLoaded) {
    navigator.vibrate?.([5]);
    activeExp.playTapAction();
    audio.currentTime = 0;
    playActiveAudio();
  }
}

// --- Build 26 anchors ---
const experiences: ModelExperience[] = CARDS.map((card) => {
  const anchor = mindarThree.addAnchor(card.targetIndex);
  const exp    = new ModelExperience(scene, card);
  anchor.group.add(exp.root);
  experienceAnchors.set(exp, anchor.group);

  anchor.onTargetFound = async () => {
    // While any model is world-placed, ignore all new card detections
    if (placementManager.isPlaced) {
      // If the placed card itself re-enters frame, just refresh UI
      if (activeExp === exp) {
        showActiveStatus();
        returnBtn.style.display = "";
        placeBtn.style.display  = "none";
      }
      return;
    }

    activeExp  = exp;
    activeCard = card;
    resetButton.disabled = false;
    scanOverlay?.classList.add("locked");

    if (!exp.isLoaded) {
      setStatus("loading", `Loading ${card.letter} for ${card.word}…`, "Please wait a moment.", card.letter);
      showLoader(`Loading ${card.letter} for ${card.word}`, card.accentColor);
      try {
        await exp.load();
      } catch (err) {
        console.error(err);
        hideLoader();
        scanOverlay?.classList.remove("locked");
        setStatus("error", "Model failed to load", "Try reloading the page.");
        return;
      }
      hideLoader();
    }

    if (activeExp !== exp) return;

    exp.showWithReveal();
    exp.playDetectionBurst(card.accentColor);
    navigator.vibrate?.([10]);
    currentScale = card.scale;
    showActiveStatus();
    stopAudio();
    audio.src = card.audioPath;
    setAudioButtonState(true);
    playActiveAudio();

    // Show Place Here button once model is visible
    placeBtn.style.display  = "";
    returnBtn.style.display = "none";
  };

  anchor.onTargetLost = () => {
    // Keep model visible if it has been world-placed
    if (placementManager.isPlaced && activeExp === exp) return;

    exp.hide();
    if (activeExp === exp) {
      activeExp  = null;
      activeCard = null;
      resetButton.disabled = true;
      stopAudio();
      setAudioButtonState(false);
      hideLoader();
      scanOverlay?.classList.remove("locked");
      placeBtn.style.display  = "none";
      returnBtn.style.display = "none";
      setStatus("lost", "Scan an alphabet flashcard", "Point the camera at any alphabet flashcard.");
    }
  };

  return exp;
});

// --- Helpers ---
function pinchDist(t: TouchList) {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
}

// --- Touch ---
container.addEventListener("touchstart", (e) => {
  if (!activeExp) return;
  if (e.touches.length === 1) {
    const t = e.touches[0];
    lastPointer      = { x: t.clientX, y: t.clientY };
    longPressOrigin  = { x: t.clientX, y: t.clientY };
    longPressTimer   = window.setTimeout(enterMoveMode, LONG_PRESS_DELAY);
    touchStartPos    = { x: t.clientX, y: t.clientY };
    touchHasMoved    = false;
    touchWasPinch    = false;
  } else if (e.touches.length === 2) {
    if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (isMoveMode) exitMoveMode();
    pinchStartDist  = pinchDist(e.touches);
    pinchStartScale = currentScale;
    lastPointer     = null;
    longPressOrigin = null;
    touchStartPos   = null;
    touchWasPinch   = true;
  }
}, { passive: true });

container.addEventListener("touchmove", (e) => {
  if (!activeExp) return;

  if (e.touches.length === 1 && lastPointer) {
    const t  = e.touches[0];
    const dx = t.clientX - lastPointer.x;
    const dy = t.clientY - lastPointer.y;

    // Track total movement for tap detection
    if (touchStartPos) {
      const dist = Math.hypot(t.clientX - touchStartPos.x, t.clientY - touchStartPos.y);
      if (dist > TAP_MOVE_THRESHOLD) touchHasMoved = true;
    }

    if (isMoveMode) {
      e.preventDefault();
      activeExp.move(dx, dy);
    } else {
      if (longPressTimer !== null && longPressOrigin) {
        const dist = Math.hypot(t.clientX - longPressOrigin.x, t.clientY - longPressOrigin.y);
        if (dist > LONG_PRESS_THRESHOLD) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
      activeExp.rotate(dx, dy);
    }

    lastPointer = { x: t.clientX, y: t.clientY };
  } else if (e.touches.length === 2 && pinchStartDist > 0) {
    const newScale = pinchStartScale * (pinchDist(e.touches) / pinchStartDist);
    currentScale   = newScale;
    activeExp.zoom(newScale);
  }
}, { passive: false });

container.addEventListener("touchend", (e) => {
  if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }

  // Detect tap: single finger, barely moved, not in move mode, not a pinch
  if (
    !touchHasMoved &&
    !isMoveMode &&
    !touchWasPinch &&
    e.changedTouches.length === 1 &&
    touchStartPos !== null
  ) {
    const t = e.changedTouches[0];
    fireTap(t.clientX, t.clientY);
  }

  if (isMoveMode) exitMoveMode();
  lastPointer     = null;
  longPressOrigin = null;
  touchStartPos   = null;
  pinchStartDist  = 0;
});

container.addEventListener("touchcancel", () => {
  if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }
  isMoveMode      = false;
  lastPointer     = null;
  longPressOrigin = null;
  touchStartPos   = null;
  touchHasMoved   = false;
  touchWasPinch   = false;
  pinchStartDist  = 0;
});

// --- Mouse / pointer ---
container.addEventListener("pointerdown", (e) => {
  if (!activeExp || e.pointerType === "touch") return;
  lastPointer  = { x: e.clientX, y: e.clientY };
  mouseDownPos = { x: e.clientX, y: e.clientY };
  mouseHasMoved = false;
});

container.addEventListener("pointermove", (e) => {
  if (!activeExp || e.pointerType === "touch" || !lastPointer) return;
  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;

  if (mouseDownPos) {
    const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
    if (dist > TAP_MOVE_THRESHOLD) mouseHasMoved = true;
  }

  activeExp.rotate(dx, dy);
  lastPointer = { x: e.clientX, y: e.clientY };
});

window.addEventListener("pointerup", (e) => {
  if (e.pointerType !== "touch" && !mouseHasMoved && mouseDownPos && activeExp) {
    fireTap(e.clientX, e.clientY);
  }
  lastPointer  = null;
  mouseDownPos = null;
  mouseHasMoved = false;
});

container.addEventListener("wheel", (e) => {
  if (!activeExp) return;
  e.preventDefault();
  const minS = activeExp.getMinScale();
  const maxS = activeExp.getMaxScale();
  currentScale = THREE.MathUtils.clamp(
    currentScale + (e.deltaY > 0 ? -0.06 : 0.06),
    minS,
    maxS
  );
  activeExp.zoom(currentScale);
}, { passive: false });

// --- Audio button ---
audioButton.addEventListener("click", () => {
  if (!activeCard) return;
  audio.currentTime = 0;
  playActiveAudio();
});

// --- Reset ---
resetButton.addEventListener("click", () => {
  if (!activeExp || !activeCard) return;
  activeExp.reset();
  currentScale = activeCard.scale;
});

// --- Scan overlay helpers ---
function hideScanOverlay() {
  if (!scanOverlay) return;
  scanOverlay.classList.remove("locked");
  // setProperty with "important" beats every CSS rule including display:flex
  scanOverlay.style.setProperty("display", "none", "important");
  scanOverlay.style.setProperty("visibility", "hidden", "important");
}

function showScanOverlay() {
  if (!scanOverlay) return;
  scanOverlay.style.removeProperty("display");
  scanOverlay.style.removeProperty("visibility");
}

// --- Place Here ---
placeBtn.addEventListener("click", async () => {
  if (!activeExp) return;
  const anchorGroup = experienceAnchors.get(activeExp);
  if (!anchorGroup) return;

  // Hide BEFORE await — no frame gap, guaranteed synchronous
  hideScanOverlay();

  const ok = await placementManager.requestPermissionAndPlace(activeExp.root, scene, anchorGroup);
  if (ok) {
    activeExp.isPlaced = true;
    placeBtn.style.display  = "none";
    returnBtn.style.display = "";
    navigator.vibrate?.([8, 40, 8]);
    if (activeCard) {
      setStatus("found", `${activeCard.letter} for ${activeCard.word}`,
        "Placed in world  •  Move away from card",
        activeCard.letter, activeCard.accentColor);
    }
  } else {
    // Permission denied — restore overlay and show error
    showScanOverlay();
    if (activeCard) {
      setStatus("found", `${activeCard.letter} for ${activeCard.word}`,
        "Motion access denied — cannot place",
        activeCard.letter, activeCard.accentColor);
      setTimeout(showActiveStatus, 2500);
    }
  }
});

// --- Return to Card ---
returnBtn.addEventListener("click", () => {
  if (!activeExp) return;
  const anchorGroup = experienceAnchors.get(activeExp);
  if (!anchorGroup) return;

  activeExp.isPlaced = false;
  placementManager.release(activeExp.root, scene, anchorGroup);
  activeExp.reset();
  currentScale = activeCard?.scale ?? currentScale;
  returnBtn.style.display = "none";
  placeBtn.style.display  = "";
  showScanOverlay();
  navigator.vibrate?.([8]);
  showActiveStatus();
});

// --- Start ---
startButton.addEventListener("click", async () => {
  if (isStarted) return;
  try {
    startButton.disabled = true;
    setStatus("loading", "Starting camera", "Allow camera access when your browser asks.");
    await mindarThree.start();
    isStarted = true;
    setStatus("scanning", "Scan an alphabet flashcard", "Point your camera at any A–Z flashcard.");

    // Preload all models in parallel so any card scan is instant
    Promise.all(experiences.map(exp => exp.load().catch(() => {})));

    let lastTime = performance.now();
    renderer.setAnimationLoop(() => {
      const now   = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime    = now;
      for (const exp of experiences) exp.update(delta);
      if (placementManager.isPlaced && activeExp) {
        placementManager.update(activeExp.root);
      }
      renderer.render(scene, camera);
    });
  } catch (err) {
    console.error(err);
    startButton.disabled = false;
    setStatus("error", "Camera could not start", "Use HTTPS or localhost and allow camera permission.");
  }
});

window.addEventListener("beforeunload", () => {
  if (isStarted) mindarThree.stop();
});

setStatus("loading", "Ready to scan", "Tap Start Camera, then point your phone at any alphabet flashcard.");
