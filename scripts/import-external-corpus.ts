import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeClassNames } from "./analyze-classnames";

const rootDir = process.cwd();
const mvpIndependentFileTarget = 50;

type SampleSourceKind = "independent-external" | "local-smoke-fixture" | "generated-fixture";

interface CliArgs {
  inputs: string[];
  outDir: string;
  reportFile: string;
  label: string;
  sampleSource: SampleSourceKind;
  limit: number;
  minFiles: number;
  minSupportedDirect: number;
  analyzeOnly: boolean;
  includeTests: boolean;
  failOnGate: boolean;
}

interface CandidateFile {
  sourceRoot: string;
  sourceRelativeFile: string;
  absoluteFile: string;
  bytes: number;
  sha256: string;
  classNameOccurrences: number;
}

interface ManifestFile extends CandidateFile {
  copiedRelativeFile: string;
}

interface ExternalCorpusManifest {
  generatedAt: string;
  label: string;
  sampleSource: SampleSourceKind;
  sourceRoots: string[];
  filesDir: string;
  limit: number;
  includeTests: boolean;
  selectedFiles: ManifestFile[];
  skipped: Record<string, number>;
}

interface ExternalCorpusReport {
  generatedAt: string;
  available: boolean;
  mode: "import" | "analyze-only";
  sample: {
    label: string;
    sourceKind: SampleSourceKind;
    independent: boolean;
    localSmokeFixture: boolean;
    generatedFixture: boolean;
  };
  filesDir: string;
  manifestFile: string;
  sourceRoots: string[];
  selectedFileCount: number;
  skipped: Record<string, number>;
  gates: {
    minFilesPass: boolean;
    staticAndSimpleCoveragePass: boolean;
    supportedDirectCoveragePass: boolean;
    allObservedCoveragePass: boolean;
  };
  targets: {
    minFiles: number;
    editableCoverage: number;
    mvpIndependentFiles: number;
  };
  summary: {
    classNameOccurrences: number;
    directEditClassNameCount: number;
    readOnlyClassNameCount: number;
    readOnlyClassNameRatio: number;
    averageClassNamesPerFile: number;
    editableTokenCoverage: number;
    topUnsupportedReasons: Array<{ reason: string; count: number }>;
  };
  gateFailures: Array<{
    gate: string;
    actual: number | boolean;
    target: number | boolean;
    detail: string;
  }>;
  mvpEvidence: {
    usableAsMvpEvidence: boolean;
    decision:
      | "mvp-evidence-ready"
      | "measurement-smoke-only"
      | "collect-more-samples"
      | "coverage-gate-failed"
      | "no-corpus";
    reason: string;
    nextStep: string;
  };
  analysis: ReturnType<typeof analyzeClassNames>;
  caveat: string;
}

function defaultArgs(): CliArgs {
  return {
    inputs: [],
    outDir: path.join(rootDir, ".intent", "external-corpus"),
    reportFile: path.join(rootDir, "reports", "performance", "external-corpus-audit.json"),
    label: "external-corpus",
    sampleSource: "independent-external",
    limit: 100,
    minFiles: 50,
    minSupportedDirect: 0.5,
    analyzeOnly: false,
    includeTests: false,
    failOnGate: false
  };
}

function parseArgs(argv: string[]): CliArgs {
  const args = defaultArgs();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      args.outDir = path.resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--report") {
      args.reportFile = path.resolve(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--label") {
      args.label = argv[index + 1] ?? args.label;
      index += 1;
    } else if (arg === "--sample-source") {
      args.sampleSource = parseSampleSource(argv[index + 1] ?? "");
      index += 1;
    } else if (arg === "--limit") {
      args.limit = Number(argv[index + 1] ?? args.limit);
      index += 1;
    } else if (arg === "--min-files") {
      args.minFiles = Number(argv[index + 1] ?? args.minFiles);
      index += 1;
    } else if (arg === "--min-supported-direct") {
      args.minSupportedDirect = Number(argv[index + 1] ?? args.minSupportedDirect);
      index += 1;
    } else if (arg === "--analyze-only") {
      args.analyzeOnly = true;
    } else if (arg === "--include-tests") {
      args.includeTests = true;
    } else if (arg === "--fail-on-gate") {
      args.failOnGate = true;
    } else {
      args.inputs.push(path.resolve(arg));
    }
  }

  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    throw new Error("--limit must be a positive number");
  }
  if (!Number.isFinite(args.minFiles) || args.minFiles <= 0) {
    throw new Error("--min-files must be a positive number");
  }
  if (
    !Number.isFinite(args.minSupportedDirect) ||
    args.minSupportedDirect < 0 ||
    args.minSupportedDirect > 1
  ) {
    throw new Error("--min-supported-direct must be a number between 0 and 1");
  }
  if (!args.analyzeOnly && args.inputs.length === 0) {
    throw new Error("Provide at least one external React/Tailwind source directory or file.");
  }
  if (args.label.trim().length === 0) {
    throw new Error("--label must not be empty");
  }

  return args;
}

