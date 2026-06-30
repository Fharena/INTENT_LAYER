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
  metrics?: {
    previewMs?: number;
    applyMs?: number;
    revertMs?: number;
    taskMs?: number;
    resultMs?: number;
  };
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
    };

export interface PatchOperationLog {
  version: 1;
  updatedAt: string;
  entries: PatchOperationLogEntry[];
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

export interface AgentResultRequest {
  id: string;
  taskFile?: string;
  summary: string;
  changedFiles?: string[];
  checks?: string[];
  notes?: string;
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
  };
  sourceDiff: string | null;
  semanticDiff: {
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
  } | null;
  metrics: {
    resultMs: number;
  };
}
