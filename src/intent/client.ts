import { candidatesForToken } from "./tailwind";
import type {
  AgentResultArtifact,
  AgentLaunchResult,
  AgentProvider,
  ClientMetric,
  AgentTaskResult,
  IntentBinding,
  IntentGraph,
  PatchRequest,
  IntentToken,
  PatchApplyResult,
  PatchConflictReport,
  PatchConflictResolveResult,
  PatchFailure,
  PatchPreview,
  PatchRevertResult,
  PatchUndoDiscardResult,
  PatchUndoRevertResult,
  UndoHistoryReport
} from "./types";

type PatchResponse = PatchApplyResult | PatchFailure;
type PreviewResponse = PatchPreview | PatchFailure;
type RevertResponse = PatchRevertResult | PatchFailure;
type AgentTaskResponse = AgentTaskResult | PatchFailure;
type AgentLaunchResponse = AgentLaunchResult | PatchFailure;
type AgentResultResponse = AgentResultArtifact | PatchFailure;
type UndoHistoryResponse = UndoHistoryReport;
type ConflictReportResponse = PatchConflictReport;
type ConflictResolveResponse = PatchConflictResolveResult | PatchFailure;
type UndoDiscardResponse = PatchUndoDiscardResult | PatchFailure;
type UndoRevertResponse = PatchUndoRevertResult | PatchFailure;

interface RenderScope {
  renderedInstanceCount: number;
  isShared: boolean;
}

const lastAgentTaskFileByIntentId = new Map<string, string>();
const overlayStyleId = "intent-layer-overlay-style";
const overlayBaseBottom = 18;
const overlayAvoidanceGap = 14;
let overlayPlacementFrame: number | null = null;
let overlayCollapsed = false;
const devToolCandidateSelector = [
  "nextjs-portal",
  "vite-error-overlay",
  "#nextjs-portal",
  "#__next-build-watcher",
  "[data-nextjs-toast]",
  "[data-nextjs-dialog-overlay]",
  "[data-nextjs-dev-tools]",
  "[data-nextjs-dev-tools-button]"
].join(",");

declare global {
  interface Window {
    __intentMetrics?: ClientMetric[];
  }
}

function recordClientMetric(metric: ClientMetric) {
  window.__intentMetrics = [...(window.__intentMetrics ?? []), metric];
  void fetch("/__intent/client-metric", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(metric)
  }).catch(() => {
    // Metrics must never break the editing path.
  });
}

