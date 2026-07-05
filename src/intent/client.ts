import { candidatesForToken } from "./tailwind";
import type {
  AgentResultArtifact,
  AgentQueueSignal,
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
  IntentLayerLanguage,
  IntentLayerSettings,
  IntentOverlaySettings,
  IntentSetupResult,
  IntentSetupStatus,
  UndoHistoryReport
} from "./types";

type PatchResponse = PatchApplyResult | PatchFailure;
type PreviewResponse = PatchPreview | PatchFailure;
type RevertResponse = PatchRevertResult | PatchFailure;
type AgentTaskResponse = AgentTaskResult | PatchFailure;
type AgentResultResponse = AgentResultArtifact | PatchFailure;
type AgentQueueResponse = AgentQueueSignal | PatchFailure;
type UndoHistoryResponse = UndoHistoryReport;
type ConflictReportResponse = PatchConflictReport;
type ConflictResolveResponse = PatchConflictResolveResult | PatchFailure;
type UndoDiscardResponse = PatchUndoDiscardResult | PatchFailure;
type UndoRevertResponse = PatchUndoRevertResult | PatchFailure;
type SetupResponse = IntentSetupStatus;
type SetupApplyResponse = IntentSetupResult | PatchFailure;

interface RenderScope {
  renderedInstanceCount: number;
  isShared: boolean;
}

type WorkflowState = "idle" | "done" | "active" | "blocked";
type OverlayView = "editor" | "setup";

type TextKey =
  | "agentCreate"
  | "agentChange"
  | "agentCreated"
  | "agentHandoff"
  | "agentLaunchPlan"
  | "agentLaunchRunLocked"
  | "agentPlaceholder"
  | "agentQueue"
  | "agentQueueEmpty"
  | "agentQueueLatest"
  | "agentQueueRefresh"
  | "agentQueueWaiting"
  | "agentRecord"
  | "agentResult"
  | "agentResultPlaceholder"
  | "agentRunEnabled"
  | "agentRunLockedDetail"
  | "agentRunToggle"
  | "agentRunToggleDetail"
  | "agentSettings"
  | "autoOpenSetup"
  | "autoOpenSetupDetail"
  | "apply"
  | "applyAll"
  | "beginnerStartDetail"
  | "beginnerStartTitle"
  | "binding"
  | "claudeCommand"
  | "claudeHook"
  | "claudeHookDetail"
  | "classMode"
  | "codexSubtool"
  | "codexCommand"
  | "codexSkill"
  | "codexSkillDetail"
  | "component"
  | "commandInputPlaceholder"
  | "commandPlan"
  | "compact"
  | "density"
  | "conflicts"
  | "conflictsEmpty"
  | "comfortable"
  | "deterministicPatch"
  | "defaultCollapsed"
  | "defaultCollapsedDetail"
  | "dock"
  | "dockLeft"
  | "dockRight"
  | "directEdit"
  | "directEditEmpty"
  | "dynamicArgs"
  | "editableTokens"
  | "elementSelected"
  | "english"
  | "expand"
  | "expertTrace"
  | "guardedHandoff"
  | "healthReady"
  | "healthSetup"
  | "inspectableNoTokens"
  | "intentMap"
  | "korean"
  | "language"
  | "minimize"
  | "nextStep"
  | "noBinding"
  | "noIntentElement"
  | "panelSettings"
  | "pick"
  | "pickHint"
  | "pickMode"
  | "preview"
  | "ready"
  | "resetOnboarding"
  | "resetOnboardingDone"
  | "runLocked"
  | "saveSettings"
  | "settingsSaved"
  | "selectSingle"
  | "selectedSource"
  | "setup"
  | "setupApply"
  | "setupComplete"
  | "setupGraphReady"
  | "setupGraphWaiting"
  | "setupIntro"
  | "setupOpen"
  | "setupStatus"
  | "setupTitle"
  | "setupTitleReady"
  | "setupWorkspaceReady"
  | "setupWorkspaceWaiting"
  | "sourceHash"
  | "sharedSource"
  | "singleRender"
  | "undo"
  | "undoHistory"
  | "undoHistoryEmpty"
  | "workflowEdit"
  | "workflowInspect"
  | "workflowPick"
  | "workflowReview";

const lastAgentTaskFileByIntentId = new Map<string, string>();
const overlayStyleId = "intent-layer-overlay-style";
const overlayRuntimeVersion = "visual-map-v1";
const overlayBaseBottom = 18;
const overlayAvoidanceGap = 14;
let overlayPlacementFrame: number | null = null;
let overlayCollapsed = false;
let overlayView: OverlayView = "editor";
let overlayLanguage: IntentLayerLanguage = detectInitialLanguage();
let overlaySettings: IntentOverlaySettings = defaultOverlaySettings();
let latestSetupStatus: IntentSetupStatus | null = null;
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

