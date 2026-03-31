# Coding Conventions

**Analysis Date:** 2026-03-30

## Naming Patterns

**Files:**
- React components: PascalCase (e.g., `Viewer.tsx`, `AnnotationPanel.tsx`, `CommentPopover.tsx`)
- Utilities: camelCase (e.g., `parser.ts`, `storage.ts`, `sharing.ts`)
- Types/interfaces: camelCase (e.g., `types.ts`)
- Tests: `.test.ts` suffix (e.g., `parser.test.ts`, `storage.test.ts`)
- Server files: camelCase with descriptive names (e.g., `index.ts`, `review.ts`, `annotate.ts`, `external-annotations.ts`)

**Functions:**
- Utility functions: camelCase with verb prefixes
  - `extractFrontmatter()`, `parseMarkdownToBlocks()`, `generateSlug()`, `saveToHistory()`
  - Getters: `getIdentity()`, `getEditorMode()`, `getPlanVersion()`
  - Setters: `saveEditorMode()`, `saveInputMethod()`, `setCustomIdentity()`
  - Boolean queries: `isRemoteSession()`, `isObsidianConfigured()`, `needsAISetup()`
- Export pattern: `export function` or `export const` for public API

**Variables:**
- camelCase for local variables and parameters
- PascalCase for React components and types
- Constants: camelCase (not SCREAMING_SNAKE_CASE, e.g., `configuredPort`, `planDir`)

**Types:**
- Interfaces: PascalCase (e.g., `Annotation`, `Block`, `ServerOptions`, `ViewerHandle`)
- Props interfaces: Component name + `Props` suffix (e.g., `ViewerProps`, `SettingsProps`, `AnnotationToolbarProps`)
- Enums: PascalCase with SCREAMING_SNAKE_CASE members
  - `AnnotationType.DELETION`, `AnnotationType.COMMENT`, `AnnotationType.GLOBAL_COMMENT`
- Type aliases: PascalCase (e.g., `EditorMode`, `InputMethod`, `CodeAnnotationType`)

## Code Style

**Formatting:**
- No explicit formatter config detected (no `.prettierrc` or similar)
- Indentation: 2 spaces (observed in all TypeScript/TSX files)
- Quotes: Mixed single and double quotes (no enforced standard)
- Line length: Not enforced, but typically kept reasonable (~100-120 chars)
- Semicolons: Consistently used at statement ends

**Linting:**
- No ESLint or Biome config found in root
- TypeScript strict mode enabled in all `tsconfig.json` files

## TypeScript Configuration

**Compiler Options (standard across packages):**
```typescript
{
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "bundler",
  "strict": true,
  "skipLibCheck": true,
  "noEmit": true,
  "allowImportingTsExtensions": true,
  "isolatedModules": true,
  "moduleDetection": "force",
  "types": ["bun-types"]
}
```

**Key settings:**
- Strict mode enabled everywhere
- Bundler module resolution (Bun/Vite ecosystem)
- `.ts` imports allowed (bundler will handle)
- Test files excluded via `"exclude": ["**/*.test.ts"]` in `packages/server/tsconfig.json`

## Import Organization

**Order:**
1. External dependencies (React, Node.js built-ins, third-party libraries)
2. Internal workspace packages (`@plannotator/*`)
3. Relative imports (local modules, components, utils)
4. Type-only imports when needed

**Examples from codebase:**
```typescript
// packages/editor/App.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { type Origin, getAgentName, getAgentBadge } from '@plannotator/shared/agents';
import { parseMarkdownToBlocks, exportAnnotations } from '@plannotator/ui/utils/parser';
import { Viewer, ViewerHandle } from '@plannotator/ui/components/Viewer';
```

**Path Aliases:**
- Workspace packages: `@plannotator/ui`, `@plannotator/server`, `@plannotator/shared`, `@plannotator/editor`, `@plannotator/review-editor`, `@plannotator/ai`
- No internal path aliases (uses relative imports within packages)

## Error Handling

**Patterns:**
- Null returns for not-found scenarios (e.g., `getPlanVersion()` returns `null`)
- HTTP error responses in server endpoints (400, 404, etc.)
- Try-catch for async operations (file I/O, git commands)
- Error responses as JSON: `Response.json({ error: "message" }, { status: 400 })`

