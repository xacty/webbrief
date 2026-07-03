import { z } from 'zod';

// Mirrors backend normalizeExportOptions / normalizeExportPreset
// (backend/src/routes/projects.js) and buildImageKitTransformations
// (backend/src/lib/imagekit.js). Keep enums in sync with those helpers.

export const exportPreset = z.enum(['original', 'web', 'jpg', 'png']);

export const exportFormat = z.enum(['webp', 'jpg', 'jpeg', 'png', 'avif', 'auto']);

export const exportFit = z.enum(['at_max', 'at_least', 'maintain_ratio', 'force']);

export const exportCropMode = z.enum(['extract', 'pad_extract', 'pad_resize']);

export const exportFocus = z.enum([
  'center', 'top', 'left', 'bottom', 'right',
  'top_left', 'top_right', 'bottom_left', 'bottom_right',
  'auto', 'face',
]);

// Shared transformation fields for export / convert tools. All optional —
// the backend applies preset defaults and ignores what is missing.
export const exportOptionsShape = {
  preset: exportPreset
    .optional()
    .describe("Quick preset: 'web' (1600px WebP q85), 'jpg' (2400px q90), 'png' (2400px), 'original' (no transform). Explicit fields below override the preset."),
  format: exportFormat
    .optional()
    .describe("Output format conversion (webp/jpg/png/avif, or 'auto' to let the CDN pick)."),
  quality: z.number().int().min(1).max(100)
    .optional()
    .describe('Compression quality 1-100 (lossy formats).'),
  width: z.number().int().min(1).max(10000)
    .optional()
    .describe('Target width in px (with cropMode=extract: width of the cropped region).'),
  height: z.number().int().min(1).max(10000)
    .optional()
    .describe('Target height in px (with cropMode=extract: height of the cropped region).'),
  fit: exportFit
    .optional()
    .describe("Resize strategy when width/height are set: 'at_max' (never upscale, keep ratio), 'at_least', 'maintain_ratio', 'force'."),
  cropMode: exportCropMode
    .optional()
    .describe("Cropping: 'extract' cuts an exact region (width/height = region size, x/y = top-left corner), 'pad_extract'/'pad_resize' pad instead of cutting."),
  x: z.number().int().min(0)
    .optional()
    .describe('Left offset in px of the crop region (cropMode=extract).'),
  y: z.number().int().min(0)
    .optional()
    .describe('Top offset in px of the crop region (cropMode=extract).'),
  focus: exportFocus
    .optional()
    .describe("Re-frame automatic crops: 'center', 'face', 'auto', or an edge/corner."),
  fileName: z.string().min(1).max(80)
    .optional()
    .describe('Base name for the exported file(s); extension is derived from the format.'),
};

// One export target: reference an asset by its UUID (preferred, from
// assets_list) or by the image src URL embedded in page content.
export const exportItem = z
  .object({
    assetId: z.string().uuid().optional().describe('project_assets UUID (from assets_list)'),
    src: z.string().url().optional().describe('Image URL as it appears in page contentHtml'),
  })
  .refine((item) => Boolean(item.assetId || item.src), {
    message: 'Each item needs assetId or src',
  });
