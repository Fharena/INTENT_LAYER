export type IntentTokenCategory =
  | "spacing"
  | "radius"
  | "layout"
  | "typography"
  | "color"
  | "effect";

export interface IntentToken {
  token: string;
  start: number;
  end: number;
  sourceStart: number;
  sourceEnd: number;
  category: IntentTokenCategory | null;
  editable: boolean;
}

export interface IntentLiteralTextBinding {
  kind: "literal";
  start: number;
  end: number;
  value: string;
}

export interface IntentBinding {
  id: string;
  file: string;
  relativeFile: string;
  tagName: string;
  componentName: string | null;
  sourceHash: string;
  transformMs: number;
  className: {
    kind: "static" | "call-literals" | "read-only";
    start: number;
    end: number;
    value: string;
    callee?: "cn" | "clsx";
    dynamicSegments: number;
    unsupportedReason?: string;
  };
  textContent?: IntentLiteralTextBinding;
  tokens: IntentToken[];
}

export interface IntentGraph {
  version: 1;
  generatedAt: string;
  entries: Record<string, IntentBinding>;
}

export interface IntentRuntimeLayoutScope {
  kind: "grid" | "flex";
  parentId: string;
  childIds: string[];
  unboundChildCount: number;
  renderedParentCount: number;
}

export interface IntentRuntimeSelectionRequest {
  id: string | null;
  route?: string;
  text?: string;
  role?: string | null;
  classTokens?: string[];
  visible?: boolean;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  layout?: IntentRuntimeLayoutScope | null;
}

export interface IntentRuntimeSelection {
  version: 1;
  selectedAt: string;
  sessionId: string | null;
  freshUntil: string;
  selection: null | {
    id: string;
    componentName: string | null;
    tagName: string;
    sourceFile: string;
    route: string;
    text: string;
    role: string | null;
    classTokens: string[];
    visible: boolean;
    rect: IntentRuntimeSelectionRequest["rect"];
    layout: IntentRuntimeLayoutScope | null;
  };
}

export interface IntentRuntimeSession {
  version: 1;
  sessionId: string;
  root: string;
  url: string;
  token: string;
  pid: number;
  startedAt: string;
}

export interface IntentRuntimeTokenResult {
  ok: boolean;
  status: "verified" | "drifted" | "unavailable";
  id: string;
  expectedToken: string;
  renderedInstanceCount: number;
  matchingInstanceCount: number;
  visibleInstanceCount: number;
  route: string | null;
  detail: string;
}

export interface ClickToPanelMetric {
  kind: "click-to-panel";
  id: string | null;
  status: "selected" | "missing-binding" | "missing-element";
  createdAt: string;
  graphFetchMs: number | null;
  pickToPanelMs: number;
  clickToPanelMs: number;
  bindingLookupMs: number;
  renderMs: number;
}

export interface PatchInteractionMetric {
  kind: "patch-preview" | "patch-apply" | "patch-revert";
  id: string | null;
  status: "ok" | "rejected";
  createdAt: string;
  oldToken?: string;
  nextToken?: string;
  roundTripMs: number;
  serverMs: number | null;
  renderMs: number;
  reason?: string;
}

export type ClientMetric = ClickToPanelMetric | PatchInteractionMetric;

export interface ClientMetricsReport {
  version: 1;
  generatedAt: string;
  metrics: ClientMetric[];
}

export type IntentLayerLanguage = "ko" | "en";
export type IntentOverlayDock = "left" | "right";
export type IntentOverlayDensity = "comfortable" | "compact";
export type IntentAgentCommandSource = "settings" | "env" | "default";
export type IntentAgentRunSource = "settings" | "env" | "locked";

export interface IntentOverlaySettings {
  dock: IntentOverlayDock;
  density: IntentOverlayDensity;
  defaultCollapsed: boolean;
  autoOpenSetup: boolean;
}

export interface IntentAgentSettings {
  legacyQueueEnabled: boolean;
  runEnabled: boolean;
  codexCommand: string | null;
  claudeCommand: string | null;
  codexSkillEnabled: boolean;
  claudeHookEnabled: boolean;
}

export interface IntentMcpSettings {
  codexEnabled: boolean;
  claudeEnabled: boolean;
}

