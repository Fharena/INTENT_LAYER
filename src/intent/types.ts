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
  };
  metrics: {
    resultMs: number;
  };
}
