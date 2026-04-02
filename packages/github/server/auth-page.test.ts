import { describe, test, expect } from "bun:test";
import { authRequiredHtml, sessionExpiredHtml, accessDeniedHtml } from "./auth-page.ts";

describe("authRequiredHtml", () => {
  test("contains Authentication Required heading", () => {
    const html = authRequiredHtml("/api/auth/github/login");
    expect(html).toContain("Authentication Required");
  });

  test("contains Sign in with GitHub link", () => {
    const html = authRequiredHtml("/api/auth/github/login");
    expect(html).toContain("Sign in with GitHub");
    expect(html).toContain("/api/auth/github/login");
  });

  test("encodes return_to in login URL when provided", () => {
    const html = authRequiredHtml("/api/auth/github/login", "https://share.plannotator.ai/#abc123");
    expect(html).toContain("return_to=");
    expect(html).toContain(encodeURIComponent("https://share.plannotator.ai/#abc123"));
  });

  test("does not leak plan metadata (D-06)", () => {
    const html = authRequiredHtml("/api/auth/github/login");
    expect(html).not.toContain("data-plan");
    expect(html).not.toContain("data-author");
  });

  test("has proper accessibility attributes", () => {
    const html = authRequiredHtml("/api/auth/github/login");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<title>Authentication Required</title>");
  });

  test("contains legal disclaimer", () => {
    const html = authRequiredHtml("/api/auth/github/login");
    expect(html).toContain("By signing in, you agree to allow Plannotator");
  });

  test("uses loginUrl directly when no returnTo provided", () => {
    const html = authRequiredHtml("/api/auth/github/login");
    // Should contain the href without return_to param
    expect(html).toContain('href="/api/auth/github/login"');
  });
});

describe("sessionExpiredHtml", () => {
  test("contains Session Expired heading", () => {
    const html = sessionExpiredHtml("/api/auth/github/login");
    expect(html).toContain("Session Expired");
  });

  test("contains Sign in with GitHub link", () => {
    const html = sessionExpiredHtml("/api/auth/github/login");
    expect(html).toContain("Sign in with GitHub");
  });

  test("contains re-authentication message", () => {
    const html = sessionExpiredHtml("/api/auth/github/login");
    expect(html).toContain("Your session has expired. Please sign in again to continue.");
  });
});

describe("accessDeniedHtml", () => {
  test("contains Access Denied heading", () => {
    const html = accessDeniedHtml();
    expect(html).toContain("Access Denied");
  });

  test("contains contact owner message", () => {
    const html = accessDeniedHtml();
    expect(html).toContain("Contact the share owner");
  });

  test("does NOT contain login button", () => {
    const html = accessDeniedHtml();
    expect(html).not.toContain("Sign in with GitHub");
  });

  test("does NOT contain disclaimer", () => {
    const html = accessDeniedHtml();
    expect(html).not.toContain("By signing in");
  });
});
