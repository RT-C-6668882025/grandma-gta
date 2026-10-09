<div align="center">

# Grandma GTA · 阿嬤俠盜

**A browser-playable open world set in rural Taiwan, starring Auntie Xiuqin, 72.**
Square-dance battles, flip-flop combos, carjacking, police chases and goose wrangling.
It was all built with an AI toolchain: **Tripo** made the 3D characters and motions, **Claude Code** wrote the game, and **Three.js** renders it.

[中文](README.md) · [▶ Watch the trailer](https://github.com/andyhuo520/grandma-gta/releases/tag/v1.0.0) · [Quick start](#quick-start) · [Workflow](#workflow)

<a href="https://github.com/andyhuo520/grandma-gta/releases/tag/v1.0.0">
  <img src="docs/media/hero-skill-cards.gif" width="800" alt="Trailer opening: skill cards for square dance, slap, carjack, run and Auntie Xiuqin">
</a>

</div>

## Gameplay

| | | |
|---|---|---|
| <img src="docs/media/play-dance.gif"><br>**Square dance**: rhythm mini-game; win the plaza | <img src="docs/media/play-slipper.gif"><br>**Slap**: punches, kicks, sticks, thrown flip-flops (cartoon KO stars, no blood) | <img src="docs/media/play-carjack.gif"><br>**Carjack**: press F and the driver gets pulled out |
| <img src="docs/media/play-police.gif"><br>**Run**: a 1–5 "gossip" wanted level, chased by the old cop; pray at the temple to clear it | <img src="docs/media/play-ride.gif"><br>**Ride**: e-tricycle with 4 radio stations | <img src="docs/media/play-geese.gif"><br>**Catch the geese**: dive-tackle 6 runaway geese in 75 s; they waddle, flee, fly and bite back |

- **Story:** 2 chapters, 13 missions.
- **Side jobs:** taxi, recycling, cabbage farming, scratch cards.
- **Town systems:**
  - traffic AI that stops at red lights;
  - NPC law enforcement;
  - day/night and weather;
  - shops and outfit recolours.
- **Voice:** 110 voiced lines across 12 voices.

## Quick start

No dependencies and no build step.

```bash
git clone https://github.com/andyhuo520/grandma-gta.git && cd grandma-gta
python3 tools/serve.py        # open http://localhost:8965
```

**URL flags:**
- `?nostory`: free roam
- `?story=N`: jump to mission N
- `?rich`: start with NT$20,000
- `?autostart`: skip the title screen

**Controls:**
- **On foot:** `WASD` move, `Shift` run, `E` interact, `LMB/J` attack, `G` throw flip-flop.
- **Vehicles:** `F` enter, carjack or exit; `R` change radio station.
- **Menus:** `Tab` inventory, `T` phone (mission menu), `M` map, `Esc` pause.

> The original square-dance song is copyrighted and not included. Without it, the game synthesises a pentatonic dance loop at the same 127 BPM, so the rhythm game still works. To use your own legal copy, drop the chorus at `assets/music/square-dance-chorus.mp3`.

## Workflow

The game was built in four stages:

1. **Assets in Tripo Studio:**
   - T-pose concept image;
   - image-to-3D with **Smart Mesh P2.0** native quads (4 LODs);
   - texture → retopology → **Mixamo auto-rig**;
   - 22–25 preset motions plus **Text-to-Motion**;
   - GLB export.

   Geese, buffalo, the banyan and street props come from text-to-3D.

   | | |
   |---|---|
   | <img src="docs/media/tripo-image-to-3d.gif"> | <img src="docs/media/tripo-texture-rig.gif"> |
   | <img src="docs/media/tripo-text-to-motion.gif"> | <img src="docs/media/tripo-anim-presets.gif"> |
2. **Asset processing:**
   - headless Blender decimation of ~2M-triangle text-to-3D meshes (`tools/decimate.py`);
   - texture shrinking (`tools/glb-shrink.py`);
   - clip and bone inspection (`tools/glbinfo.py`).
3. **Game code by Claude Code:** ~8k lines of plain ES modules on Three.js r180, with no engine and no bundler. Highlights:
   - **`actor.js`:** a rig-agnostic animation layer with automatic hit-frame detection and two-bone IK. `leanToBars` and `gripHand` let a 0.41 m arm reach the handlebars.
   - **`goose.js`:** a static mesh brought to life by a vertex-shader injection (neck, legs, tucked feet) plus procedural wings and an 8-state AI.
   - **`law.js`:** NPC policing that targets whoever actually hit someone, never just who looks like a thug. It has 14 unit tests.
   - **Testing:** a debug API on `window.__ama` lets `tools/play.py` (Playwright, headless) play every mission end to end. Run the unit tests with `node --test tests/*.test.mjs`.
4. **Trailer:**
   - **Game footage:** `tools/rec.py` freezes the game clock and steps it frame by frame, piping frames straight into ffmpeg, so the 60 fps capture never drops a frame.
   - **Tripo footage:** recorded with Screen Studio.
   - **Edit:** cut in Remotion with GTA-style half-screen skill cards, MISSION PASSED / WASTED cards and comic speech bubbles.
   - **Voices:** Xiaomi MiMo TTS.

## Tools

| Tool | Used for |
|---|---|
| [Tripo Studio](https://www.tripo3d.ai) | Characters, animals and props; Smart Mesh P2.0, texturing, retopology, auto-rigging, motion presets, Text-to-Motion |
| [Claude Code](https://claude.com/claude-code) | All game code, tools and tests; drove Tripo Studio through Claude in Chrome |
| [Three.js](https://threejs.org) r180 | Rendering and skeletal animation |
| [Blender](https://www.blender.org) 5 | Headless decimation |
| [Playwright](https://playwright.dev) | Headless tests and frame-accurate capture |
| [Remotion](https://www.remotion.dev) + [FFmpeg](https://ffmpeg.org) | Trailer edit and mastering |
| Xiaomi MiMo TTS | Character voices |

## License

- **Code:** [MIT](LICENSE).
- **3D models** (`assets/**/*.glb`): generated with Tripo and provided for learning and demo use. Check [Tripo's terms](https://www.tripo3d.ai) before any commercial use.
- **Voice clips:** generated with Xiaomi MiMo TTS.
- **Music:** no copyrighted music is included.
