import path from 'node:path'
import ImageKit, { toFile } from '@imagekit/nodejs'

const {
  IMAGEKIT_PUBLIC_KEY,
  IMAGEKIT_PRIVATE_KEY,
  IMAGEKIT_URL_ENDPOINT,
} = process.env

if (!IMAGEKIT_PUBLIC_KEY || !IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_URL_ENDPOINT) {
  console.warn(
    'Missing IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, or IMAGEKIT_URL_ENDPOINT. Image uploads will fail until they are configured.'
  )
}

export const imagekit = new ImageKit({
  publicKey: IMAGEKIT_PUBLIC_KEY || 'missing-imagekit-public-key',
  privateKey: IMAGEKIT_PRIVATE_KEY || 'missing-imagekit-private-key',
  urlEndpoint: IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/missing-endpoint',
})

export function isImageKitConfigured() {
  return Boolean(IMAGEKIT_PUBLIC_KEY && IMAGEKIT_PRIVATE_KEY && IMAGEKIT_URL_ENDPOINT)
}

export function sanitizeFileName(fileName = 'file') {
  const baseName = path.basename(String(fileName || 'file')).trim() || 'file'
  return baseName.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

export function buildImageKitPath(...segments) {
  return `/${segments
    .filter(Boolean)
    .map((segment) => String(segment).replace(/^\/+|\/+$/g, ''))
    .join('/')}`
}

export function buildImageKitUrl(filePath, transformations = []) {
  const normalizedPath = buildImageKitPath(filePath)
  const transformation = transformations.length > 0
    ? [Object.fromEntries(
      transformations.map((entry) => {
        const [key, ...rest] = String(entry).split('-')
        return [key, rest.join('-')]
      })
    )]
    : undefined

  return imagekit.helper.buildSrc({
    urlEndpoint: IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/missing-endpoint',
    src: normalizedPath,
    transformation,
  })
}

export async function uploadToImageKit({
  buffer,
  fileName,
  folder,
  tags,
}) {
  if (!isImageKitConfigured()) {
    throw new Error('ImageKit no está configurado en el backend')
  }

  return imagekit.files.upload({
    file: await toFile(buffer, sanitizeFileName(fileName)),
    fileName: sanitizeFileName(fileName),
    folder,
    useUniqueFileName: false,
    overwriteFile: false,
    tags,
  })
}
