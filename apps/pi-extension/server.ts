/**
 * Node-compatible servers for Plannotator Pi extension.
 *
 * Pi loads extensions via jiti (Node.js), so we can't use Bun.serve().
 * These are lightweight node:http servers implementing just the routes
 * each UI needs — plan review, code review, and markdown annotation.
 */

import { createServer, type IncomingMessage, type Server } from "node:http";
import { execSync } from "node:child_process";
import os from "node:os";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync, unlinkSync } from "node:fs";
import { join, basename, resolve, extname } from "node:path";
import { createHash, randomUUID } from "node:crypto";

// ── Helpers ──────────────────────────────────────────────────────────────

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

function json(res: import("node:http").ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function html(res: import("node:http").ServerResponse, content: string): void {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(content);
}

function listenOnRandomPort(server: Server): number {
  server.listen(0);
  const addr = server.address() as { port: number };
  return addr.port;
}

// ── Image Validation (duplicated from packages/server/image.ts) ─────────

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "tiff", "tif", "avif",
]);
const UPLOAD_DIR = "/tmp/plannotator";

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filePath.slice(lastDot + 1).toLowerCase();
}

function validateImagePath(rawPath: string): { valid: boolean; resolved: string; error?: string } {
  const resolved = resolve(rawPath);
  if (!ALLOWED_IMAGE_EXTENSIONS.has(getExtension(resolved))) {
    return { valid: false, resolved, error: "Path does not point to a supported image file" };
  }
  return { valid: true, resolved };
}

function validateUploadExtension(fileName: string): { valid: boolean; ext: string; error?: string } {
  const ext = getExtension(fileName) || "png";
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return { valid: false, ext, error: `File extension ".${ext}" is not a supported image type` };
  }
  return { valid: true, ext };
}

const MIME_MAP: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
  tiff: "image/tiff", tif: "image/tiff", avif: "image/avif",
};

function handlePiImage(req: IncomingMessage, res: import("node:http").ServerResponse): void {
  const url = new URL(req.url!, "http://localhost");
  const imagePath = url.searchParams.get("path");
  if (!imagePath) { json(res, { error: "Missing path parameter" }, 400); return; }
  const validation = validateImagePath(imagePath);
  if (!validation.valid) { json(res, { error: validation.error }, 403); return; }
  try {
    if (!existsSync(validation.resolved)) { json(res, { error: "File not found" }, 404); return; }
    const data = readFileSync(validation.resolved);
    const mime = MIME_MAP[getExtension(validation.resolved)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, "Content-Length": data.length });
    res.end(data);
  } catch {
    json(res, { error: "Failed to read file" }, 500);
  }
}

// ── Image Upload (Node multipart parser) ────────────────────────────────

function parseMultipartFile(req: IncomingMessage): Promise<{ filename: string; data: Buffer } | null> {
  return new Promise((resolve) => {
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) { resolve(null); return; }
    const boundary = boundaryMatch[1];

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks);
        const boundaryBuf = Buffer.from(`--${boundary}`);
        // Find the file part
        const bodyStr = body.toString("latin1");
        const parts = bodyStr.split(`--${boundary}`);
        for (const part of parts) {
          if (!part.includes('name="file"')) continue;
          const filenameMatch = part.match(/filename="([^"]+)"/);
          if (!filenameMatch) continue;
          // Find blank line separating headers from content
          const headerEnd = part.indexOf("\r\n\r\n");
          if (headerEnd === -1) continue;
          // Extract binary data (use Buffer offset, not string)
          const partStart = bodyStr.indexOf(part);
          const dataStart = partStart + headerEnd + 4;
          // Find the closing boundary
          let dataEnd = bodyStr.indexOf(`\r\n--${boundary}`, dataStart);
          if (dataEnd === -1) dataEnd = body.length;
          resolve({ filename: filenameMatch[1], data: body.subarray(dataStart, dataEnd) });
          return;
        }
        resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