const texts: Record<IntentLayerLanguage, Record<TextKey, string>> = {
  ko: {
    agentCreate: "작업 만들기",
    agentChange: "변경 요청",
    agentCreated: "Agent 작업 생성",
    agentHandoff: "Agent 전달",
    agentLaunchPlan: "실행 계획",
    agentLaunchRunLocked: "실행 잠김",
    agentPlaceholder: "복잡하거나 직접 수정이 어려운 변경사항을 적어주세요",
    agentQueue: "Agent 큐",
    agentQueueEmpty: "대기 중인 Agent 작업이 없습니다.",
    agentQueueLatest: "최근 작업",
    agentQueueRefresh: "큐 새로고침",
    agentQueueWaiting: "작업이 큐에 올라갔습니다. Codex skill 또는 Claude hook이 처리합니다.",
    agentRecord: "결과 기록",
    agentResult: "결과",
    agentResultPlaceholder: "Agent가 작업한 결과를 요약해 주세요",
    agentRunEnabled: "Agent 실행이 켜져 있습니다. Run 버튼이 로컬 CLI를 시작할 수 있습니다.",
    agentRunLockedDetail: "Agent 실행은 잠겨 있습니다. 설정에서 켜거나 INTENT_LAYER_AGENT_RUN=1을 사용하면 실제 CLI를 시작할 수 있습니다.",
    agentRunToggle: "Agent 실행 허용",
    agentRunToggleDetail: "켜면 Run Codex/Claude가 로컬 CLI를 시작할 수 있습니다. 꺼져 있으면 command plan만 만듭니다.",
    agentSettings: "Agent Hooks",
    autoOpenSetup: "설정 필요 시 자동 열기",
    autoOpenSetupDetail: "workspace나 onboarding이 비어 있으면 시작할 때 설정 화면을 엽니다.",
    apply: "적용",
    applyAll: "전체 적용",
    beginnerStartDetail: "시작은 하나입니다. 선택을 누르고 고칠 UI를 클릭하세요.",
    beginnerStartTitle: "수정할 화면 요소를 고르세요",
    binding: "Source binding",
    claudeCommand: "Claude 명령",
    claudeHook: "Claude 자동 픽업",
    claudeHookDetail: "Claude Code가 열려 있으면 .intent-agent-queue.json 변경을 감지해 같은 작업 큐를 처리합니다.",
    classMode: "Class 모드",
    codexSubtool: "Codex 보조 도구",
    codexCommand: "Codex 명령",
    codexSkill: "Codex 작업 스킬",
    codexSkillDetail: "프로젝트에 Codex skill을 설치해 queued 작업을 같은 방식으로 claim하고 처리합니다.",
    component: "컴포넌트",
    commandInputPlaceholder: "비워두면 기본값 또는 환경변수를 사용합니다",
    commandPlan: "명령 계획",
    compact: "컴팩트",
    density: "밀도",
    conflicts: "되돌리기 충돌",
    conflictsEmpty: "해결되지 않은 충돌이 없습니다.",
    comfortable: "기본",
    deterministicPatch: "결정론적 패치",
    defaultCollapsed: "시작 시 접기",
    defaultCollapsedDetail: "다음 새로고침부터 패널을 접힌 상태로 시작합니다.",
    dock: "패널 위치",
    dockLeft: "왼쪽",
    dockRight: "오른쪽",
    directEdit: "직접 수정",
    directEditEmpty: "직접 수정 가능한 토큰이 아직 없습니다.",
    dynamicArgs: "동적 인자 read-only",
    editableTokens: "수정 가능 토큰",
    elementSelected: "요소를 선택했습니다",
    english: "English",
    expand: "펼치기",
    expertTrace: "검증 근거",
    guardedHandoff: "Agent 전달",
    healthReady: "준비",
    healthSetup: "설정 필요",
    inspectableNoTokens: "이 요소는 inspect 가능하지만 아직 직접 수정 가능한 토큰이 없습니다.",
    intentMap: "Intent 맵",
    korean: "한국어",
    language: "언어",
    minimize: "접기",
    nextStep: "다음 행동",
    noBinding: "이 요소의 binding을 찾지 못했습니다",
    noIntentElement: "Intent binding이 있는 요소가 아닙니다",
    panelSettings: "패널",
    pick: "선택",
    pickHint: "선택을 누른 뒤 페이지에서 수정할 UI를 클릭하세요.",
    pickMode: "선택 모드입니다",
    preview: "미리보기",
    ready: "준비됐습니다. 요소를 선택하세요.",
    resetOnboarding: "온보딩 다시 보기",
    resetOnboardingDone: "다음 실행 때 설정 화면이 다시 열립니다",
    runLocked: "실행은 잠겨 있습니다. 설정에서 Agent 실행을 켜거나 INTENT_LAYER_AGENT_RUN=1일 때만 CLI가 실행됩니다.",
    saveSettings: "설정 저장",
    settingsSaved: "설정을 저장했습니다",
    selectSingle: "이 렌더 인스턴스에만 연결됩니다.",
    selectedSource: "선택된 소스",
    setup: "설정",
    setupApply: "설정 완료",
    setupComplete: "설정이 완료됐습니다",
    setupGraphReady: "소스 binding이 준비됐습니다.",
    setupGraphWaiting: "Vite가 TSX/JSX를 변환하면 binding이 생깁니다.",
    setupIntro: "Vite dev server 안에서 CLI 없이 Intent Layer 기본 설정을 마칩니다.",
    setupOpen: "설정 화면",
    setupStatus: "설정 상태",
    setupTitle: "처음 설정",
    setupTitleReady: "설정",
    setupWorkspaceReady: ".intent 워크스페이스가 준비됐습니다.",
    setupWorkspaceWaiting: ".intent 워크스페이스를 생성해야 합니다.",
    sourceHash: "Source hash",
    sharedSource: "공유 source",
    singleRender: "단일 렌더",
    undo: "되돌리기",
    undoHistory: "되돌리기 기록",
    undoHistoryEmpty: "대기 중인 되돌리기 작업이 없습니다.",
    workflowEdit: "수정",
    workflowInspect: "근거 확인",
    workflowPick: "선택",
    workflowReview: "검토"
  },
  en: {
    agentCreate: "Create task",
    agentChange: "Change request",
    agentCreated: "Agent task created",
    agentHandoff: "Agent handoff",
    agentLaunchPlan: "Command plan",
    agentLaunchRunLocked: "Run locked",
    agentPlaceholder: "Describe a complex or unsupported edit",
    agentQueue: "Agent queue",
    agentQueueEmpty: "No pending agent tasks.",
    agentQueueLatest: "Latest task",
    agentQueueRefresh: "Refresh queue",
    agentQueueWaiting: "Task is queued. Codex skill or Claude hook can pick it up.",
    agentRecord: "Record result",
    agentResult: "Result",
    agentResultPlaceholder: "Summarize the agent result",
    agentRunEnabled: "Agent run is enabled. Run buttons may start local CLIs.",
    agentRunLockedDetail: "Agent run is locked. Enable it in settings or set INTENT_LAYER_AGENT_RUN=1 to start local CLIs.",
    agentRunToggle: "Enable Agent run",
    agentRunToggleDetail: "When enabled, Run Codex/Claude may start local CLIs. When disabled, they only create command plans.",
    agentSettings: "Agent Hooks",
    autoOpenSetup: "Open setup when needed",
    autoOpenSetupDetail: "Open the setup view on startup when the workspace or onboarding is incomplete.",
    apply: "Apply",
    applyAll: "Apply all",
    beginnerStartDetail: "Start with one action: pick an element on the page.",
    beginnerStartTitle: "Choose something to edit",
    binding: "Binding",
    claudeCommand: "Claude command",
    claudeHook: "Claude auto pickup",
    claudeHookDetail: "When Claude Code is open, it watches .intent-agent-queue.json and processes the same queue.",
    classMode: "Class mode",
    codexSubtool: "Codex subtool",
    codexCommand: "Codex command",
    codexSkill: "Codex task skill",
    codexSkillDetail: "Install a project Codex skill that claims and processes queued tasks through the shared queue.",
    component: "Component",
    commandInputPlaceholder: "Leave blank to use the default or environment variable",
    commandPlan: "Command plan",
    compact: "Compact",
    density: "Density",
    conflicts: "Undo conflicts",
    conflictsEmpty: "No unresolved undo conflicts.",
    comfortable: "Comfortable",
    deterministicPatch: "Deterministic patch",
    defaultCollapsed: "Start minimized",
    defaultCollapsedDetail: "Start the panel collapsed on the next page load.",
    dock: "Panel position",
    dockLeft: "Left",
    dockRight: "Right",
    directEdit: "Direct edit",
    directEditEmpty: "No direct-edit tokens yet.",
    dynamicArgs: "dynamic args read-only",
    editableTokens: "Editable tokens",
    elementSelected: "Element selected",
    english: "English",
    expand: "Expand",
    expertTrace: "Validation trace",
    guardedHandoff: "Agent handoff",
    healthReady: "Ready",
    healthSetup: "Setup needed",
    inspectableNoTokens: "This element is inspectable, but it has no direct-edit tokens yet.",
    intentMap: "Intent map",
    korean: "Korean",
    language: "Language",
    minimize: "Minimize",
    nextStep: "Next step",
    noBinding: "No binding found for that element",
    noIntentElement: "No intent binding on this element",
    panelSettings: "Panel",
    pick: "Pick",
    pickHint: "Click Pick, then choose something on the page to edit.",
    pickMode: "Pick mode active",
    preview: "Preview",
    ready: "Ready. Start by picking an element.",
    resetOnboarding: "Show onboarding again",
    resetOnboardingDone: "Setup will open again on the next run",
    runLocked: "Agent run is locked. Agent CLIs run only when enabled in settings or INTENT_LAYER_AGENT_RUN=1 is set.",
    saveSettings: "Save settings",
    settingsSaved: "Settings saved",
    selectSingle: "Affects this rendered instance.",
    selectedSource: "Selected source",
    setup: "Setup",
    setupApply: "Finish setup",
    setupComplete: "Setup complete",
    setupGraphReady: "Source bindings are ready.",
    setupGraphWaiting: "Bindings appear after Vite transforms TSX/JSX files.",
    setupIntro: "Finish Intent Layer setup inside the Vite dev server, without extra CLI steps.",
    setupOpen: "Setup view",
    setupStatus: "Setup status",
    setupTitle: "First setup",
    setupTitleReady: "Settings",
    setupWorkspaceReady: ".intent workspace is ready.",
    setupWorkspaceWaiting: ".intent workspace needs to be created.",
    sourceHash: "Source hash",
    sharedSource: "Shared source",
    singleRender: "Single render",
    undo: "Undo",
    undoHistory: "Undo history",
    undoHistoryEmpty: "No pending undo operations.",
    workflowEdit: "Edit",
    workflowInspect: "Inspect",
    workflowPick: "Pick",
    workflowReview: "Review"
  }
};

