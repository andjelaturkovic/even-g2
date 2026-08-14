export const APP_SESSION_STATES = [
  "idle",
  "ready",
  "listening",
  "streaming",
  "stopped",
  "error"
] as const;

export type AppSessionState = (typeof APP_SESSION_STATES)[number];

export const CAPTURE_SOURCES = ["laptop", "phone", "glasses"] as const;

export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export interface SonioxRealtimeAudioConfig {
  audioFormat: "s16le";
  sampleRate: 16000;
  numChannels: 1;
}

export const DEFAULT_REALTIME_AUDIO_CONFIG: SonioxRealtimeAudioConfig = {
  audioFormat: "s16le",
  sampleRate: 16000,
  numChannels: 1
};

export interface CaptionSessionConfig {
  captureSource: CaptureSource;
  languageHint?: string;
  rollingWindowSize: number;
}

export const DEFAULT_CAPTION_SESSION_CONFIG: CaptionSessionConfig = {
  captureSource: "laptop",
  rollingWindowSize: 4
};