export interface IntentLayerSettings {
  version: 1;
  language: IntentLayerLanguage;
  onboardingCompletedAt: string | null;
  updatedAt: string;
  overlay: IntentOverlaySettings;
  mcp: IntentMcpSettings;
  agent: IntentAgentSettings;
}

export interface IntentSetupCheck {
  name: string;
  status: "ready" | "warn" | "missing";
  detail: string;
}

export interface IntentSetupStatus {
  version: 1;
  generatedAt: string;
  root: string;
  language: IntentLayerLanguage;
  workspaceReady: boolean;
  settingsReady: boolean;
  graphReady: boolean;
  graphEntryCount: number;
  setupRequired: boolean;
  settings: IntentLayerSettings;
  checks: IntentSetupCheck[];
  mcp: {
    codexEnabled: boolean;
    codexReady: boolean;
    codexConfigPath: string;
    claudeEnabled: boolean;
    claudeReady: boolean;
    claudeConfigPath: string;
    serverCommand: string;
    serverArgs: string[];
    serverReady: boolean;
  };
  agent: {
    legacyQueueEnabled: boolean;
    runEnabled: boolean;
    runEnabledSource: IntentAgentRunSource;
    codexCommand: string;
    codexCommandSource: IntentAgentCommandSource;
    codexAvailable: boolean;
    claudeCommand: string;
    claudeCommandSource: IntentAgentCommandSource;
    claudeAvailable: boolean;
    queueSignalReady: boolean;
    queueSignalPath: string;
    codexSkillEnabled: boolean;
    codexSkillReady: boolean;
    codexSkillPath: string;
    claudeHookEnabled: boolean;
    claudeHookReady: boolean;
    claudeSettingsPath: string;
  };
}

export interface IntentSetupRequest {
  language?: IntentLayerLanguage;
  createWorkspace?: boolean;
  completeOnboarding?: boolean;
  resetOnboarding?: boolean;
  overlay?: Partial<IntentOverlaySettings>;
  mcp?: Partial<IntentMcpSettings>;
  agent?: Partial<IntentAgentSettings>;
}

export interface IntentSetupResult {
  ok: true;
  status: IntentSetupStatus;
  createdPaths: string[];
  existingPaths: string[];
  settingsFile: string;
  metrics: {
    setupMs: number;
  };
}

export interface PatchRequest {
  id: string;
  oldToken: string;
  nextToken: string;
  sourceStart?: number;
  sourceEnd?: number;
}

export interface LiteralTextEditRequest {
  id: string;
  oldText: string;
  nextText: string;
}

export interface PatchTextEdit {
  id: string;
  label: string;
  range: {
    start: number;
    end: number;
  };
  appliedRange: {
    start: number;
    end: number;
  };
  oldText: string;
  newText: string;
}

export type PatchKind =
  | "tailwind-token-replace"
  | "tailwind-token-revert"
  | "literal-text"
  | "literal-text-revert"
  | "grid-layout"
  | "grid-layout-revert"
  | "flex-layout"
  | "flex-layout-revert";

export interface PatchPreview {
  ok: true;
  kind?: PatchKind;
  id: string;
  file: string;
  relativeFile: string;
  oldToken: string;
  nextToken: string;
  range: {
    start: number;
    end: number;
  };
  before: string;
  after: string;
  sourceHashBefore: string;
  sourceHashAfter: string;
  edits?: PatchTextEdit[];
  metrics: {
    previewMs: number;
  };
}

export type GridLayoutBreakpoint = string;

export interface GridLayoutInspectRequest {
  parentId: string;
  childIds: string[];
  unboundChildCount?: number;
  breakpoint: GridLayoutBreakpoint;
}

export interface GridLayoutResolvedValue {
  explicit: number | null;
  effective: number | null;
}

export interface GridLayoutInspection {
  ok: true;
  parentId: string;
  relativeFile: string;
  breakpoint: GridLayoutBreakpoint;
  supportedBreakpoints: GridLayoutBreakpoint[];
  columns: GridLayoutResolvedValue;
  rows: GridLayoutResolvedValue;
  columnTemplate: {
    explicit: number[] | null;
    effective: number[] | null;
  };
  items: Array<{
    id: string;
    label: string;
    columnStart: GridLayoutResolvedValue;
    columnSpan: GridLayoutResolvedValue;
    rowStart: GridLayoutResolvedValue;
    rowSpan: GridLayoutResolvedValue;
  }>;
}

