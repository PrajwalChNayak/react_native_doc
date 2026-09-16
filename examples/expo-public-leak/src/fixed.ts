/**
 * FIXED.
 *
 * The app never holds the third-party key. It calls YOUR backend, authenticated
 * with the user's own short-lived access token. The backend holds the
 * privileged key server-side, checks that this user may see this report, calls
 * the third party, and returns only what the user is allowed to see.
 *
 * What is left in the bundle is a public base URL, which is fine to publish. An
 * access token extracted from a device belongs to one user, expires, and can be
 * revoked — unlike an inlined API key, which is the same for every install and
 * valid until you rotate it and ship a new build.
 */
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.example.com';

export async function fetchReportFixed(reportId: string, accessToken: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}/reports/${encodeURIComponent(reportId)}`, {
    headers: {Authorization: `Bearer ${accessToken}`},
  });
  if (!response.ok) throw new Error(`Report request failed: ${response.status}`);
  return response.json();
}
