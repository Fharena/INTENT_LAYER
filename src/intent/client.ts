import { candidatesForToken } from "./tailwind";
import type {
  AgentResultArtifact,
  AgentTaskResult,
  IntentBinding,
  IntentGraph,
  IntentToken,
  PatchApplyResult,
  PatchFailure,
  PatchPreview,
  PatchRevertResult
} from "./types";

type PatchResponse = PatchApplyResult | PatchFailure;
type PreviewResponse = PatchPreview | PatchFailure;
type RevertResponse = PatchRevertResult | PatchFailure;
type AgentTaskResponse = AgentTaskResult | PatchFailure;
type AgentResultResponse = AgentResultArtifact | PatchFailure;

const lastAgentTaskFileByIntentId = new Map<string, string>();

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

  function patchBody() {
    return JSON.stringify({
      id: binding.id,
      oldToken: token.token,
      nextToken: select.value,
      sourceStart: token.sourceStart,
      sourceEnd: token.sourceEnd
    });
  }

  preview.addEventListener("click", async () => {
    const response = await fetch("/__intent/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: patchBody()
    });
    const result = (await response.json()) as PreviewResponse;
    if (result.ok) {
      previewBox.style.display = "block";
      previewBox.textContent = [`- ${result.before}`, `+ ${result.after}`].join("\n");
      setStatus(`Preview ${result.oldToken} -> ${result.nextToken} in ${result.metrics.previewMs}ms`);
    } else {
      previewBox.style.display = "block";
      previewBox.textContent = result.detail ?? result.reason;
      setStatus(`Preview rejected: ${result.reason}`);
    }
  });

  apply.addEventListener("click", async () => {
    const response = await fetch("/__intent/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: patchBody()
    });
    const result = (await response.json()) as PatchResponse;
    if (result.ok) {
      setStatus(`Applied ${result.oldToken} -> ${result.nextToken} in ${result.metrics.applyMs}ms`);
    } else {
      setStatus(`Rejected: ${result.reason}`);
    }
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
    const response = await fetch("/__intent/revert-last", {
      method: "POST"
    });
    const result = (await response.json()) as RevertResponse;
    if (result.ok) {
      renderBinding(
        panel,
        binding,
        `Reverted ${result.oldToken} -> ${result.restoredToken} in ${result.metrics.revertMs}ms`
      );
    } else {
      renderBinding(panel, binding, `Undo rejected: ${result.reason}`);
    }
  });
  panel.appendChild(undo);

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
        renderBinding(panel, binding, message);
      });
    }

    renderAgentTaskForm(panel, binding, (message) => {
      renderBinding(panel, binding, message);
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

  function setStatus(message: string) {
    renderBinding(panel, selectedBinding, message);
  }

  renderBinding(panel, null, "Ready");

  panel.addEventListener("intent:start-pick", async () => {
    const response = await fetch("/__intent/graph");
    graph = (await response.json()) as IntentGraph;
    pickMode = true;
    setStatus("Pick mode active");
  });

  document.addEventListener(
    "click",
    (event) => {
      if (!pickMode) return;

      const target = event.target as HTMLElement | null;
      if (!target || panel.contains(target)) return;

      const element = target.closest("[data-intent-id]") as HTMLElement | null;
      event.preventDefault();
      event.stopPropagation();
      pickMode = false;

      if (!element || !graph) {
        setStatus("No intent binding on this element");
        return;
      }

      if (selectedElement) {
        selectedElement.removeAttribute("data-intent-selected");
      }

      selectedElement = element;
      selectedElement.setAttribute("data-intent-selected", "true");
      selectedBinding = graph.entries[element.dataset.intentId ?? ""] ?? null;
      renderBinding(panel, selectedBinding, selectedBinding ? "Binding selected" : "Binding missing");
    },
    true
  );
}
