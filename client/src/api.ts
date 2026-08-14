export const SERVER_BASE_URL =
  import.meta.env.VITE_SERVER_BASE_URL ?? "http://localhost:3001";

export interface BackendHealthResponse {
  ok: boolean;
  service: string;
  sonioxConfigured: boolean;
  sonioxApiBaseUrl: string;
  sonioxTmpKeyExpiresSeconds: number;
  sonioxMaxSessionDurationSeconds: number;
  realtimeAudioConfig: {
    audioFormat: string;
    sampleRate: number;
    numChannels: number;
  };
}

export interface TemporaryApiKeyResponse {
  ok: boolean;
  api_key: string;
  expires_at: string;
}

export async function fetchBackendHealth(): Promise<BackendHealthResponse> {
  const response = await fetch(`${SERVER_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error(`Backend health check failed with ${response.status}`);
  }

  return (await response.json()) as BackendHealthResponse;
}

export async function fetchTemporaryApiKey(): Promise<TemporaryApiKeyResponse> {
  const response = await fetch(`${SERVER_BASE_URL}/tmp-key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      clientReferenceId: "phase1-desktop-client"
    })
  });

  const data = (await response.json()) as
    | TemporaryApiKeyResponse
    | { ok: false; error: string };

  if (!response.ok || !data.ok) {
    const error = "error" in data ? data.error : `Temporary key request failed with ${response.status}`;
    throw new Error(error);
  }

  return data;
}
