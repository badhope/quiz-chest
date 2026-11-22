import { useSearchParams } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import { useAppStore } from '../store/useAppStore'
import { WrongBookPage } from './WrongBookPage'
import { FavoritesPage } from './FavoritesPage'

/**
 * 题夹：把「错题本」和「我的收藏」并成一个入口。
 *
 * 两页原本是同一套结构——列表、空状态、清空确认、回到题库的链接，
 * 只是取数来源不同。留两个侧栏入口等于让用户在两个页面之间来回找同一道题。
 * 这里用 Radix Tabs 做视图切换，地址栏保留 ?tab= 以便刷新后停在原处。
 */
export function ShelfPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'favorites' ? 'favorites' : 'wrong'
  const wrongCount = useAppStore((state) => Object.keys(state.wrongBook).length)
  const favoriteCount = useAppStore((state) => state.favorites.length)

  return (
    <div className="shelf-page">
      <Tabs.Root
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params)
          next.set('tab', value)
          setParams(next, { replace: true })
        }}
      >
        <Tabs.List className="shelf-tabs" aria-label="题夹视图">
          <Tabs.Trigger value="wrong">
            错题本
            {wrongCount > 0 ? <span className="shelf-tab-count mono">{wrongCount}</span> : null}
          </Tabs.Trigger>
          <Tabs.Trigger value="favorites">
            我的收藏
            {favoriteCount > 0 ? <span className="shelf-tab-count mono">{favoriteCount}</span> : null}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="wrong" className="shelf-panel">
          <WrongBookPage />
        </Tabs.Content>
        <Tabs.Content value="favorites" className="shelf-panel">
          <FavoritesPage />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
