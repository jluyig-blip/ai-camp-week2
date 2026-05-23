/**
 * Sentry detector — polls the Sentry API for error-rate spikes and new issues.
 *
 * Env: SENTRY_AUTH_TOKEN, SENTRY_ORG_SLUG, SENTRY_PROJECT_SLUG
 *
 * Degrades gracefully when env is missing — emits a single low-severity
 * "config-missing" alert (deduped 24h) so the operator sees the gap on the board,
 * instead of crashing the sweep.
 */
const TOKEN = process.env.SENTRY_AUTH_TOKEN || "";
const ORG = process.env.SENTRY_ORG_SLUG || "";
const PROJECT = process.env.SENTRY_PROJECT_SLUG || "";
const BASE = "https://sentry.io/api/0";

async function sentryFetch(pathname) {
  const r = await fetch(`${BASE}${pathname}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`sentry ${pathname}: ${r.status}`);
  return await r.json();
}

async function run(ruleSet, state) {
  if (!TOKEN || !ORG || !PROJECT) {
    const k = "sentry:config-missing";
    if (state.alerts[k] && Date.now() - state.alerts[k] < 24 * 3600 * 1000) return [];
    return [{
      source: "sentry", signal: "config-missing", severity: "low",
      message: "SENTRY_AUTH_TOKEN / SENTRY_ORG_SLUG / SENTRY_PROJECT_SLUG not set — Sentry polling disabled. Add them to .env.",
      threshold: "env present", value: "missing", routesTo: "orchestrator",
      evidence: { needs: ["SENTRY_AUTH_TOKEN", "SENTRY_ORG_SLUG", "SENTRY_PROJECT_SLUG"] },
    }];
  }

  const alerts = [];
  const baselineKey = "sentry:baseline:error_rate";
  const baseline = state[baselineKey] || null;
  try {
    // Hourly event stats — legacy endpoint that accepts a project slug.
    // Returns [[unix_ts, count], ...]; the last bucket is the in-progress hour.
    const stats = await sentryFetch(`/projects/${ORG}/${PROJECT}/stats/?stat=received&since=${Math.floor(Date.now() / 1000) - 6 * 3600}`);
    const counts = (Array.isArray(stats) ? stats : []).map((b) => b[1] || 0);
    const recent = counts.slice(-1)[0] || 0;
    const prior = counts.slice(0, -1);
    const avgPriorHours = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 0;

    if (baseline && recent > baseline * 3 && recent > 5) {
      alerts.push({
        source: "sentry", signal: "error-rate-spike", severity: "high",
        message: `Sentry error rate ${recent}/h — ${(recent / Math.max(1, baseline)).toFixed(1)}× baseline (${baseline.toFixed(1)}/h).`,
        threshold: `${(baseline * 3).toFixed(1)}/h`, value: `${recent}/h`, routesTo: "frontend-agent",
        evidence: { window: "1h current bucket", baseline, recent, hourlyAvg: avgPriorHours },
      });
    }
    // Rolling EMA baseline (alpha 0.2 for hourly samples)
    state[baselineKey] = baseline ? baseline * 0.8 + recent * 0.2 : Math.max(recent, avgPriorHours);

    // New issues — Sentry rejects statsPeriod=1h, so fetch 24h and filter client-side.
    const qs = new URLSearchParams({ statsPeriod: "24h", query: "is:unresolved", limit: "100" }).toString();
    const issues24h = await sentryFetch(`/projects/${ORG}/${PROJECT}/issues/?${qs}`);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const newIssues1h = (Array.isArray(issues24h) ? issues24h : []).filter((i) => i.firstSeen && new Date(i.firstSeen).getTime() >= oneHourAgo);
    if (newIssues1h.length > 5) {
      alerts.push({
        source: "sentry", signal: "new-issue-spike", severity: "medium",
        message: `${newIssues1h.length} new unresolved issues in the last hour (24h total: ${issues24h.length}).`,
        threshold: "> 5", value: `${newIssues1h.length}`, routesTo: "frontend-agent",
        evidence: { topIssues: newIssues1h.slice(0, 3).map((i) => ({ title: i.title, count: i.count, firstSeen: i.firstSeen, link: i.permalink })) },
      });
    }

    // Heartbeat — confirm the path is alive (deduped 12h)
    const hbKey = "sentry:heartbeat";
    if (!state.alerts[hbKey] || Date.now() - state.alerts[hbKey] > 12 * 3600 * 1000) {
      alerts.push({
        source: "sentry", signal: "heartbeat", severity: "low",
        message: `Sentry polling OK. Last 1h: ${recent} events; 6h avg ${avgPriorHours.toFixed(1)}/h; baseline ${(state[baselineKey] || 0).toFixed(1)}.`,
        threshold: "alive", value: "ok", routesTo: "orchestrator",
        evidence: { recent, avgPriorHours, baseline: state[baselineKey], org: ORG, project: PROJECT },
      });
    }
  } catch (e) {
    return [{ source: "sentry", signal: "api-error", severity: "low", message: `Sentry API error: ${e.message}`, routesTo: "orchestrator", evidence: { error: e.message } }];
  }
  return alerts;
}

module.exports = { run };
