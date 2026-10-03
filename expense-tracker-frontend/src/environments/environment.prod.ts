/**
 * Production build (replaces environment.ts via angular.json fileReplacements).
 * Locally: Angular on :4300 talks to the Production API on :5200.
 * When you deploy, change apiUrl to your public API address, e.g. https://api.yourdomain.com/api/v1
 */
export const environment = {
  production: true,
  name: 'production',
  apiUrl: 'http://localhost:5200/api/v1',
};
