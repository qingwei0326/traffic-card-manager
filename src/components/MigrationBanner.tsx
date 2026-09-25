import { X } from 'lucide-react'

/**
 * 数据库迁移失败的起动告警横幅。
 *
 * 抽成纯展示组件是为了能脱离整个 App 树单独单测：
 * 真实原因由后端 `migration_get_status` 通过 `appApi.migration.getStatus`
 * 返回，这里只负责把 `error` 渲染出来并支持手动关闭。
 */
export function MigrationBanner({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <div
      className="flex items-start gap-3 border-b border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100"
      role="alert"
      data-testid="migration-warning"
    >
      <span className="mt-0.5 text-base leading-none">⚠️</span>
      <div className="flex-1">
        <p className="font-medium">数据库迁移未完成</p>
        <p className="mt-0.5 leading-5 opacity-90">{error}</p>
        <p className="mt-1 text-xs opacity-75">部分功能可能异常，建议用新版本打开或联系开发者。</p>
      </div>
      <button
        onClick={onDismiss}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-amber-500 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-800/60 dark:hover:text-amber-200"
        aria-label="关闭告警"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default MigrationBanner
