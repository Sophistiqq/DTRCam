/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

import { build, files, version } from '$service-worker';

const CACHE_NAME = `dtrcam-cache-${version}`;
const ASSETS_TO_CACHE = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(ASSETS_TO_CACHE))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.map((key) => {
						if (key !== CACHE_NAME) {
							return caches.delete(key);
						}
					})
				)
			)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Bypass non-GET requests and API calls (let sync engine handle API queueing)
	if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
		return;
	}

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE_NAME);

			// For static build assets, serve cache-first
			if (ASSETS_TO_CACHE.includes(url.pathname)) {
				const cachedResponse = await cache.match(event.request);
				if (cachedResponse) return cachedResponse;
			}

			// For pages/navigation, try network first, then fall back to cached page or shell
			try {
				const networkResponse = await fetch(event.request);
				if (networkResponse.ok && event.request.url.startsWith('http')) {
					cache.put(event.request, networkResponse.clone());
				}
				return networkResponse;
			} catch {
				// 1. Direct page match from previous visits
				const cachedPage = await cache.match(event.request);
				if (cachedPage) return cachedPage;

				// 2. Cached /punch page
				const cachedPunch = await cache.match('/punch');
				if (cachedPunch) return cachedPunch;

				// 3. Cached root /
				const fallback = await cache.match('/');
				if (fallback) return fallback;

				return new Response('Offline - DTRCam is running without network connection.', {
					status: 503,
					headers: { 'Content-Type': 'text/plain' }
				});
			}
		})()
	);
});
