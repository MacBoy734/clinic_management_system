'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  SkeletonList, SkeletonCard, ErrorState, EmptyState, Card, Badge, Icon,
  cap, formatTime, timeAgo, formatMoney, StatCard,
} from '@/utils/helpers'
import { useAuthStore } from '@/store/authStore'
import { DispenseModal } from '@/components/pharmacy/DispenseModal'
import { CancelPrescriptionModal } from '@/components/pharmacy/CancelPrescriptionModal'
import socket from '@/lib/socket'

function matchStockItem(item, stock) {
  if (!item || !stock?.length) return null
  if (item.product_id) {
    return stock.find((s) => s.id === item.product_id) || null
  }
  const firstWord = (item.drug_name || '').toLowerCase().split(' ')[0]
  if (!firstWord) return null
  return (
    stock.find(
      (s) =>
        s.name.toLowerCase().includes(firstWord) ||
        (s.generic_name && s.generic_name.toLowerCase().includes(firstWord))
    ) || null
  )
}

export default function QueueTab() {
  const queryClient = useQueryClient()
  const [dispensing, setDispensing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const user = useAuthStore((s) => s.user)
  const pharmacistName = user?.username || 'Pharmacist'

  const queueQuery = useQuery({
    queryKey: ['pharmacy', 'queue'],
    queryFn: () => api.get('/api/pharmacy/queue'),
    refetchInterval: 20000,
    staleTime: 10000,
  })

  const stockQuery = useQuery({
    queryKey: ['pharmacy', 'stock'],
    queryFn: () => api.get('/api/pharmacy/stock'),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const dispenseMutation = useMutation({
    mutationFn: (id) => api.patch(`/api/pharmacy/prescriptions/${id}/dispense`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pharmacy'] }),
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) =>
      api.patch(`/api/pharmacy/prescriptions/${id}/cancel`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pharmacy'] }),
  })

  const confirmRestockMut = useMutation({
    mutationFn: (itemId) =>
      api.patch(`/api/pharmacy/prescription-items/${itemId}/confirm-restock`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy'] })
      toast.success('Item restocked — inventory credited')
    },
  })

  const isLoading = queueQuery.isLoading || stockQuery.isLoading
  const isRefetching = queueQuery.isFetching || stockQuery.isFetching
  const error = queueQuery.error || stockQuery.error
  const refetch = () => {
    queueQuery.refetch()
    stockQuery.refetch()
  }

  useEffect(() => {
    socket.on('prescription:new', () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'queue'] })
    })
    socket.on('prescription:returned', () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'queue'] })
    })

    return () => {
      socket.off('prescription:new')
      socket.off('prescription:returned')
    }
  }, [queryClient])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonList items={4} />
      </div>
    )
  }

  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  const queue = queueQuery.data?.prescriptions || []
  const stock = stockQuery.data?.items || []
  const dispensedToday = queueQuery.data?.dispensed_today || 0

  const lowStockCount = stock.filter((s) => s.current_stock > 0 && s.current_stock <= s.reorder_level).length
  const outOfStockCount = stock.filter((s) => s.current_stock === 0).length

  const handleDispense = async (prescription) => {
    try {
      const result = await dispenseMutation.mutateAsync(prescription.id)
      if (result.partial) {
        toast.success(
          `Dispensed ${result.issued_count} of ${result.issued_count + result.declined_count} items. Patient returning to doctor.`,
          { duration: 5000 }
        )
      } else {
        toast.success('Prescription dispensed — patient moved to doctor')
      }
      setDispensing(null)
    } catch (err) {
      if (err?.response?.status === 409) {
        toast.error('Already processed by another user. Refreshing…')
        queryClient.invalidateQueries({ queryKey: ['pharmacy', 'queue'] })
      } else {
        toast.error(err.message || 'Could not dispense prescription')
      }
    }
  }

  const handleCancel = async (prescription, reason) => {
    try {
      await cancelMutation.mutateAsync({ id: prescription.id, reason })
      toast.success('Prescription cancelled — patient moved to billing')
      setCancelling(null)
    } catch (err) {
      toast.error(err.message || 'Could not cancel prescription')
    }
  }

  const handleConfirmRestock = async (itemId) => {
    try {
      await confirmRestockMut.mutateAsync(itemId)
    } catch (err) {
      toast.error(err.message || 'Could not confirm restock')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="clipboard" color="blue" label="Pending" value={queue.filter((q) => q.status === 'pending').length} sublabel="to dispense" />
        <StatCard icon="check" color="green" label="Dispensed Today" value={dispensedToday} sublabel="prescriptions" />
        <StatCard icon="alert" color="amber" label="Low Stock" value={lowStockCount} sublabel="drugs" />
        <StatCard icon="x" color="red" label="Out of Stock" value={outOfStockCount} sublabel="drugs" />
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
        >
          <Icon name="refresh" size={13} className={isRefetching ? 'animate-spin' : ''} />
          {isRefetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!queue.length ? (
        <EmptyState
          icon="clipboard"
          title="No active prescriptions"
          description="New prescriptions and returned items will appear here."
        />
      ) : (
        <div className="space-y-3">
          {queue.map((p) => (
            <PrescriptionCard
              key={p.id}
              prescription={p}
              stock={stock}
              onDispense={() => setDispensing(p)}
              onCancel={() => setCancelling(p)}
              onConfirmRestock={handleConfirmRestock}
              confirmRestockLoading={confirmRestockMut.isPending}
            />
          ))}
        </div>
      )}

      {dispensing && (
        <DispenseModal
          prescription={dispensing}
          stock={stock}
          loading={dispenseMutation.isPending}
          onClose={() => setDispensing(null)}
          onConfirm={() => handleDispense(dispensing)}
        />
      )}

      {cancelling && (
        <CancelPrescriptionModal
          prescription={cancelling}
          loading={cancelMutation.isPending}
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => handleCancel(cancelling, reason)}
        />
      )}
    </div>
  )
}

