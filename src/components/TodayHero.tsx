export function TodayHero({ date }: { date: string }) {
  return (
    <section className="today-hero" aria-label="Today's overview">
      <div className="relative z-10 max-w-[72%] py-2 sm:max-w-[65%]">
        <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-accent">Daurham Health · Today</p>
        <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-3xl">Your day, in focus.</h2>
        <p className="mt-2 text-xs font-medium text-zinc-600 sm:text-sm">{date}</p>
        <p className="mt-3 max-w-sm text-xs leading-relaxed text-zinc-600 sm:text-sm">Track what matters. Train at your pace.</p>
      </div>
      <svg className="today-hero-art" viewBox="0 0 460 220" role="presentation" focusable="false" aria-hidden="true">
        <g className="today-scene today-scene--ridge">
          <circle cx="345" cy="67" r="36" fill="var(--health-accent-secondary)" opacity=".24" />
          <path d="M10 220 L132 134 L183 171 L263 69 L334 156 L383 117 L460 184 L460 220Z" fill="var(--health-accent-secondary)" opacity=".23" />
          <path d="M105 220 L243 109 L309 178 L365 137 L460 191 L460 220Z" fill="var(--health-accent)" opacity=".31" />
          <path d="M210 220 L326 141 L384 186 L431 150 L460 167 L460 220Z" fill="var(--health-accent)" opacity=".23" />
        </g>
        <g className="today-scene today-scene--ocean">
          <circle cx="362" cy="65" r="42" fill="var(--health-accent-secondary)" opacity=".3" />
          <path d="M0 158 Q90 123 180 158 T360 153 T540 151 L540 220H0Z" fill="var(--health-accent-secondary)" opacity=".25"/>
          <path d="M0 186 Q85 158 174 183 T370 181 T550 174 L550 220H0Z" fill="var(--health-accent)" opacity=".3"/>
          <path d="M165 162 L230 107 L300 162Z" fill="var(--health-accent)" opacity=".19"/>
        </g>
        <g className="today-scene today-scene--cosmos">
          <circle cx="349" cy="74" r="53" fill="var(--health-accent-secondary)" opacity=".14"/>
          <circle cx="349" cy="74" r="32" fill="var(--health-accent)" opacity=".24"/>
          <circle cx="349" cy="74" r="24" fill="var(--health-accent-secondary)" opacity=".43"/>
          <ellipse cx="342" cy="83" rx="111" ry="21" fill="none" stroke="var(--health-accent)" strokeWidth="4" opacity=".4" transform="rotate(-20 342 83)"/>
          <g fill="var(--health-accent-secondary)" opacity=".7">
            <circle cx="174" cy="58" r="2"/><circle cx="225" cy="30" r="3"/><circle cx="419" cy="18" r="2"/><circle cx="436" cy="129" r="3"/><circle cx="280" cy="145" r="2"/>
          </g>
          <path d="M128 220 Q250 129 330 194 T500 174 L500 220Z" fill="var(--health-accent)" opacity=".14"/>
        </g>
        <g className="today-scene today-scene--wasteland">
          <circle cx="350" cy="78" r="48" fill="var(--health-accent-secondary)" opacity=".28"/>
          <path d="M120 220 L194 153 L236 163 L303 115 L357 152 L424 137 L500 177 L500 220Z" fill="var(--health-accent-secondary)" opacity=".23"/>
          <path d="M190 190h12v-31h6v31h8v-42h7v42h14v-24h7v24h9v-48h8v48h20v30h-91z" fill="var(--health-accent)" opacity=".22"/>
          <path d="M0 220 L110 206 L220 211 L320 193 L420 207 L500 192 L500 220Z" fill="var(--health-accent)" opacity=".3"/>
        </g>
      </svg>
    </section>
  )
}
