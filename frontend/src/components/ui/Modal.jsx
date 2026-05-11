import { X } from 'lucide-react'
import { Button } from './Button'

export function Modal({ open, title, children, onClose }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close modal">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-5 custom-scrollbar">{children}</div>
      </div>
    </div>
  )
}