export interface GridLayoutItemEdit {
  id: string;
  columnStart?: number | null;
  columnSpan?: number | null;
  rowStart?: number | null;
  rowSpan?: number | null;
}

export interface GridLayoutEditRequest extends GridLayoutInspectRequest {
  columns?: number | null;
  rows?: number | null;
  columnTemplate?: number[] | null;
  items: GridLayoutItemEdit[];
}

export interface GridLayoutPreviewResult {
  ok: true;
  previewId: string;
  expiresAt: string;
  parentId: string;
  breakpoint: GridLayoutBreakpoint;
  affectedBindingCount: number;
  patch: PatchPreview;
}

export interface GridLayoutApplyRequest {
  previewId: string;
}

export type FlexLayoutBreakpoint = string;
export type FlexLayoutDirection = "row" | "row-reverse" | "col" | "col-reverse";
export type FlexLayoutWrap = "nowrap" | "wrap" | "wrap-reverse";
export type FlexLayoutJustify = "normal" | "start" | "end" | "center" | "between" | "around" | "evenly" | "stretch";
export type FlexLayoutAlign = "start" | "end" | "center" | "baseline" | "stretch";
export type FlexLayoutAlignSelf = "auto" | "start" | "end" | "center" | "stretch" | "baseline";

export interface FlexLayoutResolvedValue<T extends string> {
  explicit: T | null;
  effective: T;
}

export interface FlexLayoutInspectRequest {
  parentId: string;
  childIds: string[];
  unboundChildCount?: number;
  breakpoint: FlexLayoutBreakpoint;
}

export interface FlexLayoutInspection {
  ok: true;
  parentId: string;
  relativeFile: string;
  breakpoint: FlexLayoutBreakpoint;
  supportedBreakpoints: FlexLayoutBreakpoint[];
  direction: FlexLayoutResolvedValue<FlexLayoutDirection>;
  wrap: FlexLayoutResolvedValue<FlexLayoutWrap>;
  justify: FlexLayoutResolvedValue<FlexLayoutJustify>;
  align: FlexLayoutResolvedValue<FlexLayoutAlign>;
  gap: {
    explicit: string | null;
    effective: string | null;
    candidates: string[];
  };
  items: Array<{
    id: string;
    label: string;
    alignSelf: FlexLayoutResolvedValue<FlexLayoutAlignSelf>;
  }>;
}

export interface FlexLayoutItemEdit {
  id: string;
  alignSelf?: FlexLayoutAlignSelf | null;
}

export interface FlexLayoutEditRequest extends FlexLayoutInspectRequest {
  direction?: FlexLayoutDirection | null;
  wrap?: FlexLayoutWrap | null;
  justify?: FlexLayoutJustify | null;
  align?: FlexLayoutAlign | null;
  gap?: string | null;
  items: FlexLayoutItemEdit[];
}

export interface FlexLayoutPreviewResult {
  ok: true;
  previewId: string;
  expiresAt: string;
  parentId: string;
  breakpoint: FlexLayoutBreakpoint;
  affectedBindingCount: number;
  patch: PatchPreview;
}

export interface FlexLayoutApplyRequest {
  previewId: string;
}

export interface PatchFailure {
  ok: false;
  id?: string;
  reason: string;
  detail?: string;
  conflictFile?: string;
  conflictArtifact?: PatchConflictArtifact;
  metrics?: {
    previewMs?: number;
    applyMs?: number;
    revertMs?: number;
    resolveMs?: number;
    discardMs?: number;
    taskMs?: number;
    launchMs?: number;
    resultMs?: number;
    claimMs?: number;
    statusMs?: number;
  };
}

export interface PatchConflictArtifact {
  version: 1;
  kind: "revert-conflict";
  createdAt: string;
  resolvedAt?: string;
  reason: string;
  id: string;
  file: string;
  relativeFile: string;
  range: {
    start: number;
    end: number;
  };
  expectedToken: string;
  actualToken: string;
  expectedSourceHash?: string;
  actualSourceHash?: string;
  restoreToken: string;
  beforeLine: string;
  operationFile: string;
  diffFile: string;
  guidance: string[];
  resolution?: {
    action: "discard-pending-undo";
    note?: string;
  };
}

