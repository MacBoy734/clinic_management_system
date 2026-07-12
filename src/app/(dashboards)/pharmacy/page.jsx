'use client'

// QueueTab — prescription queue (the pharmacist's main work area)
// APIs:
//   GET   /api/pharmacy/queue                       → { prescriptions: [...], dispensed_today }
//   GET   /api/pharmacy/stock                       → { items: [...] } (used for stock checks per item)
//   PATCH /api/pharmacy/prescriptions/:id/dispense  → dispense, body { pharmacist_id: 5 }

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api  from '@/lib/api'
import {
  SkeletonList, SkeletonCard, ErrorState, EmptyState, Card, Badge, Icon,
  cap, formatTime, timeAgo, formatMoney, StatCard,
} from '@/utils/helpers'
import { useAuthStore } from '@/store/authStore'
import { DispenseModal } from '@/components/pharmacy/DispenseModal'
import { CancelPrescriptionModal } from '@/components/pharmacy/CancelPrescriptionModal'
import socket from '@/lib/socket'

// Match a medication name to a stock item (same heuristic as the dispense API)
function matchStockItem(medication, stock) {
  if (!medication || !stock?.length) return null
  const firstWord = medication.toLowerCase().split(' ')[0]
  return (
    stock.find(
      (s) =>
        s.name.toLowerCase().includes(firstWord) ||
        s.generic_name.toLowerCase().includes(firstWord)
    ) || null
  )
}

export default function QueueTab() {
  const queryClient = useQueryClient()
  const [dispensing, setDispensing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const user = useAuthStore((s) => s.user)
  const pharmacistName = user?.name || 'Pharmacist'

  // Parallel queries: queue + stock (stock powers the per-item stock warning badges)
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
    mutationFn: (id) => api.patch(`/api/pharmacy/prescriptions/${id}/dispense`, { pharmacist_id: 5 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy'] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason, cancelled_by }) =>
      api.patch(`/api/pharmacy/prescriptions/${id}/cancel`, { reason, cancelled_by }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy'] })
    },
  })

  const isLoading = queueQuery.isLoading || stockQuery.isLoading
  const error = queueQuery.error || stockQuery.error
  const refetch = () => {
    queueQuery.refetch()
    stockQuery.refetch()
  }

    useEffect(() => {
    socket.on('prescription:new', () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'queue'] })
    })

    return () => {
      socket.off('prescription:new')
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

  // Derive stat card values
  const lowStockCount = stock.filter((s) => s.current_stock > 0 && s.current_stock <= s.reorder_level).length
  const outOfStockCount = stock.filter((s) => s.current_stock === 0).length

  const handleDispense = async (prescription) => {
    try {
      await dispenseMutation.mutateAsync(prescription.id)
      toast.success('Prescription dispensed, patient moved to billing')
      setDispensing(null)
    } catch (err) {
      toast.error(err.message || 'Could not dispense prescription')
    }
  }

  const handleCancel = async (prescription, reason) => {
    try {
      await cancelMutation.mutateAsync({
        id: prescription.id,
        reason,
        cancelled_by: pharmacistName,
      })
      toast.success('Prescription cancelled — patient moved to billing')
      setCancelling(null)
    } catch (err) {
      toast.error(err.message || 'Could not cancel prescription')
    }
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="clipboard" color="blue" label="Pending" value={queue.length} sublabel="to dispense" />
        <StatCard icon="check" color="green" label="Dispensed Today" value={dispensedToday} sublabel="prescriptions" />
        <StatCard icon="alert" color="amber" label="Low Stock" value={lowStockCount} sublabel="drugs" />
        <StatCard icon="x" color="red" label="Out of Stock" value={outOfStockCount} sublabel="drugs" />
      </div>

      {/* Queue list */}
      {!queue.length ? (
        <EmptyState
          icon="clipboard"
          title="No pending prescriptions"
          description="New prescriptions from the doctor will appear here for dispensing."
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
            />
          ))}
        </div>
      )}

      {/* Dispense modal */}
      {dispensing && (
        <DispenseModal
          prescription={dispensing}
          stock={stock}
          loading={dispenseMutation.isPending}
          onClose={() => setDispensing(null)}
          onConfirm={() => handleDispense(dispensing)}
        />
      )}

      {/* Cancel modal */}
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

function PrescriptionCard({ prescription, stock, onDispense, onCancel }) {
  const items = prescription.items || []
  const totalCost = items.reduce((s, i) => s + (i.unit_cost || 0) * (i.quantity || 0), 0)
  const hasStockIssue = items.some((item) => {
    const si = matchStockItem(item.medication, stock)
    return !si || si.current_stock < item.quantity
  })

  return (
    <Card className="p-4 hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
      {/* Top row: patient + action */}
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
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
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
        </div>
      </div>

      {/* Medication items */}
      <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/40">
        {items.map((item) => {
          const si = matchStockItem(item.medication, stock)
          const out = si && si.current_stock === 0
          const insufficient = si && si.current_stock > 0 && si.current_stock < item.quantity
          const low = si && si.current_stock > 0 && si.current_stock <= si.reorder_level && !insufficient
          return (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <Icon name="pill" size={14} className="text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">{item.medication}</p>
                  {out && (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Out of stock
                    </Badge>
                  )}
                  {insufficient && (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Insufficient ({si.current_stock}/{item.quantity})
                    </Badge>
                  )}
                  {low && (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Low stock ({si.current_stock})
                    </Badge>
                  )}
                  {!si && (
                    <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">
                      Not in inventory
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {item.dosage} · {item.frequency} · {item.duration} · Qty {item.quantity}
                </p>
              </div>
              <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300 tabular-nums shrink-0">
                {formatMoney((item.unit_cost || 0) * (item.quantity || 0))}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer total */}
      <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-gray-500 dark:text-gray-400">
        <span>
          Total:{' '}
          <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
            {formatMoney(totalCost)}
          </span>
        </span>
      </div>
    </Card>
  )
}