import adapter from '@sveltejs/adapter-node';
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
		sveltekit({
			adapter: adapter(),
			experimental: {
				instrumentation: {
					server: true
				}
			},
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			kit: {
				csrf: {
					checkOrigin: false
				}
			}
		})
	]
});
