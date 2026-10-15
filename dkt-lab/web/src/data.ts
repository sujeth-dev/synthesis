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
}

export interface LabIndex {
  generated_at: string | null
  datasets: DatasetEntry[]
}

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
