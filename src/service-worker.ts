/// <reference types="@sveltejs/kit" />
/// <reference no-default_lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

import { build, files, version } from '$service-worker';

const CACHE_NAME = `dtrcam-cache-${version}`;
const ASSETS_TO_CACHE = [...build, ...files];

// Pages to eagerly cache during install for offline camera availability
const OFFLINE_PAGES = ['/cam', '/login', '/punch', '/'];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll([...ASSETS_TO_CACHE, ...OFFLINE_PAGES]))
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

				// 2. Standalone camera — works without auth, the core offline feature
				const cachedCam = await cache.match('/cam');
				if (cachedCam) return cachedCam;

				// 3. Cached /punch page (if previously visited while logged in)
				const cachedPunch = await cache.match('/punch');
				if (cachedPunch) return cachedPunch;

				// 4. Cached root /
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
