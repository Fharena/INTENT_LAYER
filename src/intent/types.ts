export type IntentTokenCategory =
  | "spacing"
  | "radius"
  | "layout"
  | "typography"
  | "color";

export interface IntentToken {
  token: string;
  start: number;
  end: number;
  sourceStart: number;
  sourceEnd: number;
  category: IntentTokenCategory | null;
  editable: boolean;
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
  tokens: IntentToken[];
}

export interface IntentGraph {
  version: 1;
  generatedAt: string;
  entries: Record<string, IntentBinding>;
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

export interface IntentLayerSettings {
  version: 1;
  language: IntentLayerLanguage;
  onboardingCompletedAt: string | null;
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
  checks: IntentSetupCheck[];
  agent: {
    runEnabled: boolean;
    codexCommand: string;
    codexAvailable: boolean;
    claudeCommand: string;
    claudeAvailable: boolean;
  };
}

export interface IntentSetupRequest {
  language?: IntentLayerLanguage;
  createWorkspace?: boolean;
  completeOnboarding?: boolean;
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

export interface PatchPreview {
  ok: true;
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
  metrics: {
    previewMs: number;
  };
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

export interface AgentTaskResult {
  ok: true;
  id: string;
  file: string;
  relativeFile: string;
  taskFile: string;
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
