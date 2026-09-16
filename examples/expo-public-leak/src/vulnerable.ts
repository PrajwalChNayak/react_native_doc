/**
 * VULNERABLE. Do not copy.
 *
 * Calls a third-party API directly from the app with a privileged key. The key
 * comes from an EXPO_PUBLIC_ variable, so Metro inlines it into the bundle at
 * build time and anyone with the app binary can recover it —
 * `npm run prove-leak` does exactly that.
 *
 * It does not matter that the key is "only" read from process.env: in an Expo
 * app that is a build-time text substitution, not a runtime secret store.
 */
export async function fetchReportVulnerable(reportId: string): Promise<unknown> {
  const response = await fetch(
    `https://reports.third-party.example/v1/reports/${encodeURIComponent(reportId)}`,
    {
      headers: {
        // Inlined into the shipped binary as a string constant.
        Authorization: `Bearer ${process.env.EXPO_PUBLIC_ANALYTICS_KEY ?? ''}`,
      },
    },
  );
  if (!response.ok) throw new Error(`Report request failed: ${response.status}`);
  return response.json();
}
