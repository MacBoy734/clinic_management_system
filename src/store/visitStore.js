import { create } from 'zustand'

export const useVisitStore = create((set) => ({
  activeVisitId:   null,
  activePatientId: null,

  setActiveVisit: (visitId, patientId) =>
    set({ activeVisitId: visitId, activePatientId: patientId }),

  clearActiveVisit: () =>
    set({ activeVisitId: null, activePatientId: null }),
}))