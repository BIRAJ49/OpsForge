import { motion } from 'framer-motion'

export function Card({ children, className = '', hover = false }) {
  if (!hover) {
    return (
      <div
        className={`rounded-lg border border-slate-700/70 bg-slate-900/80 shadow-xl shadow-slate-950/20 backdrop-blur ${className}`}
      >
        {children}
      </div>
    )
  }

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`rounded-lg border border-slate-700/70 bg-slate-900/80 shadow-xl shadow-slate-950/20 backdrop-blur ${className}`}
    >
      {children}
    </motion.div>
  )
}

export function CardHeader({ title, description, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function CardContent({ children, className = '' }) {
  return <div className={`p-5 ${className}`}>{children}</div>
}
