import { useEffect, useState } from 'react'
import { fetchBenchmarks } from './api'
import { fetchExercises } from '@/features/training/api'
import { fetchSupplements } from '@/features/supplements/api'
import type { RequirementCatalogs } from './protocol-form'

const emptyCatalogs: RequirementCatalogs = { supplements: [], exercises: [], benchmarks: [] }

export function useLabCatalogs(): RequirementCatalogs {
  const [catalogs, setCatalogs] = useState<RequirementCatalogs>(emptyCatalogs)
  useEffect(() => {
    let cancelled = false
    Promise.all([fetchSupplements(), fetchExercises(), fetchBenchmarks()])
      .then(([supplements, exercises, benchmarks]) => {
        if (cancelled) {
          return
        }
        setCatalogs({
          supplements: supplements.supplements.map((item) => ({ id: item.id, label: item.name })),
          exercises: exercises.map((item) => ({ id: item.id, label: item.name })),
          benchmarks: benchmarks.benchmarks.filter((item) => item.isActive).map((item) => ({
            id: item.id,
            label: item.title,
            protocolVersionId: item.currentVersionId,
          })),
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return catalogs
}
