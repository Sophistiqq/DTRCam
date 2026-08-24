/**
 * Cryptographic helpers using browser Web Crypto API (SubtleCrypto).
 */

/**
 * Compute hex-encoded SHA-256 hash of an ArrayBuffer or Uint8Array.
 */
export async function computeSha256(data: ArrayBuffer | Uint8Array): Promise<string> {
	const buffer = data instanceof Uint8Array ? (data.buffer as ArrayBuffer) : data;
	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute hex-encoded SHA-256 hash of a Blob.
 */
export async function computeBlobSha256(blob: Blob): Promise<string> {
	const arrayBuffer = await blob.arrayBuffer();
	return computeSha256(arrayBuffer);
}
