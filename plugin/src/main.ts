import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList
} from "@evenrealities/even_hub_sdk";

import { startSttStream } from "./asr/stt";
import { mountUi, setStatus, setTranscript } from "./ui";

mountUi();

interface CaptionState {
  line1: string;
  line2: string;
  activeLine: string;
}

const apiKey = import.meta.env.VITE_STT_API_KEY as string | undefined;

if (!apiKey) {
  setStatus("error", "VITE_STT_API_KEY not set - copy .env.example to .env.local");
  throw new Error("VITE_STT_API_KEY is not set");
}

setStatus("connecting", "Waiting for Even bridge…");

const bridge = await waitForEvenAppBridge();
setStatus("connecting", "Even bridge connected · creating transcript page");
const MAX_ACTIVE_LINE_CHARACTERS = 50;
const CAPTION_INACTIVITY_TIMEOUT_MS = 60_000;

const transcriptContainer = new TextContainerProperty({
  xPosition: 18,
  yPosition: 180,
  width: 520,
  height: 248,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 4,
  containerID: 1,
  containerName: "main",
  zOrderIndex: 1,
  content: "Listening…",
  isEventCapture: 1
});

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [transcriptContainer]
  })
);

if (result !== 0) {
  setStatus("error", `createStartUpPageContainer failed: ${result}`);
  throw new Error(`createStartUpPageContainer failed: ${result}`);
}

let lastRender = "";
let renderTimer: number | null = null;
let inactivityTimer: number | null = null;
let currentContent = "Listening…";
let hasSeenAudio = false;
let cleanedUp = false;
let captionState: CaptionState = createEmptyCaptionState();
let finalizedUtteranceCount = 0;
let lastRawInterim = "";
let committedInterimText = "";
let liveInterimText = "";
let lastObservedFinalText = "";
let lastObservedInterimText = "";

const stt = startSttStream(
  apiKey,
  ({ finalText, interimText }) => {
    applyCaptionSnapshot(finalText, interimText);
  },
  (error) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus("error", `STT error: ${message}`);
    currentContent = `Error\n${message}`;
    scheduleGlassesRender();
    console.error("STT error:", error);
  }
);

await bridge.audioControl(true);
setStatus("connecting", "Glasses microphone armed · waiting for first audio");
scheduleGlassesRender();

function scheduleGlassesRender(): void {
  if (renderTimer !== null) {
    return;
  }

  renderTimer = window.setTimeout(async () => {
    renderTimer = null;

    if (currentContent === lastRender) {
      return;
    }

    lastRender = currentContent;

    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 1,
        containerName: "main",
        content: currentContent
      })
    );
  }, 90);
}

function eventTypeOf(
  envelope?: {
    eventType?: OsEventTypeList;
  }
): OsEventTypeList | null {
  if (!envelope) {
    return null;
  }

  return envelope.eventType ?? null;
}

