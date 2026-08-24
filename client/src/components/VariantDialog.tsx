import { useRef } from 'react'
import type { Product } from '@/api/types'

interface Props {
  product: Product
  variants: { variant: string; quantity: number }[]
  newVariantInput: string
  onAdjust: (variant: string, delta: number) => void
  onInputChange: (v: string) => void
  onSubmitVariant: () => void
  onClose: () => void
  t: (key: string) => string
}

export default function VariantDialog({ product, variants, newVariantInput, onAdjust, onInputChange, onSubmitVariant, onClose, t }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-t-lg sm:rounded-lg p-4 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-3 text-gray-900 dark:text-white">{product.name}</h3>
        {variants.map((v) => (
          <div key={v.variant} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-b-0">
            <span className="text-sm flex-1 min-w-0 truncate text-gray-900 dark:text-gray-300">{v.variant}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => onAdjust(v.variant, -1)}
                className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/40 text-sm font-bold flex items-center justify-center"
              >−</button>
              <span className="w-6 text-center text-sm font-bold text-gray-900 dark:text-white">{v.quantity}</span>
              <button onClick={() => onAdjust(v.variant, 1)}
                className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-sm font-bold flex items-center justify-center"
              >+</button>
            </div>
          </div>
        ))}
        <div className="flex gap-2 mt-4">
          <input
            ref={inputRef}
            type="text"
            value={newVariantInput}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmitVariant() }}
            placeholder={t('order.newVariantPlaceholder') ?? 'Neue Variante...'}
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 text-sm"
          />
          <button
            onClick={onSubmitVariant}
            disabled={!newVariantInput.trim()}
            className="bg-blue-600 text-white rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
          >+</button>
        </div>
        {product.extras && product.extras.length > 0 && (
          <div className="mt-3 space-y-2">
            {product.extras.map((extra) => (
              <div key={extra.id}>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{extra.name}</div>
                <div className="flex flex-wrap gap-1">
                  {extra.options.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => {
                        const sep = newVariantInput.trim() ? ' ' : ''
                        onInputChange(newVariantInput.trim() + sep + option.name)
                        inputRef.current?.focus()
                      }}
                      className="bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600"
                    >{option.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full mt-3 bg-gray-100 dark:bg-gray-700 rounded-md py-2.5 text-sm font-medium text-gray-900 dark:text-white"
        >{t('order.confirmVariants')}</button>
      </div>
    </div>
  )
}