function ensureOverlayStyles() {
  if (document.getElementById(overlayStyleId)) return;

  const style = document.createElement("style");
  style.id = overlayStyleId;
  style.textContent = `
[data-intent-overlay-root] {
  position: fixed !important;
  right: max(18px, env(safe-area-inset-right)) !important;
  bottom: var(--intent-layer-bottom, 18px) !important;
  z-index: 2147483000 !important;
  width: min(392px, calc(100vw - 24px)) !important;
  max-height: var(--intent-layer-max-height, min(72vh, calc(100vh - 48px))) !important;
  overflow: hidden auto !important;
  box-sizing: border-box !important;
  padding: 0 !important;
  border: 1px solid rgba(142, 130, 255, 0.38) !important;
  border-radius: 8px !important;
  background:
    linear-gradient(145deg, rgba(12, 13, 18, 0.94), rgba(31, 33, 44, 0.86)),
    rgba(12, 13, 18, 0.88) !important;
  color: #eef2ff !important;
  box-shadow:
    0 28px 70px rgba(0, 0, 0, 0.46),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 0 36px rgba(126, 117, 255, 0.16) !important;
  backdrop-filter: blur(20px) saturate(1.16) !important;
  -webkit-backdrop-filter: blur(20px) saturate(1.16) !important;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  font-size: 12px !important;
  line-height: 1.45 !important;
  letter-spacing: 0 !important;
}

[data-intent-overlay-root] *,
[data-intent-overlay-root] *::before,
[data-intent-overlay-root] *::after {
  box-sizing: border-box !important;
  letter-spacing: 0 !important;
}

.intent-layer-header {
  position: sticky !important;
  top: 0 !important;
  z-index: 2 !important;
  display: grid !important;
  gap: 10px !important;
  padding: 13px 13px 11px !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09) !important;
  background: rgba(12, 13, 18, 0.78) !important;
  backdrop-filter: blur(18px) saturate(1.12) !important;
  -webkit-backdrop-filter: blur(18px) saturate(1.12) !important;
}

.intent-layer-brand {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  min-width: 0 !important;
}

.intent-layer-mark {
  width: 9px !important;
  height: 9px !important;
  flex: 0 0 auto !important;
  border-radius: 999px !important;
  background: linear-gradient(135deg, #8d7cff, #62d9ff) !important;
  box-shadow: 0 0 18px rgba(120, 130, 255, 0.72) !important;
}

.intent-layer-title {
  color: #f8fbff !important;
  font-size: 14px !important;
  font-weight: 800 !important;
  line-height: 1.1 !important;
  white-space: nowrap !important;
}

.intent-layer-pill {
  max-width: 132px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  padding: 3px 7px !important;
  border: 1px solid rgba(141, 124, 255, 0.35) !important;
  border-radius: 999px !important;
  background: rgba(118, 104, 255, 0.12) !important;
  color: #c7d2ff !important;
  font-size: 10px !important;
  font-weight: 800 !important;
}

.intent-layer-status {
  color: #b6bfd4 !important;
  font-size: 11px !important;
  line-height: 1.4 !important;
}

.intent-layer-actions {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
}

.intent-layer-header-actions {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}

[data-intent-overlay-root][data-intent-collapsed="true"] {
  width: min(286px, calc(100vw - 24px)) !important;
}

[data-intent-overlay-root][data-intent-collapsed="true"] .intent-layer-header {
  border-bottom: 0 !important;
}

[data-intent-overlay-root] .intent-layer-button,
[data-intent-overlay-root] button {
  min-height: 32px !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 7px !important;
  background: rgba(255, 255, 255, 0.07) !important;
  color: #eef2ff !important;
  padding: 6px 9px !important;
  font-size: 12px !important;
  font-weight: 800 !important;
  line-height: 1.1 !important;
  cursor: pointer !important;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease !important;
}

[data-intent-overlay-root] button:hover {
  transform: translateY(-1px) !important;
  border-color: rgba(142, 130, 255, 0.58) !important;
  background: rgba(255, 255, 255, 0.11) !important;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.26) !important;
}

[data-intent-overlay-root] button:disabled {
  cursor: default !important;
  opacity: 0.5 !important;
  transform: none !important;
}

[data-intent-overlay-root] button[data-intent-variant="primary"] {
  border-color: rgba(119, 209, 255, 0.52) !important;
  background: linear-gradient(135deg, rgba(124, 109, 255, 0.96), rgba(78, 188, 255, 0.9)) !important;
  color: #ffffff !important;
  box-shadow: 0 12px 28px rgba(105, 128, 255, 0.24) !important;
}

.intent-layer-content {
  display: grid !important;
  gap: 10px !important;
  padding: 12px 13px 13px !important;
}

.intent-layer-section {
  display: grid !important;
  gap: 8px !important;
  padding: 10px !important;
  border: 1px solid rgba(255, 255, 255, 0.09) !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.045) !important;
}

.intent-layer-section-title,
[data-intent-overlay-root] label {
  display: block !important;
  margin: 0 !important;
  color: #f3f6ff !important;
  font-size: 11px !important;
  font-weight: 850 !important;
}

[data-intent-overlay-root] p {
  margin: 0 !important;
  color: #b6bfd4 !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
}

.intent-layer-meta,
[data-intent-overlay-root] pre {
  margin: 0 !important;
  padding: 9px !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 7px !important;
  background: rgba(3, 6, 14, 0.48) !important;
  color: #cfd7eb !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  font-size: 11px !important;
  line-height: 1.45 !important;
  white-space: pre-wrap !important;
  word-break: break-word !important;
}

.intent-layer-token-row {
  display: grid !important;
  grid-template-columns: minmax(0, 1.1fr) minmax(96px, 0.9fr) auto auto !important;
  gap: 8px !important;
  align-items: center !important;
  margin: 0 !important;
}

.intent-layer-token-label {
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  color: #eef2ff !important;
  font-size: 11px !important;
  font-weight: 800 !important;
}

[data-intent-overlay-root] select,
[data-intent-overlay-root] textarea {
  width: 100% !important;
  min-width: 0 !important;
  border: 1px solid rgba(255, 255, 255, 0.13) !important;
  border-radius: 7px !important;
  background: rgba(4, 7, 15, 0.62) !important;
  color: #eef2ff !important;
  padding: 7px 8px !important;
  font-size: 12px !important;
  outline: none !important;
}

[data-intent-overlay-root] textarea {
  resize: vertical !important;
}

[data-intent-overlay-root] select:focus,
[data-intent-overlay-root] textarea:focus {
  border-color: rgba(112, 204, 255, 0.66) !important;
  box-shadow: 0 0 0 3px rgba(120, 130, 255, 0.16) !important;
}

.intent-layer-preview-box {
  grid-column: 1 / -1 !important;
  display: none;
}

.intent-layer-list {
  display: grid !important;
  gap: 6px !important;
  margin: 0 !important;
  padding-left: 18px !important;
}

.intent-layer-muted {
  color: #96a0b7 !important;
  font-size: 11px !important;
}

.intent-layer-conflict-item {
  display: grid !important;
  gap: 6px !important;
  border: 1px solid rgba(255, 255, 255, 0.09) !important;
  border-radius: 7px !important;
  padding: 8px !important;
  background: rgba(255, 255, 255, 0.045) !important;
}

[data-intent-selected="true"] {
  outline: 2px solid rgba(142, 130, 255, 0.92) !important;
  outline-offset: 3px !important;
  box-shadow: 0 0 0 6px rgba(142, 130, 255, 0.18) !important;
}

body[data-intent-layer-picking="true"] [data-intent-id] {
  cursor: crosshair !important;
}

body[data-intent-layer-picking="true"] [data-intent-id]:hover {
  outline: 2px solid rgba(98, 217, 255, 0.92) !important;
  outline-offset: 3px !important;
  box-shadow: 0 0 0 6px rgba(98, 217, 255, 0.16) !important;
}

@media (max-width: 520px) {
  [data-intent-overlay-root] {
    right: max(12px, env(safe-area-inset-right)) !important;
    left: max(12px, env(safe-area-inset-left)) !important;
    width: auto !important;
  }

  .intent-layer-token-row {
    grid-template-columns: 1fr 1fr !important;
  }
}
`;
  document.head.appendChild(style);
}

