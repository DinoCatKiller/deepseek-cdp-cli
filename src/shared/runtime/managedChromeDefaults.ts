import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type ChromePathProbe = (candidate: string) => boolean

export function resolveDefaultChromeExecutablePath(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  pathExists: ChromePathProbe = defaultPathExists,
): string | undefined {
  if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  }

  if (platform === 'win32') {
    return firstExisting(
      [
        chromeWindowsRelativePath(env['PROGRAMFILES']),
        chromeWindowsRelativePath(env['PROGRAMFILES(X86)']),
        chromeWindowsRelativePath(env['LOCALAPPDATA']),
      ],
      pathExists,
    )
  }

  if (platform === 'linux') {
    return 'google-chrome'
  }

  return undefined
}

export function resolveDefaultChromeUserDataDir(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  pathExists: ChromePathProbe = defaultPathExists,
): string | undefined {
  const home = env['HOME'] ?? env['USERPROFILE']

  if (platform === 'darwin') {
    return home ? join(home, 'Library', 'Application Support', 'Google', 'Chrome') : undefined
  }

  if (platform === 'win32') {
    return firstExisting(
      [
        chromeWindowsUserDataPath(env['LOCALAPPDATA']),
        chromeWindowsUserDataPath(env['PROGRAMFILES']),
        chromeWindowsUserDataPath(env['PROGRAMFILES(X86)']),
      ],
      pathExists,
    )
  }

  if (platform === 'linux') {
    return home ? join(home, '.config', 'google-chrome') : undefined
  }

  return undefined
}

function chromeWindowsRelativePath(root: string | undefined): string | undefined {
  return root
    ? `${root}\\Google\\Chrome\\Application\\chrome.exe`
    : undefined
}

function chromeWindowsUserDataPath(root: string | undefined): string | undefined {
  return root
    ? `${root}\\Google\\Chrome\\User Data`
    : undefined
}

function firstExisting(
  candidates: (string | undefined)[],
  pathExists: ChromePathProbe,
): string | undefined {
  for (const candidate of candidates) {
    if (candidate && pathExists(candidate)) {
      return candidate
    }
  }

  return undefined
}

function defaultPathExists(candidate: string): boolean {
  return existsSync(candidate)
}