/**
 * 等待条件成立（轮询到超时）。
 *
 * 为什么不用固定的 `setTimeout(0)`：写操作是异步落库的，固定延时在高负载
 * 的 CI 上不够用，会变成间歇性失败的假阳性。轮询到条件成立才断言，
 * 才是对「最终会一致」这件事的正确表达。
 */
export async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const { timeoutMs = 2000, intervalMs = 5, label = '条件' } = options
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await predicate()) return
    if (Date.now() >= deadline) {
      throw new Error(`等待${label}超时（${timeoutMs}ms）`)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