function rectsOverlap(first: DOMRect, second: DOMRect): boolean {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

function shouldAvoidFixedElement(panel: HTMLElement, element: HTMLElement, panelRect: DOMRect): boolean {
  if (element === panel || panel.contains(element) || element.closest("[data-intent-overlay-root]")) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.position !== "fixed" || style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) {
    return false;
  }

  if (rect.width > window.innerWidth * 0.92 && rect.height > window.innerHeight * 0.75) {
    return false;
  }

  if (rect.bottom < window.innerHeight - 260) {
    return false;
  }

  return rectsOverlap(panelRect, rect);
}

function isLikelyDevToolContainer(element: HTMLElement): boolean {
  const signature = `${element.id} ${element.className} ${element.tagName}`.toLowerCase();
  return (
    signature.includes("next") ||
    signature.includes("vite") ||
    signature.includes("vercel") ||
    signature.includes("turbopack") ||
    signature.includes("devtool")
  );
}

function overlayAvoidanceCandidates(panel: HTMLElement): HTMLElement[] {
  const candidates = new Set<HTMLElement>();

  for (const element of Array.from(document.body.children)) {
    if (!(element instanceof HTMLElement) || element === panel || panel.contains(element)) {
      continue;
    }

    candidates.add(element);

    if (isLikelyDevToolContainer(element)) {
      for (const child of Array.from(element.querySelectorAll<HTMLElement>("*"))) {
        candidates.add(child);
      }
    }
  }

  for (const element of Array.from(document.querySelectorAll<HTMLElement>(devToolCandidateSelector))) {
    candidates.add(element);
  }

  return [...candidates];
}

function updateOverlayPlacement(panel: HTMLElement) {
  panel.style.setProperty("--intent-layer-bottom", `${overlayBaseBottom}px`);
  panel.style.setProperty("--intent-layer-max-height", `calc(100vh - ${overlayBaseBottom * 2}px)`);

  const panelRect = panel.getBoundingClientRect();
  let bottom = overlayBaseBottom;

  for (const element of overlayAvoidanceCandidates(panel)) {
    if (!shouldAvoidFixedElement(panel, element, panelRect)) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    bottom = Math.max(bottom, Math.ceil(window.innerHeight - rect.top + overlayAvoidanceGap));
  }

  const maxBottom = Math.max(overlayBaseBottom, window.innerHeight - 180);
  const nextBottom = Math.min(bottom, maxBottom);
  panel.style.setProperty("--intent-layer-bottom", `${nextBottom}px`);
  panel.style.setProperty("--intent-layer-max-height", `calc(100vh - ${nextBottom + overlayBaseBottom}px)`);
  panel.dataset.intentAvoidedDevtools = nextBottom > overlayBaseBottom ? "true" : "false";
}

function scheduleOverlayPlacement(panel: HTMLElement) {
  if (overlayPlacementFrame !== null) {
    return;
  }

  overlayPlacementFrame = window.requestAnimationFrame(() => {
    overlayPlacementFrame = null;
    updateOverlayPlacement(panel);
  });
}

function createButton(label: string, variant: "primary" | "secondary" = "secondary"): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = "intent-layer-button";
  button.dataset.intentVariant = variant;
  button.style.border = "1px solid #cbd5e1";
  button.style.background = "#ffffff";
  button.style.color = "#0f172a";
  button.style.borderRadius = "6px";
  button.style.padding = "6px 9px";
  button.style.fontSize = "12px";
  button.style.fontWeight = "700";
  button.style.cursor = "pointer";
  return button;
}

function intentIdSelector(id: string): string {
  const escaped = typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(id) : id.replace(/[^A-Za-z0-9_-]/g, "\\$&");
  return `[data-intent-id="${escaped}"]`;
}

function elementsForIntentId(id: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(intentIdSelector(id))).filter(
    (element) => !element.closest("[data-intent-overlay-root]")
  );
}

function clearSelectedIntentElements() {
  for (const element of document.querySelectorAll<HTMLElement>("[data-intent-selected='true']")) {
    element.removeAttribute("data-intent-selected");
  }
}

function selectIntentElements(id: string): RenderScope {
  const elements = elementsForIntentId(id);
  for (const element of elements) {
    element.setAttribute("data-intent-selected", "true");
  }
  return {
    renderedInstanceCount: Math.max(elements.length, 1),
    isShared: elements.length > 1
  };
}

function createPanel() {
  ensureOverlayStyles();
  const panel = document.createElement("div");
  panel.className = "intent-layer-panel";
  panel.style.position = "fixed";
  panel.style.right = "16px";
  panel.style.bottom = "16px";
  panel.style.zIndex = "999999";
  panel.style.width = "360px";
  panel.style.maxHeight = "70vh";
  panel.style.overflow = "auto";
  panel.style.background = "#ffffff";
  panel.style.border = "1px solid #cbd5e1";
  panel.style.borderRadius = "8px";
  panel.style.boxShadow = "0 20px 50px rgba(15, 23, 42, 0.18)";
  panel.style.fontFamily =
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  panel.style.color = "#0f172a";
  panel.style.padding = "12px";
  return panel;
}

