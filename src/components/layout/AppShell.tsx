import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar, MobileNav } from './Sidebar'
import { StorageBanner } from './StorageBanner'
import { SearchDialog } from '../search/SearchDialog'
import { useAppStore } from '../../store/useAppStore'
import { useBrand } from '../../hooks/useBrand'
import { useAndroidBackButton } from '../../hooks/useAndroidBackButton'
import { applyBrand } from '../../lib/brand'
import { syncSystemChrome } from '../../lib/platform'
import { domains } from '../../data/taxonomy'
import { ErrorBoundary } from '../ErrorBoundary'
import { Menu, Moon, Search, Sun, X } from '../ui/icons'
import { NAV_LABELS } from './navigation'

/** 自带顶栏的沉浸式路由，不套侧边栏与全局顶栏。 */
const FULLSCREEN_ROUTES = ['/practice/', '/practice-plan/', '/compose-run']

const pageTitles: Record<string, string> = {
  '/': NAV_LABELS.home,
  '/catalog': NAV_LABELS.catalog,
  '/review': NAV_LABELS.review,
  '/records': NAV_LABELS.records,
  '/settings': NAV_LABELS.settings,
  '/import': '导入题库',
  '/compose': NAV_LABELS.compose,
}

function resolveTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname]
  if (pathname.startsWith('/domain/')) {
    const domainId = pathname.split('/')[2] ?? ''
    return domains.find((domain) => domain.id === domainId)?.name ?? '领域题库'
  }
  if (pathname.startsWith('/collection/')) return '题库详情'
  if (pathname.startsWith('/practice/')) return '答题练习'
  if (pathname.startsWith('/practice-plan/')) return '策略练习'
  if (pathname.startsWith('/result/')) return '练习结果'
  if (pathname.startsWith('/compose-run')) return '自定义组卷'
  if (pathname === '/goals') return NAV_LABELS.goals
  if (pathname.startsWith('/goal/')) return '备考路线'
  if (pathname.startsWith('/strategy/')) return NAV_LABELS.strategy
  return '题小星'
}

export function AppShell() {
  const location = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const theme = useAppStore((state) => state.settings.theme)
  const fontScale = useAppStore((state) => state.settings.fontScale)
  const toggleTheme = useAppStore((state) => state.toggleTheme)
  const brand = useBrand()
  const overlayState = useRef({ navOpen, searchOpen })
  useEffect(() => {
    overlayState.current = { navOpen, searchOpen }
  }, [navOpen, searchOpen])

  useAndroidBackButton(() => {
    if (overlayState.current.searchOpen) {
      setSearchOpen(false)
      return true
    }
    if (overlayState.current.navOpen) {
      setNavOpen(false)
      return true
    }

    // Radix Dialog 自己监听 document 的 Escape，不需要为每个弹层再写一套关闭逻辑。
    if (document.querySelector('[role="dialog"]')) {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        }),
      )
      return true
    }

    const practice = document.querySelector('.practice-shell')
    if (practice) {
      if (practice.classList.contains('outline-open')) {
        document.querySelector<HTMLButtonElement>('.practice-outline-toggle')?.click()
        return true
      }
      // 和顶栏返回按钮共用「退出练习」确认框，避免硬件返回绕过确认。
      document.querySelector<HTMLButtonElement>('[aria-label="退出练习"]')?.click()
      return true
    }
    return false
  })

  useEffect(() => {
    applyBrand(brand)
    document.title = `${brand.productName} · ${brand.productEn}`
  }, [brand])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    syncSystemChrome(theme)
  }, [theme])

  useEffect(() => {
    document.body.dataset.font = fontScale
  }, [fontScale])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setNavOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // 全屏沉浸式路由：练习、策略练习、自定义组卷。这些页面自带顶栏与进度条，
  // 再套一层侧边栏会挤压答题区，所以只渲染内容本身。
  if (FULLSCREEN_ROUTES.some((prefix) => location.pathname.startsWith(prefix))) {
    return (
      <>
        <StorageBanner />
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
        {searchOpen ? <SearchDialog onClose={() => setSearchOpen(false)} /> : null}
      </>
    )
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <StorageBanner />
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen ? (
        <div className="mobile-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />
      ) : null}
      <div className="main-col">
        <header className="topbar">
          <button
            className="icon-button mobile-menu-button"
            onClick={() => setNavOpen((value) => !value)}
            aria-label={navOpen ? '关闭导航' : '打开导航'}
            aria-expanded={navOpen}
          >
            {navOpen ? <X /> : <Menu />}
          </button>
          <div className="topbar-title">
            <span className="topbar-eyebrow">{brand.productEn} · QUESTION BANK</span>
            <span className="topbar-page">{resolveTitle(location.pathname)}</span>
          </div>
          <div className="topbar-spacer" />
          <button
            className="search-trigger"
            onClick={() => setSearchOpen(true)}
            aria-label="搜索题库、考点、题目"
          >
            <Search />
            <span>搜索题库、考点、题目</span>
            <kbd className="search-key">⌘K</kbd>
          </button>
          <button
            className="icon-button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
            title={theme === 'light' ? '深色模式' : '浅色模式'}
          >
            {theme === 'light' ? <Moon /> : <Sun />}
          </button>
        </header>
        <main id="main" className="content page-enter" key={location.pathname}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <MobileNav />
      {searchOpen ? <SearchDialog onClose={() => setSearchOpen(false)} /> : null}
    </div>
  )
}