function usage(): string {
  return [
    "Usage:",
    "  tsx scripts/import-external-corpus.ts <external-dir-or-file...> [--limit 100]",
    "  tsx scripts/import-external-corpus.ts --analyze-only",
    "",
    "Options:",
    "  --out <dir>                   Output folder under .intent/ (default: .intent/external-corpus)",
    "  --report <file>               JSON report file (default: reports/performance/external-corpus-audit.json)",
    "  --label <name>                Human-readable corpus label (default: external-corpus)",
    "  --sample-source <kind>        independent-external | local-smoke-fixture | generated-fixture",
    "  --limit <n>                   Max files to copy/analyze (default: 100)",
    "  --min-files <n>               Gate target for selected files (default: 50)",
    "  --min-supported-direct <0-1>  Gate target for supported direct coverage (default: 0.5)",
    "  --include-tests               Include *.test, *.spec, and *.stories files",
    "  --fail-on-gate                Exit non-zero if gates fail"
  ].join("\n");
}

function parseSampleSource(value: string): SampleSourceKind {
  if (
    value === "independent-external" ||
    value === "local-smoke-fixture" ||
    value === "generated-fixture"
  ) {
    return value;
  }
  throw new Error("--sample-source must be independent-external, local-smoke-fixture, or generated-fixture");
}

function toRepoPath(file: string): string {
  return path.relative(rootDir, path.resolve(file)).replace(/\\/g, "/");
}

function assertIntentOutputDir(dir: string): void {
  const normalizedDir = path.resolve(dir);
  const intentRoot = path.join(rootDir, ".intent");
  if (normalizedDir !== intentRoot && !normalizedDir.startsWith(`${intentRoot}${path.sep}`)) {
    throw new Error(`Refusing to write external corpus copies outside .intent/: ${normalizedDir}`);
  }
}

function isSourceFile(file: string): boolean {
  return /\.[jt]sx$/.test(file);
}

function isSkippedByName(file: string, includeTests: boolean): boolean {
  if (includeTests) return false;
  return /\.(test|spec|stories)\.[jt]sx$/i.test(file);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function collectCandidates(input: string, includeTests: boolean, skipped: Record<string, number>): CandidateFile[] {
  if (!fs.existsSync(input)) {
    increment(skipped, "missing-input");
    return [];
  }

  const root = fs.statSync(input).isDirectory() ? input : path.dirname(input);
  const ignoredDirs = new Set([
    ".git",
    ".next",
    ".turbo",
    ".vite",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out"
  ]);
  const candidates: CandidateFile[] = [];

  function visit(file: string): void {
    const stat = fs.statSync(file);
    if (stat.isDirectory()) {
      const base = path.basename(file);
      if (ignoredDirs.has(base)) {
        increment(skipped, `ignored-dir:${base}`);
        return;
      }

      for (const entry of fs.readdirSync(file)) {
        visit(path.join(file, entry));
      }
      return;
    }

    if (!stat.isFile()) return;
    if (!isSourceFile(file)) {
      increment(skipped, "non-jsx-tsx");
      return;
    }
    if (isSkippedByName(file, includeTests)) {
      increment(skipped, "test-story-file");
      return;
    }

    const source = fs.readFileSync(file, "utf8");
    const classNameOccurrences = source.match(/\bclassName\s*=/g)?.length ?? 0;
    if (classNameOccurrences === 0) {
      increment(skipped, "no-className");
      return;
    }

    candidates.push({
      sourceRoot: root,
      sourceRelativeFile: path.relative(root, file).replace(/\\/g, "/"),
      absoluteFile: file,
      bytes: Buffer.byteLength(source),
      sha256: sha256(source),
      classNameOccurrences
    });
  }

  visit(input);
  return candidates;
}

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "sample";
}

function clearFilesDir(filesDir: string): void {
  assertIntentOutputDir(filesDir);
  fs.rmSync(filesDir, { recursive: true, force: true });
  fs.mkdirSync(filesDir, { recursive: true });
}

