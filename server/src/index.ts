import cors from "cors";
import express from "express";

import { DEFAULT_REALTIME_AUDIO_CONFIG } from "@even-g2/shared";

import { loadServerConfig } from "./config.js";
import { createTemporaryApiKey } from "./soniox-temp-key.js";

const config = loadServerConfig();
const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "even-g2-soniox-server",
    sonioxConfigured: Boolean(config.sonioxApiKey),
    sonioxApiBaseUrl: config.sonioxApiBaseUrl,
    sonioxTmpKeyExpiresSeconds: config.sonioxTmpKeyExpiresSeconds,
    sonioxMaxSessionDurationSeconds: config.sonioxMaxSessionDurationSeconds,
    realtimeAudioConfig: DEFAULT_REALTIME_AUDIO_CONFIG
  });
});

app.post("/tmp-key", async (request, response) => {
  try {
    const clientReferenceId = readOptionalClientReferenceId(request.body);
    const temporaryKey = await createTemporaryApiKey(config, {
      clientReferenceId
    });

    response.status(201).json({
      ok: true,
      api_key: temporaryKey.apiKey,
      expires_at: temporaryKey.expiresAt,
      apiKey: temporaryKey.apiKey,
      expiresAt: temporaryKey.expiresAt
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Soniox error";
    const statusCode = getTemporaryKeyErrorStatusCode(message);

    response.status(statusCode).json({
      ok: false,
      error: message
    });
  }
});

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});

function readOptionalClientReferenceId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const candidate = (body as { clientReferenceId?: unknown }).clientReferenceId;

  if (candidate === undefined) {
    return undefined;
  }

  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error("clientReferenceId must be a non-empty string when provided");
  }

  return candidate.trim();
}

function getTemporaryKeyErrorStatusCode(message: string): number {
  if (message.includes("clientReferenceId")) {
    return 400;
  }

  if (message.includes("SONIOX_API_KEY")) {
    return 500;
  }

  return 502;
}
