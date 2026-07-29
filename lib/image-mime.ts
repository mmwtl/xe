const DECLARED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function detectImageMimeType(
  bytes: Uint8Array,
  declaredType: string,
): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 4) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brands = ascii(bytes, 8, Math.min(bytes.length, 48));
    if (/(heic|heix|hevc|hevx)/.test(brands)) {
      return "image/heic";
    }
    if (/(mif1|msf1)/.test(brands)) {
      return "image/heif";
    }
  }

  const normalizedDeclaredType = declaredType
    .toLowerCase()
    .split(";", 1)[0]
    .trim();
  return DECLARED_IMAGE_TYPES.has(normalizedDeclaredType)
    ? normalizedDeclaredType
    : null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
