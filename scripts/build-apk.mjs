#!/usr/bin/env node
/**
 * Android debug APK 构建。
 *
 * `cap sync` 只负责把 dist/ 和插件同步进 android/，真正编译 APK 的是 Gradle。
 * 这个脚本把两件事接起来，避免 `build:apk` 只是同步完就去找一个并不存在的旧产物。
 *
 * 环境要求：
 *   - Android SDK，且装有 platforms/android-36（compileSdk 见 android/variables.gradle）
 *   - JDK 21（Capacitor 8 的 Java 源码按 21 编译，JDK 17 会报 invalid source release: 21）
 *
 * 可用 JAVA_HOME / ANDROID_HOME 显式指定；未指定时会在常见安装目录里找。
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'

function javaMajor(home) {
  const release = join(home, 'release')
  if (!existsSync(release)) return 0
  const match = readFileSync(release, 'utf8').match(/JAVA_VERSION="(\d+)/)
  return match ? Number(match[1]) : 0
}

function findJava() {
  const candidates = [process.env.JAVA_HOME]
  const toolsDir = join(homedir(), 'tools')
  if (existsSync(toolsDir)) {
    for (const name of readdirSync(toolsDir)) {
      if (/^jdk(-?21|21)/i.test(name) || /^jdk-21/i.test(name)) {
        candidates.push(join(toolsDir, name))
      }
    }
  }
  const jvmDir = '/usr/lib/jvm'
  if (existsSync(jvmDir)) {
    for (const name of readdirSync(jvmDir)) {
      if (/^java-21/i.test(name)) candidates.push(join(jvmDir, name))
    }
  }
  for (const home of candidates) {
    if (!home) continue
    const java = join(home, 'bin', isWindows ? 'java.exe' : 'java')
    if (existsSync(java) && javaMajor(home) >= 21) return home
  }
  throw new Error(
    '找不到 JDK 21。Capacitor 8 的 Java 源码按 21 编译，JDK 17 会报 invalid source release: 21。\n' +
      '请安装 JDK 21 并设置 JAVA_HOME，例如：export JAVA_HOME=/path/to/jdk-21',
  )
}

function findAndroidSdk() {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]
  candidates.push(
    join(homedir(), 'android-sdk'),
    join(homedir(), 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    '/usr/lib/android-sdk',
    '/opt/android-sdk',
    'C:\\Dev\\android-sdk',
  )
  for (const home of candidates) {
    if (!home) continue
    const platform = join(home, 'platforms', 'android-36')
    const buildTools = join(home, 'build-tools')
    if (existsSync(platform) && existsSync(buildTools)) return home
  }
  throw new Error(
    '找不到含 platforms/android-36 的 Android SDK。\n' +
      '请用 sdkmanager 安装 platforms;android-36 与 build-tools;36.0.0，并设置 ANDROID_HOME。',
  )
}

const javaHome = findJava()
const androidHome = findAndroidSdk()
const androidDir = join(root, 'android')
const gradlew = join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew')

if (!isWindows && existsSync(gradlew)) {
  try {
    execFileSync('chmod', ['+x', gradlew])
  } catch {
    // 权限已正确或文件系统不支持 chmod 时，交给下面的实际执行报错。
  }
}

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  PATH: `${join(javaHome, 'bin')}${isWindows ? ';' : ':'}${process.env.PATH ?? ''}`,
}

console.log(`JDK：${javaHome}`)
console.log(`Android SDK：${androidHome}`)
console.log('\n=== gradle assembleDebug ===\n')

try {
  execFileSync(gradlew, ['assembleDebug', '--no-daemon'], {
    cwd: androidDir,
    env,
    stdio: 'inherit',
  })
} catch {
  process.exit(1)
}

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const source = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
if (!existsSync(source)) {
  console.error(`Gradle 结束但找不到 APK：${source}`)
  process.exit(1)
}

const artifactsDir = join(root, 'artifacts')
mkdirSync(artifactsDir, { recursive: true })
const target = join(artifactsDir, `quizchest-${version}-debug.apk`)
copyFileSync(source, target)
console.log(`\nAPK 已归档：${target}（${(statSync(target).size / 1024 / 1024).toFixed(1)} MB）`)

execFileSync(process.execPath, [join(root, 'scripts', 'verify-apk.mjs'), target], {
  stdio: 'inherit',
})
