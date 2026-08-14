import {
  DEFAULT_CAPTION_SESSION_CONFIG,
  DEFAULT_REALTIME_AUDIO_CONFIG,
  type AppSessionState
} from "@even-g2/shared";
import type { Recording, RealtimeResult } from "@soniox/client";

import {
  fetchBackendHealth,
  SERVER_BASE_URL,
  type BackendHealthResponse
} from "./api";
import {
  createRecordingSession,
  createUtteranceBuffer,
  getSonioxClient,
  SONIOX_REALTIME_MODEL,
  summarizeRealtimeResult
} from "./soniox";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

const appRoot = app;

let state: AppSessionState = "idle";
let recordingSession: Recording | null = null;
let backendHealth: BackendHealthResponse | null = null;
let liveTranscriptText = "";
let lastAudioMs = 0;
let captionLines: string[] = [];
let isStopping = false;
const eventLog: string[] = [];
let utteranceBuffer = createUtteranceBuffer();

renderShell();
bindActions();
syncUi();
void initialize();

async function initialize(): Promise<void> {
  appendEvent(`Using backend ${SERVER_BASE_URL}`);

  try {
    backendHealth = await fetchBackendHealth();
    appendEvent("Backend health check passed");
    setState("ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backend error";
    appendEvent(`Backend unavailable: ${message}`);
    setState("error");
  }
}

async function handleStart(): Promise<void> {
  if (recordingSession) {
    return;
  }

  try {
    resetTranscriptState();
    const permission = await getSonioxClient().permissions?.request("microphone");

    if (permission && permission.status !== "granted") {
      appendEvent(`Microphone permission not granted: ${permission.status}`);
      setState("error");
      return;
    }

    appendEvent("Starting Soniox realtime session");
    const recording = createRecordingSession();
    recordingSession = recording;
    isStopping = false;
    attachRecordingListeners(recording);
    syncUi();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown start error";
    appendEvent(`Start error: ${message}`);
    setState("error");
  }
}

async function handleStop(): Promise<void> {
  if (!recordingSession) {
    return;
  }

  const activeRecording = recordingSession;
  isStopping = true;
  appendEvent("Stopping Soniox session");

  try {
    activeRecording.finalize({
      trailing_silence_ms: 250
    });
    appendEvent("Requested final transcript flush");
    await activeRecording.stop();
    flushCurrentUtterance();
    appendEvent("Recording stopped gracefully");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown stop error";
    appendEvent(`Stop error: ${message}`);
    setState("error");
  } finally {
    isStopping = false;
    recordingSession = null;
    setState("stopped");
  }
}

function setState(nextState: AppSessionState): void {
  state = nextState;
  syncUi();
}

function appendEvent(message: string): void {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  eventLog.unshift(`${timestamp}  ${message}`);
  if (eventLog.length > 8) {
    eventLog.length = 8;
  }

  syncLog();
}

function renderShell(): void {
  appRoot.innerHTML = `
    <main class="shell">
      <section class="panel">
        <div class="hero">
          <div>
            <p class="eyebrow">Phase 1 Desktop Mock</p>
            <h1>Soniox Captions Client</h1>
          </div>
          <span class="status" data-role="status-label"></span>
        </div>

        <p class="copy">
          This desktop mock now uses the official Soniox Web SDK and your temporary-key backend
          to validate real-time transcription before the Even plugin integration starts.
        </p>

        <div class="actions">
          <button class="button button-primary" data-action="start">
            Start captions
          </button>
          <button class="button" data-action="stop">
            Stop captions
          </button>
        </div>

        <section class="transcript">
          <div class="transcript-header">
            <h2>Captions</h2>
            <span data-role="audio-ms">0 ms processed</span>
          </div>
          <div class="transcript-body">
            <ol class="transcript-lines" data-role="caption-lines"></ol>
            <p class="transcript-live" data-role="live-transcript"></p>
          </div>
        </section>

        <dl class="meta">
          <div>
            <dt>Capture source</dt>
            <dd>${DEFAULT_CAPTION_SESSION_CONFIG.captureSource}</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>${SERVER_BASE_URL}</dd>
          </div>
          <div>
            <dt>Audio target</dt>
            <dd>${DEFAULT_REALTIME_AUDIO_CONFIG.sampleRate} Hz / ${DEFAULT_REALTIME_AUDIO_CONFIG.audioFormat}</dd>
          </div>
          <div>
            <dt>Soniox model</dt>
            <dd>${SONIOX_REALTIME_MODEL}</dd>
          </div>
          <div>
            <dt>Rolling window</dt>
            <dd>${DEFAULT_CAPTION_SESSION_CONFIG.rollingWindowSize} finalized + 1 live</dd>
          </div>
          <div>
            <dt>Soniox configured</dt>
            <dd data-role="soniox-configured">unknown</dd>
          </div>
        </dl>

        <section class="log">
          <div class="log-header">
            <h2>Event log</h2>
            <span data-role="log-count">0 entries</span>
          </div>
          <ul data-role="event-log"></ul>
        </section>
      </section>
    </main>
  `;
}

function bindActions(): void {
  const startButton = getRequiredElement<HTMLButtonElement>('[data-action="start"]');
  const stopButton = getRequiredElement<HTMLButtonElement>('[data-action="stop"]');

  startButton.addEventListener("click", () => {
    void handleStart();
  });

  stopButton.addEventListener("click", () => {
    void handleStop();
  });
}

function syncUi(): void {
  syncStatus();
  syncButtons();
  syncTranscript();
  syncBackendHealth();
  syncLog();
}

function syncStatus(): void {
  const statusLabel = getRequiredElement<HTMLElement>('[data-role="status-label"]');
  statusLabel.className = `status status-${state}`;
  statusLabel.textContent = state;
}

function syncButtons(): void {
  const startButton = getRequiredElement<HTMLButtonElement>('[data-action="start"]');
  const stopButton = getRequiredElement<HTMLButtonElement>('[data-action="stop"]');

  startButton.disabled = recordingSession !== null;
  stopButton.disabled = recordingSession === null;
}

function syncTranscript(): void {
  const captionLinesList = getRequiredElement<HTMLOListElement>('[data-role="caption-lines"]');
  const liveTranscript = getRequiredElement<HTMLElement>('[data-role="live-transcript"]');
  const audioMs = getRequiredElement<HTMLElement>('[data-role="audio-ms"]');

  captionLinesList.innerHTML = captionLines.length
    ? captionLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")
    : `<li class="transcript-placeholder">Finalized caption lines will appear here.</li>`;
  liveTranscript.textContent = liveTranscriptText || "Live in-progress caption will appear here.";
  audioMs.textContent = `${lastAudioMs} ms processed`;
}

function syncBackendHealth(): void {
  const sonioxConfigured = getRequiredElement<HTMLElement>('[data-role="soniox-configured"]');
  sonioxConfigured.textContent = backendHealth
    ? String(backendHealth.sonioxConfigured)
    : "unknown";
}

function syncLog(): void {
  const logCount = getRequiredElement<HTMLElement>('[data-role="log-count"]');
  const logList = getRequiredElement<HTMLUListElement>('[data-role="event-log"]');

  logCount.textContent = `${eventLog.length} entries`;
  logList.innerHTML = eventLog.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
}

function getRequiredElement<T extends Element>(selector: string): T {
  const element = appRoot.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function attachRecordingListeners(recording: Recording): void {
  recording.on("state_change", ({ new_state, old_state, reason }) => {
    appendEvent(`Soniox state: ${old_state} -> ${new_state}${reason ? ` (${reason})` : ""}`);
    setState(mapRecordingState(new_state));
  });

  recording.on("connected", () => {
    appendEvent("Soniox websocket connected");
  });

  recording.on("result", (result) => {
    applyRealtimeResult(result);
  });

  recording.on("finalized", () => {
    appendEvent("Current speech finalized");
    flushCurrentUtterance();
  });

  recording.on("endpoint", () => {
    appendEvent("Endpoint detected");
    flushCurrentUtterance();
  });

  recording.on("finished", () => {
    appendEvent("Soniox signaled end of stream");
    flushCurrentUtterance();
    if (!isStopping) {
      recordingSession = null;
      setState("stopped");
    }
  });

  recording.on("error", (error) => {
    appendEvent(`Soniox error: ${error.message}`);
    recordingSession = null;
    setState("error");
  });
}

function applyRealtimeResult(result: RealtimeResult): void {
  utteranceBuffer.addResult(result);
  liveTranscriptText = summarizeRealtimeResult(result).liveText.trim();
  lastAudioMs = result.total_audio_proc_ms;
  syncTranscript();
}

function flushCurrentUtterance(): void {
  const utterance = utteranceBuffer.markEndpoint();

  if (!utterance) {
    return;
  }

  const text = utterance.text.trim();
  if (!text) {
    return;
  }

  captionLines = [...captionLines, text].slice(
    -DEFAULT_CAPTION_SESSION_CONFIG.rollingWindowSize
  );
  liveTranscriptText = "";
  syncTranscript();
}

function resetTranscriptState(): void {
  liveTranscriptText = "";
  lastAudioMs = 0;
  captionLines = [];
  utteranceBuffer.reset();
  utteranceBuffer = createUtteranceBuffer();
  syncTranscript();
}

function mapRecordingState(
  recordingState:
    | "idle"
    | "starting"
    | "connecting"
    | "recording"
    | "paused"
    | "stopping"
    | "stopped"
    | "error"
    | "canceled"
    | "reconnecting"
): AppSessionState {
  switch (recordingState) {
    case "idle":
      return "idle";
    case "starting":
    case "connecting":
      return "listening";
    case "recording":
    case "paused":
    case "reconnecting":
      return "streaming";
    case "stopping":
    case "stopped":
    case "canceled":
      return "stopped";
    case "error":
      return "error";
  }
}
