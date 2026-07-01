interface SkeletonProps {
  className?: string
  lines?: number
  type?: 'text' | 'card' | 'row'
}

function SkeletonBox({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 dark:bg-slate-700 rounded ${className}`} />
  )
}

export default function Skeleton({ lines = 3, type = 'text', className = '' }: SkeletonProps) {
  if (type === 'card') {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <SkeletonBox className="h-3 w-16" />
                  <SkeletonBox className="h-7 w-20" />
                </div>
                <SkeletonBox className="w-12 h-12 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
        <div className="card p-6">
          <SkeletonBox className="h-5 w-24 mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBox key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="card p-6">
          <SkeletonBox className="h-5 w-40 mb-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 mb-3">
              <SkeletonBox className="h-4 w-32" />
              <SkeletonBox className="h-4 w-16" />
              <SkeletonBox className="h-4 w-20" />
              <SkeletonBox className="h-4 w-24" />
              <SkeletonBox className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'row') {
    return (
      <div className={`space-y-3 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <SkeletonBox className="w-4 h-4 rounded" />
            <SkeletonBox className="h-4 w-20" />
            <SkeletonBox className="h-4 w-24" />
            <SkeletonBox className="h-4 w-16" />
            <SkeletonBox className="h-4 w-40 flex-1" />
            <SkeletonBox className="h-4 w-12" />
            <SkeletonBox className="h-4 w-16" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBox
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  )
}
