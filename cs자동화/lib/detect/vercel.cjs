/**
 * Vercel detector — polls the Vercel API for deploy state (and is a stub for 5xx
 * rate / bundle delta, which need a log-drain integration to do properly).
 *
 * Env: VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID (only for team accounts)
 *
 * Degrades gracefully when env is missing.
 */
const TOKEN = process.env.VERCEL_TOKEN || "";
const PROJECT = process.env.VERCEL_PROJECT_ID || "";
const TEAM = process.env.VERCEL_TEAM_ID || "";
const BASE = "https://api.vercel.com";

async function vercelFetch(pathname) {
  const sep = pathname.includes("?") ? "&" : "?";
  const url = `${BASE}${pathname}${TEAM ? `${sep}teamId=${TEAM}` : ""}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`vercel ${pathname}: ${r.status}`);
  return await r.json();
}

async function run(ruleSet, state) {
  if (!TOKEN || !PROJECT) {
    const k = "vercel:config-missing";
    if (state.alerts[k] && Date.now() - state.alerts[k] < 24 * 3600 * 1000) return [];
    return [{
      source: "vercel", signal: "config-missing", severity: "low",
      message: "VERCEL_TOKEN / VERCEL_PROJECT_ID not set — Vercel polling disabled. Add them to .env.",
      threshold: "env present", value: "missing", routesTo: "orchestrator",
    }];
  }

  const alerts = [];
  try {
    const deploys = await vercelFetch(`/v6/deployments?projectId=${PROJECT}&limit=5`);
    const list = deploys.deployments || [];
    const failed = list.find((d) => d.state === "ERROR" || d.state === "CANCELED");
    if (failed) {
      const key = `vercel:deploy-fail:${failed.uid}`;
      if (!state.alerts[key]) {
        alerts.push({
          source: "vercel", signal: "deploy-failure", severity: "high",
          message: `Vercel deploy ${failed.uid} state=${failed.state} (${(failed.meta && failed.meta.githubCommitMessage) || failed.name}).`,
          threshold: "state != ERROR/CANCELED", value: failed.state, routesTo: "deploy-gate-agent",
          evidence: { uid: failed.uid, branch: failed.meta && failed.meta.githubCommitRef, commit: failed.meta && (failed.meta.githubCommitSha || "").slice(0, 7), url: failed.url },
        });
      }
    }
    // Bundle delta / 5xx burst would need a log-drain integration; out of scope here.
    // Note the most recent READY deploy so a future bundle-inspect step has a marker.
    const recent = list.find((d) => d.state === "READY");
    if (recent) {
      const seenKey = `vercel:last-deploy:${recent.uid}`;
      if (!state[seenKey]) state[seenKey] = recent.created;
    }
  } catch (e) {
    return [{ source: "vercel", signal: "api-error", severity: "low", message: `Vercel API error: ${e.message}`, routesTo: "orchestrator" }];
  }
  return alerts;
}

module.exports = { run };
