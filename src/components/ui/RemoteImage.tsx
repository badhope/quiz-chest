import { Link } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'

/**
 * 题库里的图片可能来自导入文件，是不可信输入。
 *
 * data: 内嵌图片随题库一起走，不会泄露访问行为，直接放行；
 * http(s) 外链会在加载时把「这台机器正在看哪道题」告诉第三方服务器。
 * 因此默认只显示占位条，用户明确打开「允许远程图片」后才真正请求。
 */
export function RemoteImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const allowed = useAppStore((state) => state.settings.allowRemoteImages)
  const remote = /^https?:/i.test(src)
  const embedded = /^data:image\//i.test(src)

  if (remote && !allowed) {
    return (
      <span className={`remote-image-blocked${className ? ` ${className}` : ''}`}>
        远程图片已拦截
        <Link to="/settings">去设置里允许</Link>
      </span>
    )
  }

  if (!remote && !embedded) {
    // 既不是 data:image 也不是 http(s)，不渲染，避免 javascript: / file: 之类的伪协议。
    return null
  }

  return <img className={className} src={src} alt={alt} loading="lazy" />
}
