import {
  BrowserPermissionResolver,
  RealtimeUtteranceBuffer,
  SonioxClient,
  type RealtimeResult,
  type Recording
} from "@soniox/client";

import { fetchTemporaryApiKey } from "./api";

export const SONIOX_REALTIME_MODEL = "stt-rt-v5";

const client = new SonioxClient({
  config: async () => {
    const temporaryKey = await fetchTemporaryApiKey();

    return {
      api_key: temporaryKey.api_key
    };
  },
  permissions: new BrowserPermissionResolver()
});

export function getSonioxClient(): SonioxClient {
  return client;
}

export function createRecordingSession(): Recording {
  return client.realtime.record({
    model: SONIOX_REALTIME_MODEL,
    language_hints: ["hr", "en"],
    auto_reconnect: true,
    max_reconnect_attempts: 3,
    reconnect_base_delay_ms: 1000,
    enable_endpoint_detection: true
  });
}

export function createUtteranceBuffer(): RealtimeUtteranceBuffer {
  return new RealtimeUtteranceBuffer({
    final_only: true,
    max_tokens: 2000
  });
}

export function summarizeRealtimeResult(result: RealtimeResult): {
  finalizedText: string;
  liveText: string;
} {
  return {
    finalizedText: result.tokens
      .filter((token) => token.is_final)
      .map((token) => token.text)
      .join(""),
    liveText: result.tokens
      .filter((token) => !token.is_final)
      .map((token) => token.text)
      .join("")
  };
}
