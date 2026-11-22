import { NavLink, useLocation } from 'react-router-dom'

import { goals } from '../../data/goals'
import { useAppStore } from '../../store/useAppStore'
import { useBrand } from '../../hooks/useBrand'
import { streakFromDates } from '../../lib/datetime'
import { NAV_LABELS } from './navigation'
import {
  BarChart3,
  Bookmark,
  Flame,
  House,
  Layers,
  LayoutGrid,
  Library,
  Settings,
  Sparkles,
  Target,
} from '../ui/icons'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const wrongCount = useAppStore((state) => Object.keys(state.wrongBook).length)
  const favoriteCount = useAppStore((state) => state.favorites.length)
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
          {NAV_LABELS.home}
        </NavLink>
        <NavLink
          to="/goals"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Target />
          {NAV_LABELS.goals}
          <span className="nav-count">{goals.length}</span>
        </NavLink>
        <NavLink
          to="/strategy/daily"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Sparkles />
          {NAV_LABELS.strategy}
        </NavLink>
        <NavLink
          to="/catalog"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Library />
          {NAV_LABELS.catalog}
        </NavLink>
        <NavLink
          to="/compose"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Layers />
          {NAV_LABELS.compose}
        </NavLink>
      </nav>

      <nav className="nav-group">
        <span className="nav-label">我的</span>
        <NavLink
          to="/review?tab=wrong"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <Bookmark />
          {NAV_LABELS.review}
          {wrongCount + favoriteCount > 0 ? (
            <span className="nav-count">{wrongCount + favoriteCount}</span>
          ) : null}
        </NavLink>
        <NavLink
          to="/records?tab=stats"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          onClick={onClose}
        >
          <BarChart3 />
          {NAV_LABELS.records}
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
          {NAV_LABELS.settings}
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
    { to: '/', label: NAV_LABELS.home, icon: House, match: pathname === '/' },
    {
      to: '/catalog',
      label: '题库',
      icon: LayoutGrid,
      match: pathname.startsWith('/catalog') || pathname.startsWith('/domain') || pathname.startsWith('/import'),
    },
    {
      to: '/review?tab=wrong',
      label: NAV_LABELS.review,
      icon: Target,
      match: pathname.startsWith('/review') || pathname.startsWith('/wrong') || pathname.startsWith('/favorites'),
    },
    {
      to: '/records?tab=stats',
      label: '档案',
      icon: BarChart3,
      match: pathname.startsWith('/records') || pathname.startsWith('/stats') || pathname.startsWith('/history'),
    },
    {
      to: '/strategy/daily',
      label: '策略',
      icon: Sparkles,
      match: pathname.startsWith('/strategy') || pathname.startsWith('/practice-plan'),
    },
    {
      to: '/settings',
      label: NAV_LABELS.settings,
      icon: Settings,
      match: pathname.startsWith('/settings') || pathname.startsWith('/goals') || pathname.startsWith('/compose'),
    },
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
