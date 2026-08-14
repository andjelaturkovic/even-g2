# Soniox + Even Realities G2 Handoff

## Goal

Build an MVP that shows live `Soniox` speech-to-text captions on `Even Realities G2` glasses.

The final target flow is:

`audio input -> Even plugin -> Soniox realtime transcription -> transcript -> Even display on G2`

## What Has Been Confirmed

### Even side

- Even support confirmed that custom live caption text can be sent to the `G2` glasses through the `Even Hub iOS app`.
- Even support confirmed developers can build custom plugins for this.
- Plugin development uses the official `Even SDK`, `CLI`, and the portal at `https://hub.evenrealities.com`.
- Testing flow from support:
  - build plugin
  - package plugin
  - upload to Even portal
  - generate QR code
  - scan QR from `Developer Center` in the Even app
  - sync plugin to glasses for local testing
- iOS note from support:
  - use `Even Realities App v2.1.2+`
  - plugins can remain active while the app is in background or the phone is locked
  - if Even Hub is opened from the glasses while the phone screen is off, launch may fail when the initial view is an image
  - other images inside Even Hub may also fail to load in that iOS scenario
- Support also indicated:
  - rely on the official Even developer portal and docs as the authoritative source
  - the G2 platform source code is proprietary and not available for public forking/modification
  - the Even developer Discord is an active support channel

### Even docs conclusions

- Even plugins are technically `web apps` hosted by the phone app, not native code running directly on the glasses.
- The glasses act as `display + input + microphone hardware`.
- Plugin code lives on the phone and communicates with the glasses through the `Even Hub SDK`.
- Even plugin audio input can come from `Phone` or `Glasses`.
- For Even-side audio sources, the meaningful official inputs are `Phone` and `Glasses`, not `Laptop`.
- Even docs indicate audio is `PCM 16 kHz, signed 16-bit little-endian, mono`.
- Even display APIs support live text updates, which is suitable for captions.
- Support mail mentioned a `.ehp` package, but current docs should be treated as authoritative if they reference a newer package format or CLI behavior.
- Plugin launch is expected to be manual through Even, such as from the glasses menu or Even Hub area of the app.

### Soniox side

- Soniox supports realtime speech-to-text.
- Soniox has a `Web SDK`, suitable for browser/WebView-style clients.
- Soniox also provides backend/server SDKs such as `@soniox/node`.
- Soniox console provides API key generation and docs sections for STT, TTS, SDKs, and integrations.
- A permanent Soniox API key should not be embedded in the plugin/client.
- The correct security model is to keep the permanent key on a backend and issue a `temporary API key` for the plugin/client.
- The user already has a Soniox account and can generate an API key in Soniox console.
- For raw G2 microphone audio, the expected Soniox realtime configuration should match Even audio characteristics:
  - `audio_format: "s16le"`
  - `sample_rate: 16000`
  - `num_channels: 1`

## Architecture Decision

Recommended architecture:

`microphone -> plugin client -> Soniox -> transcript -> Even display`

With a minimal backend:

`plugin client -> backend -> temporary Soniox key`

### Responsibilities

#### Plugin client

- Runs as the Even plugin
- Handles start/stop captions
- Captures audio from `Phone` or later `Glasses`
- Connects to Soniox with a temporary key
- Receives partial/final transcript updates
- Renders live captions via Even display APIs

#### Backend

- Stores the permanent `SONIOX_API_KEY`
- Exposes an endpoint such as `POST /tmp-key`
- Returns a temporary Soniox key for realtime transcription
- Initial backend defaults for local MVP can stay conservative, for example:
  - temporary key expiry around `300` seconds
  - maximum realtime session duration around `1800` seconds
- When moving to real glasses usage, the maximum session duration should be increased to support longer caption sessions on-device

## MVP Strategy

Work in phases.

### Phase 1: Desktop mock

Purpose:
- validate Soniox transcription
- validate transcript update behavior
- validate caption UX
- move forward without physical glasses

Setup:
- local web app
- laptop microphone
- browser caption UI
- local backend for temporary Soniox key

Output:
- live captions in browser
- no Even dependency required for core STT validation
- This is the recommended way to use a laptop microphone early, because laptop mic does not replace the official Even plugin audio source model.

### Phase 2: Even plugin with phone mic

Purpose:
- validate actual Even plugin lifecycle
- validate permissions
- validate launch/stop flow
- validate text rendering path in Even

Setup:
- Even plugin built as a small web app
- audio source set to `Phone`
- same Soniox flow as Phase 1

Output:
- plugin opens manually
- captions can start/stop
- transcript is routed through Even UI/display APIs

### Phase 3: Switch to G2 mic

Purpose:
- final end-to-end validation on real hardware

Change:
- replace `Phone` audio source with `Glasses`

Output:
- real microphone on G2
- real captions on lenses

## Why a "Frontend" Exists Here

This project does include a frontend, but in a narrow sense.

The Even plugin itself is the client-side app:

- it is the UI
- it owns client state
- it captures audio
- it sends audio to Soniox
- it receives transcript results
- it renders captions

