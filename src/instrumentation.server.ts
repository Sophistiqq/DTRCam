import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/private';

if (env.SENTRY_DSN) {
	Sentry.init({
		dsn: env.SENTRY_DSN,
		tracesSampleRate: 0.1,
		enableLogs: true
	});
}
