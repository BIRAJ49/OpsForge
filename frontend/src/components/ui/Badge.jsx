const toneMap = {
  cyan: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  blue: 'border-blue-400/40 bg-blue-400/10 text-blue-200',
  purple: 'border-purple-400/40 bg-purple-400/10 text-purple-200',
  green: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  amber: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  rose: 'border-rose-400/40 bg-rose-400/10 text-rose-200',
  slate: 'border-slate-600 bg-slate-800 text-slate-300',
}

export function Badge({ children, tone = 'slate', className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneMap[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
