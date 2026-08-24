import { handleErrorWithSentry, replayIntegration } from '@sentry/sveltekit';
import * as Sentry from '@sentry/sveltekit';
import { PUBLIC_SENTRY_DSN } from '$env/static/public';

if (PUBLIC_SENTRY_DSN) {
	Sentry.init({
		dsn: PUBLIC_SENTRY_DSN,
		tracesSampleRate: 0.1,
		integrations: [replayIntegration()],
		replaysSessionSampleRate: 0.1,
		replaysOnErrorSampleRate: 1.0
	});
}

export const handleError = handleErrorWithSentry();
