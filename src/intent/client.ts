import { candidatesForToken } from "./tailwind";
import type {
  AgentResultArtifact,
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
  UndoHistoryReport
} from "./types";

type PatchResponse = PatchApplyResult | PatchFailure;
type PreviewResponse = PatchPreview | PatchFailure;
type RevertResponse = PatchRevertResult | PatchFailure;
type AgentTaskResponse = AgentTaskResult | PatchFailure;
type AgentResultResponse = AgentResultArtifact | PatchFailure;
type UndoHistoryResponse = UndoHistoryReport;
type ConflictReportResponse = PatchConflictReport;
type ConflictResolveResponse = PatchConflictResolveResult | PatchFailure;
type UndoDiscardResponse = PatchUndoDiscardResult | PatchFailure;

const lastAgentTaskFileByIntentId = new Map<string, string>();

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

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
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

function createPanel() {
  const panel = document.createElement("div");
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
  setStatus: (message: string) => void
) {
  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "1fr 1fr auto auto";
  row.style.gap = "8px";
  row.style.alignItems = "center";
  row.style.marginTop = "8px";

  const label = document.createElement("div");
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
  const apply = createButton("Apply");
  const previewBox = document.createElement("pre");
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
      renderBinding(root, binding, `Applied ${result.oldToken} -> ${result.nextToken} in ${result.metrics.applyMs}ms`);
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
      setStatus(`Agent task created in ${result.metrics.taskMs}ms: ${result.taskFile}`);
    } else {
      setStatus(`Agent task rejected: ${result.reason}`);
    }
  });

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

  wrapper.append(label, textarea, create, resultLabel, resultTextarea, record);
  root.appendChild(wrapper);
}

function renderUndoHistory(root: HTMLElement, setStatus: (message: string) => void) {
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "12px";
  wrapper.style.paddingTop = "10px";
  wrapper.style.borderTop = "1px solid #e2e8f0";

  const header = document.createElement("div");
  header.textContent = "Undo history";
  header.style.fontSize = "12px";
  header.style.fontWeight = "800";

  const body = document.createElement("div");
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

        entry.append(text, discard);
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
  wrapper.style.marginTop = "12px";
  wrapper.style.paddingTop = "10px";
  wrapper.style.borderTop = "1px solid #e2e8f0";

  const header = document.createElement("div");
  header.textContent = "Undo conflicts";
  header.style.fontSize = "12px";
  header.style.fontWeight = "800";

  const body = document.createElement("div");
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

function renderBinding(panel: HTMLElement, binding: IntentBinding | null, status: string) {
  panel.innerHTML = "";

  const title = document.createElement("div");
  title.textContent = "Intent Layer Spike";
  title.style.fontSize = "14px";
  title.style.fontWeight = "800";
  panel.appendChild(title);

  const statusLine = document.createElement("div");
  statusLine.textContent = status;
  statusLine.style.marginTop = "6px";
  statusLine.style.fontSize = "12px";
  statusLine.style.color = "#475569";
  panel.appendChild(statusLine);

  const pick = createButton("Pick element");
  pick.style.marginTop = "10px";
  panel.appendChild(pick);

  const undo = createButton("Undo last");
  undo.style.marginTop = "10px";
  undo.style.marginLeft = "8px";
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
        `Reverted ${result.oldToken} -> ${result.restoredToken} in ${result.metrics.revertMs}ms`
      );
    } else {
      const conflict = result.conflictFile ? ` (${result.conflictFile})` : "";
      renderBinding(panel, binding, `Undo rejected: ${result.reason}${conflict}`);
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
  panel.appendChild(undo);
  renderUndoHistory(panel, (message) => {
    renderBinding(panel, binding, message);
  });
  renderConflictPanel(panel, (message) => {
    renderBinding(panel, binding, message);
  });

  if (!binding) {
    const hint = document.createElement("p");
    hint.textContent = "Pick a visible element with a supported className binding.";
    hint.style.fontSize = "12px";
    hint.style.lineHeight = "1.5";
    panel.appendChild(hint);
  } else {
    const meta = document.createElement("pre");
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
    panel.appendChild(meta);

    const editableTokens = binding.tokens.filter((item) => item.editable);
    if (editableTokens.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No supported direct-edit tokens found for this binding.";
      empty.style.fontSize = "12px";
      empty.style.lineHeight = "1.5";
      panel.appendChild(empty);
    }

    for (const token of editableTokens) {
      renderTokenRow(panel, binding, token, (message) => {
        statusLine.textContent = message;
      });
    }

    renderAgentTaskForm(panel, binding, (message) => {
      statusLine.textContent = message;
    });
  }

  pick.addEventListener("click", () => {
    panel.dispatchEvent(new CustomEvent("intent:start-pick"));
  });
}

export function initIntentOverlay() {
  if (typeof window === "undefined") return;
  if (document.querySelector("[data-intent-overlay-root]")) return;

  const panel = createPanel();
  panel.dataset.intentOverlayRoot = "true";
  document.body.appendChild(panel);

  let graph: IntentGraph | null = null;
  let selectedElement: HTMLElement | null = null;
  let selectedBinding: IntentBinding | null = null;
  let pickMode = false;
  let pickStartedAt = 0;
  let graphFetchMs: number | null = null;

  function setStatus(message: string) {
    renderBinding(panel, selectedBinding, message);
  }

  renderBinding(panel, null, "Ready");

  panel.addEventListener("intent:start-pick", async () => {
    const graphStartedAt = performance.now();
    const response = await fetch("/__intent/graph");
    graph = (await response.json()) as IntentGraph;
    graphFetchMs = Number((performance.now() - graphStartedAt).toFixed(3));
    pickStartedAt = performance.now();
    pickMode = true;
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

      if (!element || !graph) {
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

      if (selectedElement) {
        selectedElement.removeAttribute("data-intent-selected");
      }

      selectedElement = element;
      selectedElement.setAttribute("data-intent-selected", "true");
      const lookupStartedAt = performance.now();
      selectedBinding = graph.entries[element.dataset.intentId ?? ""] ?? null;
      const lookupEndedAt = performance.now();
      const renderStartedAt = performance.now();
      renderBinding(panel, selectedBinding, selectedBinding ? "Binding selected" : "Binding missing");
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