function renderTokenRow(
  root: HTMLElement,
  binding: IntentBinding,
  token: IntentToken,
  scope: RenderScope | null,
  setStatus: (message: string) => void,
  rerender: (message: string) => void
) {
  const row = document.createElement("div");
  row.className = "intent-layer-token-row";
  row.style.display = "grid";
  row.style.gridTemplateColumns = "1fr 1fr auto auto";
  row.style.gap = "8px";
  row.style.alignItems = "center";
  row.style.marginTop = "8px";

  const label = document.createElement("div");
  label.className = "intent-layer-token-label";
  label.textContent = `${token.category}: ${token.token}`;
  label.style.fontSize = "12px";
  label.style.fontWeight = "700";

  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.border = "1px solid #cbd5e1";
  select.style.borderRadius = "6px";
  select.style.padding = "6px";
  select.style.fontSize = "12px";

  for (const candidate of candidatesForToken(token.token)) {
    const option = document.createElement("option");
    option.value = candidate;
    option.textContent = candidate;
    option.selected = candidate === token.token;
    select.appendChild(option);
  }

  const preview = createButton("Preview");
  const apply = createButton(scope?.isShared ? "Apply all" : "Apply");
  if (scope?.isShared) {
    const title = `This source binding is rendered ${scope.renderedInstanceCount} times on the page.`;
    preview.title = title;
    apply.title = title;
  }
  const previewBox = document.createElement("pre");
  previewBox.className = "intent-layer-preview-box";
  previewBox.style.gridColumn = "1 / -1";
  previewBox.style.margin = "0";
  previewBox.style.padding = "8px";
  previewBox.style.borderRadius = "6px";
  previewBox.style.background = "#f8fafc";
  previewBox.style.border = "1px solid #e2e8f0";
  previewBox.style.fontSize = "11px";
  previewBox.style.whiteSpace = "pre-wrap";
  previewBox.style.display = "none";

  function patchRequest(): PatchRequest {
    return {
      id: binding.id,
      oldToken: token.token,
      nextToken: select.value,
      sourceStart: token.sourceStart,
      sourceEnd: token.sourceEnd
    };
  }

  preview.addEventListener("click", async () => {
    const request = patchRequest();
    const startedAt = performance.now();
    const response = await fetch("/__intent/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
    const result = (await response.json()) as PreviewResponse;
    const responseAt = performance.now();
    const renderStartedAt = performance.now();
    if (result.ok) {
      previewBox.style.display = "block";
      previewBox.textContent = [`- ${result.before}`, `+ ${result.after}`].join("\n");
      setStatus(`Preview ${result.oldToken} -> ${result.nextToken} in ${result.metrics.previewMs}ms`);
    } else {
      previewBox.style.display = "block";
      previewBox.textContent = result.detail ?? result.reason;
      setStatus(`Preview rejected: ${result.reason}`);
    }
    const renderedAt = performance.now();
    recordClientMetric({
      kind: "patch-preview",
      id: binding.id,
      status: result.ok ? "ok" : "rejected",
      createdAt: new Date().toISOString(),
      oldToken: result.ok ? result.oldToken : request.oldToken,
      nextToken: result.ok ? result.nextToken : request.nextToken,
      roundTripMs: Number((responseAt - startedAt).toFixed(3)),
      serverMs: result.ok ? result.metrics.previewMs : result.metrics?.previewMs ?? null,
      renderMs: Number((renderedAt - renderStartedAt).toFixed(3)),
      reason: result.ok ? undefined : result.reason
    });
  });

  apply.addEventListener("click", async () => {
    const request = patchRequest();
    const startedAt = performance.now();
    const response = await fetch("/__intent/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
    const result = (await response.json()) as PatchResponse;
    const responseAt = performance.now();
    const renderStartedAt = performance.now();
    if (result.ok) {
      const scopeNote = scope?.isShared ? `; affects ${scope.renderedInstanceCount} rendered instances` : "";
      rerender(`Applied ${result.oldToken} -> ${result.nextToken} in ${result.metrics.applyMs}ms${scopeNote}`);
    } else {
      setStatus(`Rejected: ${result.reason}`);
    }
    const renderedAt = performance.now();
    recordClientMetric({
      kind: "patch-apply",
      id: binding.id,
      status: result.ok ? "ok" : "rejected",
      createdAt: new Date().toISOString(),
      oldToken: result.ok ? result.oldToken : request.oldToken,
      nextToken: result.ok ? result.nextToken : request.nextToken,
      roundTripMs: Number((responseAt - startedAt).toFixed(3)),
      serverMs: result.ok ? result.metrics.applyMs : result.metrics?.applyMs ?? null,
      renderMs: Number((renderedAt - renderStartedAt).toFixed(3)),
      reason: result.ok ? undefined : result.reason
    });
  });

  row.append(label, select, preview, apply, previewBox);
  root.appendChild(row);
}

function renderAgentTaskForm(
  root: HTMLElement,
  binding: IntentBinding,
  setStatus: (message: string) => void
) {
  const wrapper = document.createElement("div");
  wrapper.className = "intent-layer-section";
  wrapper.style.marginTop = "12px";
  wrapper.style.paddingTop = "10px";
  wrapper.style.borderTop = "1px solid #e2e8f0";

  const label = document.createElement("label");
  label.textContent = "Agent handoff";
  label.style.display = "block";
  label.style.fontSize = "12px";
  label.style.fontWeight = "800";
  label.style.marginBottom = "6px";

  const textarea = document.createElement("textarea");
  textarea.placeholder = "Describe a complex or unsupported edit";
  textarea.rows = 3;
  textarea.style.width = "100%";
  textarea.style.boxSizing = "border-box";
  textarea.style.border = "1px solid #cbd5e1";
  textarea.style.borderRadius = "6px";
  textarea.style.padding = "8px";
  textarea.style.fontSize = "12px";
  textarea.style.resize = "vertical";

  const create = createButton("Create task");
  create.style.marginTop = "8px";
  create.addEventListener("click", async () => {
    const response = await fetch("/__intent/agent-task", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: binding.id,
        desiredChange: textarea.value
      })
    });
    const result = (await response.json()) as AgentTaskResponse;
    if (result.ok) {
      lastAgentTaskFileByIntentId.set(binding.id, result.taskFile);
      launchBox.style.display = "block";
      launchBox.textContent = `Task file\n${result.taskFile}`;
      setStatus(`Agent task created in ${result.metrics.taskMs}ms: ${result.taskFile}`);
    } else {
      setStatus(`Agent task rejected: ${result.reason}`);
    }
  });

  const launchActions = document.createElement("div");
  launchActions.className = "intent-layer-actions";
  launchActions.style.marginTop = "8px";

  const launchBox = document.createElement("pre");
  launchBox.className = "intent-layer-preview-box";
  launchBox.style.display = "none";
  launchBox.style.marginTop = "8px";

  async function launch(provider: AgentProvider, execute: boolean) {
    const knownTaskFile = lastAgentTaskFileByIntentId.get(binding.id);
    const response = await fetch("/__intent/agent-launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: binding.id,
        provider,
        desiredChange: textarea.value,
        taskFile: knownTaskFile,
        execute
      })
    });
    const result = (await response.json()) as AgentLaunchResponse;
    launchBox.style.display = "block";
    if (result.ok) {
      lastAgentTaskFileByIntentId.set(binding.id, result.taskFile);
      launchBox.textContent = [
        result.executed ? `${provider} started` : `${provider} command plan`,
        `task: ${result.taskFile}`,
        `cwd: ${result.cwd}`,
        result.executed ? `pid: ${result.pid ?? "unknown"}` : "execution: not started",
        result.stdoutFile ? `stdout: ${result.stdoutFile}` : null,
        result.stderrFile ? `stderr: ${result.stderrFile}` : null,
        "",
        result.commandText
      ]
        .filter(Boolean)
        .join("\n");
      if (result.executed) {
        setStatus(`${provider} launched in ${result.metrics.launchMs}ms: ${result.taskFile}`);
      } else if (execute && !result.enabled) {
        setStatus(`${provider} run disabled; set INTENT_LAYER_AGENT_RUN=1 to execute. Command planned.`);
      } else {
        setStatus(`${provider} command planned in ${result.metrics.launchMs}ms: ${result.taskFile}`);
      }
    } else {
      launchBox.textContent = result.detail ?? result.reason;
      setStatus(`${provider} launch rejected: ${result.reason}`);
    }
  }

  const planCodex = createButton("Plan Codex");
  planCodex.addEventListener("click", () => {
    void launch("codex", false);
  });

  const runCodex = createButton("Run Codex");
  runCodex.addEventListener("click", () => {
    void launch("codex", true);
  });

  const planClaude = createButton("Plan Claude");
  planClaude.addEventListener("click", () => {
    void launch("claude", false);
  });

  const runClaude = createButton("Run Claude");
  runClaude.addEventListener("click", () => {
    void launch("claude", true);
  });

  launchActions.append(planCodex, runCodex, planClaude, runClaude);

  const resultLabel = document.createElement("label");
  resultLabel.textContent = "Result";
  resultLabel.style.display = "block";
  resultLabel.style.fontSize = "12px";
  resultLabel.style.fontWeight = "800";
  resultLabel.style.marginTop = "10px";
  resultLabel.style.marginBottom = "6px";

  const resultTextarea = document.createElement("textarea");
  resultTextarea.placeholder = "Summarize the agent result";
  resultTextarea.rows = 3;
  resultTextarea.style.width = "100%";
  resultTextarea.style.boxSizing = "border-box";
  resultTextarea.style.border = "1px solid #cbd5e1";
  resultTextarea.style.borderRadius = "6px";
  resultTextarea.style.padding = "8px";
  resultTextarea.style.fontSize = "12px";
  resultTextarea.style.resize = "vertical";

  const record = createButton("Record result");
  record.style.marginTop = "8px";
  record.addEventListener("click", async () => {
    const response = await fetch("/__intent/agent-result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: binding.id,
        taskFile: lastAgentTaskFileByIntentId.get(binding.id),
        summary: resultTextarea.value,
        changedFiles: [binding.relativeFile],
        checks: ["npm run typecheck", "npm run eval", "npm run build"]
      })
    });
    const result = (await response.json()) as AgentResultResponse;
    if (result.ok) {
      setStatus(`Agent result recorded in ${result.metrics.resultMs}ms: ${result.resultFile}`);
    } else {
      setStatus(`Agent result rejected: ${result.reason}`);
    }
  });

  wrapper.append(label, textarea, create, launchActions, launchBox, resultLabel, resultTextarea, record);
  root.appendChild(wrapper);
}

