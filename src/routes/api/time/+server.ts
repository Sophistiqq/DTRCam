import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const now = Date.now();
	return json(
		{
			server_time: now,
			iso: new Date(now).toISOString()
		},
		{
			headers: {
				'Cache-Control': 'no-store, no-cache, must-revalidate',
				Pragma: 'no-cache'
			}
		}
	);
};
