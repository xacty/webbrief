import assert from 'node:assert/strict'
import { test } from 'node:test'

import { extractReferencedAssetIds } from '../src/lib/assetReferences.js'
import { partitionTrashableAssets, collectFolderSubtreeIds, validateAssetFileName } from '../src/routes/library.js'

test('extractReferencedAssetIds: detecta storage_path y public_url en html', () => {
  const assets = [
    { id: 'a1', storage_path: '/companies/c/library/x.webp', public_url: 'https://ik.io/co/companies/c/library/x.webp' },
    { id: 'a2', storage_path: '/companies/c/library/y.webp', public_url: null },
  ]
  const pages = [{ content_html: '<img src="https://ik.io/co/companies/c/library/x.webp?tr=w-800">' }]
  assert.deepEqual([...extractReferencedAssetIds(assets, pages)], ['a1'])
})

test('partitionTrashableAssets: separa referenciados', () => {
  const out = partitionTrashableAssets({
    assets: [{ id: 'a1' }, { id: 'a2' }],
    referencedIds: new Set(['a1']),
  })
  assert.deepEqual(out.trashable.map((a) => a.id), ['a2'])
  assert.deepEqual(out.kept, [{ id: 'a1', reason: 'referenced' }])
})

// Cobertura adicional (no pedida explícitamente por el plan, pero necesaria
// para la papelera de carpetas en cascada: recorrer carpeta + descendientes).
test('collectFolderSubtreeIds: incluye la carpeta y todos sus descendientes', () => {
  const folders = [
    { id: 'a', parent_folder_id: null },
    { id: 'b', parent_folder_id: 'a' },
    { id: 'c', parent_folder_id: 'b' },
    { id: 'd', parent_folder_id: null },
  ]
  assert.deepEqual(new Set(collectFolderSubtreeIds(folders, 'a')), new Set(['a', 'b', 'c']))
  assert.deepEqual(collectFolderSubtreeIds(folders, 'd'), ['d'])
  assert.deepEqual(collectFolderSubtreeIds(folders, 'nonexistent'), ['nonexistent'])
})

// Cobertura adicional para el rename de assets (PATCH /assets/:assetId),
// simétrica a validateFolderName ya testeado en library-folders.test.js.
test('validateAssetFileName: recorta, limita a 255, rechaza vacío', () => {
  assert.equal(validateAssetFileName('  foto.jpg  '), 'foto.jpg')
  assert.equal(validateAssetFileName(''), null)
  assert.equal(validateAssetFileName('x'.repeat(300))?.length, 255)
})
