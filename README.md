# Even G2 Soniox Captions

MVP scaffold for live Soniox captions on Even Realities G2 glasses.

## Workspaces

- `client/`: desktop browser client for Phase 1 validation
- `plugin/`: Even `asr` template-based plugin for device integration
- `server/`: backend that will issue temporary Soniox API keys
- `shared/`: shared types and constants across workspaces

## Planned phases

1. Desktop browser proof of concept with laptop microphone
2. Even plugin using G2 glasses microphone
3. Private build packaging and on-device iteration

## Notes

- The desktop `client/` keeps the safer server-side temporary-key flow.
- The desktop `client/` still uses the backend temporary-key flow.
- The `plugin/` workspace now intentionally follows the official Even `asr` template pattern and uses `VITE_STT_API_KEY` client-side.
- The Even plugin package is separate from the backend deployment.
- `plugin/app.json` follows the Even template manifest shape and should be validated with `evenhub pack` before upload.
- Replace the placeholder `package_id` in `plugin/app.json` before packaging or uploading to Even Hub.

## Phase 1 backend

Create `server/.env` from `server/.env.example` and set:

- `SONIOX_API_KEY`
- optional `SONIOX_API_BASE_URL`
- optional temporary-key duration overrides

The backend exposes:

- `GET /health`
- `POST /tmp-key`

## Phase 1 local test flow

1. Create `server/.env` from `server/.env.example` and set `SONIOX_API_KEY`.
2. Create `client/.env` from `client/.env.example` if your backend is not on `http://localhost:3001`.
3. Start the backend:
   - `npm run dev:server`
4. Start the desktop client:
   - `npm run dev:client`
5. Open `http://localhost:5173`.
6. Click `Start captions`, allow microphone access, and speak in Croatian or English.

Expected Phase 1 behavior:

- backend health check passes
- temporary Soniox key is fetched from `POST /tmp-key`
- real-time transcription starts in the browser
- finalized caption lines accumulate in a rolling window
- `Stop captions` gracefully finalizes the current utterance and ends the session

## Phase 2 local device test flow

1. Make sure your Even G2 glasses are paired, updated, and visible in the Even Realities App.
2. Enable Developer Mode in the Even Realities App.
3. Create `plugin/.env.local` from `plugin/.env.example` and set `VITE_STT_API_KEY`.
4. Start the plugin dev server:
   - `npm run dev:plugin`
5. On your computer, generate a QR code that points to the plugin dev server:
   - `evenhub qr --url "http://<your-local-ip>:5173"`
6. In the Even Realities App, open the developer QR entry and scan the code.
7. Open the plugin on the glasses. The template starts listening immediately.

Expected Phase 2 behavior:

- the plugin WebView loads inside Even App
- the Even bridge creates a single full-screen startup text container on G2
- the glasses microphone starts automatically
- PCM audio is streamed directly into Soniox real-time STT from the plugin
- the phone UI mirrors final and interim transcript state
- the glasses view is updated with a debounced rolling transcript
- double-tapping the temple exits the app and stops the microphone
