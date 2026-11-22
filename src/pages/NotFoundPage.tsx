import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="not-found">
      <span className="not-found-code mono serif">404</span>
      <h1 className="serif">这一页没有收录在题库里</h1>
      <p>地址可能已变更，或题目已被调整。回到学习台继续。</p>
      <Link to="/" className="button button-primary">
        返回学习台
      </Link>
    </div>
  )
}
