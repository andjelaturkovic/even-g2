type StatusKind = "idle" | "connecting" | "listening" | "error";

let statusNode: HTMLDivElement | null = null;
let finalNode: HTMLPreElement | null = null;
let interimNode: HTMLPreElement | null = null;

export function mountUi(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("App root not found");
  }

  app.innerHTML = `
    <main class="shell">
      <section class="panel">
        <h1>Soniox</h1>
        <div class="status status-idle" data-role="status">
          <strong>idle</strong>
          <span>Waiting for Even bridge…</span>
        </div>
        <section class="transcript">
          <div>
            <h2>Transcript</h2>
            <pre data-role="final-text">Listening…</pre>
          </div>
          <div>
            <h2>Live transcript</h2>
            <pre data-role="interim-text"></pre>
          </div>
        </section>
      </section>
    </main>
  `;

  const style = document.createElement("style");
  style.textContent = `
    :root {
      color-scheme: dark;
      font-family: "SF Mono", "Menlo", "Monaco", monospace;
      background:
        radial-gradient(circle at top left, rgba(148, 255, 0, 0.12), transparent 28%),
        linear-gradient(160deg, #091008 0%, #101912 100%);
      color: #eefadf;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
    }

    .shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }

    .panel {
      width: min(760px, 100%);
      padding: 28px;
      border-radius: 20px;
      border: 1px solid rgba(148, 255, 0, 0.14);
      background: rgba(6, 12, 8, 0.84);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
    }

    h1 {
      margin: 0 0 20px;
      font-size: clamp(2rem, 5vw, 3rem);
      line-height: 1;
    }

    .status {
      display: grid;
      gap: 4px;
      padding: 14px 16px;
      border-radius: 16px;
      margin-bottom: 20px;
    }

    .status strong {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.82rem;
    }

    .status-idle,
    .status-connecting {
      background: rgba(231, 248, 219, 0.08);
    }

    .status-listening {
      background: rgba(232, 255, 122, 0.14);
      color: #f1ff8a;
    }

    .status-error {
      background: rgba(255, 89, 89, 0.16);
      color: #ff8a8a;
    }

    .transcript {
      display: grid;
      gap: 16px;
    }

    .transcript h2 {
      margin: 0 0 8px;
      font-size: 0.95rem;
    }

    .transcript pre {
      margin: 0;
      min-height: 120px;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid rgba(231, 248, 219, 0.08);
      background: rgba(231, 248, 219, 0.05);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.55;
    }

    @media (max-width: 720px) {
      .panel {
        padding: 22px;
      }
    }
  `;

  document.head.appendChild(style);

  statusNode = app.querySelector<HTMLDivElement>('[data-role="status"]');
  finalNode = app.querySelector<HTMLPreElement>('[data-role="final-text"]');
  interimNode = app.querySelector<HTMLPreElement>('[data-role="interim-text"]');
}

export function setStatus(kind: StatusKind, message: string): void {
  if (!statusNode) {
    return;
  }

  statusNode.className = `status status-${kind}`;
  statusNode.innerHTML = `<strong>${escapeHtml(kind)}</strong><span>${escapeHtml(message)}</span>`;
}

export function setTranscript(finalText: string, interimText: string): void {
  if (finalNode) {
    finalNode.textContent = finalText || "Listening…";
  }

  if (interimNode) {
    interimNode.textContent = interimText;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
