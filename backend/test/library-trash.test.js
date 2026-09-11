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

// Documenta el contrato que BUG A rompía en silencio: library.js seleccionaba
// `id, file_name` (sin storage_path/public_url) antes de llamar a
// findReferencedAssetIds, así que needles quedaba vacío para todos los
// assets y ninguno se marcaba como referenciado — cualquier imagen en uso
// podía trashearse. Ahora la función falla cerrado (lanza) en vez de fallar
// abierto (dejar pasar) cuando un asset no trae ninguno de los dos campos,
// para que un select incompleto como ese reviente en vez de desproteger.
test('extractReferencedAssetIds: lanza si un asset no trae storage_path ni public_url', () => {
  const assets = [{ id: 'a1', file_name: 'foto.jpg' }]
  const pages = [{ content_html: '<p>sin imágenes</p>' }]
  assert.throws(
    () => extractReferencedAssetIds(assets, pages),
    /storage_path ni public_url/
  )
})

// extractReferencedAssetIds es agnóstica del origen de cada content_html:
// solo le importa recibir un array de objetos con esa propiedad.
// findReferencedAssetIds (lib/assetReferences.js) le pasa el content_html de
// project_pages tal cual, pero cualquier llamador que combine varios arrays
// antes de invocarla debe seguir funcionando. Se testea acá al nivel de la
// función pura porque mockear supabaseAdmin es pesado (mismo criterio
// documentado en test/companies-create.test.js).
test('extractReferencedAssetIds: detecta referencias sin importar en qué array combinado aparecen', () => {
  const assets = [
    { id: 'a1', storage_path: '/companies/c/library/only-in-second-source.webp', public_url: null },
    { id: 'a2', storage_path: '/companies/c/library/unused.webp', public_url: null },
  ]
  const firstSource = [{ content_html: '<p>sin imágenes nuevas todavía</p>' }]
  const secondSource = [{ content_html: '<img src="/companies/c/library/only-in-second-source.webp">' }]
  const merged = [...firstSource, ...secondSource]
  assert.deepEqual([...extractReferencedAssetIds(assets, merged)], ['a1'])
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
