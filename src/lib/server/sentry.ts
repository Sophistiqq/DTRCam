import * as Sentry from '@sentry/sveltekit';
import { SENTRY_DSN } from '$env/static/private';

export function initSentry() {
	if (SENTRY_DSN) {
		Sentry.init({
			dsn: SENTRY_DSN,
			tracesSampleRate: 1.0
		});
	}
}