function renderUndoHistory(root: HTMLElement, setStatus: (message: string) => void) {
  const wrapper = document.createElement("div");
  wrapper.className = "intent-layer-section";
  wrapper.style.marginTop = "12px";
  wrapper.style.paddingTop = "10px";
  wrapper.style.borderTop = "1px solid #e2e8f0";

  const header = document.createElement("div");
  header.className = "intent-layer-section-title";
  header.textContent = "Undo history";
  header.style.fontSize = "12px";
  header.style.fontWeight = "800";

  const body = document.createElement("div");
  body.className = "intent-layer-muted";
  body.textContent = "Loading...";
  body.style.marginTop = "6px";
  body.style.fontSize = "11px";
  body.style.color = "#475569";

  wrapper.append(header, body);
  root.appendChild(wrapper);

  void fetch("/__intent/undo-history")
    .then((response) => response.json() as Promise<UndoHistoryResponse>)
    .then((history) => {
      body.innerHTML = "";
      if (history.pendingCount === 0) {
        body.textContent = "No pending undo operations.";
        return;
      }

      const list = document.createElement("ol");
      list.className = "intent-layer-list";
      list.style.margin = "0";
      list.style.paddingLeft = "18px";
      list.style.display = "grid";
      list.style.gap = "6px";

      for (const item of history.entries.slice().reverse().slice(0, 5)) {
        const entry = document.createElement("li");
        entry.style.lineHeight = "1.35";
        entry.style.fontWeight = item.next ? "800" : "500";

        const text = document.createElement("span");
        text.textContent = `${item.next ? "next: " : ""}${item.oldToken} -> ${item.nextToken} (${item.relativeFile})`;

        const discard = createButton("Discard");
        discard.style.marginLeft = "6px";
        discard.style.padding = "3px 6px";
        discard.style.fontSize = "10px";
        discard.addEventListener("click", async () => {
          discard.disabled = true;
          discard.style.cursor = "default";
          const response = await fetch("/__intent/discard-undo", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operationFile: item.operationFile,
              note: "Discarded from overlay undo history."
            })
          });
          const result = (await response.json()) as UndoDiscardResponse;
          if (result.ok) {
            setStatus(`Undo discarded: ${item.nextToken}, ${result.pendingCount} pending`);
          } else {
            discard.disabled = false;
            discard.style.cursor = "pointer";
            setStatus(`Undo discard rejected: ${result.reason}`);
          }
        });

        const revert = createButton("Revert");
        revert.style.marginLeft = "6px";
        revert.style.padding = "3px 6px";
        revert.style.fontSize = "10px";
        revert.addEventListener("click", async () => {
          revert.disabled = true;
          revert.style.cursor = "default";
          const response = await fetch("/__intent/revert-undo", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operationFile: item.operationFile
            })
          });
          const result = (await response.json()) as UndoRevertResponse;
          if (result.ok) {
            setStatus(`Undo reverted: ${item.nextToken} -> ${item.oldToken}, ${result.pendingCount} pending`);
          } else {
            revert.disabled = false;
            revert.style.cursor = "pointer";
            setStatus(`Undo revert rejected: ${result.reason}`);
          }
        });

        entry.append(text, revert, discard);
        list.appendChild(entry);
      }

      body.appendChild(list);
    })
    .catch(() => {
      body.textContent = "Undo history unavailable.";
    });
}

