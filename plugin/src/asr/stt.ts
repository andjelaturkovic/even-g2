import {
  RealtimeSttSession,
  RealtimeUtteranceBuffer,
  resolveConnectionConfig,
  type RealtimeResult
} from "@soniox/client";

export interface SttSnapshot {
  finalText: string;
  interimText: string;
  finished: boolean;
}

export interface SttClient {
  sendPcm(chunk: Uint8Array): void;
  close(): void;
  resetTranscript(): void;
}

export function startSttStream(
  apiKey: string,
  onSnapshot: (snap: SttSnapshot) => void,
  onError?: (err: unknown) => void
): SttClient {
  const resolved = resolveConnectionConfig({
    api_key: apiKey
  });

  const session = new RealtimeSttSession(resolved.api_key, resolved.stt_ws_url, {
    model: "stt-rt-v5",
    audio_format: "pcm_s16le",
    sample_rate: 16000,
    num_channels: 1,
    language_hints: ["hr", "en"],
    enable_endpoint_detection: true
  });

  const utteranceBuffer = new RealtimeUtteranceBuffer({
    final_only: true,
    max_tokens: 2000
  });

  let finalText = "";
  let interimText = "";
  let closed = false;
  let connected = false;
  let connectPromise: Promise<void> | null = null;
  const pendingChunks: Uint8Array[] = [];

  session.on("result", (result: RealtimeResult) => {
    utteranceBuffer.addResult(result);
    interimText = result.tokens
      .filter((token) => !token.is_final)
      .map((token) => token.text)
      .join("")
      .trim();

    onSnapshot({
      finalText,
      interimText,
      finished: false
    });
  });

  session.on("endpoint", () => {
    const utterance = utteranceBuffer.markEndpoint();
    if (!utterance?.text.trim()) {
      return;
    }

    finalText = appendTranscript(finalText, utterance.text.trim());
    interimText = "";

    onSnapshot({
      finalText,
      interimText,
      finished: false
    });
  });

  session.on("finished", () => {
    if (interimText.trim()) {
      finalText = appendTranscript(finalText, interimText.trim());
      interimText = "";
    }

    onSnapshot({
      finalText,
      interimText: "",
      finished: true
    });
  });

  session.on("error", (error) => {
    onError?.(error);
  });

  return {
    sendPcm(chunk: Uint8Array) {
      if (closed) {
        return;
      }

      if (connected) {
        session.sendAudio(chunk);
        return;
      }

      pendingChunks.push(chunk);

      if (!connectPromise) {
        connectPromise = session
          .connect()
          .then(() => {
            connected = true;

            while (pendingChunks.length > 0) {
              const buffered = pendingChunks.shift();
              if (buffered) {
                session.sendAudio(buffered);
              }
            }
          })
          .catch((error) => {
            onError?.(error);
          });
      }
    },
    close() {
      if (closed) {
        return;
      }

      closed = true;
      pendingChunks.length = 0;
      session.finalize({
        trailing_silence_ms: 250
      });
      void session.finish().catch(() => {
        // Ignore shutdown errors during teardown.
      });
    },
    resetTranscript() {
      finalText = "";
      interimText = "";
      utteranceBuffer.reset();

      onSnapshot({
        finalText,
        interimText,
        finished: false
      });
    }
  };
}

function appendTranscript(existing: string, nextChunk: string): string {
  if (!existing) {
    return nextChunk;
  }

  return `${existing}\n${nextChunk}`;
}