export interface PatchConflictSummary extends PatchConflictArtifact {
  conflictFile: string;
  relativeConflictFile: string;
  resolved: boolean;
}

export interface PatchConflictReport {
  version: 1;
  generatedAt: string;
  conflictCount: number;
  conflicts: PatchConflictSummary[];
}

export interface PatchApplyResult extends PatchPreview {
  applied: true;
  operationFile: string;
  diffFile: string;
  metrics: {
    previewMs: number;
    applyMs: number;
  };
}

export type PatchOperationLogEntry =
  | {
      action: "apply";
      createdAt: string;
      patch: PatchApplyResult;
    }
  | {
      action: "revert";
      createdAt: string;
      patch: PatchRevertResult;
    }
  | {
      action: "discard";
      createdAt: string;
      conflictFile?: string;
      note?: string;
      patch: PatchUndoDiscardReference;
    };

export interface PatchOperationLog {
  version: 1;
  updatedAt: string;
  entries: PatchOperationLogEntry[];
}

export interface UndoHistoryItem {
  index: number;
  next: boolean;
  id: string;
  file: string;
  relativeFile: string;
  oldToken: string;
  nextToken: string;
  range: {
    start: number;
    end: number;
  };
  operationFile: string;
  diffFile: string;
  kind?: PatchPreview["kind"];
  changeCount?: number;
}

export interface UndoHistoryReport {
  version: 1;
  generatedAt: string;
  pendingCount: number;
  entries: UndoHistoryItem[];
}

export interface PatchRevertResult {
  ok: true;
  reverted: true;
  kind?: PatchPreview["kind"];
  id: string;
  file: string;
  relativeFile: string;
  oldToken: string;
  restoredToken: string;
  range: {
    start: number;
    end: number;
  };
  before: string;
  after: string;
  sourceHashBefore: string;
  sourceHashAfter: string;
  edits?: PatchTextEdit[];
  operationFile: string;
  diffFile: string;
  metrics: {
    revertMs: number;
  };
}

export interface PatchUndoDiscardReference {
  id: string;
  file: string;
  relativeFile: string;
  oldToken: string;
  nextToken: string;
  range: {
    start: number;
    end: number;
  };
}

export interface PatchConflictResolveRequest {
  conflictFile: string;
  action: "discard-pending-undo";
  note?: string;
}

export interface PatchConflictResolveResult {
  ok: true;
  resolved: true;
  conflictFile: string;
  relativeConflictFile: string;
  action: "discard-pending-undo";
  discardedPatch: PatchUndoDiscardReference;
  pendingCount: number;
  conflictArtifact: PatchConflictArtifact;
  operationLogFile: string;
  metrics: {
    resolveMs: number;
  };
}

export interface PatchUndoDiscardRequest {
  operationFile: string;
  note?: string;
}

export interface PatchUndoRevertRequest {
  operationFile: string;
}

export interface PatchUndoDiscardResult {
  ok: true;
  discarded: true;
  operationFile: string;
  discardedPatch: PatchUndoDiscardReference;
  pendingCount: number;
  operationLogFile: string;
  metrics: {
    discardMs: number;
  };
}

export interface PatchUndoRevertResult extends PatchRevertResult {
  operationLogFile: string;
  pendingCount: number;
}

export interface AgentTaskRequest {
  id: string;
  desiredChange: string;
}

export type AgentTaskStatus = "queued" | "claimed" | "running" | "done" | "failed" | "cancelled";

export interface AgentTaskMetadata {
  intentTaskVersion: 1;
  taskId: string;
  status: AgentTaskStatus;
  provider: AgentProvider | "manual" | null;
  claimedBy: string | null;
  sessionId: string | null;
  exclusive: boolean;
  createdAt: string;
  updatedAt: string;
  sourceIntentId: string | null;
  sourceFile: string | null;
  resultFile: string | null;
  diffFile: string | null;
  failureReason: string | null;
}