function renderConflictPanel(root: HTMLElement, setStatus: (message: string) => void) {
  const wrapper = document.createElement("div");
  wrapper.className = "intent-layer-section";
  wrapper.style.marginTop = "12px";
  wrapper.style.paddingTop = "10px";
  wrapper.style.borderTop = "1px solid #e2e8f0";

  const header = document.createElement("div");
  header.className = "intent-layer-section-title";
  header.textContent = "Undo conflicts";
  header.style.fontSize = "12px";
  header.style.fontWeight = "800";

  const body = document.createElement("div");
  body.className = "intent-layer-muted";
  body.textContent = "Loading...";
  body.style.marginTop = "6px";
  body.style.fontSize = "11px";
  body.style.color = "#475569";

  wrapper.append(header, body);
  root.appendChild(wrapper);

  void fetch("/__intent/conflicts")
    .then((response) => response.json() as Promise<ConflictReportResponse>)
    .then((report) => {
      body.innerHTML = "";
      if (report.conflictCount === 0) {
        body.textContent = "No unresolved undo conflicts.";
        return;
      }

      const list = document.createElement("div");
      list.style.display = "grid";
      list.style.gap = "8px";

      for (const conflict of report.conflicts.slice(0, 3)) {
        const item = document.createElement("div");
        item.className = "intent-layer-conflict-item";
        item.style.border = "1px solid #e2e8f0";
        item.style.borderRadius = "6px";
        item.style.padding = "8px";
        item.style.background = "#f8fafc";

        const summary = document.createElement("div");
        summary.textContent = `${conflict.expectedToken} -> ${conflict.actualToken} (${conflict.relativeFile})`;
        summary.style.fontWeight = "800";
        summary.style.lineHeight = "1.35";

        const pathLine = document.createElement("div");
        pathLine.textContent = conflict.relativeConflictFile;
        pathLine.style.marginTop = "4px";
        pathLine.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        pathLine.style.fontSize = "10px";
        pathLine.style.wordBreak = "break-all";

        const action = createButton("Discard undo");
        action.style.marginTop = "8px";
        action.addEventListener("click", async () => {
          action.disabled = true;
          action.style.cursor = "default";
          const response = await fetch("/__intent/resolve-conflict", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              conflictFile: conflict.relativeConflictFile,
              action: "discard-pending-undo",
              note: "Discarded from overlay conflict panel."
            })
          });
          const result = (await response.json()) as ConflictResolveResponse;
          if (result.ok) {
            setStatus(`Conflict resolved: discarded pending undo, ${result.pendingCount} pending`);
          } else {
            action.disabled = false;
            action.style.cursor = "pointer";
            setStatus(`Conflict resolve rejected: ${result.reason}`);
          }
        });

        item.append(summary, pathLine, action);
        list.appendChild(item);
      }

      body.appendChild(list);
    })
    .catch(() => {
      body.textContent = "Undo conflicts unavailable.";
    });
}

