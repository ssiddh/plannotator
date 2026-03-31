# Testing Patterns

**Analysis Date:** 2026-03-30

## Test Framework

**Runner:**
- Bun Test (built into Bun runtime)
- No Jest or Vitest config files

**Assertion Library:**
- Bun's built-in `expect` (Jest-compatible API)

**Run Commands:**
```bash
bun test              # Run all tests
bun test --watch      # Watch mode (standard Bun flag)
```

**Coverage:**
```bash
# No coverage script configured
# Bun supports --coverage flag, but not set up in project
```

**Type Checking:**
```bash
bun run typecheck     # Runs tsc --noEmit on shared, ai, and server packages
```

## Test File Organization

**Location:**
- Co-located with source files (e.g., `packages/ui/utils/parser.test.ts` next to `parser.ts`)
- Some tests in dedicated `tests/` directory:
  - `tests/parity/` - Cross-runtime parity tests
  - `tests/manual/` - Manual test scripts

**Naming:**
- Pattern: `{module}.test.ts`
- Examples: `parser.test.ts`, `storage.test.ts`, `review-core.test.ts`, `external-annotations.test.ts`

**Structure:**
```
packages/
├── ui/
│   ├── utils/
│   │   ├── parser.ts
│   │   ├── parser.test.ts
│   │   ├── callback.test.ts
│   │   └── bear.test.ts
│   └── components/
│       └── diagramLanguages.test.ts
├── server/
│   ├── storage.test.ts
│   ├── remote.test.ts
│   ├── image.test.ts
│   └── external-annotations.test.ts
├── shared/
│   ├── review-core.test.ts
│   ├── pr-provider.test.ts
│   └── feedback-templates.test.ts
tests/
├── parity/
│   ├── route-parity.test.ts
│   └── vendor-parity.test.ts
└── manual/
    ├── test-server.ts
    └── test-review-server.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, test, expect, afterEach } from "bun:test";

describe("feature or module name", () => {
  test("specific behavior being tested", () => {
    // Arrange
    const input = "...";

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

**Example from `packages/ui/utils/parser.test.ts`:**
```typescript
describe("parseMarkdownToBlocks — code fences", () => {
  /**
   * Baseline: the common triple-backtick fence still works after the nested-
   * fence fix. Regression guard so we don't break normal plans.
   */
  test("triple-backtick fence produces a single code block", () => {
    const md = "```js\nconsole.log('hi');\n```";
    const blocks = parseMarkdownToBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("code");
    expect(blocks[0].language).toBe("js");
    expect(blocks[0].content).toBe("console.log('hi');");
  });
});
```

**Patterns:**
- `describe()` blocks group related tests (feature-oriented)
- Nested `describe()` blocks for subfeatures (e.g., "code fences", "tables")
- Test descriptions are full sentences describing expected behavior
- JSDoc comments above tests explain WHY the test exists (regression guards, edge cases)

## Mocking

**Framework:** Bun's built-in `mock()` function

**Patterns:**
```typescript
import { mock } from "bun:test";

test("disables idle timeout for stream requests", async () => {
  const disableIdleTimeout = mock(() => {});

  const res = await handler.handle(
    new Request("http://localhost/api/external-annotations/stream"),
    new URL("http://localhost/api/external-annotations/stream"),
    { disableIdleTimeout },
  );

  expect(disableIdleTimeout).toHaveBeenCalledTimes(1);
});
```

**Custom Mocks:**
- Mock providers and sessions for AI tests (`packages/ai/ai.test.ts`)
- Mock runtime interfaces for git operations (`packages/shared/review-core.test.ts`)

**Example from `packages/ai/ai.test.ts`:**
```typescript
function mockSession(
  id: string,
  parentSessionId: string | null = null
): AISession {
  let active = false;
  return {
    get id() { return id; },
    parentSessionId,
    get isActive() { return active; },
    async *query(prompt: string): AsyncIterable<AIMessage> {
      active = true;
      yield { type: "text_delta", delta: `Echo: ${prompt}` };
      yield { type: "result", sessionId: id, success: true, result: `Echo: ${prompt}` };
      active = false;
    },
    abort() { active = false; },
  };
}
```

**What to Mock:**
- External I/O (file system, git commands)
- Async operations with complex setup
- Server idle timeout handlers
- AI providers and sessions

**What NOT to Mock:**
- Pure functions (parser, slug generation)
- Simple utilities (string manipulation, tag extraction)
- In-memory data structures

## Fixtures and Factories

**Test Data:**
- Inline test data (no separate fixture files)
- Factory functions for complex objects (mocks)
- Temporary directories for file I/O tests

**Example from `packages/server/storage.test.ts`:**
```typescript
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "plannotator-storage-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writes markdown file to disk", () => {
  const dir = makeTempDir();
  const path = savePlan("test-slug", "# Content", dir);
  expect(path).toBe(join(dir, "test-slug.md"));
  expect(readFileSync(path, "utf-8")).toBe("# Content");
});
```

**Location:**
- Test helpers defined at top of test file
- Cleanup via `afterEach()` hooks
- No dedicated `__fixtures__` or `test-data/` directories

## Coverage

**Requirements:** None enforced

**Current State:**
- No coverage configuration
- No coverage reporting in CI
- Tests focus on critical paths (parsers, storage, git operations)

**View Coverage:**
```bash
# Not configured, but Bun supports:
bun test --coverage
```

## Test Types

**Unit Tests:**
- Scope: Single function or module
- Approach: Pure function testing with inline data
- Examples: `parser.test.ts`, `storage.test.ts`, `callback.test.ts`, `bear.test.ts`

**Integration Tests:**
- Scope: Multiple modules working together
- Approach: Real file system, real git repos (in temp directories)
- Examples: `review-core.test.ts` (git operations), `storage.test.ts` (file I/O)

**Parity Tests:**
- Scope: Cross-runtime consistency
- Approach: Static analysis of source files (regex-based route extraction)
- Examples: `route-parity.test.ts` (Bun ↔ Pi server routes), `vendor-parity.test.ts`
- Location: `tests/parity/`

**E2E Tests:**
- Not used (no Playwright, Cypress, etc.)

## Common Patterns

**Async Testing:**
```typescript
test("uncommitted diff includes tracked and untracked files", async () => {
  const repoDir = initRepo();
  const runtime = makeRuntime(repoDir);

  writeFileSync(join(repoDir, "tracked.txt"), "after\n", "utf-8");
  writeFileSync(join(repoDir, "untracked.txt"), "brand new\n", "utf-8");

  const result = await runGitDiff(runtime, "uncommitted", "main");

  expect(result.label).toBe("Uncommitted changes");
  expect(result.patch).toContain("diff --git a/tracked.txt b/tracked.txt");
});
```

**Error Testing:**
```typescript
test("returns null for nonexistent version", () => {
  const content = getPlanVersion("test-project", "nonexistent", 99);
  expect(content).toBeNull();
});
```

**Cleanup Hooks:**
```typescript
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

