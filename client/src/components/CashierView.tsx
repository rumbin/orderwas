import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSessionStore } from '@/stores/session'
import { api } from '@/api/client'
import type { TableOrder, TableOrderItem, OpenTable } from '@/api/types'
import TableSwitcherModal from './TableSwitcherModal'
import CalculatorModal from './CalculatorModal'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

interface Props {
  initialTable: string | null
}

export default function CashierView({ initialTable }: Props) {
  const { t } = useTranslation()
  const { event, waiter, token } = useSessionStore()

  const [tableNumber, setTableNumber] = useState<string | null>(initialTable)
  const [orders, setOrders] = useState<TableOrder[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState(false)
  const [openTables, setOpenTables] = useState<OpenTable[]>([])
  const [tableModalOpen, setTableModalOpen] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [lastPayment, setLastPayment] = useState<{ paidCount: number; sumCents: number } | null>(null)

  // Fetch unpaid items for current table
  const fetchOrders = useCallback(async (tn: string | null) => {
    if (!event || !tn) { setOrders([]); return }
    setLoading(true)
    try {
      const data = await api.getUnpaidByTable(event.id, tn)
      setOrders(data)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [event])

  // Fetch open tables
  const fetchOpenTables = useCallback(async () => {
    if (!event) return
    try {
      const data = await api.getOpenTables(event.id)
      setOpenTables(data)
    } catch {
      setOpenTables([])
    }
  }, [event])

  // Initial load: fetch open tables + auto-detect table
  useEffect(() => {
    if (!event) return
    fetchOpenTables()

    if (initialTable) {
      setTableNumber(initialTable)
      fetchOrders(initialTable)
      return
    }

    // Auto-detect: load all orders to find last table of current waiter
    api.getOrders(event.id).then((allOrders) => {
      if (!waiter) return
      const waiterOrders = allOrders
        .filter((o) => o.waiterId === waiter.id && o.tableNumber && o.status !== 'paid' && o.status !== 'cancelled')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const lastTable = waiterOrders[0]?.tableNumber ?? null
      setTableNumber(lastTable)
      if (lastTable) fetchOrders(lastTable)
    }).catch(() => {})
  }, [event, waiter, initialTable, fetchOpenTables, fetchOrders])

  // Re-fetch when table changes
  useEffect(() => {
    if (tableNumber) fetchOrders(tableNumber)
  }, [tableNumber, fetchOrders])

  // Clear selection when table changes
  useEffect(() => {
    setSelected(new Set())
  }, [tableNumber])

  // Collect all unpaid item ids
  const allUnpaidIds = orders.flatMap((o) =>
    o.items.filter((i) => !i.paidAt).map((i) => i.id)
  )

  // Sum of selected items
  const selectedSum = orders.reduce((sum, o) => {
    return sum + o.items
      .filter((i) => selected.has(i.id) && !i.paidAt)
      .reduce((s, i) => s + i.lineTotalCents, 0)
  }, 0)

  // Toggle single item
  const toggleItem = (itemId: string, paid: boolean) => {
    if (paid) return // Don't toggle already-paid items
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  // Toggle all unpaid
  const toggleAll = () => {
    if (selected.size === allUnpaidIds.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allUnpaidIds))
    }
  }

  // Pay selected items
  const handlePay = async () => {
    if (selected.size === 0 || !token) return
    setPaying(true)
    try {
      const result = await api.payItems([...selected], token)
      setLastPayment({ paidCount: result.paidCount, sumCents: result.sumCents })
      setSelected(new Set())
      if (tableNumber) fetchOrders(tableNumber)
      fetchOpenTables()
    } catch {
      // Error handled silently — could add toast here
    } finally {
      setPaying(false)
    }
  }

  // Handle table switch from modal
  const handleTableSelect = (tn: string) => {
    setTableNumber(tn)
    setTableModalOpen(false)
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Table selector header */}
      <div className="border-b dark:border-gray-700">
        <button
          onClick={() => setTableModalOpen(true)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
        >
          <span className="font-semibold text-gray-900 dark:text-white">
            {tableNumber ? `Tisch ${tableNumber}` : t('cashier.selectTable')}
          </span>
          <span className="text-gray-400 dark:text-gray-500 text-lg">▾</span>
        </button>
      </div>

      {/* Success toast */}
      {lastPayment && (
        <div className="mx-4 mt-3 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400">
          ✅ {t('cashier.paymentSuccess')} — {lastPayment.paidCount} {t('cashier.unpaidItems')}, {formatCents(lastPayment.sumCents)}
        </div>
      )}

      {/* Order list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-8">{t('common.loading')}</div>
        )}

        {!loading && orders.length === 0 && tableNumber && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-8">{t('cashier.noOpenItems')}</div>
        )}

        {!loading && !tableNumber && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-8">{t('cashier.selectTable')}</div>
        )}

        {orders.map((order) => (
          <div
            key={order.orderId}
            className="border dark:border-gray-700 rounded-lg overflow-hidden"
          >
            {/* Order header */}
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                #{order.tearOffNumber ?? order.orderId.slice(0, 6)} ({order.waiterName}, {new Date(order.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })})
              </span>
            </div>

            {/* Items */}
            <div className="divide-y dark:divide-gray-700">
              {order.items.map((item) => {
                const isPaid = !!item.paidAt
                return (
                  <div
                    key={item.id}
                    onClick={() => !isPaid && toggleItem(item.id, isPaid)}
                    className={`flex items-center justify-between px-3 py-2.5 ${
                      isPaid
                        ? 'opacity-50 bg-gray-50 dark:bg-gray-700/30'
                        : 'active:bg-gray-100 dark:active:bg-gray-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {!isPaid ? (
                        <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          selected.has(item.id)
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 dark:border-gray-500'
                        }`}>
                          {selected.has(item.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                      ) : null}
                      <span className={`text-sm ${isPaid ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                        {item.quantity}× {item.productName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isPaid ? (
                        <span className="text-xs text-green-600 dark:text-green-400">✓ {t('cashier.itemPaid')}</span>
                      ) : (
                        <span className="text-sm font-mono text-gray-900 dark:text-white">{formatCents(item.lineTotalCents)}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer bar */}
      {allUnpaidIds.length > 0 && (
        <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-800">
          {/* Select all */}
          <div
            onClick={toggleAll}
            className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b dark:border-gray-700"
          >
            <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
              selected.size === allUnpaidIds.length && allUnpaidIds.length > 0
                ? 'bg-blue-600 border-blue-600'
                : 'border-gray-300 dark:border-gray-500'
            }`}>
              {selected.size === allUnpaidIds.length && allUnpaidIds.length > 0 && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('cashier.selectAll')}</span>
          </div>

          {/* Sum + actions */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">{t('cashier.sum')}</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">{formatCents(selectedSum)}</span>
              <button
                onClick={() => setCalculatorOpen(true)}
                className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-lg"
                title={t('cashier.calculator')}
              >
                🧮
              </button>
            </div>
            <button
              onClick={handlePay}
              disabled={selected.size === 0 || paying}
              className="bg-blue-600 text-white rounded-lg px-5 py-2.5 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {paying ? t('common.loading') : t('cashier.pay')}
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {tableModalOpen && (
        <TableSwitcherModal
          tables={openTables}
          currentTable={tableNumber}
          onSelect={handleTableSelect}
          onClose={() => setTableModalOpen(false)}
        />
      )}

      {calculatorOpen && (
        <CalculatorModal
          sumCents={selectedSum}
          onClose={() => setCalculatorOpen(false)}
        />
      )}
    </div>
  )
}
