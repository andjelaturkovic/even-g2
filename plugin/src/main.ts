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

const apiKey = import.meta.env.VITE_STT_API_KEY as string | undefined;

if (!apiKey) {
  setStatus("error", "VITE_STT_API_KEY not set - copy .env.example to .env.local");
  throw new Error("VITE_STT_API_KEY is not set");
}

setStatus("connecting", "Waiting for Even bridge…");

const bridge = await waitForEvenAppBridge();
setStatus("connecting", "Even bridge connected · creating transcript page");
const MAX_VISIBLE_FINAL_UTTERANCES = 2;
const MAX_VISIBLE_TRANSCRIPT_CHARACTERS = 200;

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
let currentContent = "Listening…";
let hasSeenAudio = false;
let cleanedUp = false;

const stt = startSttStream(
  apiKey,
  ({ finalText, interimText }) => {
    const nextContent = buildGlassesTranscript(finalText, interimText);

    if (nextContent.length > MAX_VISIBLE_TRANSCRIPT_CHARACTERS) {
      stt.resetTranscript();
      currentContent = "Listening…";
      setTranscript("", "");
      scheduleGlassesRender();
      return;
    }

    currentContent = nextContent;
    setTranscript(finalText, interimText);
    scheduleGlassesRender();
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
  }, 120);
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

function buildGlassesTranscript(finalText: string, interimText: string): string {
  const finalUtterances = finalText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-MAX_VISIBLE_FINAL_UTTERANCES);

  const interim = interimText.trim();
  const parts = interim ? [...finalUtterances, interim] : finalUtterances;

  return parts.length > 0 ? parts.join("\n") : "Listening…";
}
