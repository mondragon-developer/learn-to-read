# Dream Arena — 3D soccer

The game uses Three.js 0.186.1. The reading app keeps its existing DOM renderer. `soccer.ts` is a small lazy-loading boundary; the engine and game scene are parsed when soccer opens. The service worker also precaches these chunks so the first game can open offline after installation.

## Play and visual design

- A stadium view replaces the small SVG panel on supported devices. Camera placement responds to portrait/landscape dimensions and stays still while aiming.
- Original articulated player meshes have jersey names/numbers, saved shirt/shorts/cleat colors, faces, gloves, run-up, kick, dive and celebration poses. Geometry and canvas textures are authored in source; no downloaded player likenesses, external models, paid generation jobs or asset-service credentials are involved.
- The pitch, stands, crowd sections, tubular goal frame and net are dimensional. The ball spins, the net ripples on a goal, and a short confetti burst and original synthesized fanfare accompany the existing Fish goal cue.
- Hold the marked ball for power, drag toward the goal, and release. Keyboard arrows move the aim; Enter/Space shoots. The aiming guide uses the same trajectory calculation as the ball.
- Goalkeeper mode: the camera sits behind the child's keeper and a computer striker shoots; a tap near the ball's path dives to meet it (`childDive3`), and the save counts toward the child's keeper saves.
- Keeper reach is one model (`KEEPER_ARM`, `keeperGlove`, `keeperReach`) used by the rig's arm angles and by save detection, with a 1.6 m step and 0.5 m jump limit; after the dive the keeper holds, then lands.
- Penalties, free kicks and targets retain three-shot rounds. Free kicks and targets allow left/centre/right and near/far origins. Anytime replays and the original scheduled-break limit remain. Soccer totals stay separate from reading assessments.

## Boundaries

- `src/domain/rewards/Soccer3D.ts`: world coordinates in metres, y up, goal line z=0; ball trajectory, keeper pose, wall, frame, target and save calculations. No Three.js dependency.
- `src/ui/activities/soccer3d/Assets.ts`: original meshes, textures and articulated character poses; static parts are merged per bone rather than drawn separately.
- `Scene.ts`: camera, projection/ray aiming, stadium, graphics quality and resource ownership. It owns no animation loop.
- `Game.ts`: one animation loop, input, rounds, pause/resume, score events and UI.
- `Sound.ts`: user-unlocked synthesized kick/impact/fanfare; stopped and closed with the game.
- `soccerFlat.ts`: previous SVG game, automatically used when WebGL2 is unavailable or the context is lost.

## Performance and lifecycle

The main JavaScript remains approximately 476 KB raw. The lazy game/engine chunk adds approximately 574 KB raw / 147 KB gzip; the SVG fallback is a separate 15 KB chunk. Textures and meshes are produced locally rather than downloaded. The offline audio library is unchanged.

Geometry is merged per articulated part, and crowd members use instancing. Rendering uses one shadow-casting light, a 1024-pixel shadow map, no postprocessing and a pixel-ratio ceiling of 1.25. Light mode uses a lower resolution and contact shadows. Sustained slow frames automatically lower resolution and disable shadow maps. These are bounded quality changes, not a guarantee of a fixed frame rate.

The loop stops when hidden and at round completion. Visibility restoration excludes hidden time from the shot. Closing disposes geometries, materials, textures, instancing buffers, shadow targets and renderer, explicitly releases the WebGL context, disconnects resize observers and closes the effects audio context. Reading resumes through the existing pause boundary.

Reduced motion disables camera travel, confetti and crowd movement and does not continuously render idle scenes. The ball and keeper still move during a shot so its result remains understandable.

## Validation and remaining device check

Unit tests cover physical origins, trajectories, weak shots, wall presence, goal dimensions, keeper collision poses and targets. Browser checks cover real touch-coordinate aiming, modes, offline rounds, replay, graphics settings, context disposal, context-loss fallback and returning to reading. The old SVG outcome tests explicitly disable WebGL2 and continue to exercise the fallback.

Validation passed: 161 unit tests, typecheck, content validation, production build, the full 90-scenario browser suite, and three additional first-game-offline checks. Those checks install the service worker, physically stop an isolated origin server, reload the app, and open and play the 3D game for the first time. Saved previews: [desktop](previews/soccer3d-desktop.png) and [phone](previews/soccer3d-phone.png).

Desktop browser measurements are not physical-device acceptance. Isolated runs measured about 17 ms median in iPad-sized WebKit and about 33 ms in headless Chromium. Confirm touch feel, thermal behaviour and sustained frame rate on the child's actual iPad before claiming 60 FPS there.