function PrescriptionCard({
  prescription,
  stock,
  onDispense,
  onCancel,
  onConfirmRestock,
  confirmRestockLoading,
}) {
  const items = prescription.items || []
  const isPending = prescription.status === 'pending'
  const hasReturnedItems = items.some((i) => i.status === 'returned')
  const isReturnedPrescription = prescription.status === 'returned' || hasReturnedItems

  const hasStockIssue = isPending && items.some((item) => {
    const si = matchStockItem(item, stock)
    return !si || si.current_stock < item.quantity
  })

  return (
    <Card className="p-4 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-linear-to-br from-[#1a6cbf] to-[#155a9f] flex items-center justify-center shrink-0">
            <span className="text-[13px] font-semibold text-white">
              {prescription.patient_name?.charAt(0) || 'P'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                {prescription.patient_name}
              </span>
              <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">
                {prescription.patient_age}y · {cap(prescription.patient_gender)}
              </Badge>
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Rx #{prescription.id}
              </Badge>

              {isPending && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pending</Badge>}
              {isReturnedPrescription && <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Returned</Badge>}
              {prescription.status === 'issued' && !hasReturnedItems && (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Completed</Badge>
              )}

              {hasStockIssue && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <Icon name="alert" size={10} /> Stock check
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Prescribed by {prescription.prescribed_by} · {timeAgo(prescription.prescribed_at)} ·{' '}
              {formatTime(prescription.prescribed_at)}
            </p>
            {isReturnedPrescription && (
              <p className="text-[11px] text-purple-600 dark:text-purple-400 mt-0.5 font-medium">
                Doctor returned {items.filter((i) => i.status === 'returned').length} item(s) — confirm restock
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {isPending && (
            <>
              <button
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-red-300 hover:text-red-600 dark:hover:border-red-800 dark:hover:text-red-400 flex items-center gap-1.5"
              >
                <Icon name="xCircle" size={13} /> Cancel
              </button>
              <button
                onClick={onDispense}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1a6cbf] hover:bg-[#155a9f] text-white flex items-center gap-1.5"
              >
                <Icon name="check" size={13} /> Review &amp; Dispense
              </button>
            </>
          )}
          {prescription.status === 'issued' && !hasReturnedItems && (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <Icon name="check" size={12} /> Done
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40">
        {items.map((item) => {
          const si = matchStockItem(item, stock)
          const out = isPending && si && si.current_stock === 0
          const insufficient = isPending && si && si.current_stock > 0 && si.current_stock < item.quantity
          const low = isPending && si && si.current_stock > 0 && si.current_stock <= si.reorder_level && !insufficient

          return (
            <div key={item.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <Icon name="pill" size={14} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.medication}</p>

                  {isPending && out && (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Out of stock</Badge>
                  )}
                  {isPending && insufficient && (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Insufficient ({si.current_stock}/{item.quantity})
                    </Badge>
                  )}
                  {isPending && low && (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Low stock ({si.current_stock})
                    </Badge>
                  )}
                  {isPending && !si && (
                    <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">Not in inventory</Badge>
                  )}

                  {item.status === 'issued' && (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">Issued</Badge>
                  )}
                  {item.status === 'declined' && (
                    <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400 text-[10px]">Declined</Badge>
                  )}
                  {item.status === 'returned' && (
                    <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-[10px]">Returned</Badge>
                  )}
                  {item.status === 'cancelled' && (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">Cancelled</Badge>
                  )}
                </div>

                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {item.dosage} · {item.frequency} · {item.duration} · Qty {item.quantity}
                </p>

                {item.status === 'returned' && (
                  <div className="mt-2">
                    <p className="text-[11px] text-purple-600 dark:text-purple-400 mb-1.5">
                      Returned by {item.returned_by} · {item.return_reason ? `Reason: ${item.return_reason}` : 'No reason given'}
                    </p>
                    <button
                      onClick={() => onConfirmRestock(item.id)}
                      disabled={confirmRestockLoading}
                      className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 flex items-center gap-1"
                    >
                      <Icon name="check" size={12} />
                      {confirmRestockLoading ? 'Restocking…' : 'Confirm Restock'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}