function detectInitialLanguage(): IntentLayerLanguage {
  try {
    const stored = window.localStorage.getItem("intent-layer-language");
    if (stored === "ko" || stored === "en") return stored;
  } catch {
    // Ignore storage failures in embedded previews.
  }

  return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
}

function t(key: TextKey): string {
  return texts[overlayLanguage][key];
}

function compactPath(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}

function setOverlayLanguage(language: IntentLayerLanguage) {
  overlayLanguage = language;
  try {
    window.localStorage.setItem("intent-layer-language", language);
  } catch {
    // Ignore storage failures in embedded previews.
  }
}

function defaultOverlaySettings(): IntentOverlaySettings {
  return {
    dock: "right",
    density: "comfortable",
    defaultCollapsed: false,
    autoOpenSetup: true
  };
}

function syncSettings(settings: IntentLayerSettings) {
  setOverlayLanguage(settings.language);
  overlaySettings = settings.overlay;
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
  width: min(430px, calc(100vw - 24px)) !important;
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

[data-intent-overlay-root][data-intent-dock="left"] {
  right: auto !important;
  left: max(18px, env(safe-area-inset-left)) !important;
}

[data-intent-overlay-root][data-intent-dock="right"] {
  right: max(18px, env(safe-area-inset-right)) !important;
  left: auto !important;
}

[data-intent-overlay-root][data-intent-density="compact"] {
  width: min(346px, calc(100vw - 24px)) !important;
  font-size: 11px !important;
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
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
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
  gap: 11px !important;
  padding: 12px 13px 13px !important;
}

.intent-layer-workflow {
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 6px !important;
}

.intent-layer-step {
  display: grid !important;
  gap: 5px !important;
  min-width: 0 !important;
  padding: 8px 7px !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.045) !important;
}

.intent-layer-step[data-intent-state="done"] {
  border-color: rgba(85, 230, 165, 0.28) !important;
  background: rgba(85, 230, 165, 0.08) !important;
}

.intent-layer-step[data-intent-state="active"] {
  border-color: rgba(118, 204, 255, 0.5) !important;
  background: linear-gradient(135deg, rgba(124, 109, 255, 0.2), rgba(78, 188, 255, 0.12)) !important;
  box-shadow: 0 0 0 1px rgba(118, 204, 255, 0.14) inset !important;
}

.intent-layer-step[data-intent-state="blocked"] {
  border-color: rgba(255, 209, 102, 0.3) !important;
  background: rgba(255, 209, 102, 0.07) !important;
}

.intent-layer-step-index {
  display: inline-grid !important;
  width: 20px !important;
  height: 20px !important;
  place-items: center !important;
  border-radius: 999px !important;
  background: rgba(255, 255, 255, 0.08) !important;
  color: #dbe7ff !important;
  font-size: 10px !important;
  font-weight: 900 !important;
}

.intent-layer-step-label {
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  color: #eef2ff !important;
  font-size: 10px !important;
  font-weight: 850 !important;
}

.intent-layer-empty-state {
  display: grid !important;
  gap: 10px !important;
  padding: 12px !important;
  border: 1px solid rgba(118, 204, 255, 0.18) !important;
  border-radius: 8px !important;
  background:
    linear-gradient(135deg, rgba(124, 109, 255, 0.14), rgba(78, 188, 255, 0.07)),
    rgba(255, 255, 255, 0.045) !important;
}

.intent-layer-section-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  min-width: 0 !important;
}

