/**
 * Build-time environment variables inlined by
 * babel-plugin-transform-inline-environment-variables. Only the variables
 * listed in babel.config.js are substituted; every other `process.env`
 * reference is left untouched, so this declaration is intentionally narrow
 * rather than pulling in the full Node typings.
 */
declare const process: {
  env: {
    BAMBUDDY_DEMO_URL?: string;
    BAMBUDDY_DEMO_USERNAME?: string;
    BAMBUDDY_DEMO_PASSWORD?: string;
  };
};
