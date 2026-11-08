import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { HomePage } from './pages/HomePage'
import { CatalogPage, DomainPage } from './pages/CatalogPage'
import { GoalsPage, GoalPage } from './pages/GoalsPage'
import { StrategyPage } from './pages/StrategyPage'
import { PlanPracticePage } from './pages/PlanPracticePage'
import { CollectionPage } from './pages/CollectionPage'
import { PracticePage } from './pages/PracticePage'
import { ResultPage } from './pages/ResultPage'
import { WrongBookPage } from './pages/WrongBookPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'
import { ImportPage } from './pages/ImportPage'
import { LibraryPage } from './pages/LibraryPage'
import { EditPage } from './pages/EditPage'
import { ComposePage } from './pages/ComposePage'
import { ComposeRunPage } from './pages/ComposeRunPage'
import { PrintPage } from './pages/PrintPage'
import { NotFoundPage } from './pages/NotFoundPage'

const StatsPage = lazy(() =>
  import('./pages/StatsPage').then((module) => ({ default: module.StatsPage })),
)

// 原生壳（Tauri / Capacitor）用 hash 路由，避免本地静态服务器缺少 SPA 回退。
const Router = import.meta.env.MODE === 'native' ? HashRouter : BrowserRouter

export function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="domain/:domainId" element={<DomainPage />} />
          <Route path="library" element={<LibraryPage />} />
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
          <Route path="wrong" element={<WrongBookPage />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route
            path="stats"
            element={
              <Suspense fallback={<div className="route-loading">正在加载统计图表…</div>}>
                <StatsPage />
              </Suspense>
            }
          />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Router>
  )
}
