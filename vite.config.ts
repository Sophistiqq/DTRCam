import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import basicSsl from '@vitejs/plugin-basic-ssl';

const sentryEnabled = process.env.SENTRY_ORG && process.env.SENTRY_PROJECT && process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
	server: {
		host: true
	},
	plugins: [
		basicSsl(),
		...(sentryEnabled
			? [
					sentrySvelteKit({
						sourceMapsUploadOptions: {
							org: process.env.SENTRY_ORG,
							project: process.env.SENTRY_PROJECT,
							authToken: process.env.SENTRY_AUTH_TOKEN
						}
					})
				]
			: []),
		sveltekit()
	]
});
