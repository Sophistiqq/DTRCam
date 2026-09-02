import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		csrf: {
			// ponytail: disable origin check behind reverse proxy; re-enable when HTTPS is available
			checkOrigin: false
		}
	}
};

export default config;
