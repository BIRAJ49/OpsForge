import { useState } from 'react'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  icon: Icon,
  loading = false,
  disabled,
  onClick,
  ...props
}) {
  const [internalLoading, setInternalLoading] = useState(false)
  const isLoading = loading || internalLoading
  const isDisabled = disabled || isLoading
  const variants = {
    primary:
      'border-cyan-400/50 bg-cyan-400 text-slate-950 shadow-cyan-950/30 hover:bg-cyan-300',
    secondary:
      'border-slate-700 bg-slate-800/80 text-slate-100 hover:border-cyan-500/60 hover:bg-slate-800',
    ghost: 'border-transparent bg-transparent text-slate-300 hover:bg-slate-800/80 hover:text-white',
    danger:
      'border-rose-500/50 bg-rose-500/12 text-rose-200 hover:bg-rose-500/20',
    warning:
      'border-amber-500/50 bg-amber-500/12 text-amber-100 hover:bg-amber-500/20',
  }
  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-5 text-sm',
    icon: 'h-10 w-10 justify-center p-0',
  }

  async function handleClick(event) {
    if (!onClick || isDisabled) return
    const result = onClick(event)
    if (result && typeof result.then === 'function') {
      try {
        setInternalLoading(true)
        await result
      } finally {
        setInternalLoading(false)
      }
    }
  }

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isDisabled}
      onClick={handleClick}
      type={props.type || (onClick ? 'button' : 'submit')}
      {...props}
    >
      {isLoading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : Icon ? (
        <Icon className="h-4 w-4" />
      ) : null}
      {children}
    </button>
  )
}
