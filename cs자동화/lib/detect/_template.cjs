/**
 * Detector template — copy this to lib/detect/<name>.cjs, register it in
 * lib/watch/scheduler.cjs (the `detectors` map), add a `{ "detector": "<name>" ... }`
 * block to lib/detect/rules.json, and enable it in config.js → detectors.
 *
 * A detector exports `run(ruleSet, state)` and returns an array of alert objects.
 * It must:
 *   - degrade gracefully when its credentials/config are missing (return a single
 *     low-severity "config-missing" alert, deduped, instead of throwing);
 *   - never throw out of `run` for a transient API error — catch it and return a
 *     low-severity "api-error" alert;
 *   - keep state it needs (baselines, "already seen" markers) on the `state` object —
 *     the scheduler persists it to data/runs/watch-state.json between sweeps.
 *
 * Alert shape (only `source`, `signal`, `severity` are required):
 *   {
 *     source:    "<detector name>",
 *     signal:    "<machine-readable signal id, matches rules.json>",
 *     severity:  "low" | "medium" | "high" | "critical",
 *     message:   "human-readable one-liner",
 *     threshold: "what the limit was",          // optional, for the task body
 *     value:     "what we observed",            // optional
 *     routesTo:  "frontend-agent",              // optional; which agent the task goes to
 *     evidence:  { ...arbitrary JSON... }       // optional; gets dumped into the task
 *   }
 *
 * Example skeleton for "datadog" — replace with your monitoring of choice
 * (CloudWatch, Prometheus, a /healthz endpoint, a custom metrics API, …):
 */
const API_KEY = process.env.DATADOG_API_KEY || "";
const APP_KEY = process.env.DATADOG_APP_KEY || "";

async function run(ruleSet, state) {
  // 1. Config check — surface the gap once a day, don't crash.
  if (!API_KEY || !APP_KEY) {
    const k = "datadog:config-missing";
    if (state.alerts[k] && Date.now() - state.alerts[k] < 24 * 3600 * 1000) return [];
    return [{
      source: "datadog", signal: "config-missing", severity: "low",
      message: "DATADOG_API_KEY / DATADOG_APP_KEY not set — this detector is disabled.",
      threshold: "env present", value: "missing", routesTo: "orchestrator",
      evidence: { needs: ["DATADOG_API_KEY", "DATADOG_APP_KEY"] },
    }];
  }

  const alerts = [];
  try {
    // 2. Fetch a metric / query a log search / hit a health endpoint.
    //    const data = await fetch("https://api.datadoghq.com/api/v1/query?...", { headers: { "DD-API-KEY": API_KEY, "DD-APPLICATION-KEY": APP_KEY } }).then(r => r.json());

    // 3. Compare against a threshold (and/or a rolling baseline you keep on `state`).
    //    const baseline = state["datadog:baseline:errors"] || null;
    //    if (baseline && observed > baseline * 3) alerts.push({ source: "datadog", signal: "...", severity: "high", ... });
    //    state["datadog:baseline:errors"] = baseline ? baseline * 0.8 + observed * 0.2 : observed;

    // 4. Optional heartbeat (deduped, so the operator knows polling is alive).
  } catch (e) {
    return [{ source: "datadog", signal: "api-error", severity: "low", message: `Datadog API error: ${e.message}`, routesTo: "orchestrator", evidence: { error: e.message } }];
  }
  return alerts;
}

module.exports = { run };