function renderBinding(panel: HTMLElement, binding: IntentBinding | null, status: string, scope: RenderScope | null = null) {
  panel.innerHTML = "";
  panel.dataset.intentCollapsed = overlayCollapsed ? "true" : "false";

  const header = document.createElement("div");
  header.className = "intent-layer-header";

  const brand = document.createElement("div");
  brand.className = "intent-layer-brand";

  const mark = document.createElement("span");
  mark.className = "intent-layer-mark";

  const title = document.createElement("div");
  title.className = "intent-layer-title";
  title.textContent = "Intent Layer";

  const pill = document.createElement("span");
  pill.className = "intent-layer-pill";
  pill.textContent = "Codex subtool";

  brand.append(mark, title, pill);
  header.appendChild(brand);

  const statusLine = document.createElement("div");
  statusLine.className = "intent-layer-status";
  statusLine.textContent = status;
  header.appendChild(statusLine);

  const actions = document.createElement("div");
  actions.className = "intent-layer-actions intent-layer-header-actions";

  const pick = createButton("Pick", "primary");
  pick.title = "Pick an element on the page";
  pick.addEventListener("click", () => {
    panel.dispatchEvent(new CustomEvent("intent:start-pick"));
  });
  actions.appendChild(pick);

  const toggle = createButton(overlayCollapsed ? "Expand" : "Minimize");
  toggle.title = overlayCollapsed ? "Expand the Intent Layer panel" : "Minimize the Intent Layer panel";
  toggle.addEventListener("click", () => {
    overlayCollapsed = !overlayCollapsed;
    renderBinding(panel, binding, overlayCollapsed ? "Panel minimized" : status, scope);
  });
  actions.appendChild(toggle);

  const undo = createButton("Undo last");
  undo.title = "Revert the latest direct patch";
  undo.addEventListener("click", async () => {
    const startedAt = performance.now();
    const response = await fetch("/__intent/revert-last", {
      method: "POST"
    });
    const result = (await response.json()) as RevertResponse;
    const responseAt = performance.now();
    const renderStartedAt = performance.now();
    if (result.ok) {
      renderBinding(
        panel,
        binding,
        `Reverted ${result.oldToken} -> ${result.restoredToken} in ${result.metrics.revertMs}ms`,
        scope
      );
    } else {
      const conflict = result.conflictFile ? ` (${result.conflictFile})` : "";
      renderBinding(panel, binding, `Undo rejected: ${result.reason}${conflict}`, scope);
    }
    const renderedAt = performance.now();
    recordClientMetric({
      kind: "patch-revert",
      id: result.ok ? result.id : binding?.id ?? null,
      status: result.ok ? "ok" : "rejected",
      createdAt: new Date().toISOString(),
      oldToken: result.ok ? result.oldToken : undefined,
      nextToken: result.ok ? result.restoredToken : undefined,
      roundTripMs: Number((responseAt - startedAt).toFixed(3)),
      serverMs: result.ok ? result.metrics.revertMs : result.metrics?.revertMs ?? null,
      renderMs: Number((renderedAt - renderStartedAt).toFixed(3)),
      reason: result.ok ? undefined : result.reason
    });
  });
  actions.appendChild(undo);
  header.appendChild(actions);
  panel.appendChild(header);

  if (overlayCollapsed) {
    scheduleOverlayPlacement(panel);
    return;
  }

  const content = document.createElement("div");
  content.className = "intent-layer-content";
  panel.appendChild(content);

  if (!binding) {
    const hint = document.createElement("p");
    hint.textContent = "Click Pick element, then choose something on the page to edit its Tailwind tokens.";
    hint.style.fontSize = "12px";
    hint.style.lineHeight = "1.5";
    content.appendChild(hint);
  } else {
    const meta = document.createElement("pre");
    meta.className = "intent-layer-meta";
    meta.textContent = [
      `${binding.componentName ?? "Unknown"} <${binding.tagName}>`,
      binding.relativeFile,
      binding.id,
      `className: ${binding.className.kind}${
        binding.className.callee ? ` (${binding.className.callee})` : ""
      }`,
      binding.className.dynamicSegments > 0
        ? `dynamic args read-only: ${binding.className.dynamicSegments}`
        : "dynamic args read-only: 0",
      binding.className.unsupportedReason
        ? `unsupported: ${binding.className.unsupportedReason}`
        : "unsupported: none"
    ].join("\n");
    meta.style.marginTop = "10px";
    meta.style.padding = "8px";
    meta.style.borderRadius = "6px";
    meta.style.background = "#f1f5f9";
    meta.style.fontSize = "11px";
    meta.style.whiteSpace = "pre-wrap";
    content.appendChild(meta);

    const effectiveScope = scope ?? {
      renderedInstanceCount: 1,
      isShared: false
    };
    const scopeBox = document.createElement("div");
    scopeBox.className = "intent-layer-section";
    const scopeTitle = document.createElement("div");
    scopeTitle.className = "intent-layer-section-title";
    scopeTitle.textContent = effectiveScope.isShared ? "Shared source" : "Single render";
    const scopeText = document.createElement("p");
    scopeText.textContent = effectiveScope.isShared
      ? `Affects ${effectiveScope.renderedInstanceCount} rendered instances.`
      : "Affects this rendered instance.";
    scopeBox.append(scopeTitle, scopeText);
    content.appendChild(scopeBox);

    const editableTokens = binding.tokens.filter((item) => item.editable);
    if (editableTokens.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "This element is inspectable, but it has no direct-edit tokens yet.";
      empty.style.fontSize = "12px";
      empty.style.lineHeight = "1.5";
      content.appendChild(empty);
    }

    for (const token of editableTokens) {
      renderTokenRow(
        content,
        binding,
        token,
        effectiveScope,
        (message) => {
          statusLine.textContent = message;
        },
        (message) => {
          renderBinding(panel, binding, message, effectiveScope);
        }
      );
    }

    renderAgentTaskForm(content, binding, (message) => {
      statusLine.textContent = message;
    });

    renderUndoHistory(content, (message) => {
      renderBinding(panel, binding, message, effectiveScope);
    });
    renderConflictPanel(content, (message) => {
      renderBinding(panel, binding, message, effectiveScope);
    });
  }

  scheduleOverlayPlacement(panel);
}