This is why the project naturally splits into:

- `plugin/client`
- `backend`

It is still "just a plugin", but the plugin is implemented as a web client.

## Recommended Tech Stack

Keep MVP simple:

- Plugin/client: `TypeScript + Vite`
- Backend: `Node + Express`
- Soniox client side: `Web SDK`
- Soniox backend side: `@soniox/node`

React is optional and not required for MVP.

## Launch and Stop Model

The plugin is not treated like a system daemon.

Expected behavior:

1. User manually opens the plugin from Even
2. User taps or selects `Start captions`
3. Plugin starts audio capture and Soniox streaming
4. User taps or selects `Stop captions`
5. Plugin stops streaming but may remain open
6. User exits plugin separately

Notes:
- plugin launch should be treated as manual, not automatic
- `Start captions` and `Stop captions` should be separate from plugin open/close
- background continuation on iOS is possible on supported app versions, but reconnect and state recovery should still be designed in

Recommended internal states:

- `Idle`
- `Ready`
- `Listening`
- `Streaming`
- `Stopped`
- `Error`

## Credentials Needed

### For Phase 1

Required:

- Soniox account
- permanent `SONIOX_API_KEY`

Recommended usage:

- store permanent key only in backend `.env`
- use temporary-key flow even during desktop mock

Not required for Phase 1:

- physical G2 glasses
- native iOS credentials
- production deployment setup

## Practical Constraints

### What can be built without G2

- Soniox realtime flow
- temporary-key backend
- transcript buffering and rendering logic
- start/stop state management
- browser-based caption UI
- most of the Even plugin logic structure

### What cannot be fully validated without G2

- actual G2 microphone behavior
- BLE/device transport characteristics
- text readability on the real lens display
- final end-to-end latency on actual hardware

## Open Decisions

These were not final yet and should be chosen when implementation starts:

- start with `plain TypeScript + Vite` or introduce React
- exact caption layout behavior in Even UI
- whether to keep a rolling transcript window or shorter caption lines only

Current recommendation:

- use `plain TypeScript + Vite`
- start with a simple rolling transcript

## Potential Future Features

- Speaker separation / diarization
  - investigate Soniox speaker diarization for differentiating multiple speakers in the same live transcript
  - likely useful first on phone UI, then evaluate whether the G2 display can show speaker labels without becoming too crowded

- Long-text protection for continuous audio
  - handle cases where very long text accumulates without clean pauses, for example music, radio, or long uninterrupted speech
  - likely direction: reset or trim transcript only on finalization boundaries, not in the middle of live speech

- Audio input source selection
  - support selecting the input source inside the plugin UI
  - options to consider: `Phone microphone` and `Glasses microphone`
  - current implementation uses the `Glasses` microphone path

## Suggested Project Structure

```text
project/
  client/
    src/
      main.ts
      soniox.ts
      captions.ts
      state.ts
      mock-mic.ts
    index.html
    package.json
  plugin/
    src/
      main.ts
      even.ts
      soniox.ts
      captions.ts
      state.ts
    app.json
    package.json
  server/
    src/
      index.ts
      soniox-temp-key.ts
    package.json
    .env
```

The exact structure can be simplified further if desired.

## Immediate Next Step

Best next implementation step:

1. build `Phase 1` desktop mock
2. build backend temporary-key endpoint
3. confirm realtime transcription quality and latency
4. then move same logic into Even plugin

## Suggested Prompt To Restore Context In A New Project

Use this as the opening prompt in a new Codex session:

```text
I am building an MVP that displays Soniox live transcription captions on Even Realities G2 glasses.

Context:
- Even plugins are hosted through Even Hub and technically run as a web app/client on the phone, connected to the glasses through the Even SDK.
- The final architecture is: microphone -> Even plugin -> Soniox realtime transcription -> transcript -> Even display on G2.
- We will implement in phases:
  1. desktop mock with laptop microphone
  2. Even plugin with phone microphone
  3. switch to G2 microphone later
- We should not expose the permanent Soniox API key in the client/plugin.
- We need a small Node/Express backend that stores SONIOX_API_KEY and issues temporary Soniox keys.
- Recommended stack is plain TypeScript + Vite for client/plugin and Node + Express for backend.
- The immediate task is to build Phase 1 first unless I explicitly say otherwise.

Please read this repository and help me implement the project accordingly.
```

## Source Pointers

- Even portal: `https://hub.evenrealities.com/`
- Even docs: `https://hub.evenrealities.com/docs`
- Even get started overview: `https://hub.evenrealities.com/docs/get-started/overview`
- Even API reference/docs root: `https://hub.evenrealities.com/docs/`
- Even developer Discord: `https://discord.com/invite/GsuDkKDXDE`
- Soniox STT get started: `https://soniox.com/docs/stt/get-started`
- Soniox Web SDK: `https://soniox.com/docs/sdk/web-SDK`
- Soniox Python SDK: `https://soniox.com/docs/sdk/python-SDK`
- Soniox docs root: `https://soniox.com/docs`
- Soniox Python SDK page was also referenced as a secondary source
