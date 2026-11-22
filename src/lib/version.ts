/**
 * 应用版本的唯一运行时来源。
 *
 * `package.json` 是版本号的 single source of truth，构建期由 Vite `define`
 * 注入为 `__APP_VERSION__`。原生壳（Tauri / Capacitor）与 Web 共享同一份值，
 * 避免多处手写版本号漂移。发布流程见 docs/RELEASING.md。
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'

/** 形如 `1.3.7` 的稳定版；带 `-` 后缀的是预发布版本。 */
export function isStableVersion(version: string = APP_VERSION): boolean {
  return /^\d+\.\d+\.\d+$/.test(version)
}

/** 展示用版本标签，稳定版与预发布版统一加 `v` 前缀。 */
export function versionLabel(version: string = APP_VERSION): string {
  return `v${version}`
}