function cleanup(): void {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;
  if (inactivityTimer !== null) {
    window.clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  bridge.audioControl(false);
  stt.close();
  unsubscribe();
}

const unsubscribe = bridge.onEvenHubEvent((event) => {
  const pcm = event.audioEvent?.audioPcm;
  if (pcm) {
    if (!hasSeenAudio) {
      hasSeenAudio = true;
      setStatus("listening", "Glasses microphone live · double-tap to exit");
    }

    stt.sendPcm(pcm);
  }

  const sysType = eventTypeOf(event.sysEvent);
  const textType = eventTypeOf(event.textEvent);

  if (
    sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    textType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    cleanup();
    bridge.shutDownPageContainer(1);
    return;
  }

  if (
    sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
    sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
  ) {
    cleanup();
  }
});

window.addEventListener("beforeunload", cleanup);

function applyCaptionSnapshot(finalText: string, interimText: string): void {
  const normalizedFinalText = finalText.trim();
  const normalizedInterimText = interimText.trim();
  const transcriptChanged =
    normalizedFinalText !== lastObservedFinalText ||
    normalizedInterimText !== lastObservedInterimText;

  lastObservedFinalText = normalizedFinalText;
  lastObservedInterimText = normalizedInterimText;

  if (
    transcriptChanged &&
    (normalizedFinalText || normalizedInterimText)
  ) {
    resetCaptionInactivityTimer();
  }

  const finalizedUtterances = splitTranscriptLines(finalText);

  if (finalizedUtterances.length < finalizedUtteranceCount) {
    resetCaptionState();
  }

  const newUtterances = finalizedUtterances.slice(finalizedUtteranceCount);
  for (const utterance of newUtterances) {
    commitFinalizedUtterance(utterance);
  }

  finalizedUtteranceCount = finalizedUtterances.length;
  processInterim(interimText);
  syncCaptionDisplays();
}

function resetCaptionInactivityTimer(): void {
  if (inactivityTimer !== null) {
    window.clearTimeout(inactivityTimer);
  }

  inactivityTimer = window.setTimeout(() => {
    inactivityTimer = null;
    resetCaptionState();
    stt.resetTranscript();
    currentContent = "Listening…";
    setTranscript(currentContent);
    scheduleGlassesRender();
  }, CAPTION_INACTIVITY_TIMEOUT_MS);
}

function processInterim(rawInterim: string): void {
  const trimmedInterim = rawInterim.trim();
  liveInterimText = trimmedInterim;

  if (!trimmedInterim) {
    lastRawInterim = "";
    return;
  }

  const commonPrefix = getCommonPrefix(lastRawInterim, trimmedInterim);
  const stablePrefix = getStableCommitPrefix(commonPrefix);

  if (stablePrefix.length > committedInterimText.length) {
    appendCaptionText(stablePrefix.slice(committedInterimText.length));
    committedInterimText = stablePrefix;
  }

  lastRawInterim = trimmedInterim;
}

function commitFinalizedUtterance(utterance: string): void {
  const normalizedUtterance = utterance.trim();
  if (!normalizedUtterance) {
    resetInterimTracking();
    return;
  }

  const committedPrefix = normalizedUtterance.startsWith(committedInterimText)
    ? committedInterimText
    : getCommonPrefix(committedInterimText, normalizedUtterance);
  const remainder = normalizedUtterance.slice(committedPrefix.length);

  appendCaptionText(remainder);
  sealActiveLine();
  resetInterimTracking();
}

function appendCaptionText(text: string): void {
  appendCaptionTextToState(captionState, text);
}

function appendCaptionTextToState(state: CaptionState, text: string): void {
  const tokens = normalizeCaptionText(text);

  for (const token of tokens) {
    if (!token) {
      continue;
    }

    const nextLine = state.activeLine
      ? `${state.activeLine} ${token}`
      : token;

    if (nextLine.length <= MAX_ACTIVE_LINE_CHARACTERS) {
      state.activeLine = nextLine;
      continue;
    }

    rotateCaptionLines(state);
    state.activeLine = token;
  }
}

function sealActiveLine(): void {
  if (!captionState.activeLine) {
    return;
  }

  rotateCaptionLines(captionState);
}

function rotateCaptionLines(state: CaptionState): void {
  state.line1 = state.line2;
  state.line2 = state.activeLine;
  state.activeLine = "";
}

function syncCaptionDisplays(): void {
  currentContent = renderCaptionState(projectCaptionState());
  setTranscript(currentContent);
  scheduleGlassesRender();
}

function renderCaptionState(state: CaptionState): string {
  const lines = [state.line1, state.line2, state.activeLine].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "Listening…";
}

function projectCaptionState(): CaptionState {
  const projectedState = cloneCaptionState(captionState);
  const previewTail = getLivePreviewTail();

  if (previewTail) {
    appendCaptionTextToState(projectedState, previewTail);
  }

  return projectedState;
}

function cloneCaptionState(state: CaptionState): CaptionState {
  return {
    line1: state.line1,
    line2: state.line2,
    activeLine: state.activeLine
  };
}

function getLivePreviewTail(): string {
  if (!liveInterimText) {
    return "";
  }

  if (!committedInterimText) {
    return liveInterimText;
  }

  if (liveInterimText.startsWith(committedInterimText)) {
    return liveInterimText.slice(committedInterimText.length).trim();
  }

  return liveInterimText;
}

function splitTranscriptLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeCaptionText(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function getCommonPrefix(left: string, right: string): string {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;

  while (index < maxLength && left[index] === right[index]) {
    index += 1;
  }

  return left.slice(0, index);
}

function getStableCommitPrefix(text: string): string {
  let boundaryIndex = -1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (/\s/.test(character) || /[.,!?;:]/.test(character)) {
      boundaryIndex = /\s/.test(character) ? index : index + 1;
    }
  }

  if (boundaryIndex < 0) {
    return "";
  }

  return text.slice(0, boundaryIndex).trim();
}

function resetCaptionState(): void {
  captionState = createEmptyCaptionState();
  finalizedUtteranceCount = 0;
  resetInterimTracking();
}

function resetInterimTracking(): void {
  lastRawInterim = "";
  committedInterimText = "";
  liveInterimText = "";
}

function createEmptyCaptionState(): CaptionState {
  return {
    line1: "",
    line2: "",
    activeLine: ""
  };
}