**Example:**
```typescript
// packages/server/index.ts
if (!vParam) {
  return new Response("Missing v parameter", { status: 400 });
}
const content = getPlanVersion(project, slug, v);
if (content === null) {
  return Response.json({ error: "Version not found" }, { status: 404 });
}
```

## Logging

**Framework:** `console.log`, `console.error` (no structured logging library)

**Patterns:**
- Minimal logging in production code
- Debug logging via `console.error()` in edge cases (e.g., toolbar crashes in error boundary)
- No environment-based log levels

**Example:**
```typescript
// packages/ui/components/Viewer.tsx
componentDidCatch(error: Error) {
  console.error('AnnotationToolbar crashed:', error);
}
```

## Comments

**When to Comment:**
- Complex logic requiring explanation (nested fence parsing, regex patterns)
- Public API documentation (JSDoc-style function headers in tests and utilities)
- Regex explanations and edge cases
- Intentional workarounds or known limitations

**JSDoc/TSDoc:**
- Used extensively for test descriptions and file headers
- Function-level JSDoc for utilities (storage, parser)
- Inline comments for complex parsing logic

**Examples:**
```typescript
/**
 * Plan Storage Utility
 *
 * Saves plans and annotations to ~/.plannotator/plans/
 * Cross-platform: works on Windows, macOS, and Linux.
 */

/**
 * Baseline: the common triple-backtick fence still works after the nested-
 * fence fix. Regression guard so we don't break normal plans.
 */
test("triple-backtick fence produces a single code block", () => {
  // ...
});
```

## Function Design

**Size:**
- Small focused functions preferred
- Large functions (500+ lines) exist in UI components (`packages/ui/components/Settings.tsx`: 1815 lines, `packages/editor/App.tsx`: 1739 lines)
- Server route handlers use inline async functions within `fetch()` method

**Parameters:**
- Optional parameters use TypeScript optional syntax (`?`) or default values
- Configuration objects for multiple related parameters (e.g., `ServerOptions`)
- Destructuring common in React components

**Return Values:**
- Explicit return types for public APIs
- Type inference for internal functions
- `null` for not-found scenarios
- Objects for complex returns (e.g., `{ frontmatter, content }`, `{ version, path, isNew }`)

**Example:**
```typescript
export function extractFrontmatter(markdown: string): { frontmatter: Frontmatter | null; content: string } {
  // ...
}

export function saveToHistory(project: string, slug: string, content: string): { version: number; path: string; isNew: boolean } {
  // ...
}
```

## Module Design

**Exports:**
- Named exports preferred over default exports
- Utilities export multiple related functions
- React components typically single export per file
- Type re-exports common (e.g., `export type { EditorAnnotation } from '@plannotator/shared/types'`)

**Barrel Files:**
- Used sparingly
- `packages/server/index.ts` re-exports utilities: `export { isRemoteSession, getServerPort } from "./remote"`
- `packages/ui/types.ts` re-exports types from shared packages

**Example:**
```typescript
// packages/server/index.ts
export { isRemoteSession, getServerPort } from "./remote";
export { openBrowser } from "./browser";
export * from "./integrations";
export * from "./storage";
```

## React Conventions

**Component Definition:**
- Functional components with TypeScript (no class components except error boundaries)
- Props interfaces defined inline or above component
- `React.FC` type not used (explicit props typing preferred)

**Hooks:**
- Custom hooks prefixed with `use` (e.g., `useSharing`, `usePlanDiff`, `useAnnotationHighlighter`)
- Located in `packages/ui/hooks/`
- Return objects with named properties (e.g., `{ annotations, addAnnotation, ... }`)

**State Management:**
- `useState` for local state
- Custom config store (`packages/ui/config/configStore.ts`) for reactive settings
- Cookie-based persistence for cross-port settings
- No global state library (Redux, Zustand, etc.)

## Special Patterns

**Monorepo Structure:**
- Bun workspaces: `"workspaces": ["apps/*", "packages/*"]`
- Shared packages consumed by multiple apps
- Circular dependency avoidance via shared types in `@plannotator/shared`

**Server-Side Rendering:**
- Not used (client-side React apps only)
- Single-file HTML builds via `vite-plugin-singlefile`

**Build Artifacts:**
- Single-file HTML for plugin distribution (`apps/hook/dist/index.html`, `apps/review/dist/index.html`)
- Inline CSS and JS for standalone deployment

---

*Convention analysis: 2026-03-30*