.intent-layer-section-header > .intent-layer-section-title {
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.intent-layer-chip-row {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
}

.intent-layer-chip {
  display: inline-flex !important;
  align-items: center !important;
  max-width: 100% !important;
  min-height: 22px !important;
  padding: 3px 7px !important;
  border: 1px solid rgba(255, 255, 255, 0.11) !important;
  border-radius: 999px !important;
  background: rgba(255, 255, 255, 0.06) !important;
  color: #cbd6f0 !important;
  font-size: 10px !important;
  font-weight: 850 !important;
  line-height: 1.1 !important;
}

.intent-layer-chip[data-intent-tone="ready"] {
  border-color: rgba(85, 230, 165, 0.35) !important;
  background: rgba(85, 230, 165, 0.1) !important;
  color: #bdf8dc !important;
}

.intent-layer-chip[data-intent-tone="warn"] {
  border-color: rgba(255, 209, 102, 0.38) !important;
  background: rgba(255, 209, 102, 0.1) !important;
  color: #ffe4a3 !important;
}

.intent-layer-kv-grid {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 8px !important;
}

.intent-layer-kv {
  display: grid !important;
  gap: 4px !important;
  min-width: 0 !important;
  padding: 9px !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 8px !important;
  background: rgba(3, 6, 14, 0.34) !important;
}

.intent-layer-kv-label {
  color: #95a1ba !important;
  font-size: 10px !important;
  font-weight: 850 !important;
}

.intent-layer-kv-value {
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  color: #f5f8ff !important;
  font-size: 12px !important;
  font-weight: 850 !important;
}

.intent-layer-kv-detail {
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  color: #a9b4cc !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  font-size: 10px !important;
}

.intent-layer-code-box {
  margin: 0 !important;
  padding: 9px !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 7px !important;
  background: rgba(3, 6, 14, 0.5) !important;
  color: #cfd7eb !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  font-size: 10px !important;
  line-height: 1.45 !important;
  white-space: pre-wrap !important;
  word-break: break-word !important;
}

.intent-layer-token-list {
  display: grid !important;
  gap: 8px !important;
}

.intent-layer-setup-grid {
  display: grid !important;
  gap: 8px !important;
}

.intent-layer-check-row {
  display: grid !important;
  grid-template-columns: auto 1fr !important;
  gap: 8px !important;
  align-items: start !important;
}

.intent-layer-check-dot {
  width: 8px !important;
  height: 8px !important;
  margin-top: 5px !important;
  border-radius: 999px !important;
  background: #94a3b8 !important;
  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.13) !important;
}

.intent-layer-check-dot[data-intent-status="ready"] {
  background: #55e6a5 !important;
  box-shadow: 0 0 0 3px rgba(85, 230, 165, 0.12) !important;
}

.intent-layer-check-dot[data-intent-status="warn"] {
  background: #ffd166 !important;
  box-shadow: 0 0 0 3px rgba(255, 209, 102, 0.12) !important;
}

.intent-layer-language-grid {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 8px !important;
}

.intent-layer-control-grid {
  display: grid !important;
  gap: 8px !important;
}

.intent-layer-segmented {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 8px !important;
}

.intent-layer-setting-row {
  display: grid !important;
  grid-template-columns: 1fr auto !important;
  gap: 10px !important;
  align-items: center !important;
}

