import dotenv from "dotenv";

dotenv.config();

export interface ServerConfig {
  port: number;
  sonioxApiKey?: string;
  sonioxApiBaseUrl: string;
  sonioxTmpKeyExpiresSeconds: number;
  sonioxMaxSessionDurationSeconds: number;
}

export function loadServerConfig(): ServerConfig {
  const rawPort = process.env.PORT ?? "3001";
  const port = Number.parseInt(rawPort, 10);
  const sonioxApiBaseUrl =
    process.env.SONIOX_API_BASE_URL ?? "https://api.soniox.com";
  const sonioxTmpKeyExpiresSeconds = parsePositiveInteger(
    process.env.SONIOX_TMP_KEY_EXPIRES_SECONDS ?? "300",
    "SONIOX_TMP_KEY_EXPIRES_SECONDS"
  );
  const sonioxMaxSessionDurationSeconds = parsePositiveInteger(
    process.env.SONIOX_MAX_SESSION_DURATION_SECONDS ?? "1800",
    "SONIOX_MAX_SESSION_DURATION_SECONDS"
  );

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort}`);
  }

  return {
    port,
    sonioxApiKey: process.env.SONIOX_API_KEY,
    sonioxApiBaseUrl,
    sonioxTmpKeyExpiresSeconds,
    sonioxMaxSessionDurationSeconds
  };
}

function parsePositiveInteger(rawValue: string, envName: string): number {
  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${envName} value: ${rawValue}`);
  }

  return parsed;
}
