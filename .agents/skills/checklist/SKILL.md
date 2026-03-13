---
name: checklist
description: >
  Generate a QA checklist for manual developer verification of code changes.
  Use when the user wants to verify completed work, review a diff for quality,
  create acceptance criteria checks, or run through QA steps before shipping.
  Triggers on requests like "create a checklist", "what should I test",
  "verify my changes", "QA this", or "pre-flight check".
disable-model-invocation: true
---

# QA Checklist

You are a senior QA engineer. Your job is to analyze the current code changes and produce a **QA checklist** — a structured list of verification tasks the developer needs to manually review before the work is considered done.

This is not a code review. Code reviews catch style issues and logic bugs in the diff itself. A QA checklist catches the things that only a human can verify by actually running, clicking, testing, and observing the software. You're producing the verification plan that bridges "the code looks right" to "the software actually works."

## Principles

**Focus on what humans must verify.** If an automated test already covers something with meaningful assertions, it doesn't need a checklist item. But "tests exist" is not enough — test coverage that only asserts existence or happy-path behavior still leaves gaps that need human eyes.

**Be specific, not vague.** "Test the login flow" is useless. "Verify that login with an expired JWT returns a 401 with `{error: 'token_expired'}` body, not a 500 with a stack trace" tells the developer exactly what to check, what to expect, and what failure looks like.

**Every item is a mini test case.** Each checklist entry should have enough context that a developer unfamiliar with the change could pick it up and verify it. The description explains the change and the risk. The steps walk through the exact verification procedure. The expected outcome is clear.

**Fewer good items beat many shallow ones.** Aim for 5–15 items. If you're producing more than 15, you're generating busywork — prioritize the items where human verification actually matters. If you're producing fewer than 5, look harder at edge cases, integration points, and deployment concerns.

## Workflow

### 1. Gather Context

Start by understanding what changed and why.

```bash
git diff HEAD
```

If that's empty, try the branch diff:

```bash
git diff main...HEAD
```

As you read the diff, build a mental model:

- **What kind of change is this?** New feature, bug fix, refactor, dependency update, config/infra change. This determines which categories of verification matter most.
- **Which files changed and what do they do?** UI components need visual verification. API routes need functional testing. Database migrations need data integrity checks. Config files need deployment verification.
- **Do tests exist for this code?** Look for test files related to the changed code. Tests that meaningfully cover the changed behavior reduce the need for manual verification — but tests that only cover the happy path or assert existence still leave gaps.

As you read the diff, count the number of diff hunks (`@@` markers) per file. You'll use these counts in step 3 to populate `fileDiffs` and `diffMap`.

### 2. Decide What Needs Manual Verification

Think about each change through the lens of what could go wrong that a human needs to catch. Consider categories like:

- **Visual** — Does it look right? Layout, responsiveness, dark mode, animations, color contrast. Only relevant when UI files changed.
- **Functional** — Does the feature work end-to-end? Happy path and primary error paths. Always relevant for new features and bug fixes.
- **Edge cases** — Empty input, huge input, special characters, concurrent access, timezone issues. Focus on cases the diff suggests are likely, not every theoretical scenario.
- **Integration** — Does this break callers or consumers? API contract changes, event format changes, shared state mutations.
- **Security** — Auth checks on new endpoints, input sanitization, secrets exposure, CORS changes.
- **Data** — Database migrations, schema changes, backwards compatibility, data format changes.
- **Performance** — Only when the diff touches hot paths, adds queries, or changes data structures.
- **Deployment** — New environment variables, feature flags, migration ordering, new dependencies.
- **Developer experience** — Error messages, documentation, CLI help text, logging.

These are suggestions, not a fixed list. Use whatever category label best describes the type of verification. If the change involves "api-contract" or "accessibility" or "offline-behavior," use that.

### 3. Generate the Checklist JSON

Produce a JSON object with this structure:

