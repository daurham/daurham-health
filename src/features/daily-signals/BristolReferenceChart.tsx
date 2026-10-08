const descriptions = [
  ['Separate hard lumps', 'Often difficult to pass'],
  ['Lumpy sausage', 'Firm stool with distinct lumps'],
  ['Sausage with cracks', 'Formed stool with surface cracks'],
  ['Smooth soft sausage', 'Smooth, soft and formed'],
  ['Soft blobs', 'Distinct soft pieces with clear edges'],
  ['Mushy pieces', 'Fluffy or ragged edges'],
  ['Watery', 'Liquid without solid pieces'],
] as const

function StoolShape({ type }: { type: number }) {
  const fill = 'var(--health-accent-secondary)'
  if (type === 1) return (
    <svg aria-hidden="true" viewBox="0 0 100 36" className="h-9 w-24">
      {[14, 35, 59, 82].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 23 : 16} r={i % 2 ? 10 : 9} fill={fill} />)}
    </svg>
  )
  if (type === 2) return (
    <svg aria-hidden="true" viewBox="0 0 100 36" className="h-9 w-24">
      <path d="M6 24 Q8 9 23 12 Q33 2 46 12 Q56 5 65 13 Q82 4 94 21 Q95 33 78 31 Q60 37 48 29 Q26 36 6 24Z" fill={fill} />
    </svg>
  )
  if (type === 3) return (
    <svg aria-hidden="true" viewBox="0 0 100 36" className="h-9 w-24">
      <path d="M7 22 Q7 10 25 11 L78 12 Q95 13 94 25 Q90 34 75 30 L24 29 Q8 33 7 22Z" fill={fill} />
      <path d="M30 11 l-3 8 6 4 M55 12 l-3 7 6 5 M78 12 l-3 7" stroke="var(--health-surface)" strokeWidth="2" fill="none" />
    </svg>
  )
  if (type === 4) return (
    <svg aria-hidden="true" viewBox="0 0 100 36" className="h-9 w-24">
      <path d="M7 24 Q5 13 23 11 Q45 10 62 15 Q79 20 94 10 Q99 23 85 28 Q69 35 50 29 Q32 26 22 31 Q8 34 7 24Z" fill={fill} />
    </svg>
  )
  if (type === 5) return (
    <svg aria-hidden="true" viewBox="0 0 100 36" className="h-9 w-24">
      {[20, 49, 78].map((x) => <path key={x} d={`M${x-12} 22 q-3 -12 10 -13 q12 -3 16 10 q4 13 -11 15 q-15 0 -15 -12Z`} fill={fill} />)}
    </svg>
  )
  if (type === 6) return (
    <svg aria-hidden="true" viewBox="0 0 100 36" className="h-9 w-24">
      <path d="M9 25 Q0 15 17 11 Q23 3 35 11 Q43 2 53 13 Q66 3 76 14 Q88 8 96 22 Q98 34 79 32 Q63 39 47 31 Q29 38 20 31 Q9 36 9 25Z" fill={fill} opacity=".8" />
    </svg>
  )
  return (
    <svg aria-hidden="true" viewBox="0 0 100 36" className="h-9 w-24">
      <path d="M6 26 Q18 15 34 24 Q48 11 64 24 Q84 15 97 26 Q81 37 53 32 Q27 37 6 26Z" fill={fill} opacity=".7" />
      <path d="M19 14 q8 -9 16 0 M62 11 q8 -7 16 0" fill="none" stroke={fill} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function BristolReferenceChart({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Bristol stool chart" className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Bristol stool chart</h2>
          <button type="button" className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm" onClick={onClose}>Close</button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">Illustrated reference. Choose the shape closest to what you observed.</p>
        <ol className="mt-3 divide-y divide-zinc-100">
          {descriptions.map(([title, detail], index) => (
            <li key={title} className="flex items-center gap-2 py-2">
              <span className="w-6 shrink-0 text-center font-semibold text-accent">{index + 1}</span>
              <StoolShape type={index + 1} />
              <div className="min-w-0"><p className="text-sm font-semibold">{title}</p><p className="text-xs text-zinc-500">{detail}</p></div>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-zinc-500">Types 3–4 are typically formed; types 1–2 suggest constipation and types 6–7 loose stools. This is a reference, not a diagnosis.</p>
      </div>
    </div>
  )
}