function copySelectedFiles(args: CliArgs, filesDir: string): ExternalCorpusManifest {
  const skipped: Record<string, number> = {};
  const candidates = args.inputs
    .flatMap((input) => collectCandidates(input, args.includeTests, skipped))
    .sort((left, right) => {
      const rootCompare = left.sourceRoot.localeCompare(right.sourceRoot);
      if (rootCompare !== 0) return rootCompare;
      return left.sourceRelativeFile.localeCompare(right.sourceRelativeFile);
    });
  const selected = candidates.slice(0, args.limit);
  const selectedFiles: ManifestFile[] = [];

  clearFilesDir(filesDir);

  for (const [index, candidate] of selected.entries()) {
    const extension = path.extname(candidate.absoluteFile).toLowerCase();
    const baseName = slug(candidate.sourceRelativeFile.replace(extension, ""));
    const copiedFile = path.join(filesDir, `external-${String(index + 1).padStart(3, "0")}-${baseName}${extension}`);
    fs.copyFileSync(candidate.absoluteFile, copiedFile);
    selectedFiles.push({
      ...candidate,
      copiedRelativeFile: toRepoPath(copiedFile)
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    label: args.label,
    sampleSource: args.sampleSource,
    sourceRoots: args.inputs.map((input) => path.resolve(input)),
    filesDir: toRepoPath(filesDir),
    limit: args.limit,
    includeTests: args.includeTests,
    selectedFiles,
    skipped
  };
}

function readExistingManifest(manifestFile: string, filesDir: string): ExternalCorpusManifest {
  if (!fs.existsSync(manifestFile)) {
    return {
      generatedAt: new Date().toISOString(),
      label: "external-corpus",
      sampleSource: "independent-external",
      sourceRoots: [],
      filesDir: toRepoPath(filesDir),
      limit: 0,
      includeTests: false,
      selectedFiles: [],
      skipped: {}
    };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as Partial<ExternalCorpusManifest>;
  return {
    generatedAt: manifest.generatedAt ?? new Date().toISOString(),
    label: manifest.label ?? "external-corpus",
    sampleSource: manifest.sampleSource ?? "independent-external",
    sourceRoots: manifest.sourceRoots ?? [],
    filesDir: manifest.filesDir ?? toRepoPath(filesDir),
    limit: manifest.limit ?? 0,
    includeTests: manifest.includeTests ?? false,
    selectedFiles: manifest.selectedFiles ?? [],
    skipped: manifest.skipped ?? {}
  };
}

function gatesFor(
  analysis: ReturnType<typeof analyzeClassNames>,
  minFiles: number,
  minSupportedDirect: number
): ExternalCorpusReport["gates"] {
  return {
    minFilesPass: analysis.filesScanned >= minFiles,
    staticAndSimpleCoveragePass: analysis.editableCoverage.staticAndSimpleCnClsx >= minSupportedDirect,
    supportedDirectCoveragePass: analysis.editableCoverage.supportedDirect >= minSupportedDirect,
    allObservedCoveragePass: analysis.editableCoverage.allObservedTokens >= minSupportedDirect
  };
}

function average(value: number, total: number): number {
  if (total === 0) return 0;
  return Number((value / total).toFixed(3));
}

function ratio(value: number, total: number): number {
  if (total === 0) return 0;
  return Number((value / total).toFixed(4));
}

function allGatesPass(gates: ExternalCorpusReport["gates"]): boolean {
  return Object.values(gates).every(Boolean);
}

function topUnsupportedReasons(analysis: ReturnType<typeof analyzeClassNames>): Array<{ reason: string; count: number }> {
  return Object.entries(analysis.unsupportedReasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 5);
}

function gateFailuresFor(
  analysis: ReturnType<typeof analyzeClassNames>,
  gates: ExternalCorpusReport["gates"],
  minFiles: number,
  minSupportedDirect: number
): ExternalCorpusReport["gateFailures"] {
  const failures: ExternalCorpusReport["gateFailures"] = [];
  if (!gates.minFilesPass) {
    failures.push({
      gate: "minFilesPass",
      actual: analysis.filesScanned,
      target: minFiles,
      detail: "Collect more TSX/JSX files with className usage before treating this as corpus evidence."
    });
  }
  if (!gates.staticAndSimpleCoveragePass) {
    failures.push({
      gate: "staticAndSimpleCoveragePass",
      actual: analysis.editableCoverage.staticAndSimpleCnClsx,
      target: minSupportedDirect,
      detail: "Static and simple cn()/clsx() editable token coverage is below the configured threshold."
    });
  }
  if (!gates.supportedDirectCoveragePass) {
    failures.push({
      gate: "supportedDirectCoveragePass",
      actual: analysis.editableCoverage.supportedDirect,
      target: minSupportedDirect,
      detail: "Directly supported className expressions do not expose enough editable Tailwind tokens."
    });
  }
  if (!gates.allObservedCoveragePass) {
    failures.push({
      gate: "allObservedCoveragePass",
      actual: analysis.editableCoverage.allObservedTokens,
      target: minSupportedDirect,
      detail: "Overall observed editable token coverage is below the configured threshold."
    });
  }
  return failures;
}

function mvpEvidenceFor(
  analysis: ReturnType<typeof analyzeClassNames>,
  gates: ExternalCorpusReport["gates"],
  sampleSource: SampleSourceKind
): ExternalCorpusReport["mvpEvidence"] {
  if (analysis.filesScanned === 0) {
    return {
      usableAsMvpEvidence: false,
      decision: "no-corpus",
      reason: "No analyzable TSX/JSX files with className usage were found.",
      nextStep: "Run import-external-corpus against a React/Tailwind project or sample folder."
    };
  }

  if (!allGatesPass(gates)) {
    return {
      usableAsMvpEvidence: false,
      decision: "coverage-gate-failed",
      reason: "One or more editable coverage gates failed.",
      nextStep: "Inspect gateFailures and unsupportedReasons, then decide whether to widen deterministic support or reposition the MVP surface."
    };
  }

  if (sampleSource !== "independent-external") {
    return {
      usableAsMvpEvidence: false,
      decision: "measurement-smoke-only",
      reason: "This run validates the importer/report/gate loop, but the sample source is not independent external project data.",
      nextStep: "Run the same command against independently collected external React/Tailwind samples."
    };
  }

  if (analysis.filesScanned < mvpIndependentFileTarget) {
    return {
      usableAsMvpEvidence: false,
      decision: "collect-more-samples",
      reason: `Only ${analysis.filesScanned} files were scanned; MVP evidence needs at least ${mvpIndependentFileTarget} independent files.`,
      nextStep: "Collect more external samples or raise --limit so the report covers 50-100 files."
    };
  }

  return {
    usableAsMvpEvidence: true,
    decision: "mvp-evidence-ready",
    reason: "Independent external corpus gates passed with enough files for MVP coverage evidence.",
    nextStep: "Use this report as the current external corpus baseline and re-run after widening direct-edit support."
  };
}

export function runExternalCorpusImport(args: CliArgs): ExternalCorpusReport {
  const outDir = path.resolve(args.outDir);
  const filesDir = path.join(outDir, "files");
  const manifestFile = path.join(outDir, "manifest.json");
  assertIntentOutputDir(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = args.analyzeOnly
    ? readExistingManifest(manifestFile, filesDir)
    : copySelectedFiles(args, filesDir);
  if (!args.analyzeOnly) {
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  const analysis = analyzeClassNames([filesDir], rootDir);
  const gates = gatesFor(analysis, args.minFiles, args.minSupportedDirect);
  const sourceKind = manifest.sampleSource ?? args.sampleSource;
  const directEditClassNameCount =
    analysis.classification.static +
    analysis.classification["simple-cn-clsx"] +
    analysis.classification["partial-cn-clsx"];
  const gateFailures = gateFailuresFor(analysis, gates, args.minFiles, args.minSupportedDirect);
  const report: ExternalCorpusReport = {
    generatedAt: new Date().toISOString(),
    available: analysis.filesScanned > 0,
    mode: args.analyzeOnly ? "analyze-only" : "import",
    sample: {
      label: manifest.label ?? args.label,
      sourceKind,
      independent: sourceKind === "independent-external",
      localSmokeFixture: sourceKind === "local-smoke-fixture",
      generatedFixture: sourceKind === "generated-fixture"
    },
    filesDir: toRepoPath(filesDir),
    manifestFile: toRepoPath(manifestFile),
    sourceRoots: manifest.sourceRoots,
    selectedFileCount: manifest.selectedFiles.length,
    skipped: manifest.skipped,
    gates,
    targets: {
      minFiles: args.minFiles,
      editableCoverage: args.minSupportedDirect,
      mvpIndependentFiles: mvpIndependentFileTarget
    },
    summary: {
      classNameOccurrences: analysis.classNameOccurrences,
      directEditClassNameCount,
      readOnlyClassNameCount: analysis.classification["read-only"],
      readOnlyClassNameRatio: ratio(analysis.classification["read-only"], analysis.classNameOccurrences),
      averageClassNamesPerFile: average(analysis.classNameOccurrences, analysis.filesScanned),
      editableTokenCoverage: analysis.editableCoverage.supportedDirect,
      topUnsupportedReasons: topUnsupportedReasons(analysis)
    },
    gateFailures,
    mvpEvidence: mvpEvidenceFor(analysis, gates, sourceKind),
    analysis,
    caveat:
      "External corpus copies are local measurement artifacts under .intent/ and should not be committed without checking source licenses."
  };

  fs.mkdirSync(path.dirname(args.reportFile), { recursive: true });
  fs.writeFileSync(args.reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = runExternalCorpusImport(args);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (
      args.failOnGate &&
      (!report.gates.minFilesPass ||
        !report.gates.staticAndSimpleCoveragePass ||
        !report.gates.supportedDirectCoveragePass ||
        !report.gates.allObservedCoveragePass)
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
    process.exitCode = 1;
  }
}
