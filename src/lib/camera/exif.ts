/**
 * Lightweight pure-JS EXIF / APP1 segment injector for JPEG images.
 * Embeds capture timestamp, GPS coordinates, device info, and employee metadata into JPEG bytes.
 */

export interface ExifMetadata {
	date: Date;
	employeeNo: string;
	employeeName: string;
	punchType: 'in' | 'out';
	coords?: { lat: number; lng: number; accuracy?: number | null };
	locationText?: string;
}

/**
 * Format Date as EXIF standard: "YYYY:MM:DD HH:MM:SS"
 */
function toExifDateTime(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Convert decimal degrees into degrees/minutes/seconds rational triplets
 */
function toGpsDms(deg: number): [[number, number], [number, number], [number, number]] {
	const absolute = Math.abs(deg);
	const degrees = Math.floor(absolute);
	const minFloat = (absolute - degrees) * 60;
	const minutes = Math.floor(minFloat);
	const seconds = Math.round((minFloat - minutes) * 60 * 1000); // 1/1000th precision

	return [
		[degrees, 1],
		[minutes, 1],
		[seconds, 1000]
	];
}

/**
 * Inject EXIF APP1 segment into a JPEG Blob.
 */
export async function injectExif(jpegBlob: Blob, metadata: ExifMetadata): Promise<Blob> {
	const buffer = await jpegBlob.arrayBuffer();
	const bytes = new Uint8Array(buffer);

	// Verify JPEG SOI marker (0xFF, 0xD8)
	if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
		console.warn('[EXIF] Not a valid JPEG, skipping EXIF insertion');
		return jpegBlob;
	}

	try {
		const app1Bytes = buildApp1Segment(metadata);

		// Find insertion point (skip any existing APP0 or APP1 segment right after SOI)
		let offset = 2;
		while (offset < bytes.length - 4) {
			if (bytes[offset] !== 0xff) break;
			const marker = bytes[offset + 1];
			// If APP0 (0xE0) or APP1 (0xE1), check if we should skip past it
			if (marker === 0xe0 || marker === 0xe1) {
				const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
				offset += 2 + length;
			} else {
				break;
			}
		}

		// Construct new JPEG: SOI (2 bytes) + APP1 Segment + Remainder of original JPEG
		const newLength = 2 + app1Bytes.length + (bytes.length - offset);
		const out = new Uint8Array(newLength);
		out[0] = 0xff;
		out[1] = 0xd8;
		out.set(app1Bytes, 2);
		out.set(bytes.subarray(offset), 2 + app1Bytes.length);

		return new Blob([out.buffer], { type: 'image/jpeg' });
	} catch (err) {
		console.warn('[EXIF] Failed to inject EXIF segment:', err);
		return jpegBlob;
	}
}

/**
 * Builds the APP1 (0xFFE1) byte array containing the Exif header, TIFF header, IFD0, ExifIFD, and GPSIFD.
 */