.intent-layer-command-grid {
  display: grid !important;
  gap: 8px !important;
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

.intent-layer-token-row[data-intent-token-category="color"] {
  border-left: 2px solid rgba(98, 217, 255, 0.5) !important;
  padding-left: 8px !important;
}

.intent-layer-token-row[data-intent-token-category="spacing"],
.intent-layer-token-row[data-intent-token-category="layout"] {
  border-left: 2px solid rgba(142, 130, 255, 0.55) !important;
  padding-left: 8px !important;
}

.intent-layer-token-row[data-intent-token-category="typography"],
.intent-layer-token-row[data-intent-token-category="radius"] {
  border-left: 2px solid rgba(85, 230, 165, 0.45) !important;
  padding-left: 8px !important;
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
[data-intent-overlay-root] input,
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

function createTextInput(value: string, placeholder: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

function createSettingRow(title: string, detail: string, control: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "intent-layer-setting-row";
  const body = document.createElement("div");
  const label = document.createElement("div");
  label.className = "intent-layer-section-title";
  label.textContent = title;
  body.appendChild(label);
  if (detail) {
    const description = document.createElement("p");
    description.textContent = detail;
    body.appendChild(description);
  }
  row.append(body, control);
  return row;
}

function createToggleButton(active: boolean): HTMLButtonElement {
  const button = createButton(
    active ? (overlayLanguage === "ko" ? "켜짐" : "On") : overlayLanguage === "ko" ? "꺼짐" : "Off",
    active ? "primary" : "secondary"
  );
  button.dataset.intentToggle = active ? "true" : "false";
  return button;
}

function createSection(title: string, tone?: "ready" | "warn" | "neutral"): HTMLElement {
  const section = document.createElement("section");
  section.className = "intent-layer-section";

  const header = document.createElement("div");
  header.className = "intent-layer-section-header";

  const label = document.createElement("div");
  label.className = "intent-layer-section-title";
  label.textContent = title;
  header.appendChild(label);

  if (tone) {
    const chip = createChip(tone === "ready" ? t("healthReady") : tone === "warn" ? t("healthSetup") : "Info", tone);
    header.appendChild(chip);
  }

  section.appendChild(header);
  return section;
}

function createChip(label: string, tone: "ready" | "warn" | "neutral" = "neutral"): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "intent-layer-chip";
  chip.dataset.intentTone = tone;
  chip.textContent = label;
  return chip;
}

function createKeyValue(label: string, value: string, detail?: string): HTMLElement {
  const item = document.createElement("div");
  item.className = "intent-layer-kv";

  const labelElement = document.createElement("div");
  labelElement.className = "intent-layer-kv-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("div");
  valueElement.className = "intent-layer-kv-value";
  valueElement.title = value;
  valueElement.textContent = value;

  item.append(labelElement, valueElement);

  if (detail) {
    const detailElement = document.createElement("div");
    detailElement.className = "intent-layer-kv-detail";
    detailElement.title = detail;
    detailElement.textContent = detail;
    item.appendChild(detailElement);
  }

  return item;
}

function renderWorkflowRail(root: HTMLElement, binding: IntentBinding | null, editableCount = 0) {
  const rail = document.createElement("div");
  rail.className = "intent-layer-workflow";

  const steps: Array<{ label: string; state: WorkflowState }> = binding
    ? [
        { label: t("workflowPick"), state: "done" },
        { label: t("workflowInspect"), state: "done" },
        { label: t("workflowEdit"), state: editableCount > 0 ? "active" : "blocked" },
        { label: t("workflowReview"), state: "idle" }
      ]
    : [
        { label: t("workflowPick"), state: "active" },
        { label: t("workflowInspect"), state: "idle" },
        { label: t("workflowEdit"), state: "idle" },
        { label: t("workflowReview"), state: "idle" }
      ];

  steps.forEach((step, index) => {
    const item = document.createElement("div");
    item.className = "intent-layer-step";
    item.dataset.intentState = step.state;

    const number = document.createElement("span");
    number.className = "intent-layer-step-index";
    number.textContent = String(index + 1);

    const label = document.createElement("span");
    label.className = "intent-layer-step-label";
    label.textContent = step.label;

    item.append(number, label);
    rail.appendChild(item);
  });

  root.appendChild(rail);
}

function renderEmptyState(root: HTMLElement, panel: HTMLElement) {
  renderWorkflowRail(root, null);

  const empty = document.createElement("section");
  empty.className = "intent-layer-empty-state";

  const title = document.createElement("div");
  title.className = "intent-layer-section-title";
  title.textContent = t("beginnerStartTitle");

  const detail = document.createElement("p");
  detail.textContent = t("beginnerStartDetail");

  const pick = createButton(t("pick"), "primary");
  pick.addEventListener("click", () => {
    overlayView = "editor";
    panel.dispatchEvent(new CustomEvent("intent:start-pick"));
  });

  empty.append(title, detail, pick);
  root.appendChild(empty);
}

function renderIntentMap(
  root: HTMLElement,
  binding: IntentBinding,
  scope: RenderScope,
  editableTokens: IntentToken[]
) {
  const section = createSection(t("intentMap"), editableTokens.length > 0 ? "ready" : "warn");

  const chips = document.createElement("div");
  chips.className = "intent-layer-chip-row";
  chips.append(
    createChip(editableTokens.length > 0 ? t("deterministicPatch") : t("guardedHandoff"), editableTokens.length > 0 ? "ready" : "warn"),
    createChip(scope.isShared ? t("sharedSource") : t("singleRender"), scope.isShared ? "warn" : "neutral")
  );
  section.appendChild(chips);

  const grid = document.createElement("div");
  grid.className = "intent-layer-kv-grid";
  grid.append(
    createKeyValue(t("component"), `${binding.componentName ?? "Unknown"} <${binding.tagName}>`, binding.id),
    createKeyValue(t("selectedSource"), binding.relativeFile, `${t("sourceHash")}: ${binding.sourceHash.slice(0, 10)}`),
    createKeyValue(
      t("classMode"),
      `${binding.className.kind}${binding.className.callee ? `/${binding.className.callee}` : ""}`,
      binding.className.unsupportedReason ?? `${t("dynamicArgs")}: ${binding.className.dynamicSegments}`
    ),
    createKeyValue(
      t("editableTokens"),
      String(editableTokens.length),
      scope.isShared
        ? overlayLanguage === "ko"
          ? `${scope.renderedInstanceCount}개 렌더에 영향`
          : `Affects ${scope.renderedInstanceCount} renders`
        : t("selectSingle")
    )
  );
  section.appendChild(grid);

  const trace = document.createElement("pre");
  trace.className = "intent-layer-code-box";
  trace.textContent = [
    `${t("expertTrace")}: ${binding.relativeFile}`,
    `${t("binding")}: ${binding.id}`,
    `className: ${binding.className.kind}${
      binding.className.callee ? ` (${binding.className.callee})` : ""
    }`,
    binding.className.unsupportedReason
      ? `unsupported: ${binding.className.unsupportedReason}`
      : `unsupported: none`
  ].join("\n");
  section.appendChild(trace);

  root.appendChild(section);
}

function applyOverlaySettingsToPanel(panel: HTMLElement) {
  panel.dataset.intentDock = overlaySettings.dock;
  panel.dataset.intentDensity = overlaySettings.density;
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
  applyOverlaySettingsToPanel(panel);
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
  row.dataset.intentTokenCategory = token.category ?? "unknown";
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

  const preview = createButton(t("preview"));
  const apply = createButton(scope?.isShared ? t("applyAll") : t("apply"));
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
      const scopeNote = scope?.isShared
        ? `; ${overlayLanguage === "ko" ? "영향 렌더 수" : "affects"} ${scope.renderedInstanceCount}`
        : "";
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
  const wrapper = createSection(t("guardedHandoff"));

  const label = document.createElement("label");
  label.textContent = t("agentChange");
  label.style.display = "block";
  label.style.fontSize = "12px";
  label.style.fontWeight = "800";
  label.style.marginBottom = "6px";

  const textarea = document.createElement("textarea");
  textarea.placeholder = t("agentPlaceholder");
  textarea.rows = 3;
  textarea.style.width = "100%";
  textarea.style.boxSizing = "border-box";
  textarea.style.border = "1px solid #cbd5e1";
  textarea.style.borderRadius = "6px";
  textarea.style.padding = "8px";
  textarea.style.fontSize = "12px";
  textarea.style.resize = "vertical";

  const create = createButton(t("agentCreate"));
  create.style.marginTop = "8px";
  const queueSection = document.createElement("div");
  queueSection.className = "intent-layer-control-grid";
  queueSection.style.marginTop = "8px";

  const queueHeader = document.createElement("div");
  queueHeader.className = "intent-layer-setting-row";
  const queueTitle = document.createElement("div");
  queueTitle.className = "intent-layer-section-title";
  queueTitle.textContent = t("agentQueue");
  const refreshQueue = createButton(t("agentQueueRefresh"));
  queueHeader.append(queueTitle, refreshQueue);

  const queueBox = document.createElement("pre");
  queueBox.className = "intent-layer-code-box";
  queueBox.textContent = "Loading...";

  async function renderQueueStatus() {
    const response = await fetch("/__intent/agent-queue");
    const result = (await response.json()) as AgentQueueResponse;
    if (!("kind" in result)) {
      queueBox.textContent = result.detail ?? result.reason;
      return;
    }

    const latest = result.tasks[0] ?? null;
    if (!latest) {
      queueBox.textContent = `${t("agentQueueEmpty")}\nsignal: ${compactPath(result.queueFile)}`;
      return;
    }

    const activeCount = result.pendingTaskCount + result.runningTaskCount;
    queueBox.textContent = [
      `${t("agentQueueLatest")}: ${compactPath(latest.taskFile)}`,
      `status: ${latest.status}`,
      `provider: ${latest.provider ?? "none"}`,
      `active: ${activeCount} / done: ${result.doneTaskCount}`,
      `signal: ${compactPath(result.queueFile)}`
    ].join("\n");
  }

  refreshQueue.addEventListener("click", () => {
    void renderQueueStatus();
  });
  queueSection.append(queueHeader, queueBox);

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
      setStatus(`${t("agentCreated")} ${result.metrics.taskMs}ms: ${result.taskFile}`);
      queueBox.textContent = [
        t("agentQueueWaiting"),
        `task: ${compactPath(result.taskFile)}`,
        `status: ${result.status}`,
        `signal: .intent-agent-queue.json`
      ].join("\n");
      void renderQueueStatus();
    } else {
      setStatus(`Agent task rejected: ${result.reason}`);
    }
  });

  const resultLabel = document.createElement("label");
  resultLabel.textContent = t("agentResult");
  resultLabel.style.display = "block";
  resultLabel.style.fontSize = "12px";
  resultLabel.style.fontWeight = "800";
  resultLabel.style.marginTop = "10px";
  resultLabel.style.marginBottom = "6px";

  const resultTextarea = document.createElement("textarea");
  resultTextarea.placeholder = t("agentResultPlaceholder");
  resultTextarea.rows = 3;
  resultTextarea.style.width = "100%";
  resultTextarea.style.boxSizing = "border-box";
  resultTextarea.style.border = "1px solid #cbd5e1";
  resultTextarea.style.borderRadius = "6px";
  resultTextarea.style.padding = "8px";
  resultTextarea.style.fontSize = "12px";
  resultTextarea.style.resize = "vertical";

  const record = createButton(t("agentRecord"));
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

  wrapper.append(label, textarea, create, queueSection, resultLabel, resultTextarea, record);
  root.appendChild(wrapper);
  void renderQueueStatus();
}

