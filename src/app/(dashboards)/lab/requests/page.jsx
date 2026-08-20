'use client'

// RequestsTab — full lab request history with filters, expandable rows,
// and a printable lab report modal.
// API: GET /api/lab/requests?status=all|pending|in_progress|ready

import { useState, Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import {
  SkeletonTable, ErrorState, EmptyState, Card, Badge, Icon,
  badgeClass, cap, formatDate, formatTime,
} from '@/utils/helpers'
import { ReportModal } from '@/components/lab/ReportModal'

const FILTERS = [
  { key: 'all', label: 'All', icon: 'list' },
  { key: 'pending', label: 'Pending', icon: 'clock' },
  { key: 'in_progress', label: 'In Progress', icon: 'activity' },
  { key: 'ready', label: 'Ready', icon: 'check' },
]

export default function RequestsTab() {
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null) // request id
  const [report, setReport] = useState(null) // request to view report

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['lab', 'requests', filter],
    queryFn: () => api.get(`/api/lab/requests?status=${filter}`),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const requests = data?.requests || []

  if (isLoading) return <SkeletonTable rows={6} cols={6} />
  if (error) return <ErrorState message={error.message} onRetry={refetch} />

  return (
    <div className="space-y-4">
      {/* Filter pills + count */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors',
                filter === f.key
                  ? 'bg-[#1a6cbf] text-white'
                  : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-700',
              ].join(' ')}
            >
              <Icon name={f.icon} size={12} />
              {f.label}
            </button>
          ))}
        </div>
                <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {requests.length} request{requests.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 flex items-center gap-1.5 disabled:opacity-60"
          >
            <Icon 
              name="refresh" 
              size={13} 
              className={isFetching ? 'animate-spin' : ''} 
            />
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Table */}
      {!requests.length ? (
        <EmptyState
          icon="flask"
          title="No lab requests"
          description={filter === 'all'
            ? 'Lab requests from the doctor will appear here.'
            : `No "${cap(filter)}" requests right now.`}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-[#1e293b]/50">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 w-8"></th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Patient</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Tests</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">Urgency</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Ordered</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400">Completed</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-400 hidden lg:table-cell">Doctor</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {requests.map((req) => {
                  const isOpen = expanded === req.id
                  const testNames = req.items?.map((i) => i.test_name).join(', ') || '—'
                  return (
                    <Fragment key={req.id}>
                      <tr
                        className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : req.id)}
                      >
                        <td className="px-4 py-3">
                          <Icon
                            name={isOpen ? 'chevronDown' : 'chevronRight'}
                            size={14}
                            className="text-gray-400"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[13px] font-medium text-gray-900 dark:text-gray-100">
                            {req.patient_name}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {req.patient_age}{req.patient_age ? 'y' : ''} · {cap(req.patient_gender || '—')}
                          </p>
                        </td>
                        <td className="px-4 py-3 max-w-65">
                          <p className="text-[12px] text-gray-700 dark:text-gray-300 truncate">{testNames}</p>
                          <p className="text-[10px] text-gray-400">{req.items?.length || 0} test{(req.items?.length || 0) !== 1 ? 's' : ''}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={badgeClass(req.urgency)}>{cap(req.urgency)}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={badgeClass(req.status)}>{cap(req.status)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[12px] text-gray-700 dark:text-gray-300">{formatDate(req.ordered_at)}</p>
                          <p className="text-[10px] text-gray-400">{formatTime(req.ordered_at)}</p>
                        </td>
                        <td className="px-4 py-3">
                          {req.completed_at ? (
                            <>
                              <p className="text-[12px] text-gray-700 dark:text-gray-300">{formatDate(req.completed_at)}</p>
                              <p className="text-[10px] text-gray-400">{formatTime(req.completed_at)}</p>
                            </>
                          ) : (
                            <span className="text-[11px] text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-[12px] text-gray-600 dark:text-gray-400 truncate">{req.ordered_by || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {req.status === 'ready' ? (
                            <button
                              onClick={() => setReport(req)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-gray-200 dark:bg-[#1e293b] dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-[#1a6cbf] dark:hover:border-[#1a6cbf] hover:text-[#1a6cbf] dark:hover:text-blue-400"
                            >
                              <Icon name="fileText" size={12} />
                              Report
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-400 px-2">—</span>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={9} className="px-4 py-4 bg-gray-50/40 dark:bg-gray-700/10">
                            <ItemDetails req={req} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Report modal */}
      {report && (
        <ReportModal request={report} onClose={() => setReport(null)} />
      )}
    </div>
  )
}

// ─── Item-level details (expanded row) ───────────────────────
function ItemDetails({ req }) {
  if (!req.items?.length) {
    return <p className="text-[12px] text-gray-400 px-2">No test items.</p>
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 overflow-hidden bg-white dark:bg-[#1e293b]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700/60">
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400">Test</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400">Category</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400">Result</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400">Reference</th>
            <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-400">Flag</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400">Status</th>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400 hidden md:table-cell">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
          {req.items.map((item) => {
            const flag = flagResult(item.result, item.reference_range)
            return (
              <tr key={item.id} className="hover:bg-gray-50/40 dark:hover:bg-gray-700/10">
                <td className="px-3 py-2">
                  <p className="text-[12px] font-medium text-gray-900 dark:text-gray-100">{item.test_name}</p>
                </td>
                <td className="px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{item.category || '—'}</span>
                </td>
                <td className="px-3 py-2">
                  {item.result ? (
                    <span className="text-[12px] font-mono font-semibold text-gray-900 dark:text-gray-100">{item.result}</span>
                  ) : (
                    <span className="text-[11px] text-gray-400 italic">Pending</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">{item.reference_range || '—'}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <FlagPill flag={flag} hasResult={!!item.result} />
                </td>
                <td className="px-3 py-2">
                  <Badge className={badgeClass(item.status)}>{cap(item.status)}</Badge>
                </td>
                <td className="px-3 py-2 hidden md:table-cell max-w-55">
                  {item.notes ? (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate" title={item.notes}>{item.notes}</p>
                  ) : (
                    <span className="text-[10px] text-gray-400">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Result flagging heuristic ───────────────────────────────
// Returns 'normal' | 'abnormal' | 'neutral'
export function flagResult(result, refRange) {
  if (!result) return 'neutral'
  const r = String(result).toLowerCase().trim()

  // Keyword-based flags
  if (/\b(critical|abnormal|positive|elevated|high|low|above|below)\b/.test(r)) {
    // "negative" is normal — except when ref says positive expected
    if (r === 'negative' || r.includes('negative')) return 'normal'
    return 'abnormal'
  }
  if (r === 'negative' || r === 'normal' || r.includes('within normal')) return 'normal'
  if (r === 'positive') return 'abnormal'

  // Numeric comparison
  const num = parseFloat(r.replace(/[^0-9.\-]/g, ''))
  if (!isNaN(num) && refRange) {
    // Match patterns like "4.0-6.0", "<7.8", ">120", "0-20"
    const rangeMatch = refRange.match(/(-?\d+\.?\d*)\s*[-–]\s*(-?\d+\.?\d*)/)
    if (rangeMatch) {
      const lo = parseFloat(rangeMatch[1])
      const hi = parseFloat(rangeMatch[2])
      if (num < lo || num > hi) return 'abnormal'
      return 'normal'
    }
    const ltMatch = refRange.match(/<\s*(-?\d+\.?\d*)/)
    if (ltMatch) {
      const hi = parseFloat(ltMatch[1])
      return num > hi ? 'abnormal' : 'normal'
    }
    const gtMatch = refRange.match(/>\s*(-?\d+\.?\d*)/)
    if (gtMatch) {
      const lo = parseFloat(gtMatch[1])
      return num < lo ? 'abnormal' : 'normal'
    }
  }

  return 'neutral'
}

function FlagPill({ flag, hasResult }) {
  if (!hasResult) return <span className="text-[10px] text-gray-400">—</span>
  if (flag === 'normal') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <Icon name="check" size={9} /> Normal
      </span>
    )
  }
  if (flag === 'abnormal') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <Icon name="alert" size={9} /> Abnormal
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400">
      N/A
    </span>
  )
}