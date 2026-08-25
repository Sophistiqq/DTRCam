import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// ponytail: unauthenticated keep-alive ping target; add auth only if it starts leaking internals
export const GET: RequestHandler = async () => {
	return json(
		{ status: 'ok', uptime: Math.round(process.uptime()) },
		{
			headers: {
				'Cache-Control': 'no-store, no-cache, must-revalidate'
			}
		}
	);
};
