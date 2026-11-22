import { Link } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { useLibraryCollections } from '../lib/library'
import { downloadBankPackage } from '../lib/exporter'
import { Badge, EmptyState } from '../components/ui/primitives'
import { DomainIcon } from '../components/ui/icons'
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  CircleCheck,
  Clock,
  Download,
  Library as LibraryIcon,
  Trash2,
  Upload,
} from '../components/ui/icons'

export function LibraryPage() {
  const banks = useAppStore((state) => state.banks)
  const removeBank = useAppStore((state) => state.removeBank)
  const showSample = useAppStore((state) => state.settings.showSampleBanks)
  const collections = useLibraryCollections().filter(
    (collection) => collection.domainId === 'imported',
  )

  const importedQuestionCount = banks.reduce((sum, bank) => sum + bank.questions.length, 0)

  return (
    <div className="library-page">
      <header className="page-head page-head-row">
        <div>
          <span className="eyebrow">我的题库</span>
          <h1 className="page-title serif">导入的题库都住在这里</h1>
          <p className="page-sub">
            {banks.length > 0
              ? `${banks.length} 个题库 · 共 ${importedQuestionCount} 题，保存在本机数据库。`
              : '导入一份 JSON 或 CSV，就能离线练习、模拟考试并进入错题本。'}
          </p>
        </div>
        <Link to="/import" className="button button-primary button-sm">
          <Upload /> 导入题库
        </Link>
      </header>

      {banks.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="还没有导入题库"
          description="将题目整理为 JSON 或 CSV 后导入，即可练习、模拟考试并查看统计。"
          action={
            <Link to="/import" className="button button-primary button-sm">
              立即导入 <ArrowRight />
            </Link>
          }
        />
      ) : (
        <div className="library-grid">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="library-card"
              style={{ '--card-accent': collection.accent } as React.CSSProperties}
            >
              <div className="library-card-head">
                <span className="library-card-icon">
                  <DomainIcon name={collection.icon} />
                </span>
                <Badge tone="accent">{collection.exam}</Badge>
                <Badge tone="neutral">{collection.level}</Badge>
              </div>
              <h3 className="serif">
                <Link to={`/collection/${collection.id}`}>{collection.title}</Link>
              </h3>
              <p>{collection.subtitle}</p>
              <div className="library-card-foot">
                <span>
                  <LibraryIcon /> {collection.questions.length} 题
                </span>
                <span>
                  <Clock /> {collection.durationMin} 分钟
                </span>
                <span className="library-card-date">
                  <CircleCheck /> {new Date(collection.importedAt).toLocaleDateString('zh-CN')} 导入
                </span>
              </div>
              <div className="library-card-actions">
                <Link to={`/practice/${collection.id}?mode=practice`} className="button button-ghost button-sm">
                  开始练习
                </Link>
                <button
                  className="button button-ghost button-sm"
                  onClick={() => {
                    const bank = banks.find((item) => item.id === collection.id)
                    if (bank) downloadBankPackage(bank)
                  }}
                >
                  <Download /> 导出
                </button>
                <button
                  className="button button-ghost button-sm library-delete"
                  onClick={() => {
                    if (window.confirm(`删除「${collection.title}」？该题库与其练习记录关联将失效。`)) {
                      removeBank(collection.id)
                    }
                  }}
                >
                  <Trash2 /> 删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="library-sample-note">
        <div className="section-head">
          <div>
            <span className="eyebrow">示例内容</span>
            <h2 className="section-title serif">内置示例题库</h2>
          </div>
          <Link to="/settings" className="text-link">
            {showSample ? '在设置中隐藏' : '已被隐藏，去设置开启'} <ChevronRight />
          </Link>
        </div>
        <p className="page-sub">
          内置的 32 个示例题库每个只有 6-7 题，仅用于演示产品结构，不构成备考材料。
          {showSample ? '它们出现在题库总览中，可随时在设置里隐藏。' : '当前已隐藏，只显示你自己的题库。'}
        </p>
      </section>
    </div>
  )
}