function renderSetupPanel(
  root: HTMLElement,
  panel: HTMLElement,
  setStatus: (message: string) => void
) {
  const status = latestSetupStatus;
  const settings = status?.settings ?? {
    version: 1 as const,
    language: overlayLanguage,
    onboardingCompletedAt: null,
    updatedAt: new Date().toISOString(),
    overlay: overlaySettings,
    agent: {
      runEnabled: false,
      codexCommand: null,
      claudeCommand: null,
      codexSkillEnabled: true,
      claudeHookEnabled: true
    }
  };
  let draftLanguage = settings.language;
  let draftDock = settings.overlay.dock;
  let draftDensity = settings.overlay.density;
  let draftDefaultCollapsed = settings.overlay.defaultCollapsed;
  let draftAutoOpenSetup = settings.overlay.autoOpenSetup;
  let draftAgentRunEnabled = settings.agent.runEnabled;
  let draftCodexCommand = settings.agent.codexCommand ?? "";
  let draftClaudeCommand = settings.agent.claudeCommand ?? "";
  let draftCodexSkillEnabled = settings.agent.codexSkillEnabled;
  let draftClaudeHookEnabled = settings.agent.claudeHookEnabled;

  const currentOverlayDraft = (): IntentOverlaySettings => ({
    dock: draftDock,
    density: draftDensity,
    defaultCollapsed: draftDefaultCollapsed,
    autoOpenSetup: draftAutoOpenSetup
  });

  const currentAgentDraft = () => ({
    runEnabled: draftAgentRunEnabled,
    codexCommand: draftCodexCommand.trim() || null,
    claudeCommand: draftClaudeCommand.trim() || null,
    codexSkillEnabled: draftCodexSkillEnabled,
    claudeHookEnabled: draftClaudeHookEnabled
  });

  const saveDraft = (completeOnboarding: boolean, resetOnboarding = false) =>
    saveSetup(panel, setStatus, completeOnboarding, {
      resetOnboarding,
      language: draftLanguage,
      overlay: currentOverlayDraft(),
      agent: currentAgentDraft()
    });

  const wrapper = document.createElement("div");
  wrapper.className = "intent-layer-control-grid";

  const title = document.createElement("div");
  title.className = "intent-layer-section-title";
  title.textContent = status?.settingsReady ? t("setupTitleReady") : t("setupTitle");

  const intro = document.createElement("p");
  intro.textContent = t("setupIntro");

  const statusSection = document.createElement("div");
  statusSection.className = "intent-layer-section";
  const statusTitle = document.createElement("div");
  statusTitle.className = "intent-layer-section-title";
  statusTitle.textContent = t("setupStatus");
  const checks = document.createElement("div");
  checks.className = "intent-layer-setup-grid";

  const setupChecks =
    status?.checks ??
    [
      {
        name: "workspace",
        status: "warn" as const,
        detail: t("setupWorkspaceWaiting")
      }
    ];

  for (const check of setupChecks) {
    const row = document.createElement("div");
    row.className = "intent-layer-check-row";
    const dot = document.createElement("span");
    dot.className = "intent-layer-check-dot";
    dot.dataset.intentStatus = check.status;
    const body = document.createElement("div");
    const name = document.createElement("div");
    name.className = "intent-layer-section-title";
    name.textContent =
      check.name === "workspace"
        ? "Workspace"
        : check.name === "language"
          ? t("language")
          : check.name === "graph"
            ? "Graph"
            : check.name === "agent-integrations"
              ? t("agentSettings")
              : "Agent";
    const detail = document.createElement("p");
    if (check.name === "workspace") {
      detail.textContent = status?.workspaceReady ? t("setupWorkspaceReady") : t("setupWorkspaceWaiting");
    } else if (check.name === "graph") {
      detail.textContent = status?.graphReady
        ? `${t("setupGraphReady")} (${status.graphEntryCount})`
        : t("setupGraphWaiting");
    } else if (check.name === "agent-run") {
      detail.textContent = status?.agent.runEnabled ? t("agentRunEnabled") : t("agentRunLockedDetail");
    } else if (check.name === "agent-integrations" && status) {
      detail.textContent = [
        `${status.agent.codexSkillEnabled ? t("codexSkill") : "Codex skill off"}: ${
          status.agent.codexSkillReady ? "ready" : "setup"
        }`,
        `${status.agent.claudeHookEnabled ? t("claudeHook") : "Claude hook off"}: ${
          status.agent.claudeHookReady ? "ready" : "setup"
        }`
      ].join(" / ");
    } else {
      detail.textContent = check.detail;
    }
    body.append(name, detail);
    row.append(dot, body);
    checks.appendChild(row);
  }

  statusSection.append(statusTitle, checks);

  const languageSection = document.createElement("div");
  languageSection.className = "intent-layer-section";
  const languageLabel = document.createElement("label");
  languageLabel.textContent = t("language");
  const languageGrid = document.createElement("div");
  languageGrid.className = "intent-layer-language-grid";
  const korean = createButton(t("korean"), draftLanguage === "ko" ? "primary" : "secondary");
  const english = createButton(t("english"), draftLanguage === "en" ? "primary" : "secondary");
  korean.addEventListener("click", () => {
    draftLanguage = "ko";
    void saveDraft(false);
  });
  english.addEventListener("click", () => {
    draftLanguage = "en";
    void saveDraft(false);
  });
  languageGrid.append(korean, english);
  languageSection.append(languageLabel, languageGrid);

  const panelSection = document.createElement("div");
  panelSection.className = "intent-layer-section";
  const panelTitle = document.createElement("div");
  panelTitle.className = "intent-layer-section-title";
  panelTitle.textContent = t("panelSettings");

  const dockGrid = document.createElement("div");
  dockGrid.className = "intent-layer-segmented";
  const dockLeft = createButton(t("dockLeft"), draftDock === "left" ? "primary" : "secondary");
  const dockRight = createButton(t("dockRight"), draftDock === "right" ? "primary" : "secondary");
  dockLeft.addEventListener("click", () => {
    draftDock = "left";
    void saveDraft(false);
  });
  dockRight.addEventListener("click", () => {
    draftDock = "right";
    void saveDraft(false);
  });
  dockGrid.append(dockLeft, dockRight);

  const densityGrid = document.createElement("div");
  densityGrid.className = "intent-layer-segmented";
  const comfortable = createButton(t("comfortable"), draftDensity === "comfortable" ? "primary" : "secondary");
  const compact = createButton(t("compact"), draftDensity === "compact" ? "primary" : "secondary");
  comfortable.addEventListener("click", () => {
    draftDensity = "comfortable";
    void saveDraft(false);
  });
  compact.addEventListener("click", () => {
    draftDensity = "compact";
    void saveDraft(false);
  });
  densityGrid.append(comfortable, compact);

  const collapsedToggle = createToggleButton(draftDefaultCollapsed);
  collapsedToggle.addEventListener("click", () => {
    draftDefaultCollapsed = !draftDefaultCollapsed;
    void saveDraft(false);
  });
  const autoOpenToggle = createToggleButton(draftAutoOpenSetup);
  autoOpenToggle.addEventListener("click", () => {
    draftAutoOpenSetup = !draftAutoOpenSetup;
    void saveDraft(false);
  });

  panelSection.append(
    panelTitle,
    createSettingRow(t("dock"), "", dockGrid),
    createSettingRow(t("density"), "", densityGrid),
    createSettingRow(t("defaultCollapsed"), t("defaultCollapsedDetail"), collapsedToggle),
    createSettingRow(t("autoOpenSetup"), t("autoOpenSetupDetail"), autoOpenToggle)
  );

  const agentSection = document.createElement("div");
  agentSection.className = "intent-layer-section";
  const agentTitle = document.createElement("div");
  agentTitle.className = "intent-layer-section-title";
  agentTitle.textContent = t("agentSettings");
  const agentNote = document.createElement("p");
  agentNote.textContent =
    overlayLanguage === "ko"
      ? "작업은 하나의 큐에 올라가고, Codex와 Claude가 같은 상태/lock 규칙으로 처리합니다."
      : "Tasks go into one queue. Codex and Claude use the same status and lock rules.";
  const codexInput = createTextInput(settings.agent.codexCommand ?? "", t("commandInputPlaceholder"));
  const claudeInput = createTextInput(settings.agent.claudeCommand ?? "", t("commandInputPlaceholder"));
  const codexSkillToggle = createToggleButton(draftCodexSkillEnabled);
  codexSkillToggle.addEventListener("click", () => {
    draftCodexSkillEnabled = !draftCodexSkillEnabled;
    draftCodexCommand = codexInput.value;
    draftClaudeCommand = claudeInput.value;
    void saveDraft(false);
  });
  const claudeHookToggle = createToggleButton(draftClaudeHookEnabled);
  claudeHookToggle.addEventListener("click", () => {
    draftClaudeHookEnabled = !draftClaudeHookEnabled;
    draftCodexCommand = codexInput.value;
    draftClaudeCommand = claudeInput.value;
    void saveDraft(false);
  });
  const runToggle = createToggleButton(draftAgentRunEnabled);
  runToggle.addEventListener("click", () => {
    draftAgentRunEnabled = !draftAgentRunEnabled;
    draftCodexCommand = codexInput.value;
    draftClaudeCommand = claudeInput.value;
    void saveDraft(false);
  });
  codexInput.addEventListener("input", () => {
    draftCodexCommand = codexInput.value;
  });
  claudeInput.addEventListener("input", () => {
    draftClaudeCommand = claudeInput.value;
  });
  const commandGrid = document.createElement("div");
  commandGrid.className = "intent-layer-command-grid";
  const codexLabel = document.createElement("label");
  codexLabel.textContent = t("codexCommand");
  const claudeLabel = document.createElement("label");
  claudeLabel.textContent = t("claudeCommand");
  commandGrid.append(codexLabel, codexInput, claudeLabel, claudeInput);
  if (status) {
    const agent = document.createElement("pre");
    agent.className = "intent-layer-preview-box";
    agent.textContent = [
      `Codex: ${status.agent.codexAvailable ? "ready" : "plan only"} (${status.agent.codexCommand}, ${status.agent.codexCommandSource})`,
      `Claude: ${status.agent.claudeAvailable ? "ready" : "plan only"} (${status.agent.claudeCommand}, ${status.agent.claudeCommandSource})`,
      `queue: ${status.agent.queueSignalReady ? "ready" : "setup"} (${status.agent.queueSignalPath})`,
      `codex skill: ${status.agent.codexSkillReady ? "ready" : "setup"} (${status.agent.codexSkillPath})`,
      `claude hook: ${status.agent.claudeHookReady ? "ready" : "setup"} (${status.agent.claudeSettingsPath})`,
      status.agent.runEnabled
        ? `agent run: enabled (${status.agent.runEnabledSource})`
        : "agent run: locked"
    ].join("\n");
    commandGrid.appendChild(agent);
  }
  agentSection.append(
    agentTitle,
    agentNote,
    createSettingRow(t("codexSkill"), t("codexSkillDetail"), codexSkillToggle),
    createSettingRow(t("claudeHook"), t("claudeHookDetail"), claudeHookToggle),
    createSettingRow(t("agentRunToggle"), t("agentRunToggleDetail"), runToggle),
    commandGrid
  );

  const actions = document.createElement("div");
  actions.className = "intent-layer-actions";
  const save = createButton(status?.settingsReady ? t("saveSettings") : t("setupApply"), "primary");
  save.addEventListener("click", () => {
    draftCodexCommand = codexInput.value;
    draftClaudeCommand = claudeInput.value;
    void saveDraft(!status?.settingsReady);
  });
  const reset = createButton(t("resetOnboarding"));
  reset.addEventListener("click", () => {
    draftCodexCommand = codexInput.value;
    draftClaudeCommand = claudeInput.value;
    draftAutoOpenSetup = true;
    void saveDraft(false, true);
  });
  actions.append(save, reset);

  wrapper.append(title, intro, statusSection, languageSection, panelSection, agentSection, actions);
  root.appendChild(wrapper);
}

