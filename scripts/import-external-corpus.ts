import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeClassNames } from "./analyze-classnames";

const rootDir = process.cwd();

interface CliArgs {
  inputs: string[];
  outDir: string;
  reportFile: string;
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
  };
  analysis: ReturnType<typeof analyzeClassNames>;
  caveat: string;
}

function defaultArgs(): CliArgs {
  return {
    inputs: [],
    outDir: path.join(rootDir, ".intent", "external-corpus"),
    reportFile: path.join(rootDir, "reports", "performance", "external-corpus-audit.json"),
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
    "  --limit <n>                   Max files to copy/analyze (default: 100)",
    "  --min-files <n>               Gate target for selected files (default: 50)",
    "  --min-supported-direct <0-1>  Gate target for supported direct coverage (default: 0.5)",
    "  --include-tests               Include *.test, *.spec, and *.stories files",
    "  --fail-on-gate                Exit non-zero if gates fail"
  ].join("\n");
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
      sourceRoots: [],
      filesDir: toRepoPath(filesDir),
      limit: 0,
      includeTests: false,
      selectedFiles: [],
      skipped: {}
    };
  }

  return JSON.parse(fs.readFileSync(manifestFile, "utf8")) as ExternalCorpusManifest;
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
  const report: ExternalCorpusReport = {
    generatedAt: new Date().toISOString(),
    available: analysis.filesScanned > 0,
    mode: args.analyzeOnly ? "analyze-only" : "import",
    filesDir: toRepoPath(filesDir),
    manifestFile: toRepoPath(manifestFile),
    sourceRoots: manifest.sourceRoots,
    selectedFileCount: manifest.selectedFiles.length,
    skipped: manifest.skipped,
    gates,
    targets: {
      minFiles: args.minFiles,
      editableCoverage: args.minSupportedDirect
    },
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
