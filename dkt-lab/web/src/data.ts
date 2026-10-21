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

export interface Scores { auc: number; log_loss: number; rmse: number; accuracy: number; n: number }
export interface Metrics {
  protocol: string
  bkt: Scores & { fit_seconds: number }
  dkt: Scores & { train_seconds: number }
  roc: { bkt: { fpr: number[]; tpr: number[] }; dkt: { fpr: number[]; tpr: number[] } }
  per_skill_auc: { skill_id: string; label: string; n: number; bkt: number; dkt: number }[]
  dkt_config: Record<string, number | boolean>
  dkt_history: { epoch: number; train_loss: number; val_auc: number; seconds: number }[]
  test_students: number
}
export interface Curves { max_opportunity: number; min_rows: number; points: { opportunity: number; n: number; actual: number; bkt: number; dkt: number }[] }
export interface Heatmap {
  quantity: string
  skills: { skill_id: string; label: string }[]
  students: { student_id: string; length: number; bkt: number[]; dkt: number[]; practised: number[] }[]
}
export interface Samples { max_steps: number; students: { student_id: string; length: number; steps: [string, number][] }[] }
export interface BktParamsFile { skills: { skill_id: string; label: string; p_init: number; p_transit: number; p_slip: number; p_guess: number; n_train_sequences: number; default: boolean; hidden_concept?: number }[] }
export interface SummaryRow { id: string; name: string; kind_label: string; n: number; auc_gain: number; bkt: Omit<Scores, 'n'>; dkt: Omit<Scores, 'n'> }

// Lab 7/8 curve diagnostics (pipeline/diagnose.py). `model_cols` carry one key
// per model and per no-learning baseline, so point/fidelity records are indexed
// by name rather than having fixed bkt/dkt fields.
export type ModelKey = 'bkt' | 'dkt' | 'global_rate' | 'skill_rate' | 'student_rate' | 'skill_and_student'

export interface CurvePoint {
  opportunity: number
  from: number
  to: number
  label: string
  n: number
  actual: number
  actual_ci?: [number, number]
  [model: string]: number | string | [number, number] | undefined
}

export interface CurveFidelity {
  n_points: number
  actual_slope?: number
  models: Record<string, { mae: number; bias: number; slope: number; slope_ratio: number }>
}

export interface Diagnostics {
  question: string
  protocol: string
  kind: string
  reproduction_check: { ok: boolean; max_abs_delta: number; tolerance: number }
  all_model_scores: Record<string, Scores>
  baselines_note: string
  raw_curve: { kind: string; note: string; max_opportunity_in_data: number; min_rows: number; points: CurvePoint[] }
  cohort_curve: { kind: string; note: string; min_opportunities: number; pairs: number; min_rows: number; points: CurvePoint[] }
  raw_curve_fidelity: CurveFidelity
  cohort_curve_fidelity: CurveFidelity
  per_skill_fidelity: { skill_id: string; n: number; n_points: number; actual_slope: number; bkt: { mae: number; slope: number; slope_ratio: number }; dkt: { mae: number; slope: number; slope_ratio: number } }[]
  within_pair_spread: { pairs: number; min_opportunities: number; models: Record<string, { mean_within_pair_sd: number; mean_first_to_last_change: number }> }
  position_slices: { note: string; bins: { from: number; to: number; n: number; actual: number; bkt: PositionStat; dkt: PositionStat }[] }
  evidence_response: { note: string; students_sampled: number; bkt: EvidenceStat; dkt: EvidenceStat }
  consistency: { note: string; bkt: ConsistencyStat; dkt: ConsistencyStat }
  dataset_audit: {
    max_opportunity: number
    mean_attempts_per_student_skill: number
    fraction_pairs_with_one_attempt: number
    fraction_eval_rows_at_opportunity_1: number
    max_sequence_length: number
    has_time: boolean
    raw_multi_skill?: { file: string; mean_skills_per_problem: number; fraction_rows_from_multi_skill_problems: number }
  }
}

export interface PositionStat { auc: number; log_loss: number; mean_pred: number; ece: number }
export interface EvidenceStat {
  after_correct: { n: number; mean_delta: number; fraction_positive: number }
  after_wrong: { n: number; mean_delta: number; fraction_negative: number }
  separation: number
}
export interface ConsistencyStat { w1: number; w2: number; reconstruction_error: number; n_steps: number }

export const loadMetrics = (id: string) => loadJson<Metrics>(`${id}/metrics.json`)
export const loadCurves = (id: string) => loadJson<Curves>(`${id}/curves.json`)
export const loadDiagnostics = (id: string) => loadJson<Diagnostics>(`${id}/diagnostics.json`)
export const loadHeatmap = (id: string) => loadJson<Heatmap>(`${id}/heatmap.json`)
export const loadSamples = (id: string) => loadJson<Samples>(`${id}/samples.json`)
export const loadBktParams = (id: string) => loadJson<BktParamsFile>(`${id}/bkt_params.json`)
export const loadSummary = () => loadJson<{ datasets: SummaryRow[] }>('summary.json')