async function fetchSetupStatus(language = overlayLanguage): Promise<IntentSetupStatus | null> {
  try {
    const response = await fetch(`/__intent/setup?language=${encodeURIComponent(language)}`);
    const status = (await response.json()) as SetupResponse;
    latestSetupStatus = status;
    syncSettings(status.settings);
    return status;
  } catch {
    return null;
  }
}

async function saveSetup(
  panel: HTMLElement,
  setStatus: (message: string) => void,
  completeOnboarding: boolean,
  patch: {
    language?: IntentLayerLanguage;
    overlay?: IntentOverlaySettings;
    agent?: {
      runEnabled: boolean;
      codexCommand: string | null;
      claudeCommand: string | null;
      codexSkillEnabled: boolean;
      claudeHookEnabled: boolean;
    };
    resetOnboarding?: boolean;
  } = {}
) {
  const response = await fetch("/__intent/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      language: patch.language ?? overlayLanguage,
      createWorkspace: true,
      completeOnboarding,
      resetOnboarding: patch.resetOnboarding,
      overlay: patch.overlay,
      agent: patch.agent
    })
  });
  const result = (await response.json()) as SetupApplyResponse;
  if (result.ok) {
    latestSetupStatus = result.status;
    syncSettings(result.status.settings);
    applyOverlaySettingsToPanel(panel);
    setStatus(
      patch.resetOnboarding
        ? `${t("resetOnboardingDone")} (${result.metrics.setupMs}ms)`
        : completeOnboarding
          ? `${t("setupComplete")} (${result.metrics.setupMs}ms)`
          : `${t("settingsSaved")} (${result.metrics.setupMs}ms)`
    );
    if (completeOnboarding) {
      overlayView = "editor";
    }
    renderBinding(panel, null, completeOnboarding ? t("ready") : t("setupOpen"));
  } else {
    setStatus(result.detail ?? result.reason);
  }
}

