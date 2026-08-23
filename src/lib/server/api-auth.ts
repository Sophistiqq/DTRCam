/**
 * API Key Authentication & Rate Limiting for Payroll REST API v1
 */

import crypto from 'node:crypto';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';

const API_PEPPER = process.env.API_PEPPER || 'dev-pepper-change-in-production';

/**
 * Hash an API key with HMAC-SHA256 using the server pepper
 */
export function hashApiKey(key: string): string {
	return crypto.createHmac('sha256', API_PEPPER).update(key.trim()).digest('hex');
}

/**
 * Generate a new random API key
 * Returns the plaintext key (to show once) and inserts the hashed record into the DB
 */
export async function createApiKey(label: string): Promise<{ id: string; key: string; label: string }> {
	const rawKey = `dtr_live_${crypto.randomBytes(24).toString('base64url')}`;
	const keyHash = hashApiKey(rawKey);

	const { data, error: dbError } = await supabaseAdmin
		.from('api_keys')
		.insert({
			label,
			key_hash: keyHash,
			is_active: true
		})
		.select('id, label')
		.single();

	if (dbError || !data) {
		throw new Error(`Failed to create API key: ${dbError?.message || 'Unknown database error'}`);
	}

	return {
		id: data.id,
		key: rawKey,
		label: data.label
	};
}

// In-memory rate limiting map: keyHash -> array of timestamps
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 120;
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(keyHash: string): boolean {
	const now = Date.now();
	const windowStart = now - RATE_LIMIT_WINDOW_MS;

	const timestamps = (rateLimitMap.get(keyHash) || []).filter((t) => t > windowStart);
	if (timestamps.length >= MAX_REQUESTS_PER_MINUTE) {
		return false;
	}

	timestamps.push(now);
	rateLimitMap.set(keyHash, timestamps);
	return true;
}

/**
 * Validate incoming X-API-Key header against the api_keys table
 */
export async function requireApiKey(request: Request): Promise<{ id: string; label: string }> {
	const apiKeyHeader = request.headers.get('x-api-key') || request.headers.get('X-API-Key');

	if (!apiKeyHeader) {
		throw error(401, {
			message: 'Unauthorized: Missing X-API-Key header'
		});
	}

	const keyHash = hashApiKey(apiKeyHeader);

	if (!checkRateLimit(keyHash)) {
		throw error(429, {
			message: 'Too Many Requests: Rate limit exceeded (120 req/min)'
		});
	}

	const { data: keyRecord, error: dbError } = await supabaseAdmin
		.from('api_keys')
		.select('id, label, is_active')
		.eq('key_hash', keyHash)
		.single();

	if (dbError || !keyRecord || !keyRecord.is_active) {
		throw error(401, {
			message: 'Unauthorized: Invalid or revoked API key'
		});
	}

	// Update last_used_at in background
	supabaseAdmin
		.from('api_keys')
		.update({ last_used_at: new Date().toISOString() })
		.eq('id', keyRecord.id)
		.then();

	return {
		id: keyRecord.id,
		label: keyRecord.label
	};
}

/**
 * Generate ETag from JSON string or object
 */
export function generateEtag(data: unknown): string {
	const str = typeof data === 'string' ? data : JSON.stringify(data);
	return `"${crypto.createHash('md5').update(str).digest('hex')}"`;
}