export function initIntentOverlay() {
  if (typeof window === "undefined") return;
  if (document.querySelector("[data-intent-overlay-root]")) return;

  const panel = createPanel();
  panel.dataset.intentOverlayRoot = "true";
  document.body.appendChild(panel);
  scheduleOverlayPlacement(panel);

  window.addEventListener("resize", () => {
    scheduleOverlayPlacement(panel);
  });

  const placementObserver = new MutationObserver(() => {
    scheduleOverlayPlacement(panel);
  });
  placementObserver.observe(document.body, {
    childList: true
  });

  let graph: IntentGraph | null = null;
  let selectedBinding: IntentBinding | null = null;
  let selectedScope: RenderScope | null = null;
  let pickMode = false;
  let pickStartedAt = 0;
  let graphFetchMs: number | null = null;

  function setStatus(message: string) {
    renderBinding(panel, selectedBinding, message, selectedScope);
  }

  renderBinding(panel, null, "Ready. Start by picking an element.");

  panel.addEventListener("intent:start-pick", async () => {
    const graphStartedAt = performance.now();
    const response = await fetch("/__intent/graph");
    graph = (await response.json()) as IntentGraph;
    graphFetchMs = Number((performance.now() - graphStartedAt).toFixed(3));
    pickStartedAt = performance.now();
    pickMode = true;
    document.body.dataset.intentLayerPicking = "true";
    setStatus("Pick mode active");
  });

  document.addEventListener(
    "click",
    (event) => {
      if (!pickMode) return;

      const target = event.target as HTMLElement | null;
      if (!target || panel.contains(target)) return;

      const clickStartedAt = performance.now();
      const element = target.closest("[data-intent-id]") as HTMLElement | null;
      event.preventDefault();
      event.stopPropagation();
      pickMode = false;
      delete document.body.dataset.intentLayerPicking;

      if (!element || !graph) {
        clearSelectedIntentElements();
        selectedBinding = null;
        selectedScope = null;
        const renderStartedAt = performance.now();
        setStatus("No intent binding on this element");
        const renderedAt = performance.now();
        recordClientMetric({
          kind: "click-to-panel",
          id: null,
          status: element ? "missing-binding" : "missing-element",
          createdAt: new Date().toISOString(),
          graphFetchMs,
          pickToPanelMs: Number((renderedAt - pickStartedAt).toFixed(3)),
          clickToPanelMs: Number((renderedAt - clickStartedAt).toFixed(3)),
          bindingLookupMs: 0,
          renderMs: Number((renderedAt - renderStartedAt).toFixed(3))
        });
        return;
      }

      const lookupStartedAt = performance.now();
      const intentId = element.dataset.intentId ?? "";
      clearSelectedIntentElements();
      selectedScope = intentId ? selectIntentElements(intentId) : null;
      selectedBinding = graph.entries[intentId] ?? null;
      const lookupEndedAt = performance.now();
      const renderStartedAt = performance.now();
      overlayCollapsed = false;
      renderBinding(
        panel,
        selectedBinding,
        selectedBinding ? "Element selected" : "No binding found for that element",
        selectedScope
      );
      const renderedAt = performance.now();
      recordClientMetric({
        kind: "click-to-panel",
        id: element.dataset.intentId ?? null,
        status: selectedBinding ? "selected" : "missing-binding",
        createdAt: new Date().toISOString(),
        graphFetchMs,
        pickToPanelMs: Number((renderedAt - pickStartedAt).toFixed(3)),
        clickToPanelMs: Number((renderedAt - clickStartedAt).toFixed(3)),
        bindingLookupMs: Number((lookupEndedAt - lookupStartedAt).toFixed(3)),
        renderMs: Number((renderedAt - renderStartedAt).toFixed(3))
      });
    },
    true
  );
}