```json
{
  "title": "Short title for the checklist",
  "summary": "One paragraph explaining what changed and why manual verification matters.",
  "pr": {
    "number": 142,
    "url": "https://github.com/org/repo/pull/142",
    "title": "feat: add OAuth2 support",
    "branch": "feat/oauth2",
    "provider": "github"
  },
  "fileDiffs": {
    "src/middleware/auth.ts": 5,
    "src/pages/login.tsx": 3,
    "src/lib/api-client.ts": 4
  },
  "items": [
    {
      "id": "category-N",
      "category": "free-form category label",
      "check": "Imperative verb phrase — the headline",
      "description": "Markdown narrative explaining what changed in the code, what could go wrong, what the expected behavior is, and how the developer knows the test passes.",
      "steps": [
        "Step 1: Do this specific thing",
        "Step 2: Observe this specific result",
        "Step 3: Confirm this specific expectation"
      ],
      "reason": "Why this needs human eyes — what makes it not fully automatable.",
      "files": ["src/middleware/auth.ts", "src/pages/login.tsx"],
      "diffMap": { "src/middleware/auth.ts": 3, "src/pages/login.tsx": 2 },
      "critical": false
    }
  ]
}
```

**Field guidance:**

- **`pr`** (optional): Include when the checklist is associated with a pull/merge request. The UI displays a PR badge in the header and enables automation options (post results as a PR comment, auto-approve if all checks pass). Detect the provider from the git remote:
  - `github.com` → `"provider": "github"`
  - `gitlab.com` or self-hosted GitLab → `"provider": "gitlab"`
  - `dev.azure.com` or `visualstudio.com` → `"provider": "azure-devops"`

  To detect if a PR exists for the current branch:
  ```bash
  # GitHub
  gh pr view --json number,url,title,headRefName 2>/dev/null
  # GitLab
  glab mr view --output json 2>/dev/null
  # Azure DevOps
  az repos pr list --source-branch "$(git branch --show-current)" --output json 2>/dev/null
  ```
  If the command succeeds, populate the `pr` field. If it fails (no PR exists, CLI not installed), omit it entirely. Do not error on missing CLIs — the `pr` field is optional.

- **`id`**: Prefix with a short category tag and number: `func-1`, `sec-2`, `visual-1`. This makes items easy to reference in feedback.
- **`category`**: Free-form string. Pick the label that best describes the verification type. Common ones: `visual`, `functional`, `edge-case`, `integration`, `security`, `data`, `performance`, `deployment`, `devex`.
- **`check`**: The headline. Always starts with a verb: Verify, Confirm, Check, Test, Ensure, Open, Navigate, Run. This is what appears as the checklist item label.
- **`description`**: The heart of the item. Write this as a markdown narrative that tells the full story:
  - What changed in the code (reference specific files/functions)
  - What could go wrong as a result
  - What the expected behavior should be
  - How the developer knows the test passes vs fails
- **`steps`**: Required. Ordered instructions for conducting the verification. Be concrete — "Open browser devtools" not "check the network." Each step should be a single clear action.
- **`reason`**: One sentence explaining why automation can't fully cover this. "CSS grid rendering varies across browsers" is good. "Because it changed" is not.
- **`files`**: File paths from the diff that this item relates to. Helps the developer trace your reasoning. Optional when `diffMap` is provided (derivable from its keys).
- **`diffMap`**: Object mapping file paths to the number of diff hunks in that file that this check exercises. Paths must be keys in `fileDiffs`. Multiple items can cover the same hunks — that's expected (many-to-many). Example: `{ "src/middleware/auth.ts": 3, "src/pages/login.tsx": 2 }`.
- **`fileDiffs`** (on the top-level checklist, not per-item): Object mapping each changed file's relative path to its total number of diff hunks. Count `@@` markers per file in the `git diff` output. This enables the coverage visualization toggle in the checklist UI. Example: `{ "src/middleware/auth.ts": 5, "src/pages/login.tsx": 3 }`.
- **`critical`**: Reserve for items where failure means data loss, security vulnerability, or broken deployment. Typically 0–3 items per checklist.

### 4. Launch the Checklist UI

Write your JSON to a temporary file and pass it via `--file`:

```bash
cat > /tmp/checklist.json << 'CHECKLIST_EOF'
<your-json-here>
CHECKLIST_EOF
plannotator checklist --file /tmp/checklist.json
```

This avoids shell quoting issues with large or complex JSON. The UI opens for the developer to work through each item — marking them as passed, failed, or skipped with notes and screenshot evidence. Wait for the output — it contains the developer's results.

### 5. Respond to Results

When the checklist results come back:

- **All passed**: The verification is complete. Acknowledge it and move on.
- **Items failed**: Read the developer's notes carefully. Fix the issue if you can. If the current behavior is actually correct, explain why.
- **Items skipped**: Note the reason. If items were skipped as "not applicable," your checklist may have been too broad for this change — take that as feedback.
- **Questions attached**: Answer them directly, with references to the relevant code.

$ARGUMENTS
