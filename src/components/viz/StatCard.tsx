// One headline number with its label (OLM-1), replacing the inline copies on
// /dashboard and /profile. `note` says what the number is computed over — a
// number without a reference frame is the thing Jivet et al. (2020) warn about.

export function StatCard({ value, label, accent, note, testId }: {
  value: string | number
  label: string
  accent?: string
  note?: string
  testId?: string
}) {
  return (
    <div className="p-4 rounded-xl border border-[var(--border)] bg-c-bg2" data-testid={testId}
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}>
      <p className="font-serif text-[28px] leading-none mb-1.5 text-c-text">{value}</p>
      <p className="font-mono text-[10px] text-c-muted uppercase tracking-[0.1em]">{label}</p>
      {note && <p className="text-[10px] text-c-faint mt-1">{note}</p>}
    </div>
  )
}