function renderUndoHistory(root: HTMLElement, setStatus: (message: string) => void) {
  const wrapper = createSection(t("undoHistory"));

  const body = document.createElement("div");
  body.className = "intent-layer-muted";
  body.textContent = "Loading...";
  body.style.marginTop = "6px";
  body.style.fontSize = "11px";
  body.style.color = "#475569";

  wrapper.appendChild(body);
  root.appendChild(wrapper);

  void fetch("/__intent/undo-history")
    .then((response) => response.json() as Promise<UndoHistoryResponse>)
    .then((history) => {
      body.innerHTML = "";
      if (history.pendingCount === 0) {
        body.textContent = t("undoHistoryEmpty");
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
  const wrapper = createSection(t("conflicts"));

  const body = document.createElement("div");
  body.className = "intent-layer-muted";
  body.textContent = "Loading...";
  body.style.marginTop = "6px";
  body.style.fontSize = "11px";
  body.style.color = "#475569";

  wrapper.appendChild(body);
  root.appendChild(wrapper);

  void fetch("/__intent/conflicts")
    .then((response) => response.json() as Promise<ConflictReportResponse>)
    .then((report) => {
      body.innerHTML = "";
      if (report.conflictCount === 0) {
        body.textContent = t("conflictsEmpty");
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
  applyOverlaySettingsToPanel(panel);

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
  pill.textContent = t("codexSubtool");

  brand.append(mark, title, pill);
  header.appendChild(brand);

  const statusLine = document.createElement("div");
  statusLine.className = "intent-layer-status";
  statusLine.textContent = status;
  header.appendChild(statusLine);

  const actions = document.createElement("div");
  actions.className = "intent-layer-actions intent-layer-header-actions";

  const pick = createButton(t("pick"), "primary");
  pick.title = "Pick an element on the page";
  pick.addEventListener("click", () => {
    overlayView = "editor";
    panel.dispatchEvent(new CustomEvent("intent:start-pick"));
  });
  actions.appendChild(pick);

  const setup = createButton(t("setup"));
  setup.title = t("setupOpen");
  setup.addEventListener("click", () => {
    overlayView = overlayView === "setup" ? "editor" : "setup";
    overlayCollapsed = false;
    if (overlayView === "setup") {
      void fetchSetupStatus().then(() => {
        renderBinding(panel, binding, t("setupOpen"), scope);
      });
    } else {
      renderBinding(panel, binding, status, scope);
    }
  });
  actions.appendChild(setup);

  const undo = createButton(t("undo"));
  undo.title = "Revert the latest direct patch";
  undo.addEventListener("click", async () => {
    overlayView = "editor";
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

  const toggle = createButton(overlayCollapsed ? t("expand") : t("minimize"));
  toggle.title = overlayCollapsed ? "Expand the Intent Layer panel" : "Minimize the Intent Layer panel";
  toggle.addEventListener("click", () => {
    overlayCollapsed = !overlayCollapsed;
    renderBinding(panel, binding, overlayCollapsed ? "Panel minimized" : status, scope);
  });
  actions.appendChild(toggle);
  header.appendChild(actions);
  panel.appendChild(header);

  if (overlayCollapsed) {
    scheduleOverlayPlacement(panel);
    return;
  }

  const content = document.createElement("div");
  content.className = "intent-layer-content";
  panel.appendChild(content);

  if (overlayView === "setup") {
    renderSetupPanel(content, panel, (message) => {
      statusLine.textContent = message;
    });
  } else if (!binding) {
    renderEmptyState(content, panel);
  } else {
    const effectiveScope = scope ?? {
      renderedInstanceCount: 1,
      isShared: false
    };

    const editableTokens = binding.tokens.filter((item) => item.editable);
    renderWorkflowRail(content, binding, editableTokens.length);
    renderIntentMap(content, binding, effectiveScope, editableTokens);

    const directSection = createSection(t("directEdit"), editableTokens.length > 0 ? "ready" : "warn");
    if (editableTokens.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = t("inspectableNoTokens");
      empty.style.fontSize = "12px";
      empty.style.lineHeight = "1.5";
      directSection.appendChild(empty);
    }

    const tokenList = document.createElement("div");
    tokenList.className = "intent-layer-token-list";
    for (const token of editableTokens) {
      renderTokenRow(
        tokenList,
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
    if (editableTokens.length > 0) {
      directSection.appendChild(tokenList);
    }
    content.appendChild(directSection);

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
  const existingPanel = document.querySelector<HTMLElement>("[data-intent-overlay-root]");
  if (existingPanel) {
    const hotReloading = Boolean((import.meta as ImportMeta & { hot?: unknown }).hot);
    if (!hotReloading || existingPanel.dataset.intentOverlayVersion === overlayRuntimeVersion) {
      return;
    }
    existingPanel.remove();
  }

  const panel = createPanel();
  panel.dataset.intentOverlayRoot = "true";
  panel.dataset.intentOverlayVersion = overlayRuntimeVersion;
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

  renderBinding(panel, null, t("ready"));
  void fetchSetupStatus().then((status) => {
    if (!status) return;
    overlayCollapsed = status.settings.overlay.defaultCollapsed;
    if (status.setupRequired && status.settings.overlay.autoOpenSetup) {
      overlayView = "setup";
      overlayCollapsed = false;
      renderBinding(panel, null, t("setupOpen"));
    } else {
      renderBinding(panel, selectedBinding, t("ready"), selectedScope);
    }
  });

  panel.addEventListener("intent:start-pick", async () => {
    overlayView = "editor";
    const graphStartedAt = performance.now();
    const response = await fetch("/__intent/graph");
    graph = (await response.json()) as IntentGraph;
    graphFetchMs = Number((performance.now() - graphStartedAt).toFixed(3));
    pickStartedAt = performance.now();
    pickMode = true;
    document.body.dataset.intentLayerPicking = "true";
    setStatus(t("pickMode"));
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
        setStatus(t("noIntentElement"));
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
        selectedBinding ? t("elementSelected") : t("noBinding"),
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
