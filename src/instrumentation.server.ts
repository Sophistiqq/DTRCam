import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/private';

if (env.SENTRY_DSN) {
	Sentry.init({
		dsn: env.SENTRY_DSN,
		tracesSampleRate: 1.0,
		enableLogs: true
	});
}
