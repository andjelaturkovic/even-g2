import type { ServerConfig } from "./config.js";

interface CreateTemporaryApiKeyInput {
  clientReferenceId?: string;
}

interface SonioxTemporaryApiKeyResponse {
  api_key: string;
  expires_at: string;
}

export interface TemporaryApiKeyResult {
  apiKey: string;
  expiresAt: string;
}

export async function createTemporaryApiKey(
  config: ServerConfig,
  input: CreateTemporaryApiKeyInput
): Promise<TemporaryApiKeyResult> {
  if (!config.sonioxApiKey) {
    throw new Error("SONIOX_API_KEY is not configured");
  }

  const response = await fetch(`${config.sonioxApiBaseUrl}/v1/auth/temporary-api-key`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.sonioxApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      usage_type: "transcribe_websocket",
      expires_in_seconds: config.sonioxTmpKeyExpiresSeconds,
      single_use: true,
      max_session_duration_seconds: config.sonioxMaxSessionDurationSeconds,
      client_reference_id: input.clientReferenceId
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Soniox temporary key request failed with ${response.status}: ${errorBody}`
    );
  }

  const data = (await response.json()) as SonioxTemporaryApiKeyResponse;

  return {
    apiKey: data.api_key,
    expiresAt: data.expires_at
  };
}
