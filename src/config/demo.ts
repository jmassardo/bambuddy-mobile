// Configuration for the optional one-tap demo instance.
//
// These values are injected at bundle time by
// babel-plugin-transform-inline-environment-variables (see babel.config.js)
// from CI secrets, so no credentials live in this repository. When the
// variables are absent the references below inline to `undefined`, the demo
// is reported as unconfigured, and the UI hides the demo entry point.

const url = process.env.BAMBUDDY_DEMO_URL ?? '';
const username = process.env.BAMBUDDY_DEMO_USERNAME ?? '';
const password = process.env.BAMBUDDY_DEMO_PASSWORD ?? '';

export const demoConfig = {
  url: url.replace(/\/+$/, ''),
  username,
  password,
} as const;

/**
 * True only when a complete demo configuration was baked into this build.
 * Callers must check this before showing any demo affordance.
 */
export function isDemoConfigured(): boolean {
  return Boolean(demoConfig.url && demoConfig.username && demoConfig.password);
}
