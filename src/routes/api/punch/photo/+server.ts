import { json, type RequestHandler } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ locals, url, request }) => {
	const { profile } = locals;
	if (!profile || !profile.is_active) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const punchId = url.searchParams.get('id');
	if (!punchId) {
		return json({ error: 'Missing punch id parameter' }, { status: 400 });
	}

	// Retrieve punch record to check permissions and get photo_path
	const { data: punch, error: dbError } = await supabaseAdmin
		.from('punches')
		.select('id, employee_id, photo_path, payload_sha256')
		.eq('id', punchId)
		.single();

	if (dbError || !punch) {
		return json({ error: 'Punch not found' }, { status: 404 });
	}

	// Verify that the user is the owner of the punch or an admin
	if (profile.role !== 'admin' && punch.employee_id !== profile.id) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	if (!punch.photo_path) {
		return json({ error: 'No photo attached to this record' }, { status: 404 });
	}

	// Check client ETag cache
	const ifNoneMatch = request.headers.get('if-none-match');
	if (punch.payload_sha256 && ifNoneMatch === punch.payload_sha256) {
		return new Response(null, { status: 304 });
	}

	// Download photo blob from Supabase storage
	const { data: fileBlob, error: storageError } = await supabaseAdmin.storage
		.from('punch-media')
		.download(punch.photo_path);

	if (storageError || !fileBlob) {
		console.warn(`[API /punch/photo] Storage download failed for path ${punch.photo_path}:`, storageError);
		return json({ error: 'Failed to download photo from storage' }, { status: 502 });
	}

	const headers = new Headers({
		'Content-Type': 'image/jpeg',
		'Cache-Control': 'private, max-age=86400',
	});

	if (punch.payload_sha256) {
		headers.set('ETag', punch.payload_sha256);
	}

	return new Response(fileBlob, {
		status: 200,
		headers
	});
};
