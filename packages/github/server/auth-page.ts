/**
 * Server-rendered HTML pages for authentication states.
 *
 * These pages are returned as inline HTML in 401/403 responses
 * before any client-side JS loads. They cannot use the Plannotator
 * theme system or React because the plan app is never served.
 *
 * Per D-01: Server-side gate returns HTML, not plan content.
 * Per D-06: No plan metadata, title, author, or any content shown.
 */

const GITHUB_OCTOCAT_SVG = `<svg width="64" height="64" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" fill="#24292e"/></svg>`;

const GITHUB_BUTTON_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" fill="#ffffff"/></svg>`;

const BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f5f5f5;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 16px;
  }
  .card {
    background: #ffffff;
    max-width: 400px;
    width: 100%;
    padding: 48px;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    text-align: center;
  }
  .icon {
    margin-bottom: 24px;
  }
  h1 {
    color: #111111;
    font-size: 24px;
    font-weight: 600;
    line-height: 1.2;
    margin-bottom: 8px;
  }
  .body-text {
    color: #666666;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
    margin-bottom: 32px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 24px;
    background: #24292e;
    color: #ffffff;
    border-radius: 6px;
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
    text-decoration: none;
    transition: background-color 200ms;
  }
  .btn:hover {
    background: #2c3136;
  }
  .btn:focus-visible {
    outline: 2px solid #24292e;
    outline-offset: 2px;
  }
  .disclaimer {
    color: #999999;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    margin-top: 24px;
  }
`;

function buildLoginUrl(loginUrl: string, returnTo?: string): string {
  if (returnTo) {
    return `${loginUrl}?return_to=${encodeURIComponent(returnTo)}`;
  }
  return loginUrl;
}

/**
 * HTML page for unauthenticated users accessing a whitelist share.
 * Returns 401 with "Sign in with GitHub" button.
 *
 * Per D-05: Full-page error for unauthenticated users.
 * Per D-06: No plan metadata preview before authentication.
 */
export function authRequiredHtml(loginUrl: string, returnTo?: string): string {
  const href = buildLoginUrl(loginUrl, returnTo);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authentication Required</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="icon">${GITHUB_OCTOCAT_SVG}</div>
    <h1>Authentication Required</h1>
    <p class="body-text">This share requires GitHub authentication.</p>
    <a href="${href}" class="btn">${GITHUB_BUTTON_ICON_SVG} Sign in with GitHub</a>
    <p class="disclaimer">By signing in, you agree to allow Plannotator to access your GitHub profile and organization membership.</p>
  </div>
</body>
</html>`;
}

/**
 * HTML page for users with an expired/invalid session token.
 * Returns 401 with "Sign in with GitHub" button.
 *
 * Per D-11: Token expiry triggers re-authentication.
 */
export function sessionExpiredHtml(loginUrl: string, returnTo?: string): string {
  const href = buildLoginUrl(loginUrl, returnTo);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Session Expired</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="icon">${GITHUB_OCTOCAT_SVG}</div>
    <h1>Session Expired</h1>
    <p class="body-text">Your session has expired. Please sign in again to continue.</p>
    <a href="${href}" class="btn">${GITHUB_BUTTON_ICON_SVG} Sign in with GitHub</a>
    <p class="disclaimer">By signing in, you agree to allow Plannotator to access your GitHub profile and organization membership.</p>
  </div>
</body>
</html>`;
}

/**
 * HTML page for authenticated users who are not on the ACL whitelist.
 * Returns 403 with no login button (user is authenticated but not authorized).
 *
 * Per D-16: Single permission level (whitelist = full access).
 */
export function accessDeniedHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access Denied</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="icon">${GITHUB_OCTOCAT_SVG}</div>
    <h1>Access Denied</h1>
    <p class="body-text">You don't have permission to view this share. Contact the share owner to request access.</p>
  </div>
</body>
</html>`;
}