async function handlePiUpload(req: IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
  try {
    const file = await parseMultipartFile(req);
    if (!file) { json(res, { error: "No file provided" }, 400); return; }
    const extResult = validateUploadExtension(file.filename);
    if (!extResult.valid) { json(res, { error: extResult.error }, 400); return; }
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const tempPath = `${UPLOAD_DIR}/${randomUUID()}.${extResult.ext}`;
    writeFileSync(tempPath, file.data);
    json(res, { path: tempPath, originalName: file.filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    json(res, { error: message }, 500);
  }
}

// ── Draft Persistence (duplicated from packages/server/draft.ts) ────────

function getDraftDir(): string {
  const dir = join(os.homedir(), ".plannotator", "drafts");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function saveDraft(key: string, data: object): void {
  writeFileSync(join(getDraftDir(), `${key}.json`), JSON.stringify(data), "utf-8");
}

function loadDraft(key: string): object | null {
  const filePath = join(getDraftDir(), `${key}.json`);
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function deleteDraft(key: string): void {
  const filePath = join(getDraftDir(), `${key}.json`);
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Ignore delete failures
  }
}

async function handlePiDraft(req: IncomingMessage, res: import("node:http").ServerResponse, draftKey: string): Promise<void> {
  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      saveDraft(draftKey, body);
      json(res, { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save draft";
      json(res, { error: message }, 500);
    }
  } else if (req.method === "DELETE") {
    deleteDraft(draftKey);
    json(res, { ok: true });
  } else {
    const draft = loadDraft(draftKey);
    if (!draft) { json(res, { found: false }, 404); return; }
    json(res, draft);
  }
}

/**
 * Open URL in system browser (Node-compatible, no Bun $ dependency).
 * Honors PLANNOTATOR_BROWSER and BROWSER env vars, matching packages/server/browser.ts.
 */
export function openBrowser(url: string): void {
  try {
    const browser = process.env.PLANNOTATOR_BROWSER || process.env.BROWSER;
    const platform = process.platform;
    const wsl = platform === "linux" && os.release().toLowerCase().includes("microsoft");

    if (browser) {
      if (process.env.PLANNOTATOR_BROWSER && platform === "darwin") {
        execSync(`open -a ${JSON.stringify(browser)} ${JSON.stringify(url)}`, { stdio: "ignore" });
      } else if (platform === "win32" || wsl) {
        execSync(`cmd.exe /c start "" ${JSON.stringify(browser)} ${JSON.stringify(url)}`, { stdio: "ignore" });
      } else {
        execSync(`${JSON.stringify(browser)} ${JSON.stringify(url)}`, { stdio: "ignore" });
      }
    } else if (platform === "win32" || wsl) {
      execSync(`cmd.exe /c start "" ${JSON.stringify(url)}`, { stdio: "ignore" });
    } else if (platform === "darwin") {
      execSync(`open ${JSON.stringify(url)}`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open ${JSON.stringify(url)}`, { stdio: "ignore" });
    }
  } catch {
    // Silently fail
  }
}

// ── Version History (Node-compatible, duplicated from packages/server) ──

function sanitizeTag(name: string): string | null {
  if (!name || typeof name !== "string") return null;
  const sanitized = name
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  return sanitized.length >= 2 ? sanitized : null;
}

function extractFirstHeading(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (!match) return null;
  return match[1].trim();
}

function generateSlug(plan: string): string {
  const date = new Date().toISOString().split("T")[0];
  const heading = extractFirstHeading(plan);
  const slug = heading ? sanitizeTag(heading) : null;
  return slug ? `${slug}-${date}` : `plan-${date}`;
}

function detectProjectName(): string {
  try {
    const toplevel = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const name = basename(toplevel);
    return sanitizeTag(name) ?? "_unknown";
  } catch {
    // Not a git repo — fall back to cwd
  }
  try {
    const name = basename(process.cwd());
    return sanitizeTag(name) ?? "_unknown";
  } catch {
    return "_unknown";
  }
}

function getHistoryDir(project: string, slug: string): string {
  const historyDir = join(os.homedir(), ".plannotator", "history", project, slug);
  mkdirSync(historyDir, { recursive: true });
  return historyDir;
}

function getNextVersionNumber(historyDir: string): number {
  try {
    const entries = readdirSync(historyDir);
    let max = 0;
    for (const entry of entries) {
      const match = entry.match(/^(\d+)\.md$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
    return max + 1;
  } catch {
    return 1;
  }
}

function saveToHistory(
  project: string,
  slug: string,
  plan: string,
): { version: number; path: string; isNew: boolean } {
  const historyDir = getHistoryDir(project, slug);
  const nextVersion = getNextVersionNumber(historyDir);
  if (nextVersion > 1) {
    const latestPath = join(historyDir, `${String(nextVersion - 1).padStart(3, "0")}.md`);
    try {
      const existing = readFileSync(latestPath, "utf-8");
      if (existing === plan) {
        return { version: nextVersion - 1, path: latestPath, isNew: false };
      }
    } catch { /* proceed with saving */ }
  }
  const fileName = `${String(nextVersion).padStart(3, "0")}.md`;
  const filePath = join(historyDir, fileName);
  writeFileSync(filePath, plan, "utf-8");
  return { version: nextVersion, path: filePath, isNew: true };
}

function getPlanVersion(
  project: string,
  slug: string,
  version: number,
): string | null {
  const historyDir = join(os.homedir(), ".plannotator", "history", project, slug);
  const fileName = `${String(version).padStart(3, "0")}.md`;
  const filePath = join(historyDir, fileName);
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function getVersionCount(project: string, slug: string): number {
  const historyDir = join(os.homedir(), ".plannotator", "history", project, slug);
  try {
    const entries = readdirSync(historyDir);
    return entries.filter((e) => /^\d+\.md$/.test(e)).length;
  } catch {
    return 0;
  }
}

function listVersions(
  project: string,
  slug: string,
): Array<{ version: number; timestamp: string }> {
  const historyDir = join(os.homedir(), ".plannotator", "history", project, slug);
  try {
    const entries = readdirSync(historyDir);
    const versions: Array<{ version: number; timestamp: string }> = [];
    for (const entry of entries) {
      const match = entry.match(/^(\d+)\.md$/);
      if (match) {
        const version = parseInt(match[1], 10);
        const filePath = join(historyDir, entry);
        try {
          const stat = statSync(filePath);
          versions.push({ version, timestamp: stat.mtime.toISOString() });
        } catch {
          versions.push({ version, timestamp: "" });
        }
      }
    }
    return versions.sort((a, b) => a.version - b.version);
  } catch {
    return [];
  }
}

function listProjectPlans(
  project: string,
): Array<{ slug: string; versions: number; lastModified: string }> {
  const projectDir = join(os.homedir(), ".plannotator", "history", project);
  try {
    const entries = readdirSync(projectDir, { withFileTypes: true });
    const plans: Array<{ slug: string; versions: number; lastModified: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slugDir = join(projectDir, entry.name);
      const files = readdirSync(slugDir).filter((f) => /^\d+\.md$/.test(f));
      if (files.length === 0) continue;
      let latest = 0;
      for (const file of files) {
        try {
          const mtime = statSync(join(slugDir, file)).mtime.getTime();
          if (mtime > latest) latest = mtime;
        } catch { /* skip */ }
      }
      plans.push({
        slug: entry.name,
        versions: files.length,
        lastModified: latest ? new Date(latest).toISOString() : "",
      });
    }
    return plans.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  } catch {
    return [];
  }
}

// ── Plan Review Server ──────────────────────────────────────────────────

export interface PlanServerResult {
  port: number;
  url: string;
  waitForDecision: () => Promise<{ approved: boolean; feedback?: string }>;
  stop: () => void;
}

export function startPlanReviewServer(options: {
  plan: string;
  htmlContent: string;
  origin?: string;
}): PlanServerResult {
  // Version history
  const slug = generateSlug(options.plan);
  const project = detectProjectName();
  const historyResult = saveToHistory(project, slug, options.plan);
  const previousPlan =
    historyResult.version > 1
      ? getPlanVersion(project, slug, historyResult.version - 1)
      : null;
  const versionInfo = {
    version: historyResult.version,
    totalVersions: getVersionCount(project, slug),
    project,
  };

  const draftKey = contentHash(options.plan);

  let resolveDecision!: (result: { approved: boolean; feedback?: string }) => void;
  const decisionPromise = new Promise<{ approved: boolean; feedback?: string }>((r) => {
    resolveDecision = r;
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost`);

    if (url.pathname === "/api/plan/version") {
      const vParam = url.searchParams.get("v");
      if (!vParam) {
        json(res, { error: "Missing v parameter" }, 400);
        return;
      }
      const v = parseInt(vParam, 10);
      if (isNaN(v) || v < 1) {
        json(res, { error: "Invalid version number" }, 400);
        return;
      }
      const content = getPlanVersion(project, slug, v);
      if (content === null) {
        json(res, { error: "Version not found" }, 404);
        return;
      }
      json(res, { plan: content, version: v });
    } else if (url.pathname === "/api/plan/versions") {
      json(res, { project, slug, versions: listVersions(project, slug) });
    } else if (url.pathname === "/api/plan/history") {
      json(res, { project, plans: listProjectPlans(project) });
    } else if (url.pathname === "/api/plan") {
      json(res, { plan: options.plan, origin: options.origin ?? "pi", previousPlan, versionInfo });
    } else if (url.pathname === "/api/approve" && req.method === "POST") {
      const body = await parseBody(req);
      resolveDecision({ approved: true, feedback: body.feedback as string | undefined });
      json(res, { ok: true });
    } else if (url.pathname === "/api/deny" && req.method === "POST") {
      const body = await parseBody(req);
      resolveDecision({ approved: false, feedback: (body.feedback as string) || "Plan rejected" });
      json(res, { ok: true });
    } else if (url.pathname === "/api/image" && req.method === "GET") {
      handlePiImage(req, res);
    } else if (url.pathname === "/api/upload" && req.method === "POST") {
      await handlePiUpload(req, res);
    } else if (url.pathname === "/api/draft") {
      await handlePiDraft(req, res, draftKey);
    } else {
      html(res, options.htmlContent);
    }
  });

  const port = listenOnRandomPort(server);

  return {
    port,
    url: `http://localhost:${port}`,
    waitForDecision: () => decisionPromise,
    stop: () => server.close(),
  };
}

// ── Code Review Server ──────────────────────────────────────────────────

export type DiffType = "uncommitted" | "staged" | "unstaged" | "last-commit" | "branch";

export interface DiffOption {
  id: DiffType | "separator";
  label: string;
}

export interface GitContext {
  currentBranch: string;
  defaultBranch: string;
  diffOptions: DiffOption[];
}

export interface ReviewServerResult {
  port: number;
  url: string;
  waitForDecision: () => Promise<{ feedback: string }>;
  stop: () => void;
}

/** Run a git command and return stdout (empty string on error). */
function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

export function getGitContext(): GitContext {
  const currentBranch = git("rev-parse --abbrev-ref HEAD") || "HEAD";

  let defaultBranch = "";
  const symRef = git("symbolic-ref refs/remotes/origin/HEAD");
  if (symRef) {
    defaultBranch = symRef.replace("refs/remotes/origin/", "");
  }
  if (!defaultBranch) {
    const hasMain = git("show-ref --verify refs/heads/main");
    defaultBranch = hasMain ? "main" : "master";
  }

  const diffOptions: DiffOption[] = [
    { id: "uncommitted", label: "Uncommitted changes" },
    { id: "last-commit", label: "Last commit" },
  ];
  if (currentBranch !== defaultBranch) {
    diffOptions.push({ id: "branch", label: `vs ${defaultBranch}` });
  }

  return { currentBranch, defaultBranch, diffOptions };
}

export function runGitDiff(diffType: DiffType, defaultBranch = "main"): { patch: string; label: string } {
  switch (diffType) {
    case "uncommitted":
      return { patch: git("diff HEAD --src-prefix=a/ --dst-prefix=b/"), label: "Uncommitted changes" };
    case "staged":
      return { patch: git("diff --staged --src-prefix=a/ --dst-prefix=b/"), label: "Staged changes" };
    case "unstaged":
      return { patch: git("diff --src-prefix=a/ --dst-prefix=b/"), label: "Unstaged changes" };
    case "last-commit":
      return { patch: git("diff HEAD~1..HEAD --src-prefix=a/ --dst-prefix=b/"), label: "Last commit" };
    case "branch":
      return { patch: git(`diff ${defaultBranch}..HEAD --src-prefix=a/ --dst-prefix=b/`), label: `Changes vs ${defaultBranch}` };
    default:
      return { patch: "", label: "Unknown diff type" };
  }
}

export function startReviewServer(options: {
  rawPatch: string;
  gitRef: string;
  htmlContent: string;
  origin?: string;
  diffType?: DiffType;
  gitContext?: GitContext;
}): ReviewServerResult {
  let currentPatch = options.rawPatch;
  let currentGitRef = options.gitRef;
  let currentDiffType: DiffType = options.diffType || "uncommitted";
  const draftKey = contentHash(currentPatch || "");

  let resolveDecision!: (result: { feedback: string }) => void;
  const decisionPromise = new Promise<{ feedback: string }>((r) => {
    resolveDecision = r;
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost`);

    if (url.pathname === "/api/diff" && req.method === "GET") {
      json(res, {
        rawPatch: currentPatch,
        gitRef: currentGitRef,
        origin: options.origin ?? "pi",
        diffType: currentDiffType,
        gitContext: options.gitContext,
      });
    } else if (url.pathname === "/api/diff/switch" && req.method === "POST") {
      const body = await parseBody(req);
      const newType = body.diffType as DiffType;
      if (!newType) {
        json(res, { error: "Missing diffType" }, 400);
        return;
      }
      const defaultBranch = options.gitContext?.defaultBranch || "main";
      const result = runGitDiff(newType, defaultBranch);
      currentPatch = result.patch;
      currentGitRef = result.label;
      currentDiffType = newType;
      json(res, { rawPatch: currentPatch, gitRef: currentGitRef, diffType: currentDiffType });
    } else if (url.pathname === "/api/feedback" && req.method === "POST") {
      const body = await parseBody(req);
      resolveDecision({ feedback: (body.feedback as string) || "" });
      json(res, { ok: true });
    } else if (url.pathname === "/api/image" && req.method === "GET") {
      handlePiImage(req, res);
    } else if (url.pathname === "/api/upload" && req.method === "POST") {
      await handlePiUpload(req, res);
    } else if (url.pathname === "/api/draft") {
      await handlePiDraft(req, res, draftKey);
    } else {
      html(res, options.htmlContent);
    }
  });

  const port = listenOnRandomPort(server);

  return {
    port,
    url: `http://localhost:${port}`,
    waitForDecision: () => decisionPromise,
    stop: () => server.close(),
  };
}

// ── Annotate Server ─────────────────────────────────────────────────────

export interface AnnotateServerResult {
  port: number;
  url: string;
  waitForDecision: () => Promise<{ feedback: string }>;
  stop: () => void;
}

export function startAnnotateServer(options: {
  markdown: string;
  filePath: string;
  htmlContent: string;
  origin?: string;
}): AnnotateServerResult {
  const draftKey = contentHash(options.markdown);

  let resolveDecision!: (result: { feedback: string }) => void;
  const decisionPromise = new Promise<{ feedback: string }>((r) => {
    resolveDecision = r;
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost`);

    if (url.pathname === "/api/plan" && req.method === "GET") {
      json(res, {
        plan: options.markdown,
        origin: options.origin ?? "pi",
        mode: "annotate",
        filePath: options.filePath,
      });
    } else if (url.pathname === "/api/feedback" && req.method === "POST") {
      const body = await parseBody(req);
      resolveDecision({ feedback: (body.feedback as string) || "" });
      json(res, { ok: true });
    } else if (url.pathname === "/api/image" && req.method === "GET") {
      handlePiImage(req, res);
    } else if (url.pathname === "/api/upload" && req.method === "POST") {
      await handlePiUpload(req, res);
    } else if (url.pathname === "/api/draft") {
      await handlePiDraft(req, res, draftKey);
    } else {
      html(res, options.htmlContent);
    }
  });

  const port = listenOnRandomPort(server);

  return {
    port,
    url: `http://localhost:${port}`,
    waitForDecision: () => decisionPromise,
    stop: () => server.close(),
  };
}

// ── Checklist Validation (Node-compatible, duplicated from packages/server) ──

/**
 * Validate a checklist JSON object.
 * Returns an array of error messages (empty = valid).
 */
export function validateChecklist(data: unknown): string[] {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    errors.push("Checklist must be a JSON object.");
    return errors;
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.title !== "string" || !obj.title.trim()) {
    errors.push('Missing or empty "title" (string).');
  }

  if (typeof obj.summary !== "string" || !obj.summary.trim()) {
    errors.push('Missing or empty "summary" (string).');
  }

  // Validate optional PR field
  if (obj.pr !== undefined) {
    if (typeof obj.pr !== "object" || obj.pr === null) {
      errors.push('"pr" must be an object if provided.');
    } else {
      const pr = obj.pr as Record<string, unknown>;
      if (typeof pr.number !== "number") {
        errors.push('pr.number must be a number.');
      }
      if (typeof pr.url !== "string" || !pr.url) {
        errors.push('pr.url must be a non-empty string.');
      }
      const validProviders = ["github", "gitlab", "azure-devops"];
      if (!validProviders.includes(pr.provider as string)) {
        errors.push(`pr.provider must be one of: ${validProviders.join(", ")}.`);
      }
    }
  }

  // Validate optional fileDiffs field
  if (obj.fileDiffs !== undefined) {
    if (typeof obj.fileDiffs !== "object" || obj.fileDiffs === null || Array.isArray(obj.fileDiffs)) {
      errors.push('"fileDiffs" must be an object mapping file paths to hunk counts.');
    } else {
      for (const [key, val] of Object.entries(obj.fileDiffs as Record<string, unknown>)) {
        if (typeof val !== "number" || val < 1 || !Number.isInteger(val)) {
          errors.push(`fileDiffs["${key}"] must be a positive integer.`);
        }
      }
    }
  }

  if (!Array.isArray(obj.items)) {
    errors.push('"items" must be an array.');
    return errors;
  }

  if (obj.items.length === 0) {
    errors.push('"items" array is empty — include at least one checklist item.');
  }

  for (let i = 0; i < obj.items.length; i++) {
    const item = obj.items[i] as Record<string, unknown>;
    const prefix = `items[${i}]`;

    if (typeof item.id !== "string" || !item.id.trim()) {
      errors.push(`${prefix}: missing "id" (string, e.g. "func-1").`);
    }

    if (typeof item.category !== "string" || !item.category.trim()) {
      errors.push(`${prefix}: missing "category" (string, e.g. "functional").`);
    }

    if (typeof item.check !== "string" || !item.check.trim()) {
      errors.push(`${prefix}: missing "check" (imperative verb phrase).`);
    }

    if (typeof item.description !== "string" || !item.description.trim()) {
      errors.push(`${prefix}: missing "description" (markdown narrative).`);
    }

    if (!Array.isArray(item.steps) || item.steps.length === 0) {
      errors.push(`${prefix}: "steps" must be a non-empty array of strings.`);
    }

    if (typeof item.reason !== "string" || !item.reason.trim()) {
      errors.push(`${prefix}: missing "reason" (why manual verification is needed).`);
    }

    // Validate optional diffMap
    if (item.diffMap !== undefined) {
      if (typeof item.diffMap !== "object" || item.diffMap === null || Array.isArray(item.diffMap)) {
        errors.push(`${prefix}: "diffMap" must be an object mapping file paths to hunk counts.`);
      } else {
        for (const [key, val] of Object.entries(item.diffMap as Record<string, unknown>)) {
          if (typeof val !== "number" || val < 1 || !Number.isInteger(val)) {
            errors.push(`${prefix}: diffMap["${key}"] must be a positive integer.`);
          }
        }
      }
    }
  }

  return errors;
}

// ── Checklist Feedback Formatting (Node-compatible) ──

interface ChecklistItemType {
  id: string;
  category: string;
  check: string;
  description: string;
  steps: string[];
  reason: string;
  files?: string[];
  critical?: boolean;
}

interface ChecklistType {
  title: string;
  summary: string;
  items: ChecklistItemType[];
  pr?: { number: number; url: string; provider: string; title?: string; branch?: string };
}

interface ChecklistItemResultType {
  id: string;
  status: "passed" | "failed" | "skipped" | "pending";
  notes?: string[] | string;
  images?: { path: string; name: string }[];
}

function formatChecklistFeedback(
  checklist: ChecklistType,
  results: ChecklistItemResultType[],
  globalNotes?: string[] | string,
  automations?: { postToPR?: boolean; approveIfAllPass?: boolean },
): string {
  const resultMap = new Map(results.map((r) => [r.id, r]));

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;

  for (const item of checklist.items) {
    const result = resultMap.get(item.id);
    if (result?.status === "passed") passed++;
    else if (result?.status === "failed") failed++;
    else if (result?.status === "skipped") skipped++;
    else pending++;
  }

  const lines: string[] = [];

  lines.push("# QA Checklist Results");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- **Title**: ${checklist.title}`);
  lines.push(`- **Total**: ${checklist.items.length} items`);
  lines.push(`- **Passed**: ${passed} | **Failed**: ${failed} | **Skipped**: ${skipped}${pending > 0 ? ` | **Pending**: ${pending}` : ""}`);
  lines.push("");

  const failedItems = checklist.items.filter(
    (item) => resultMap.get(item.id)?.status === "failed"
  );
  if (failedItems.length > 0) {
    lines.push("## Failed Items");
    lines.push("");
    for (const item of failedItems) {
      const result = resultMap.get(item.id)!;
      lines.push(`### ${item.id}: ${item.check}`);
      lines.push(`**Status**: FAILED`);
      lines.push(`**Category**: ${item.category}`);
      if (item.critical) lines.push(`**Critical**: yes`);
      if (item.files?.length) lines.push(`**Files**: ${item.files.join(", ")}`);
      const itemNotes = Array.isArray(result.notes) ? result.notes : result.notes ? [result.notes] : [];
      for (const note of itemNotes) {
        lines.push(`**Developer notes**: ${note}`);
      }
      if (result.images?.length) {
        for (const img of result.images) {
          lines.push(`[${img.name}] ${img.path}`);
        }
      }
      lines.push("");
    }
  }

  const skippedItems = checklist.items.filter(
    (item) => resultMap.get(item.id)?.status === "skipped"
  );
  if (skippedItems.length > 0) {
    lines.push("## Skipped Items");
    lines.push("");
    for (const item of skippedItems) {
      const result = resultMap.get(item.id)!;
      lines.push(`### ${item.id}: ${item.check}`);
      lines.push(`**Status**: SKIPPED`);
      const skipNotes = Array.isArray(result.notes) ? result.notes : result.notes ? [result.notes] : [];
      for (const note of skipNotes) {
        lines.push(`**Reason**: ${note}`);
      }
      lines.push("");
    }
  }

  const passedItems = checklist.items.filter(
    (item) => resultMap.get(item.id)?.status === "passed"
  );
  if (passedItems.length > 0) {
    lines.push("## Passed Items");
    lines.push("");
    for (const item of passedItems) {
      const result = resultMap.get(item.id);
      const passNotes = result ? (Array.isArray(result.notes) ? result.notes : result.notes ? [result.notes] : []) : [];
      const notesSuffix = passNotes.length > 0 ? ` — ${passNotes.join("; ")}` : "";
      lines.push(`- [PASS] ${item.id}: ${item.check}${notesSuffix}`);
    }
    lines.push("");
  }

  const notes = Array.isArray(globalNotes) ? globalNotes : globalNotes ? [globalNotes] : [];
  if (notes.length > 0) {
    lines.push("## Developer Comments");
    lines.push("");
    for (const note of notes) {
      lines.push(`> ${note.trim().replace(/\n/g, "\n> ")}`);
      lines.push("");
    }
  }

  // Automation instructions (matches packages/server/checklist.ts)
  if (automations && checklist.pr) {
    const pr = checklist.pr;
    const hasAutomations = automations.postToPR || automations.approveIfAllPass;

    if (hasAutomations) {
      lines.push("## Automations");
      lines.push("");

      if (automations.postToPR) {
        if (pr.provider === "github") {
          lines.push("**Post results to PR**: The developer requested that you post these checklist results as a comment on the pull request.");
          lines.push(`Use the \`gh\` CLI to post a comment to PR #${pr.number}:`);
          lines.push("```bash");
          lines.push(`gh pr comment ${pr.number} --body '<checklist results markdown>'`);
          lines.push("```");
          lines.push("If `gh` is not available, inform the developer to install the GitHub CLI (`brew install gh` or https://cli.github.com).");
        } else if (pr.provider === "gitlab") {
          lines.push("**Post results to MR**: The developer requested that you post these checklist results as a comment on the merge request.");
          lines.push(`Use the \`glab\` CLI to post a note to MR !${pr.number}:`);
          lines.push("```bash");
          lines.push(`glab mr note ${pr.number} --message '<checklist results markdown>'`);
          lines.push("```");
          lines.push("If `glab` is not available, inform the developer to install the GitLab CLI (`brew install glab` or https://gitlab.com/gitlab-org/cli).");
        } else if (pr.provider === "azure-devops") {
          lines.push("**Post results to PR**: The developer requested that you post these checklist results as a comment on the pull request.");
          lines.push(`Use the \`az\` CLI to post a comment to PR #${pr.number}:`);
          lines.push("```bash");
          lines.push(`az repos pr update --id ${pr.number} --description '<append checklist results>'`);
          lines.push("```");
          lines.push("If `az` is not available, inform the developer to install Azure CLI (`brew install azure-cli` or https://learn.microsoft.com/en-us/cli/azure/install-azure-cli).");
        }
        lines.push("");
      }

      if (automations.approveIfAllPass && failed === 0 && skipped === 0 && pending === 0) {
        if (pr.provider === "github") {
          lines.push("**Approve PR**: All checklist items passed. The developer requested auto-approval.");
          lines.push(`Use the \`gh\` CLI to approve PR #${pr.number}:`);
          lines.push("```bash");
          lines.push(`gh pr review ${pr.number} --approve --body 'QA checklist passed (${passed}/${passed} items)'`);
          lines.push("```");
        } else if (pr.provider === "gitlab") {
          lines.push("**Approve MR**: All checklist items passed. The developer requested auto-approval.");
          lines.push(`Use the \`glab\` CLI to approve MR !${pr.number}:`);
          lines.push("```bash");
          lines.push(`glab mr approve ${pr.number}`);
          lines.push("```");
        } else if (pr.provider === "azure-devops") {
          lines.push("**Approve PR**: All checklist items passed. The developer requested auto-approval.");
          lines.push(`Use the \`az\` CLI to approve PR #${pr.number}:`);
          lines.push("```bash");
          lines.push(`az repos pr set-vote --id ${pr.number} --vote approve`);
          lines.push("```");
        }
        lines.push("");
      } else if (automations.approveIfAllPass && (failed > 0 || skipped > 0 || pending > 0)) {
        lines.push("**Approve PR**: Skipped — not all items passed. Fix the failed/skipped items and re-run the checklist.");
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

// ── Checklist Storage (Node-compatible, duplicated from packages/server) ──

/**
 * Save a completed checklist (original + results) to disk.
 * Returns the path to the saved file.
 *
 * Structure: ~/.plannotator/checklists/{project}/{slug}.json
 */
function saveChecklistResults(
  checklist: ChecklistType,
  results: ChecklistItemResultType[],
  globalNotes: string[] | string | undefined,
  project: string,
): string {
  const dir = join(os.homedir(), ".plannotator", "checklists", project);
  mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().split("T")[0];
  const slug = checklist.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const timestamp = Date.now();
  const filename = `${slug}-${date}-${timestamp}.json`;
  const filePath = join(dir, filename);

  writeFileSync(filePath, JSON.stringify({
    checklist,
    results,
    globalNotes,
    submittedAt: new Date().toISOString(),
    project,
  }, null, 2));

  return filePath;
}

// ── Checklist Server ─────────────────────────────────────────────────────

export interface ChecklistServerResult {
  port: number;
  url: string;
  waitForDecision: () => Promise<{ feedback: string; results: ChecklistItemResultType[]; savedTo?: string; agentSwitch?: string }>;
  stop: () => void;
}

export function startChecklistServer(options: {
  checklist: ChecklistType;
  htmlContent: string;
  origin?: string;
  project?: string;
  initialResults?: ChecklistItemResultType[];
  initialGlobalNotes?: string[];
  onReady?: (url: string, port: number) => void;
}): ChecklistServerResult {
  const project = options.project || detectProjectName();
  const draftKey = contentHash(JSON.stringify(options.checklist));

  let resolveDecision!: (result: { feedback: string; results: ChecklistItemResultType[]; savedTo?: string; agentSwitch?: string }) => void;
  const decisionPromise = new Promise<{ feedback: string; results: ChecklistItemResultType[]; savedTo?: string; agentSwitch?: string }>((r) => {
    resolveDecision = r;
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost`);

    if (url.pathname === "/api/checklist" && req.method === "GET") {
      json(res, {
        checklist: options.checklist,
        origin: options.origin ?? "pi",
        mode: "checklist",
        ...(options.initialResults && { initialResults: options.initialResults }),
        ...(options.initialGlobalNotes && { initialGlobalNotes: options.initialGlobalNotes }),
      });
    } else if (url.pathname === "/api/feedback" && req.method === "POST") {
      const body = await parseBody(req) as {
        results?: ChecklistItemResultType[];
        globalNotes?: string[] | string;
        automations?: { postToPR?: boolean; approveIfAllPass?: boolean };
        agentSwitch?: string;
      };

      deleteDraft(draftKey);

      const results = body.results || [];

      // Save to disk
      let savedTo: string | undefined;
      try {
        savedTo = saveChecklistResults(
          options.checklist,
          results,
          body.globalNotes,
          project,
        );
      } catch {
        // Non-fatal — feedback still goes to agent
      }

      const feedback = formatChecklistFeedback(
        options.checklist,
        results,
        body.globalNotes,
        body.automations,
      );

      resolveDecision({
        feedback,
        results,
        savedTo,
        agentSwitch: body.agentSwitch,
      });

      json(res, { ok: true });
    } else if (url.pathname === "/api/image" && req.method === "GET") {
      handlePiImage(req, res);
    } else if (url.pathname === "/api/upload" && req.method === "POST") {
      await handlePiUpload(req, res);
    } else if (url.pathname === "/api/draft") {
      await handlePiDraft(req, res, draftKey);
    } else {
      html(res, options.htmlContent);
    }
  });

  const port = listenOnRandomPort(server);

  if (options.onReady) {
    options.onReady(`http://localhost:${port}`, port);
  }

  return {
    port,
    url: `http://localhost:${port}`,
    waitForDecision: () => decisionPromise,
    stop: () => server.close(),
  };
}
