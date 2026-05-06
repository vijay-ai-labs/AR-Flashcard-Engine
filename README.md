# AR Codex — A–Z Alphabet Flashcard AR

A mobile WebAR app that scans printed A–Z alphabet flashcards and displays an interactive 3D model above each one. Point your phone camera at any card to see the letter's object come to life — rotate, zoom, and hear the word spoken aloud.

## Features

- 26 unique 3D models (A = Apple → Z = Zebra) triggered by image targets
- Real-time AR tracking via MindAR image recognition
- Drag to rotate, pinch to zoom, long-press to reposition in world space
- Tap to trigger reveal/bounce animation
- Per-letter audio pronunciation
- "Place Here" world-space pinning — walk around the model
- Glassmorphism UI with per-letter accent colours
- Fully responsive, safe-area aware layout for notched phones

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Build | [Vite](https://vitejs.dev/) 7 + TypeScript 5 |
| 3D | [Three.js](https://threejs.org/) r160 |
| AR tracking | [MindAR](https://hiukim.github.io/mind-ar-js-doc/) (bundled vendor) |
| SSL (dev) | `@vitejs/plugin-basic-ssl` |

## Folder Structure

```
AR-CodexV2/
├── public/
│   ├── targets/
│   │   ├── alphabet.mind   ← compiled MindAR target (A=0 … Z=25)
│   │   ├── A.png … Z.png   ← flashcard reference images
│   ├── models/
│   │   └── A.glb … Z.glb   ← 3D models
│   └── audio/
│       └── A.mp3 … Z.mp3   ← pronunciation audio
├── src/
│   ├── cards.ts            ← per-letter config (scale, position, rotation, colour)
│   ├── main.ts             ← AR session, input handling, UI
│   ├── modelExperience.ts  ← Three.js model loading, animations, particles
│   ├── placementManager.ts ← world-space placement logic
│   ├── styles.css
│   └── vendor/             ← bundled MindAR ES module
├── index.html
├── vite.config.ts
└── package.json
```

## Requirements

- **Node.js** 18+ (for local development)
- **Modern mobile browser** — Chrome for Android, Safari 15+ on iOS
- **Camera permission** — required by the browser
- **HTTPS** — browsers block `getUserMedia` on plain HTTP. Vite's dev server uses a self-signed cert automatically. On a deployed site use a real HTTPS URL (Vercel/Netlify provide this automatically).
- **Printed flashcards** — physical A–Z cards with the images from `public/targets/`. The reference images are the source-of-truth for recognition.

## Local Development

```bash
npm install
npm run dev
```

Vite starts an HTTPS dev server. Open the **Network URL** (e.g. `https://192.168.x.x:5173`) on your phone. Accept the self-signed certificate warning in the browser when prompted.

```bash
npm run preview   # preview the production build locally
```

## Build

```bash
npm run build
```

Output goes to `dist/`. TypeScript is type-checked first (`tsc`), then Vite bundles everything. All `public/` assets (targets, models, audio) are copied into `dist/` automatically.

## Deployment

**Recommended: Vercel or Netlify**

Both platforms build and serve the app automatically with HTTPS.

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 18+ |

No environment variables required. No server-side logic — the app is entirely static after build.

**GitHub Pages note:** GitHub Pages serves from a subpath (`/repo-name/`). You must add `base: '/repo-name/'` to `vite.config.ts` before building, otherwise asset paths will 404. Vercel/Netlify serve from root and do not need this change.

## Asset Guide

### Target file

`public/targets/alphabet.mind` — compiled MindAR image target database. Target indexes are fixed:

```
A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9,
K=10, L=11, M=12, N=13, O=14, P=15, Q=16, R=17, S=18,
T=19, U=20, V=21, W=22, X=23, Y=24, Z=25
```

Do not rename or replace `alphabet.mind` without recompiling it from the source images using the [MindAR compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile/).

### Models

`public/models/A.glb` through `Z.glb`. Every model is normalised at load time so its longest axis equals 1 marker unit, then scaled by the `scale` field in `src/cards.ts`.

### Audio

`public/audio/A.mp3` through `Z.mp3`. Played on `targetFound`. Browser autoplay policy may block audio until the user has interacted with the page (e.g. tapped Start Camera).

## Per-Card Tuning

Each letter has its own config in `src/cards.ts`:

```ts
{ letter: 'A', word: 'Apple', targetIndex: 0,
  modelPath: '/models/A.glb', audioPath: '/audio/A.mp3',
  accentColor: '#ef4444',
  scale: 0.9,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
}
```

| Field | Effect |
|-------|--------|
| `scale` | Final size in marker-relative units. The model is normalised to maxDim = 1 first, so `scale: 0.9` fills ~90% of one marker unit. |
| `position` | `[x, y, z]`. X/Z shift the model laterally. Y adds extra vertical lift above the auto-computed floor (useful for birds, planes, etc.). |
| `rotation` | Initial Euler angles in radians `[x, y, z]`. Use to fix models that load facing the wrong direction (e.g. `[0, Math.PI, 0]` flips 180°). |
| `anchorPosition` | Shifts the entire content root (ring + model) relative to the card centre. |
| `ringScale` | Scales the decorative ring independently from the model. |
| `minScale` / `maxScale` | Clamps pinch-zoom range for this card. |

**Common fixes:**

- Model too small → increase `scale`
- Model too large → decrease `scale`
- Model off-centre → adjust `position[0]` (left/right) or `position[2]` (forward/back)
- Model floating or sinking → adjust `position[1]` (positive = higher)
- Model facing wrong direction → adjust `rotation[1]` (`Math.PI` = 180° turn)

**Debug logging:**

Set `DEBUG_TUNING = true` in `src/modelExperience.ts` to log bounding box, scale, baseY, position, and rotation for each letter to the browser console on load. Set back to `false` before shipping.

## Troubleshooting

**Camera not opening**
- Must be served over HTTPS (or `localhost`).
- Grant camera permission when the browser prompts.
- On iOS, use Safari — Chrome on iOS cannot access camera for WebAR.

**Model not appearing**
- Check that the printed flashcard matches the images in `public/targets/`.
- Ensure the card is well-lit and fills at least 30–40% of the camera view.
- Check the browser console for 404 errors on model or target paths.

**Marker recognition slow or unreliable**
- Use good lighting — avoid shadows across the card.
- Print cards at high quality; the reference images are full-colour.
- Hold the camera steady for 1–2 seconds over a card.
- Recognition speed is a function of hardware; lower-end phones will be slower.

**Audio not playing**
- Browser autoplay policy blocks audio until a user gesture. Tap "Start Camera" first.
- Check the console for 404 on the audio file.

**Model too large, small, or off-centre**
- Adjust `scale` and `position` in `src/cards.ts` for that letter.
- Enable `DEBUG_TUNING` to read the normalised bounding box in the console.



Recommended target: under 3 MB per model. Tools to reduce size:

```bash
# Install
npm install -g @gltf-transform/cli

# Optimise a model (meshopt + texture resize)
gltf-transform optimize public/models/O.glb public/models/O.glb --texture-compress webp
```

Also consider Draco compression, but verify MindAR's bundled Three.js supports it first.

## Known Limitations

- Physical flashcard recognition and model alignment **must be verified on a real phone with printed cards** — this cannot be confirmed through a desktop browser or emulator.
- Browser autoplay policy will block pronunciation audio until the user has made a gesture on the page.
- iOS WebXR/WebAR is limited to Safari; Chrome on iOS will not grant camera access for AR.
- `alphabet.mind` is ~12 MB and loaded at AR session start — expect a brief delay on first use over a slow connection.
