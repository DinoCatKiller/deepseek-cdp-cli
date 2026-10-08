import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import {
  resolveDefaultChromeExecutablePath,
  resolveDefaultChromeUserDataDir,
} from '../src/shared/runtime/managedChromeDefaults.js'

const neverExists = (): boolean => false

void test('resolveDefaultChromeExecutablePath keeps the fixed macOS binary path', () => {
  assert.equal(
    resolveDefaultChromeExecutablePath('darwin', {}, neverExists),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  )
})

void test('resolveDefaultChromeExecutablePath resolves the linux binary name', () => {
  assert.equal(
    resolveDefaultChromeExecutablePath('linux', {}, neverExists),
    'google-chrome',
  )
})

void test('resolveDefaultChromeExecutablePath returns undefined for unsupported platforms', () => {
  assert.equal(resolveDefaultChromeExecutablePath('freebsd', {}, neverExists), undefined)
})

void test('resolveDefaultChromeExecutablePath prefers Program Files on win32', () => {
  const env = {
    PROGRAMFILES: 'C:\\Program Files',
    'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
  }

  assert.equal(
    resolveDefaultChromeExecutablePath('win32', env, candidate =>
      candidate === 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  )
})

void test('resolveDefaultChromeExecutablePath falls back to Program Files (x86) on win32', () => {
  const env = {
    PROGRAMFILES: 'C:\\Program Files',
    'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
  }

  assert.equal(
    resolveDefaultChromeExecutablePath('win32', env, candidate =>
      candidate === 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  )
})

void test('resolveDefaultChromeExecutablePath falls back to LOCALAPPDATA on win32', () => {
  const env = {
    PROGRAMFILES: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
  }

  assert.equal(
    resolveDefaultChromeExecutablePath('win32', env, candidate =>
      candidate === 'C:\\Users\\tester\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Users\\tester\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  )
})

void test('resolveDefaultChromeExecutablePath returns undefined when no win32 candidate exists', () => {
  const env = {
    PROGRAMFILES: 'C:\\Program Files',
    LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
  }

  assert.equal(resolveDefaultChromeExecutablePath('win32', env, neverExists), undefined)
})

void test('resolveDefaultChromeUserDataDir prefers LOCALAPPDATA on win32', () => {
  const env = {
    PROGRAMFILES: 'C:\\Program Files',
    'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local',
  }

  assert.equal(
    resolveDefaultChromeUserDataDir('win32', env, candidate =>
      candidate === 'C:\\Users\\tester\\AppData\\Local\\Google\\Chrome\\User Data'),
    'C:\\Users\\tester\\AppData\\Local\\Google\\Chrome\\User Data',
  )
})

void test('resolveDefaultChromeUserDataDir resolves the macOS support directory', () => {
  const env = { HOME: '/Users/tester' }

  assert.equal(
    resolveDefaultChromeUserDataDir('darwin', env, neverExists),
    join('/Users/tester', 'Library', 'Application Support', 'Google', 'Chrome'),
  )
})

void test('resolveDefaultChromeUserDataDir resolves the linux config directory', () => {
  const env = { HOME: '/home/tester' }

  assert.equal(
    resolveDefaultChromeUserDataDir('linux', env, neverExists),
    join('/home/tester', '.config', 'google-chrome'),
  )
})

void test('resolveDefaultChromeUserDataDir falls back to USERPROFILE when HOME is missing', () => {
  assert.equal(
    resolveDefaultChromeUserDataDir('linux', { USERPROFILE: 'C:\\Users\\tester' }, neverExists),
    join('C:\\Users\\tester', '.config', 'google-chrome'),
  )
})

void test('the default probe resolves a real win32 Chrome layout without an injected probe', async () => {
  const localAppData = await mkdtemp(join(tmpdir(), 'deepseek-chrome-defaults-'))
  const chromeDirectory = join(localAppData, 'Google', 'Chrome', 'Application')
  try {
    await mkdir(chromeDirectory, { recursive: true })
    await writeFile(join(chromeDirectory, 'chrome.exe'), '', 'utf8')

    assert.equal(
      resolveDefaultChromeExecutablePath('win32', { LOCALAPPDATA: localAppData }),
      join(chromeDirectory, 'chrome.exe'),
    )
    assert.equal(
      resolveDefaultChromeUserDataDir('win32', { LOCALAPPDATA: localAppData }),
      undefined,
    )

    await mkdir(join(localAppData, 'Google', 'Chrome', 'User Data'), { recursive: true })
    assert.equal(
      resolveDefaultChromeUserDataDir('win32', { LOCALAPPDATA: localAppData }),
      join(localAppData, 'Google', 'Chrome', 'User Data'),
    )
  } finally {
    await rm(localAppData, { recursive: true, force: true })
  }
})