import type {AnalyticsConfig, AnalyticsEnvironment} from './types';
/** Optional diagnostics must never stop the game gateway when unconfigured. */
export function analyticsConfig(env: NodeJS.ProcessEnv): AnalyticsConfig {
  if (env.FACTORY_ANALYTICS_ENABLED !== 'true') return {enabled: false};
  const captureOrigin = env.FACTORY_POSTHOG_CAPTURE_ORIGIN;
  const projectToken = env.FACTORY_POSTHOG_PROJECT_TOKEN || '';
  const pseudonymKey = env.FACTORY_ANALYTICS_HMAC_KEY || '';
  const environment = env.FACTORY_ANALYTICS_ENVIRONMENT;
  const release = env.FACTORY_ANALYTICS_RELEASE || '';
  if (!['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(captureOrigin || '') ||
      !/^phc_[A-Za-z0-9_-]{10,200}$/.test(projectToken) || pseudonymKey.length < 32 ||
      pseudonymKey.length > 512 || !['development', 'test', 'staging', 'production'].includes(environment || '') ||
      !/^[a-f0-9]{40}$/.test(release)) return {enabled: false};
  return {enabled: true, captureOrigin: captureOrigin as 'https://us.i.posthog.com' | 'https://eu.i.posthog.com',
    projectToken, pseudonymKey, environment: environment as AnalyticsEnvironment, release};
}
