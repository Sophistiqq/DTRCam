import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { addDebugClient, removeDebugClient } from '$lib/server/debug';

export const GET: RequestHandler = () => {
	if (!dev) {
		return new Response('Not found', { status: 404 });
	}

	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			addDebugClient(controller);

			// Greet the client immediately so they know the stream is live.
			const greeting =
				`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`;
			controller.enqueue(encoder.encode(greeting));
		},
		cancel(controller) {
			removeDebugClient(controller as ReadableStreamDefaultController<Uint8Array>);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': '*'
		}
	});
};
