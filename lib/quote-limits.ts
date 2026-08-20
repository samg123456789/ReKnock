// Shared upload limits for quote intake, safe to import from both client and
// server (no "use server" boundary). Anthropic ceilings: ~5MB per image,
// 32MB / 100 pages per PDF. We downscale big photos client-side before upload.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 32 * 1024 * 1024;
export const MAX_FILES = 3;
// Long-edge px we downscale phone photos to before upload. Plenty for OCR.
export const IMAGE_MAX_EDGE = 1600;
