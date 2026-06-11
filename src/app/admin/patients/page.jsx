'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

// ─── React Query hooks ────────────────────────────────────────────────────────
function usePatients({ page, period, visitType, feeStatus, search }) {
  return useQuery({
    queryKey: ['admin', 'patients', { page, period, visitType, feeStatus, search }],
    queryFn: () =>
      api.get(
        `/api/admin/patients?page=${page}&limit=20&period=${period}&visit_type=${visitType}&fee_status=${feeStatus}&search=${encodeURIComponent(search)}`
      ),
    keepPreviousData: true,
    staleTime: 30000,
  })
}

function usePatientStats(period) {
  return useQuery({
    queryKey: ['admin', 'patient-stats', period],
    queryFn: () => api.get(`/api/admin/patients/stats?period=${period}`),
    staleTime: 60000,
  })
}

function usePatientDetail(patientId) {
  return useQuery({
    queryKey: ['admin', 'patient-detail', patientId],
    queryFn: () => api.get(`/api/admin/patients/${patientId}`),
    enabled: !!patientId,
    staleTime: 60000,
  })
}

// ─── Mock data (schema-accurate) ─────────────────────────────────────────────
// One Patient record with aggregated visit data
const MOCK_PATIENTS = [
  {
    // Patient model fields
    id: 1,
    name: 'James Otieno',
    date_of_birth: '1990-03-14',
    gender: 'male',
    phone: '0712 345 678',
    national_id: '28374610',
    blood_group: 'O+',
    allergies: null,
    // Aggregated from visits
    total_visits: 4,
    last_visit_date: '2026-06-10T08:30:00Z',
    last_visit_type: 'consultation',
    last_diagnosis: 'Acute febrile illness',
    total_billed: 5800,
    unpaid_balance: 0,
    visits: [
      {
        id: 1,
        visit_type: 'consultation',
        status: 'done',
        diagnosis: 'Acute febrile illness',
        arrived_at: '2026-06-10T08:30:00Z',
        doctor: { username: 'Dr. Kim' },
        bill: { consultation_fee: 500, lab_fee: 800, medication_fee: 200, procedure_fee: 0, total_amount: 1500, fee_status: 'paid' },
        lab_requests: [
          { id: 1, test_name: 'Full Blood Count', status: 'ready', result: '5.2 × 10³/μL', notes: 'Within normal limits' },
          { id: 2, test_name: 'Malaria RDT', status: 'ready', result: 'Negative', notes: null },
        ],
        prescriptions: [
          {
            id: 1, status: 'dispensed', notes: 'Take with food',
            items: [
              { id: 1, drug_name: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'Three times daily', duration: '5 days', quantity: 15, unit_cost: 10 },
              { id: 2, drug_name: 'Paracetamol 500mg', dosage: '500mg', frequency: 'Every 8 hours', duration: '3 days', quantity: 9, unit_cost: 5 },
            ],
          },
        ],
      },
      {
        id: 11,
        visit_type: 'direct_lab',
        status: 'done',
        diagnosis: null,
        arrived_at: '2026-04-22T09:00:00Z',
        referred_by: 'Dr. Mwangi (Kenyatta Hospital)',
        referrer_phone: '0700 111 222',
        doctor: null,
        bill: { consultation_fee: 0, lab_fee: 1200, medication_fee: 0, procedure_fee: 0, total_amount: 1200, fee_status: 'paid' },
        lab_requests: [
          { id: 20, test_name: 'Liver Function Tests', status: 'ready', result: 'ALT 32 U/L — normal', notes: null },
        ],
        prescriptions: [],
      },
    ],
  },
  {
    id: 2,
    name: 'Aisha Kamau',
    date_of_birth: '1998-07-22',
    gender: 'female',
    phone: '0722 456 789',
    national_id: '39182736',
    blood_group: 'A+',
    allergies: 'Penicillin',
    total_visits: 2,
    last_visit_date: '2026-06-10T09:00:00Z',
    last_visit_type: 'consultation',
    last_diagnosis: 'Upper respiratory tract infection',
    total_billed: 1800,
    unpaid_balance: 900,
    visits: [
      {
        id: 2,
        visit_type: 'consultation',
        status: 'done',
        diagnosis: 'Upper respiratory tract infection',
        arrived_at: '2026-06-10T09:00:00Z',
        doctor: { username: 'Dr. Kim' },
        bill: { consultation_fee: 500, lab_fee: 0, medication_fee: 400, procedure_fee: 0, total_amount: 900, fee_status: 'pending' },
        lab_requests: [],
        prescriptions: [
          {
            id: 2, status: 'dispensed', notes: null,
            items: [
              { id: 3, drug_name: 'Cetirizine 10mg', dosage: '10mg', frequency: 'Once daily', duration: '7 days', quantity: 7, unit_cost: 15 },
              { id: 4, drug_name: 'Salbutamol inhaler', dosage: '100mcg/puff', frequency: 'As needed', duration: '14 days', quantity: 1, unit_cost: 300 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 3,
    name: 'Peter Mwangi',
    date_of_birth: '1973-11-05',
    gender: 'male',
    phone: '0733 567 890',
    national_id: '10293847',
    blood_group: 'B+',
    allergies: null,
    total_visits: 6,
    last_visit_date: '2026-06-09T10:15:00Z',
    last_visit_type: 'consultation',
    last_diagnosis: 'Hypertensive urgency',
    total_billed: 18400,
    unpaid_balance: 0,
    visits: [
      {
        id: 3,
        visit_type: 'consultation',
        status: 'done',
        diagnosis: 'Hypertensive urgency',
        arrived_at: '2026-06-09T10:15:00Z',
        doctor: { username: 'Dr. Kim' },
        bill: { consultation_fee: 500, lab_fee: 1700, medication_fee: 1000, procedure_fee: 0, total_amount: 3200, fee_status: 'paid' },
        lab_requests: [
          { id: 3, test_name: 'ECG', status: 'ready', result: 'Normal sinus rhythm', notes: null },
          { id: 4, test_name: 'Renal Function Tests', status: 'ready', result: 'Creatinine 88 μmol/L', notes: 'Within range' },
        ],
        prescriptions: [
          {
            id: 3, status: 'dispensed', notes: 'Take in the morning',
            items: [
              { id: 4, drug_name: 'Amlodipine 5mg', dosage: '5mg', frequency: 'Once daily', duration: '30 days', quantity: 30, unit_cost: 25 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 4,
    name: 'Grace Wanjiku',
    date_of_birth: '2007-01-30',
    gender: 'female',
    phone: '0744 678 901',
    national_id: '48291037',
    blood_group: 'AB-',
    allergies: null,
    total_visits: 1,
    last_visit_date: '2026-06-09T11:30:00Z',
    last_visit_type: 'consultation',
    last_diagnosis: 'Allergic contact dermatitis',
    total_billed: 1100,
    unpaid_balance: 0,
    visits: [
      {
        id: 4,
        visit_type: 'consultation',
        status: 'done',
        diagnosis: 'Allergic contact dermatitis',
        arrived_at: '2026-06-09T11:30:00Z',
        doctor: { username: 'Dr. Kim' },
        bill: { consultation_fee: 500, lab_fee: 0, medication_fee: 600, procedure_fee: 0, total_amount: 1100, fee_status: 'paid' },
        lab_requests: [],
        prescriptions: [
          {
            id: 4, status: 'dispensed', notes: 'Apply sparingly to affected area',
            items: [
              { id: 5, drug_name: 'Hydrocortisone cream 1%', dosage: 'Topical', frequency: 'Twice daily', duration: '7 days', quantity: 1, unit_cost: 150 },
              { id: 6, drug_name: 'Loratadine 10mg', dosage: '10mg', frequency: 'Once daily', duration: '5 days', quantity: 5, unit_cost: 20 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 5,
    name: 'Samuel Korir',
    date_of_birth: '1963-08-12',
    gender: 'male',
    phone: '0755 789 012',
    national_id: '57381920',
    blood_group: 'O-',
    allergies: 'Sulfonamides',
    total_visits: 12,
    last_visit_date: '2026-06-08T08:00:00Z',
    last_visit_type: 'consultation',
    last_diagnosis: 'Type 2 diabetes — routine review',
    total_billed: 28800,
    unpaid_balance: 0,
    visits: [
      {
        id: 5,
        visit_type: 'consultation',
        status: 'done',
        diagnosis: 'Type 2 diabetes — routine review',
        arrived_at: '2026-06-08T08:00:00Z',
        doctor: { username: 'Dr. Kim' },
        bill: { consultation_fee: 500, lab_fee: 1400, medication_fee: 500, procedure_fee: 0, total_amount: 2400, fee_status: 'waived' },
        lab_requests: [
          { id: 5, test_name: 'HbA1c', status: 'ready', result: '6.8%', notes: 'Controlled' },
          { id: 6, test_name: 'Fasting Blood Sugar', status: 'ready', result: '5.9 mmol/L', notes: 'Normal' },
        ],
        prescriptions: [
          {
            id: 5, status: 'dispensed', notes: 'Continue with meals',
            items: [
              { id: 7, drug_name: 'Metformin 500mg', dosage: '500mg', frequency: 'Twice daily', duration: '90 days', quantity: 180, unit_cost: 8 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 6,
    name: 'Faith Njeri',
    date_of_birth: '2019-04-03',
    gender: 'female',
    phone: '0766 890 123',
    national_id: null,
    blood_group: 'A-',
    allergies: null,
    total_visits: 3,
    last_visit_date: '2026-06-08T09:45:00Z',
    last_visit_type: 'consultation',
    last_diagnosis: 'Gastroenteritis',
    total_billed: 2400,
    unpaid_balance: 0,
    visits: [
      {
        id: 6,
        visit_type: 'consultation',
        status: 'done',
        diagnosis: 'Gastroenteritis',
        arrived_at: '2026-06-08T09:45:00Z',
        doctor: { username: 'Dr. Kim' },
        bill: { consultation_fee: 500, lab_fee: 100, medication_fee: 200, procedure_fee: 0, total_amount: 800, fee_status: 'paid' },
        lab_requests: [
          { id: 7, test_name: 'Stool Culture', status: 'ready', result: 'No pathogens isolated', notes: null },
        ],
        prescriptions: [
          {
            id: 6, status: 'dispensed', notes: null,
            items: [
              { id: 8, drug_name: 'ORS sachets', dosage: 'Per instructions', frequency: 'After each loose stool', duration: '3 days', quantity: 6, unit_cost: 30 },
              { id: 9, drug_name: 'Zinc sulfate 20mg syrup', dosage: '10ml', frequency: 'Once daily', duration: '10 days', quantity: 1, unit_cost: 120 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 7,
    name: 'David Ochieng',
    date_of_birth: '1985-05-19',
    gender: 'male',
    phone: '0777 901 234',
    national_id: '66172839',
    blood_group: 'B-',
    allergies: null,
    total_visits: 2,
    last_visit_date: '2026-06-07T08:30:00Z',
    last_visit_type: 'injection',
    last_diagnosis: 'Mechanical low back pain',
    total_billed: 1500,
    unpaid_balance: 0,
    visits: [
      {
        id: 7,
        visit_type: 'injection',
        status: 'done',
        diagnosis: 'Mechanical low back pain',
        arrived_at: '2026-06-07T08:30:00Z',
        doctor: { username: 'Dr. Kim' },
        bill: { consultation_fee: 0, lab_fee: 0, medication_fee: 300, procedure_fee: 400, total_amount: 700, fee_status: 'paid' },
        lab_requests: [],
        prescriptions: [
          {
            id: 7, status: 'dispensed', notes: 'Take with food',
            items: [
              { id: 10, drug_name: 'Ibuprofen 400mg', dosage: '400mg', frequency: 'Three times daily', duration: '5 days', quantity: 15, unit_cost: 10 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 8,
    name: 'Mary Wambui',
    date_of_birth: '1989-02-28',
    gender: 'female',
    phone: '0788 012 345',
    national_id: '77283910',
    blood_group: 'O+',
    allergies: null,
    total_visits: 5,
    last_visit_date: '2026-06-07T10:00:00Z',
    last_visit_type: 'consultation',
    last_diagnosis: 'Essential hypertension',
    total_billed: 9000,
    unpaid_balance: 0,
    visits: [
      {
        id: 8,
        visit_type: 'consultation',
        status: 'done',
        diagnosis: 'Essential hypertension',
        arrived_at: '2026-06-07T10:00:00Z',
        doctor: { username: 'Dr. Kim' },
        bill: { consultation_fee: 500, lab_fee: 700, medication_fee: 600, procedure_fee: 0, total_amount: 1800, fee_status: 'paid' },
        lab_requests: [
          { id: 8, test_name: 'Lipid Profile', status: 'ready', result: 'LDL 2.8 mmol/L', notes: 'Acceptable' },
          { id: 9, test_name: 'Urinalysis', status: 'ready', result: 'Normal', notes: null },
        ],
        prescriptions: [
          {
            id: 8, status: 'dispensed', notes: 'Monitor BP weekly',
            items: [
              { id: 11, drug_name: 'Enalapril 5mg', dosage: '5mg', frequency: 'Once daily', duration: '30 days', quantity: 30, unit_cost: 20 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 9,
    name: 'John Kamande',
    date_of_birth: '1997-09-08',
    gender: 'male',
    phone: '0799 123 456',
    national_id: '88391027',
    blood_group: 'A+',
    allergies: null,
    total_visits: 3,
    last_visit_date: '2026-06-06T07:30:00Z',
    last_visit_type: 'direct_lab',
    last_diagnosis: null,
    total_billed: 3600,
    unpaid_balance: 1200,
    visits: [
      {
        id: 9,
        visit_type: 'direct_lab',
        status: 'done',
        diagnosis: null,
        referred_by: 'Dr. Omondi (Aga Khan)',
        referrer_phone: '0711 222 333',
        arrived_at: '2026-06-06T07:30:00Z',
        doctor: null,
        bill: { consultation_fee: 0, lab_fee: 1200, medication_fee: 0, procedure_fee: 0, total_amount: 1200, fee_status: 'pending' },
        lab_requests: [
          { id: 10, test_name: 'Malaria RDT', status: 'ready', result: 'Positive (P. falciparum)', notes: null },
          { id: 11, test_name: 'Full Blood Count', status: 'ready', result: 'Hb 11.2 g/dL — mild anaemia', notes: 'Monitor' },
        ],
        prescriptions: [],
      },
    ],
  },
  {
    id: 10,
    name: 'Susan Achieng',
    date_of_birth: '1982-12-15',
    gender: 'female',
    phone: '0700 234 567',
    national_id: '99102837',
    blood_group: 'B+',
    allergies: null,
    total_visits: 7,
    last_visit_date: '2026-06-06T09:00:00Z',
    last_visit_type: 'consultation',
    last_diagnosis: 'Urinary tract infection',
    total_billed: 9800,
    unpaid_balance: 0,
    visits: [
      {
        id: 10,
        visit_type: 'consultation',
        status: 'done',
        diagnosis: 'Urinary tract infection',
        arrived_at: '2026-06-06T09:00:00Z',
        doctor: { username: 'Dr. Kim' },
        bill: { consultation_fee: 500, lab_fee: 500, medication_fee: 400, procedure_fee: 0, total_amount: 1400, fee_status: 'paid' },
        lab_requests: [
          { id: 12, test_name: 'Urinalysis', status: 'ready', result: 'WBCs +++, bacteria ++', notes: 'Consistent with UTI' },
          { id: 13, test_name: 'Urine Culture & Sensitivity', status: 'ready', result: 'E. coli — sensitive to Nitrofurantoin', notes: null },
        ],
        prescriptions: [
          {
            id: 10, status: 'dispensed', notes: 'Drink plenty of water',
            items: [
              { id: 13, drug_name: 'Nitrofurantoin 100mg', dosage: '100mg', frequency: 'Twice daily', duration: '7 days', quantity: 14, unit_cost: 25 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 11,
    name: 'Miriam Chebet',
    date_of_birth: '2000-06-20',
    gender: 'female',
    phone: '0711 345 678',
    national_id: '11029384',
    blood_group: 'O+',
    allergies: null,
    total_visits: 2,
    last_visit_date: '2026-06-05T10:00:00Z',
    last_visit_type: 'family_planning',
    last_diagnosis: null,
    total_billed: 1600,
    unpaid_balance: 0,
    visits: [
      {
        id: 12,
        visit_type: 'family_planning',
        status: 'done',
        diagnosis: null,
        arrived_at: '2026-06-05T10:00:00Z',
        doctor: { username: 'Dr. Auma' },
        bill: { consultation_fee: 0, lab_fee: 0, medication_fee: 0, procedure_fee: 800, total_amount: 800, fee_status: 'paid' },
        lab_requests: [],
        prescriptions: [],
      },
    ],
  },
  {
    id: 12,
    name: 'Kevin Njoroge',
    date_of_birth: '1978-03-27',
    gender: 'male',
    phone: '0722 567 890',
    national_id: '22103948',
    blood_group: 'AB+',
    allergies: 'Aspirin',
    total_visits: 1,
    last_visit_date: '2026-06-04T11:00:00Z',
    last_visit_type: 'direct_lab',
    last_diagnosis: null,
    total_billed: 2200,
    unpaid_balance: 0,
    visits: [
      {
        id: 13,
        visit_type: 'direct_lab',
        status: 'done',
        diagnosis: null,
        referred_by: 'Dr. Waweru (MP Shah)',
        referrer_phone: '0733 444 555',
        arrived_at: '2026-06-04T11:00:00Z',
        doctor: null,
        bill: { consultation_fee: 0, lab_fee: 2200, medication_fee: 0, procedure_fee: 0, total_amount: 2200, fee_status: 'paid' },
        lab_requests: [
          { id: 21, test_name: 'PSA (Prostate Specific Antigen)', status: 'ready', result: '3.2 ng/mL — normal', notes: null },
          { id: 22, test_name: 'Lipid Profile', status: 'ready', result: 'LDL 3.1 mmol/L', notes: 'Borderline' },
          { id: 23, test_name: 'Thyroid Function Tests', status: 'ready', result: 'TSH 2.4 mIU/L — normal', notes: null },
        ],
        prescriptions: [],
      },
    ],
  },
]

const MOCK_STATS = {
  total_patients: 248,
  total_billed: 1246500,
  unpaid_balance: 87200,
  top_diagnosis: 'Malaria / Fever',
}

// ─── Period options ───────────────────────────────────────────────────────────
const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'this_year', label: 'This year' },
]

// ─── Visit type filter tabs ───────────────────────────────────────────────────
const VISIT_TYPE_TABS = [
  { key: 'all', label: 'All patients' },
  { key: 'consultation', label: 'Consultation' },
  { key: 'direct_lab', label: 'Direct to lab' },
  { key: 'injection', label: 'Injection' },
  { key: 'family_planning', label: 'Family planning' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAge(dob) {
  if (!dob) return null
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-KE', {
    hour: '2-digit', minute: '2-digit',
  })
}

const FEE_COLORS = {
  paid:    'text-emerald-600 dark:text-emerald-400',
  pending: 'text-amber-600  dark:text-amber-400',
  waived:  'text-gray-400   dark:text-gray-500',
}

const FEE_BADGE = {
  paid:    'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-700/40',
  pending: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-700/40',
  waived:  'bg-gray-50 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700/40',
}

const LAB_STATUS_COLORS = {
  pending:     'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-700/40',
  in_progress: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-700/40',
  ready:       'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-700/40',
}

const VISIT_TYPE_COLORS = {
  consultation:   'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-700/40',
  direct_lab:     'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border-purple-100 dark:border-purple-700/40',
  injection:      'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-700/40',
  family_planning:'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-400 border-pink-100 dark:border-pink-700/40',
}

const VISIT_TYPE_LABELS = {
  consultation: 'Consultation',
  direct_lab: 'Direct lab',
  injection: 'Injection',
  family_planning: 'Family planning',
}

const GENDER_INITIALS = { male: '♂', female: '♀', other: '⚧' }

// ─── Patient detail slide-over ────────────────────────────────────────────────
function PatientDetailPanel({ patientId, onClose }) {
  const { data: patientData, isLoading } = usePatientDetail(patientId)
  const [expandedVisitId, setExpandedVisitId] = useState(null)

  const patient = patientData || MOCK_PATIENTS.find((p) => p.id === patientId)
  if (!patient && !isLoading) return null

  const age = getAge(patient?.date_of_birth)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-white dark:bg-[#1e293b] h-full overflow-y-auto shadow-2xl border-l border-gray-200 dark:border-gray-700 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-[#1e293b] z-10">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Patient Record</h2>
            {patient && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                {patient.total_visits} visit{patient.total_visits !== 1 ? 's' : ''} · ID {patient.national_id ?? 'not captured'}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none transition-colors"
          >×</button>
        </div>

        {isLoading ? (
          <div className="flex-1 p-6 space-y-4">
            {[1,2,3,4].map((i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : patient ? (
          <div className="px-6 py-5 space-y-5 flex-1">

            {/* Patient profile */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 flex items-center justify-center text-lg font-bold">
                {patient.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-bold text-gray-900 dark:text-gray-100">{patient.name}</p>
                  {patient.gender && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">{GENDER_INITIALS[patient.gender]}</span>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 dark:text-gray-500">
                  {age !== null ? `${age} yrs` : 'Age unknown'}
                  {patient.phone && <> · {patient.phone}</>}
                </p>
              </div>
            </div>

            {/* Patient metadata chips */}
            <div className="flex flex-wrap gap-2">
              {patient.blood_group && (
                <span className="text-[11px] px-2.5 py-1 rounded-lg border bg-red-50 dark:bg-red-900/15 text-red-600 dark:text-red-400 border-red-100 dark:border-red-700/40 font-semibold">
                  {patient.blood_group}
                </span>
              )}
              {patient.allergies && (
                <span className="text-[11px] px-2.5 py-1 rounded-lg border bg-orange-50 dark:bg-orange-900/15 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-700/40">
                  ⚠ {patient.allergies}
                </span>
              )}
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-center">
                <p className="text-[18px] font-bold text-gray-900 dark:text-gray-100">{patient.total_visits}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-0.5">Visits</p>
              </div>
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-center">
                <p className="text-[15px] font-bold text-gray-900 dark:text-gray-100">
                  {(patient.total_billed / 1000).toFixed(1)}k
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-0.5">KES billed</p>
              </div>
              <div className="rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-center">
                <p className={`text-[15px] font-bold ${patient.unpaid_balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {patient.unpaid_balance > 0 ? `${(patient.unpaid_balance / 1000).toFixed(1)}k` : '0'}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-0.5">Unpaid</p>
              </div>
            </div>

            {/* Visit history */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                Visit History ({patient.visits?.length ?? 0})
              </p>
              <div className="space-y-2">
                {(patient.visits || []).map((v) => (
                  <div key={v.id} className="rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                    {/* Visit header — clickable to expand */}
                    <button
                      onClick={() => setExpandedVisitId(expandedVisitId === v.id ? null : v.id)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/60 dark:bg-gray-800/30 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${VISIT_TYPE_COLORS[v.visit_type]}`}>
                          {VISIT_TYPE_LABELS[v.visit_type]}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {formatDate(v.arrived_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {v.bill && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${FEE_BADGE[v.bill.fee_status]}`}>
                            {v.bill.fee_status}
                          </span>
                        )}
                        <svg
                          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expandedVisitId === v.id ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                      </div>
                    </button>

                    {/* Expanded visit content */}
                    {expandedVisitId === v.id && (
                      <div className="px-4 py-3 space-y-3">

                        {/* Doctor / referrer */}
                        <div className="flex items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400">
                          {v.doctor && <span>Dr: {v.doctor.username}</span>}
                          {v.referred_by && (
                            <span className="text-purple-600 dark:text-purple-400">
                              Ref: {v.referred_by}
                            </span>
                          )}
                        </div>

                        {/* Diagnosis */}
                        {v.diagnosis && (
                          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/15 rounded-lg border border-blue-100 dark:border-blue-800/40">
                            <p className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wide mb-0.5">Diagnosis</p>
                            <p className="text-[12px] text-gray-800 dark:text-gray-200">{v.diagnosis}</p>
                          </div>
                        )}

                        {/* Bill breakdown */}
                        {v.bill && (
                          <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden text-[11px]">
                            {v.bill.consultation_fee > 0 && (
                              <div className="flex justify-between px-3 py-1.5 border-b border-gray-50 dark:border-gray-700/40">
                                <span className="text-gray-500 dark:text-gray-400">Consultation</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">KES {v.bill.consultation_fee.toLocaleString()}</span>
                              </div>
                            )}
                            {v.bill.lab_fee > 0 && (
                              <div className="flex justify-between px-3 py-1.5 border-b border-gray-50 dark:border-gray-700/40">
                                <span className="text-gray-500 dark:text-gray-400">Lab</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">KES {v.bill.lab_fee.toLocaleString()}</span>
                              </div>
                            )}
                            {v.bill.medication_fee > 0 && (
                              <div className="flex justify-between px-3 py-1.5 border-b border-gray-50 dark:border-gray-700/40">
                                <span className="text-gray-500 dark:text-gray-400">Medication</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">KES {v.bill.medication_fee.toLocaleString()}</span>
                              </div>
                            )}
                            {v.bill.procedure_fee > 0 && (
                              <div className="flex justify-between px-3 py-1.5 border-b border-gray-50 dark:border-gray-700/40">
                                <span className="text-gray-500 dark:text-gray-400">Procedure</span>
                                <span className="font-mono text-gray-700 dark:text-gray-300">KES {v.bill.procedure_fee.toLocaleString()}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/40">
                              <span className="text-[11px] font-bold text-gray-800 dark:text-gray-200">Total</span>
                              <span className="font-mono font-bold text-gray-900 dark:text-gray-100">KES {v.bill.total_amount.toLocaleString()}</span>
                            </div>
                          </div>
                        )}

                        {/* Lab requests */}
                        {v.lab_requests?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
                              Lab Results ({v.lab_requests.length})
                            </p>
                            <div className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
                              <table className="w-full text-[11px]">
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                                  {v.lab_requests.map((lr) => (
                                    <tr key={lr.id}>
                                      <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{lr.test_name}</td>
                                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                                        {lr.result ?? <span className="italic text-gray-300 dark:text-gray-600">Pending</span>}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${LAB_STATUS_COLORS[lr.status]}`}>
                                          {lr.status.replace('_', ' ')}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Prescriptions */}
                        {v.prescriptions?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
                              Prescriptions
                            </p>
                            {v.prescriptions.map((rx) => (
                              <div key={rx.id} className="rounded-lg border border-teal-100 dark:border-teal-800/30 overflow-hidden">
                                <div className="divide-y divide-gray-50 dark:divide-gray-700/30">
                                  {rx.items?.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800/20">
                                      <div>
                                        <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200">{item.drug_name}</p>
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{item.frequency} · {item.duration}</p>
                                      </div>
                                      <p className="text-[10px] text-gray-400 dark:text-gray-500">×{item.quantity}</p>
                                    </div>
                                  ))}
                                </div>
                                {rx.notes && (
                                  <p className="px-3 py-1.5 text-[10px] italic text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/40">
                                    {rx.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`bg-white dark:bg-[#1e293b] rounded-xl border p-4 flex flex-col gap-1 transition-colors ${accent || 'border-gray-200 dark:border-gray-700/60'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PatientArchivePage() {
  const [period, setPeriod]       = useState('this_month')
  const [page, setPage]           = useState(1)
  const [visitType, setVisitType] = useState('all')
  const [feeStatus, setFeeStatus] = useState('all')
  const [gender, setGender]       = useState('all')
  const [search, setSearch]       = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const patientsQuery = usePatients({ page, period, visitType, feeStatus, search })
  const statsQuery    = usePatientStats(period)

  // Use real data when available, fall back to mock
  const allPatients = patientsQuery.data?.patients || MOCK_PATIENTS
  const total       = patientsQuery.data?.total    || MOCK_PATIENTS.length
  const stats       = statsQuery.data              || MOCK_STATS

  // Client-side filter for mock data (real API handles filtering server-side)
  const patients = useMemo(() => {
    if (patientsQuery.data) return allPatients
    return allPatients.filter((p) => {
      if (visitType !== 'all' && p.last_visit_type !== visitType) return false
      if (gender !== 'all' && p.gender !== gender) return false
      if (feeStatus !== 'all') {
        const hasStatus = p.visits.some((v) => v.bill?.fee_status === feeStatus)
        if (!hasStatus) return false
      }
      if (search) {
        const q = search.toLowerCase()
        return (
          p.name.toLowerCase().includes(q) ||
          p.phone?.includes(q) ||
          p.national_id?.includes(q)
        )
      }
      return true
    })
  }, [allPatients, visitType, gender, feeStatus, search, patientsQuery.data])

  const totalPages = Math.ceil(total / 20)

  const handleSearch = (e) => { setSearch(e.target.value); setPage(1) }

  const getPageNumbers = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 3)              return [1, 2, 3, '...', totalPages]
    if (page >= totalPages - 2) return [1, '...', totalPages - 2, totalPages - 1, totalPages]
    return [1, '...', page - 1, page, page + 1, '...', totalPages]
  }

  // Count per tab for badges (mock only)
  const tabCounts = useMemo(() => {
    const base = patientsQuery.data ? null : MOCK_PATIENTS
    if (!base) return {}
    return VISIT_TYPE_TABS.reduce((acc, tab) => {
      acc[tab.key] = tab.key === 'all'
        ? base.length
        : base.filter((p) => p.last_visit_type === tab.key).length
      return acc
    }, {})
  }, [patientsQuery.data])

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-[18px] font-bold text-gray-900 dark:text-gray-100">Patients</h2>
          <p className="text-[13px] text-gray-400 dark:text-gray-500 mt-0.5">
            One record per patient — all visits aggregated
          </p>
        </div>
        {/* Period tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPeriod(p.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                period === p.key
                  ? 'bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Total patients"
          value={(stats.total_patients ?? 0).toLocaleString()}
          sub={PERIODS.find((p) => p.key === period)?.label.toLowerCase()}
        />
        <StatCard
          label="Total billed"
          value={`KES ${((stats.total_billed || 0) / 1000).toFixed(0)}k`}
          sub={PERIODS.find((p) => p.key === period)?.label.toLowerCase()}
          accent="border-emerald-200 dark:border-emerald-700/40"
        />
        <StatCard
          label="Unpaid balance"
          value={`KES ${((stats.unpaid_balance || 0) / 1000).toFixed(0)}k`}
          sub="outstanding"
          accent="border-amber-200 dark:border-amber-700/40"
        />
        <StatCard
          label="Top diagnosis"
          value={stats.top_diagnosis ?? '—'}
          sub="most common"
          accent="border-blue-200 dark:border-blue-700/40"
        />
      </div>

      {/* Visit type filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {VISIT_TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setVisitType(tab.key); setPage(1) }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all border ${
              visitType === tab.key
                ? 'bg-[#1a6cbf] text-white border-[#1a6cbf] shadow-sm'
                : 'bg-white dark:bg-[#1e293b] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700/60 hover:border-blue-300 dark:hover:border-blue-700 hover:text-[#1a6cbf] dark:hover:text-blue-400'
            }`}
          >
            {tab.label}
            {tabCounts[tab.key] !== undefined && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                visitType === tab.key
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-gray-200 dark:border-gray-700/60 overflow-hidden transition-colors">

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 flex-1">
            {patients.length.toLocaleString()} patients
          </h3>

          {/* Gender filter */}
          <select
            value={gender}
            onChange={(e) => { setGender(e.target.value); setPage(1) }}
            className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
          >
            <option value="all">All genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>

          {/* Fee status filter */}
          <select
            value={feeStatus}
            onChange={(e) => { setFeeStatus(e.target.value); setPage(1) }}
            className="text-[12px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
          >
            <option value="all">All fees</option>
            <option value="paid">Paid</option>
            <option value="pending">Has unpaid</option>
            <option value="waived">Has waived</option>
          </select>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 dark:text-gray-600"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z"/>
            </svg>
            <input
              value={search}
              onChange={handleSearch}
              placeholder="Name, phone, ID…"
              className="pl-8 pr-4 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-lg w-44 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Export */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Export
          </button>

          {patientsQuery.isFetching && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 animate-pulse">Loading…</span>
          )}
        </div>

        {/* Table */}
        {patientsQuery.isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/50 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Patient</th>
                  <th className="text-left px-5 py-3">Last visit</th>
                  <th className="text-left px-5 py-3">Type</th>
                  <th className="text-left px-5 py-3">Last diagnosis</th>
                  <th className="text-left px-5 py-3">Visits</th>
                  <th className="text-left px-5 py-3">Total billed</th>
                  <th className="text-left px-5 py-3">Unpaid</th>
                  <th className="text-left px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                {patients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-14 text-[13px] text-gray-400 dark:text-gray-500">
                      No patients found
                    </td>
                  </tr>
                ) : patients.map((p) => {
                  const age = getAge(p.date_of_birth)
                  return (
                    <tr key={p.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition-colors group">

                      {/* Patient */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 text-[#1a6cbf] dark:text-blue-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                            {p.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{p.name}</p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">
                              {age !== null ? `${age} yrs` : '—'}
                              {p.allergies && <> · <span className="text-orange-500 dark:text-orange-400">⚠</span></>}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Last visit date */}
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 font-mono text-[11px] whitespace-nowrap">
                        {p.last_visit_date ? (
                          <>
                            <p>{formatDate(p.last_visit_date)}</p>
                            <p className="text-gray-300 dark:text-gray-600">{formatTime(p.last_visit_date)}</p>
                          </>
                        ) : '—'}
                      </td>

                      {/* Last visit type */}
                      <td className="px-5 py-3.5">
                        {p.last_visit_type ? (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${VISIT_TYPE_COLORS[p.last_visit_type]}`}>
                            {VISIT_TYPE_LABELS[p.last_visit_type]}
                          </span>
                        ) : '—'}
                      </td>

                      {/* Last diagnosis */}
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-400 max-w-45 truncate" title={p.last_diagnosis}>
                        {p.last_diagnosis ?? <span className="text-gray-300 dark:text-gray-600 italic">None recorded</span>}
                      </td>

                      {/* Total visits */}
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{p.total_visits}</span>
                      </td>

                      {/* Total billed */}
                      <td className="px-5 py-3.5 font-mono font-semibold text-gray-900 dark:text-gray-100">
                        {p.total_billed.toLocaleString()}
                      </td>

                      {/* Unpaid balance */}
                      <td className="px-5 py-3.5">
                        {p.unpaid_balance > 0 ? (
                          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                            {p.unpaid_balance.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-emerald-500 dark:text-emerald-400 text-[11px] font-semibold">Cleared</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => setSelectedId(p.id)}
                          className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600 hover:text-[#1a6cbf] dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="px-5 py-3 bg-gray-50/70 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total.toLocaleString()} · Page {page}/{totalPages || 1}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
              </svg>
            </button>

            {getPageNumbers().map((pg, i) =>
              pg === '...' ? (
                <span key={`dots-${i}`} className="text-[11px] text-gray-400 dark:text-gray-500 px-1">···</span>
              ) : (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg text-[11px] font-medium transition-colors ${
                    page === pg
                      ? 'bg-[#1a6cbf] text-white border border-[#1a6cbf]'
                      : 'border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {pg}
                </button>
              )
            )}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || totalPages === 0}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Detail slide-over */}
      {selectedId && (
        <PatientDetailPanel
          patientId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  )
}