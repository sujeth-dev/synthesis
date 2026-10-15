// Loads the JSON the offline pipeline (dkt-lab/pipeline/export.py) wrote to
// public/data/. Nothing here computes a reported number; it only reads them.
export interface DatasetEntry {
  id: string
  name: string
  kind: 'real' | 'synthetic'
  kind_label: string           // e.g. "real", "synthetic (paper benchmark)"
  source_url: string
  mirror_url?: string
  licence: string
  citation: string
  notes: string[]
  downloaded_from?: string | null
  download_url?: string | null
  has_timestamps?: boolean
  skill_trimming?: { skills_before: number; skills_after: number; interactions_dropped: number; interactions_dropped_pct: number } | null
}

export interface SkippedDataset { name: string; reason: string; url: string | null }

export interface LabIndex {
  generated_at: string | null
  datasets: DatasetEntry[]
  skipped?: SkippedDataset[]
}

export interface SeqLenStats {
  min: number; p10: number; p25: number; median: number; p75: number; p90: number; max: number; mean: number
  hist: { edges: number[]; counts: number[] }
}

export interface DatasetStats {
  students: number
  skills: number
  interactions: number
  pct_correct: number
  sequence_length: SeqLenStats
  skills_per_student_median: number
  split: Record<'train' | 'val' | 'test', { students: number; interactions: number }>
  top_skills: { skill_id: string; label: string; count: number; pct_correct: number }[]
}

export const loadStats = (id: string) => loadJson<{ provenance: DatasetEntry; stats: DatasetStats }>(`${id}/stats.json`)

const cache = new Map<string, Promise<unknown>>()

export function loadJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(path, fetch(`data/${path}`).then(r => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
      return r.json()
    }))
  }
  return cache.get(path) as Promise<T>
}

export const loadIndex = () => loadJson<LabIndex>('index.json')
