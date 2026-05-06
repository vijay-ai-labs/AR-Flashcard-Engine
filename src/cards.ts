export interface CardConfig {
  letter: string;
  word: string;
  targetIndex: number;
  modelPath: string;
  audioPath: string;
  accentColor: string;
  // Per-card tuning — edit these values to dial in each model visually on-device
  scale: number;                      // display scale in marker-relative units (GLB is auto-normalized to maxDim=1 first)
  position: [number, number, number]; // [x, yOffset, z] — x/z shift; y adds above the auto-computed floor
  rotation: [number, number, number]; // initial euler rotation in radians [x, y, z]
  minScale?: number;                  // pinch zoom floor (defaults to 0.35)
  maxScale?: number;                  // pinch zoom ceiling (defaults to 2.2)
  revealScale?: number;               // starting scale for reveal animation (defaults to 0.15)
  tapAction?: string;                 // reserved for future per-card tap behavior
  // Object-area anchor in marker-local space — moves ring + model together to the printed object area.
  // Card surface = XZ plane; Y = height above surface. Z is card vertical: -Z = card bottom, +Z = card top.
  // Default [0, 0, -0.5]. Make Z more negative to go lower, less negative to go higher.
  // If ring appears at TOP instead of BOTTOM on device, flip sign: [0, 0, 0.5].
  anchorPosition?: [number, number, number];
  // Ring/shadow size multiplier. Default 1.0. Increase if ring looks too small; decrease if too large.
  ringScale?: number;
}

export const CARDS: CardConfig[] = [
  { letter: 'A', word: 'Apple',        targetIndex: 0,  modelPath: '/models/A.glb', audioPath: '/audio/A.mp3', accentColor: '#ef4444', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'B', word: 'Bag',          targetIndex: 1,  modelPath: '/models/B.glb', audioPath: '/audio/B.mp3', accentColor: '#f59e0b', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'C', word: 'Camel',        targetIndex: 2,  modelPath: '/models/C.glb', audioPath: '/audio/C.mp3', accentColor: '#d97706', scale: 0.45, position: [0, 0, 0], rotation: [0, 0, 0] },  // still big at 0.65 — reduced further; tune up if needed
  { letter: 'D', word: 'Dinosaur',     targetIndex: 3,  modelPath: '/models/D.glb', audioPath: '/audio/D.mp3', accentColor: '#16a34a', scale: 1.45, position: [-0.15, 0, 0], rotation: [0, 0, 0] }, // appeared little right — nudged left
  { letter: 'E', word: 'Eagle',        targetIndex: 4,  modelPath: '/models/E.glb', audioPath: '/audio/E.mp3', accentColor: '#eab308', scale: 0.9,  position: [0.35, 0.15, -0.25], rotation: [0, 0, 0] }, // appeared bottom-left: +X=right, +Y=lift, -Z=toward card top (flip Z sign if overshoots)
  { letter: 'F', word: 'Frog',         targetIndex: 5,  modelPath: '/models/F.glb', audioPath: '/audio/F.mp3', accentColor: '#4ade80', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'G', word: 'Giraffe',      targetIndex: 6,  modelPath: '/models/G.glb', audioPath: '/audio/G.mp3', accentColor: '#fb923c', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'H', word: 'Helicopter',   targetIndex: 7,  modelPath: '/models/H.glb', audioPath: '/audio/H.mp3', accentColor: '#60a5fa', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'I', word: 'Ice Cream',    targetIndex: 8,  modelPath: '/models/I.glb', audioPath: '/audio/I.mp3', accentColor: '#f472b6', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'J', word: 'Jellyfish',    targetIndex: 9,  modelPath: '/models/J.glb', audioPath: '/audio/J.mp3', accentColor: '#c084fc', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'K', word: 'Kite',         targetIndex: 10, modelPath: '/models/K.glb', audioPath: '/audio/K.mp3', accentColor: '#22d3ee', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'L', word: 'Lion',         targetIndex: 11, modelPath: '/models/L.glb', audioPath: '/audio/L.mp3', accentColor: '#f97316', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'M', word: 'Mouse',        targetIndex: 12, modelPath: '/models/M.glb', audioPath: '/audio/M.mp3', accentColor: '#94a3b8', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'N', word: 'Notebook',     targetIndex: 13, modelPath: '/models/N.glb', audioPath: '/audio/N.mp3', accentColor: '#818cf8', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'O', word: 'Octopus',      targetIndex: 14, modelPath: '/models/O.glb', audioPath: '/audio/O.mp3', accentColor: '#e879f9', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'P', word: 'Penguin',      targetIndex: 15, modelPath: '/models/P.glb', audioPath: '/audio/P.mp3', accentColor: '#38bdf8', scale: 0.05, position: [0, 0, 0], rotation: [0, 0, 0], minScale: 0.02, maxScale: 0.25 },
  { letter: 'Q', word: 'Queen',        targetIndex: 16, modelPath: '/models/Q.glb', audioPath: '/audio/Q.mp3', accentColor: '#fbbf24', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'R', word: 'Rabbit',       targetIndex: 17, modelPath: '/models/R.glb', audioPath: '/audio/R.mp3', accentColor: '#fb7185', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'S', word: 'Shark',        targetIndex: 18, modelPath: '/models/S.glb', audioPath: '/audio/S.mp3', accentColor: '#7dd3fc', scale: 0.9,  position: [0, -0.45, 0], rotation: [0, 0, 0] }, // appeared way too high — dropped Y hard; tune toward 0 if overshoots
  { letter: 'T', word: 'Turtle',       targetIndex: 19, modelPath: '/models/T.glb', audioPath: '/audio/T.mp3', accentColor: '#34d399', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'U', word: 'Unicorn',      targetIndex: 20, modelPath: '/models/U.glb', audioPath: '/audio/U.mp3', accentColor: '#d946ef', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'V', word: 'Vulture',      targetIndex: 21, modelPath: '/models/V.glb', audioPath: '/audio/V.mp3', accentColor: '#a78bfa', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'W', word: 'Whale',        targetIndex: 22, modelPath: '/models/W.glb', audioPath: '/audio/W.mp3', accentColor: '#1d4ed8', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'X', word: 'Christmas Tree', targetIndex: 23, modelPath: '/models/X.glb', audioPath: '/audio/X.mp3', accentColor: '#4ade80', scale: 0.9, position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'Y', word: 'Yarn',         targetIndex: 24, modelPath: '/models/Y.glb', audioPath: '/audio/Y.mp3', accentColor: '#facc15', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
  { letter: 'Z', word: 'Zebra',        targetIndex: 25, modelPath: '/models/Z.glb', audioPath: '/audio/Z.mp3', accentColor: '#e2e8f0', scale: 0.9,  position: [0, 0, 0], rotation: [0, 0, 0] },
];