function buildApp1Segment(meta: ExifMetadata): Uint8Array {
	const dateStr = toExifDateTime(meta.date) + '\0';
	const softwareStr = 'DTRCam v1.0\0';
	const userCommentStr = `Employee: ${meta.employeeName} (${meta.employeeNo}) | Type: ${meta.punchType.toUpperCase()} | Loc: ${meta.locationText || 'GPS'}\0`;

	// Memory buffer with byte writer helper
	const buf = new ArrayBuffer(2048);
	const view = new DataView(buf);
	let p = 0;

	// Marker 0xFFE1 + 2 bytes for length (filled at end)
	view.setUint8(p++, 0xff);
	view.setUint8(p++, 0xe1);
	const lenOffset = p;
	p += 2;

	// Exif\0\0 header (6 bytes)
	const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
	for (const b of exifHeader) view.setUint8(p++, b);

	const tiffStart = p;

	// TIFF Header (Little Endian: "II", 0x002A, offset 8 to IFD0)
	view.setUint8(p++, 0x49); // 'I'
	view.setUint8(p++, 0x49); // 'I'
	view.setUint16(p, 0x002a, true);
	p += 2;
	view.setUint32(p, 8, true); // Offset to IFD0 from tiffStart
	p += 2 + 2;

	// Data heap area starts after IFD entries
	// We will layout: IFD0 -> ExifIFD -> GPSIFD -> Data Values
	// Let's count entries for IFD0
	// Tags in IFD0:
	// 0x010E (ImageDescription) = 0x010E (ASCII)
	// 0x0131 (Software) = 0x0131 (ASCII)
	// 0x0132 (DateTime) = 0x0132 (ASCII)
	// 0x8769 (ExifIFDPointer) = 0x8769 (LONG)
	// 0x8825 (GPSIFDPointer) = 0x8825 (LONG) [if coords]

	const hasGps = !!meta.coords;
	const ifd0EntryCount = hasGps ? 5 : 4;

	view.setUint16(p, ifd0EntryCount, true);
	p += 2;

	// Placeholders for pointers to data
	const ifd0Start = p;
	p += ifd0EntryCount * 12 + 4; // 12 bytes per tag + 4 bytes next IFD offset (0)

	// Exif IFD
	const exifIfdOffset = p - tiffStart;
	const exifEntryCount = 2; // DateTimeOriginal (0x9003), UserComment (0x9286)
	view.setUint16(p, exifEntryCount, true);
	p += 2;
	const exifIfdStart = p;
	p += exifEntryCount * 12 + 4;

	// GPS IFD
	let gpsIfdOffset = 0;
	let gpsIfdStart = 0;
	if (hasGps) {
		gpsIfdOffset = p - tiffStart;
		const gpsEntryCount = 4; // GPSVersionID (0), GPSLatitudeRef (1), GPSLatitude (2), GPSLongitudeRef (3), GPSLongitude (4)
		view.setUint16(p, gpsEntryCount, true);
		p += 2;
		gpsIfdStart = p;
		p += gpsEntryCount * 12 + 4;
	}

	// Now append strings and values in the data section (p)
	function writeAscii(str: string): { offset: number; length: number } {
		const offset = p - tiffStart;
		for (let i = 0; i < str.length; i++) {
			view.setUint8(p++, str.charCodeAt(i));
		}
		if (p % 2 !== 0) p++; // Align
		return { offset, length: str.length };
	}

	function writeRationals(rationals: [number, number][]): { offset: number; count: number } {
		const offset = p - tiffStart;
		for (const [num, den] of rationals) {
			view.setUint32(p, num, true);
			p += 4;
			view.setUint32(p, den, true);
			p += 4;
		}
		return { offset, count: rationals.length };
	}

	const dateData = writeAscii(dateStr);
	const softData = writeAscii(softwareStr);
	const descData = writeAscii(`DTRCam Punch Record\0`);
	const commentData = writeAscii(userCommentStr);

	// Write IFD0 tags
	let tagPos = ifd0Start;
	function setTag(tag: number, type: number, count: number, valOrOffset: number) {
		view.setUint16(tagPos, tag, true);
		view.setUint16(tagPos + 2, type, true);
		view.setUint32(tagPos + 4, count, true);
		view.setUint32(tagPos + 8, valOrOffset, true);
		tagPos += 12;
	}

	// 0x010E ImageDescription (ASCII=2)
	setTag(0x010e, 2, descData.length, descData.offset);
	// 0x0131 Software
	setTag(0x0131, 2, softData.length, softData.offset);
	// 0x0132 DateTime
	setTag(0x0132, 2, dateData.length, dateData.offset);
	// 0x8769 Exif IFD Pointer (LONG=4)
	setTag(0x8769, 4, 1, exifIfdOffset);
	if (hasGps) {
		// 0x8825 GPS IFD Pointer
		setTag(0x8825, 4, 1, gpsIfdOffset);
	}
	view.setUint32(tagPos, 0, true); // Next IFD = 0

	// Write Exif IFD tags
	tagPos = exifIfdStart;
	// 0x9003 DateTimeOriginal
	setTag(0x9003, 2, dateData.length, dateData.offset);
	// 0x9286 UserComment
	setTag(0x9286, 2, commentData.length, commentData.offset);
	view.setUint32(tagPos, 0, true);

	// Write GPS IFD tags if coords exist
	if (hasGps && meta.coords) {
		tagPos = gpsIfdStart;
		const lat = meta.coords.lat;
		const lng = meta.coords.lng;
		const latDms = writeRationals(toGpsDms(lat));
		const lngDms = writeRationals(toGpsDms(lng));

		// 0x0001 GPSLatitudeRef ('N' or 'S')
		const latRefChar = lat >= 0 ? 'N\0' : 'S\0';
		const latRefVal = (latRefChar.charCodeAt(1) << 8) | latRefChar.charCodeAt(0);
		setTag(0x0001, 2, 2, latRefVal);

		// 0x0002 GPSLatitude (3 RATIONALs)
		setTag(0x0002, 5, 3, latDms.offset);

		// 0x0003 GPSLongitudeRef ('E' or 'W')
		const lngRefChar = lng >= 0 ? 'E\0' : 'W\0';
		const lngRefVal = (lngRefChar.charCodeAt(1) << 8) | lngRefChar.charCodeAt(0);
		setTag(0x0003, 2, 2, lngRefVal);

		// 0x0004 GPSLongitude (3 RATIONALs)
		setTag(0x0004, 5, 3, lngDms.offset);

		view.setUint32(tagPos, 0, true);
	}

	// Finalize APP1 segment length (payload size + 2 for length bytes)
	const app1PayloadLength = p - 2;
	view.setUint16(lenOffset, app1PayloadLength, false); // Big endian for JPEG marker lengths

	return new Uint8Array(buf, 0, p);
}