**Git Integration Tests:**
```typescript
function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function initRepo(initialBranch = "main"): string {
  const repoDir = makeTempDir("plannotator-review-core-");
  git(repoDir, ["init"]);
  git(repoDir, ["branch", "-M", initialBranch]);
  git(repoDir, ["config", "user.email", "review-core@example.com"]);
  git(repoDir, ["config", "user.name", "Review Core"]);

  writeFileSync(join(repoDir, "tracked.txt"), "before\n", "utf-8");
  git(repoDir, ["add", "tracked.txt"]);
  git(repoDir, ["commit", "-m", "initial"]);

  return repoDir;
}
```

**Descriptive Test Names:**
- Full sentences describing behavior
- Focus on outcomes, not implementation
- Edge cases explicitly labeled (e.g., "unclosed fence at EOF")

**Examples:**
```typescript
test("triple-backtick fence produces a single code block", () => { ... });
test("4-backtick fence treats inner triple-backtick as content", () => { ... });
test("closing fence with trailing text still closes the block", () => { ... });
test("same heading on same day produces same slug", () => { ... });
test("deduplicates identical content", () => { ... });
```

## Test Organization by Package

**`packages/ui/utils/`:**
- `parser.test.ts` - Markdown parsing edge cases (code fences, tables, regression tests)
- `callback.test.ts` - Callback configuration
- `bear.test.ts` - Bear notes app integration
- `diagramLanguages.test.ts` - Mermaid/Graphviz language detection

**`packages/server/`:**
- `storage.test.ts` - Plan saving, versioning, deduplication
- `remote.test.ts` - Remote session detection
- `image.test.ts` - Image handling
- `external-annotations.test.ts` - SSE stream configuration
- `project.test.ts` - Project name detection
- `integrations.test.ts` - Obsidian/Bear integrations

**`packages/shared/`:**
- `review-core.test.ts` - Git diff operations (uncommitted, staged, unstaged, branch)
- `pr-provider.test.ts` - PR provider detection
- `crypto.test.ts` - Cryptographic utilities
- `feedback-templates.test.ts` - Feedback template generation

**`packages/review-editor/utils/`:**
- `reviewSearch.test.ts` - Code review search
- `exportFeedback.test.ts` - Feedback export formatting

**`packages/ai/`:**
- `ai.test.ts` - AI session management, provider registry, endpoints (1226 lines - comprehensive)

**`tests/parity/`:**
- `route-parity.test.ts` - Ensures Bun and Pi servers expose identical API routes
- `vendor-parity.test.ts` - Cross-vendor consistency checks

**`tests/manual/`:**
- `test-server.ts` - Manual server testing script
- `test-review-server.ts` - Manual review server testing
- `test-external-annotations.ts` - Manual external annotation testing
- `test-worktree-review.ts` - Worktree review testing

## Manual Tests

Manual test scripts exist in `tests/manual/` for scenarios requiring human verification:
- Server startup and browser opening
- External annotation workflows
- Worktree-based review flows

These are not part of the automated test suite.

## Test Gaps

Based on codebase exploration, the following areas lack test coverage:

**UI Components:**
- No tests for React components (`packages/ui/components/`, `packages/editor/`, `packages/review-editor/`)
- No snapshot tests or React Testing Library usage

**Server Endpoints:**
- HTTP endpoints tested manually, not via automated tests
- No integration tests for full request/response cycles

**Browser Interactions:**
- No E2E tests for user workflows
- Annotation highlighting and selection not tested

**Share/Export:**
- URL sharing compression/decompression not tested
- Import/export flows not covered

---

*Testing analysis: 2026-03-30*
