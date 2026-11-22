import { NavLink, useLocation } from 'react-router-dom'

import { goals } from '../../data/goals'
import { useAppStore } from '../../store/useAppStore'
import { useBrand } from '../../hooks/useBrand'
import { streakFromDates } from '../../lib/quiz'
import {
  BarChart3,
  Bookmark,
  Flame,
  House,
  Layers,
  LayoutGrid,
  Library,
  ListChecks,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
} from '../ui/icons'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const wrongCount = useAppStore((state) => Object.keys(state.wrongBook).length)
  const favoriteCount = useAppStore((state) => state.favorites.length)
  const bankCount = useAppStore((state) => state.banks.length)
  const daily = useAppStore((state) => state.daily)
  const streak = streakFromDates(Object.keys(daily))
  const brand = useBrand()

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="主导航">
      <NavLink to="/" className="brand" onClick={onClose}>
        <span className="brand-mark serif">{brand.logoMark}</span>
        <span className="brand-text">
          <span className="brand-name">{brand.productName}</span>
          <span className="brand-sub">{brand.productEn}</span>
        </span>
      </NavLink>

      <nav className="nav-group">
        <span className="nav-label">开始</span>
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <House />
          学习台
        </NavLink>
        <NavLink
          to="/goals"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Target />
          目标方案
          <span className="nav-count">{goals.length}</span>
        </NavLink>
        <NavLink
          to="/strategy/daily"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Sparkles />
          练习策略
        </NavLink>
        <NavLink
          to="/catalog"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Library />
          题库总览
        </NavLink>
        <NavLink
          to="/library"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Upload />
          我的题库
          {bankCount > 0 ? <span className="nav-count">{bankCount}</span> : null}
        </NavLink>
        <NavLink
          to="/compose"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Layers />
          自定义组卷
        </NavLink>
      </nav>

      <nav className="nav-group">
        <span className="nav-label">我的</span>
        <NavLink
          to="/wrong"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Target />
          错题本
          {wrongCount > 0 ? <span className="nav-count">{wrongCount}</span> : null}
        </NavLink>
        <NavLink
          to="/favorites"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Bookmark />
          我的收藏
          {favoriteCount > 0 ? <span className="nav-count">{favoriteCount}</span> : null}
        </NavLink>
        <NavLink
          to="/stats"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <BarChart3 />
          学习统计
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <ListChecks />
          练习记录
        </NavLink>
      </nav>

      <div className="sidebar-foot">
        <div className="streak-card">
          <span className="streak-flame">
            <Flame />
          </span>
          <span className="streak-text">
            <strong>{streak > 0 ? `${streak} 天连续练习` : '今天开始打卡'}</strong>
            <span>{streak > 0 ? '保持节奏，别断档' : '完成一组题即可点亮'}</span>
          </span>
        </div>
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Settings />
          设置
        </NavLink>
        <p className="sidebar-note">
          <LayoutGrid style={{ width: 11, height: 11, verticalAlign: '-1px' }} /> {brand.footerNote}
        </p>
      </div>
    </aside>
  )
}

export function MobileNav() {
  const { pathname } = useLocation()
  const items = [
    { to: '/', label: '学习台', icon: House, match: pathname === '/' },
    {
      to: '/catalog',
      label: '题库',
      icon: LayoutGrid,
      match: pathname.startsWith('/catalog') || pathname.startsWith('/domain'),
    },
    {
      to: '/library',
      label: '我的',
      icon: Upload,
      match:
        pathname.startsWith('/library') ||
        pathname.startsWith('/import') ||
        pathname.startsWith('/compose'),
    },
    {
      to: '/strategy/daily',
      label: '策略',
      icon: Sparkles,
      match: pathname.startsWith('/strategy') || pathname.startsWith('/practice-plan'),
    },
    { to: '/wrong', label: '错题本', icon: Target, match: pathname.startsWith('/wrong') },
    { to: '/stats', label: '统计', icon: TrendingUp, match: pathname.startsWith('/stats') },
  ]
  return (
    <nav className="mobile-nav" aria-label="移动端导航">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={`mobile-nav-item${item.match ? ' active' : ''}`}
        >
          <item.icon />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
