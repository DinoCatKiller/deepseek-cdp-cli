import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  ensurePrivateDirectory,
  writePrivateFileAtomically,
  writePrivateFileExclusively,
  withPrivateFileLock,
} from '../src/infrastructure/preferences/privateAtomicFile.js'

async function withTempDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'deepseek-private-atomic-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

void test('writePrivateFileAtomically persists content and creates the parent directory', async () => {
  await withTempDirectory(async directory => {
    const file = join(directory, 'nested', 'state.json')

    await writePrivateFileAtomically(file, '{"a":1}')

    assert.equal(await readFile(file, 'utf8'), '{"a":1}')
  })
})

void test('writePrivateFileAtomically replaces existing content without leaving temp files', async () => {
  await withTempDirectory(async directory => {
    const file = join(directory, 'state.json')
    await writeFile(file, 'stale', 'utf8')

    await writePrivateFileAtomically(file, 'fresh')

    assert.equal(await readFile(file, 'utf8'), 'fresh')
    assert.deepEqual(await readdir(directory), ['state.json'])
  })
})

void test('writePrivateFileAtomically surfaces the failure and leaves no temp file behind', async () => {
  await withTempDirectory(async directory => {
    await mkdir(join(directory, 'state.json'), { recursive: true })

    await assert.rejects(writePrivateFileAtomically(join(directory, 'state.json'), 'content'))

    assert.deepEqual(await readdir(directory), ['state.json'])
  })
})

void test('writePrivateFileExclusively refuses to overwrite an existing file', async () => {
  await withTempDirectory(async directory => {
    const file = join(directory, 'lock')
    await writePrivateFileExclusively(file, 'first')

    await assert.rejects(
      writePrivateFileExclusively(file, 'second'),
      (error: NodeJS.ErrnoException) => error.code === 'EEXIST',
    )
    assert.equal(await readFile(file, 'utf8'), 'first')
  })
})

void test('writePrivateFileExclusively persists content on a fresh path', async () => {
  await withTempDirectory(async directory => {
    const file = join(directory, 'fresh')

    await writePrivateFileExclusively(file, 'content')

    assert.equal(await readFile(file, 'utf8'), 'content')
  })
})

void test('withPrivateFileLock runs the action and removes the lock file afterwards', async () => {
  await withTempDirectory(async directory => {
    const lock = join(directory, 'nested', 'prefs.lock')

    const result = await withPrivateFileLock(lock, () => Promise.resolve('done'))

    assert.equal(result, 'done')
    assert.deepEqual(await readdir(join(directory, 'nested')), [])
  })
})

void test('withPrivateFileLock fails closed while another process holds the lock', async () => {
  await withTempDirectory(async directory => {
    const lock = join(directory, 'prefs.lock')

    await assert.rejects(
      withPrivateFileLock(lock, () =>
        withPrivateFileLock(lock, () => Promise.resolve(undefined))),
      /locked by another process/,
    )
  })
})

void test('ensurePrivateDirectory is idempotent', async () => {
  await withTempDirectory(async directory => {
    const target = join(directory, 'a', 'b')

    await ensurePrivateDirectory(target)
    await ensurePrivateDirectory(target)
  })
})