export interface AgentQueueTask {
  taskId: string;
  status: AgentTaskStatus;
  provider: AgentProvider | "manual" | null;
  claimedBy: string | null;
  sessionId: string | null;
  exclusive: boolean;
  taskFile: string;
  sourceIntentId: string | null;
  sourceFile: string | null;
  resultFile: string | null;
  diffFile: string | null;
  failureReason: string | null;
  locked: boolean;
  lockFile: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentQueueSignal {
  version: 1;
  kind: "intent-agent-queue";
  updatedAt: string;
  queueFile: string;
  agentDir: string;
  totalTaskCount: number;
  pendingTaskCount: number;
  runningTaskCount: number;
  doneTaskCount: number;
  failedTaskCount: number;
  latestTask: string | null;
  tasks: AgentQueueTask[];
}

export interface AgentTaskClaimRequest {
  provider: AgentProvider;
  taskFile?: string;
  claimedBy?: string;
  sessionId?: string;
}

export interface AgentTaskClaimResult {
  ok: true;
  taskId: string;
  provider: AgentProvider;
  taskFile: string;
  status: AgentTaskStatus;
  lockFile: string;
  queue: AgentQueueSignal;
  metrics: {
    claimMs: number;
  };
}

export interface AgentTaskStatusUpdateRequest {
  provider?: AgentProvider | "manual";
  taskFile: string;
  resultFile?: string | null;
  diffFile?: string | null;
  failureReason?: string | null;
}

export interface AgentTaskStatusUpdateResult {
  ok: true;
  taskId: string;
  taskFile: string;
  status: AgentTaskStatus;
  queue: AgentQueueSignal;
  metrics: {
    statusMs: number;
  };
}

export interface AgentTaskResult {
  ok: true;
  id: string;
  taskId: string;
  file: string;
  relativeFile: string;
  taskFile: string;
  status: AgentTaskStatus;
  markdown: string;
  metrics: {
    taskMs: number;
  };
}

export type AgentProvider = "codex" | "claude";

export interface AgentLaunchRequest {
  id?: string;
  provider: AgentProvider;
  desiredChange?: string;
  taskFile?: string;
  execute?: boolean;
}

export interface AgentLaunchResult {
  ok: true;
  id: string | null;
  provider: AgentProvider;
  taskFile: string;
  command: string[];
  commandText: string;
  cwd: string;
  enabled: boolean;
  executed: boolean;
  pid: number | null;
  stdoutFile: string | null;
  stderrFile: string | null;
  guidance: string[];
  metrics: {
    launchMs: number;
  };
}

export interface AgentResultRequest {
  id: string;
  taskFile?: string;
  summary: string;
  changedFiles?: string[];
  checks?: string[];
  notes?: string;
}

export interface AgentSemanticClassNameDiff {
  classNameChangeCount: number;
  tokenAddedCount: number;
  tokenRemovedCount: number;
  classNameChanges: Array<{
    index: number;
    beforeKind: string | null;
    afterKind: string | null;
    beforeValue: string | null;
    afterValue: string | null;
    addedTokens: Array<{ token: string; category: IntentTokenCategory | null }>;
    removedTokens: Array<{ token: string; category: IntentTokenCategory | null }>;
  }>;
}

export interface AgentResultArtifact {
  ok: true;
  id: string;
  file: string;
  relativeFile: string;
  resultFile: string;
  diffFile: string;
  markdown: string;
  source: {
    sourceHashBefore: string;
    sourceHashAfter: string | null;
    sourceHashChanged: boolean | null;
    snapshotAvailable: boolean;
    diffLineCount: number;
    semanticChangeCount: number;
    componentSnapshotAvailable: boolean;
    componentDiffLineCount: number;
    componentSemanticChangeCount: number;
    relatedSnapshotAvailable: boolean;
    relatedDiffLineCount: number;
    relatedSemanticChangeCount: number;
    relatedDependencySnapshotCount: number;
    relatedDependencyDiffLineCount: number;
    relatedDependencySemanticChangeCount: number;
  };
  sourceDiff: string | null;
  semanticDiff: AgentSemanticClassNameDiff | null;
  componentSourceDiff: string | null;
  componentSemanticDiff: AgentSemanticClassNameDiff | null;
  relatedSourceDiff: string | null;
  relatedSemanticDiff: AgentSemanticClassNameDiff | null;
  relatedDependencySourceDiff: string | null;
  relatedDependencySemanticDiff: AgentSemanticClassNameDiff | null;
  metrics: {
    resultMs: number;
  };
}
