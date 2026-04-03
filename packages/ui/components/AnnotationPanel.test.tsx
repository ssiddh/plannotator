import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

// Structural tests -- validate key patterns in the component source
// (Full rendering tests require jsdom/happy-dom which aren't configured)
const src = fs.readFileSync(
  path.join(__dirname, "AnnotationPanel.tsx"),
  "utf-8"
);

describe("AnnotationPanel", () => {
  test("contains formatAbsoluteTimestamp helper using Intl.DateTimeFormat", () => {
    expect(src).toContain("function formatAbsoluteTimestamp");
    expect(src).toContain("Intl.DateTimeFormat");
  });

  test("GitHub annotations are read-only (no edit/delete for github-pr)", () => {
    expect(src).toContain("annotation.source !== 'github-pr'");
  });

  test("renders 24px GitHub avatar (w-6 h-6 rounded-full)", () => {
    expect(src).toContain("w-6 h-6 rounded-full");
  });

  test("clickable username opens githubCommentUrl in new tab", () => {
    expect(src).toContain("window.open(annotation.githubCommentUrl");
    expect(src).toContain('"_blank"');
  });

  test("renders absolute timestamp for GitHub annotations", () => {
    expect(src).toContain("formatAbsoluteTimestamp(annotation.createdA)");
  });

  test("AnnotationCard accepts depth prop with default 0", () => {
    expect(src).toContain("depth?: number");
    expect(src).toContain("depth = 0");
  });

  test("children render recursively with indented border", () => {
    expect(src).toContain("annotation.children && annotation.children.length > 0");
    expect(src).toContain("ml-6 pl-3 border-l border-border/50");
  });

  test("avatar fallback shows first letter of username", () => {
    expect(src).toContain('(annotation.author || "?")[0].toUpperCase()');
  });

  test("GitHub annotation images section is skipped", () => {
    expect(src).toContain("annotation.source !== 'github-pr'");
  });

  test("depth is capped at 3 for recursive rendering", () => {
    expect(src).toContain("Math.min((depth || 0) + 1, 3)");
  });
});
