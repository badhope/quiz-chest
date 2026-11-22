import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { HomePage } from './pages/HomePage'
import { CatalogPage, DomainPage } from './pages/CatalogPage'
import { GoalsPage, GoalPage } from './pages/GoalsPage'
import { PlanPracticePage } from './pages/PlanPracticePage'
import { CollectionPage } from './pages/CollectionPage'
import { PracticePage } from './pages/PracticePage'
import { ResultPage } from './pages/ResultPage'
import { ShelfPage } from './pages/ShelfPage'
import { RecordsPage } from './pages/RecordsPage'
import { NotFoundPage } from './pages/NotFoundPage'

// 原生壳（Tauri / Capacitor）用 hash 路由，避免本地静态服务器缺少 SPA 回退。
const Router = import.meta.env.MODE === 'native' ? HashRouter : BrowserRouter

export function App() {
  return (
    <Router>
      <Suspense fallback={<div className="route-loading">正在加载页面…</div>}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="domain/:domainId" element={<DomainPage />} />
          <Route path="library" element={<Navigate to="/catalog" replace />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="compose" element={<ComposePage />} />
          <Route path="compose-run" element={<ComposeRunPage />} />
          <Route path="print" element={<PrintPage />} />
          <Route path="edit/:collectionId" element={<EditPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="goal/:goalId" element={<GoalPage />} />
          <Route path="strategy/:kind" element={<StrategyPage />} />
          <Route path="practice-plan/:kind" element={<PlanPracticePage />} />
          <Route path="collection/:collectionId" element={<CollectionPage />} />
          <Route path="practice/:collectionId" element={<PracticePage />} />
          <Route path="result/:collectionId" element={<ResultPage />} />
          <Route path="review" element={<ShelfPage />} />
          <Route path="wrong" element={<Navigate to="/review?tab=wrong" replace />} />
          <Route path="favorites" element={<Navigate to="/review?tab=favorites" replace />} />
          <Route path="records" element={<RecordsPage />} />
          <Route path="stats" element={<Navigate to="/records?tab=stats" replace />} />
          <Route path="history" element={<Navigate to="/records?tab=history" replace />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      </Suspense>
    </Router>
  )
}

const ImportPage = lazy(() => import('./pages/ImportPage').then((module) => ({ default: module.ImportPage })))

const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))

const EditPage = lazy(() => import('./pages/EditPage').then((module) => ({ default: module.EditPage })))

const ComposePage = lazy(() => import('./pages/ComposePage').then((module) => ({ default: module.ComposePage })))

const ComposeRunPage = lazy(() => import('./pages/ComposeRunPage').then((module) => ({ default: module.ComposeRunPage })))

const PrintPage = lazy(() => import('./pages/PrintPage').then((module) => ({ default: module.PrintPage })))

const StrategyPage = lazy(() => import('./pages/StrategyPage').then((module) => ({ default: module.StrategyPage })))
