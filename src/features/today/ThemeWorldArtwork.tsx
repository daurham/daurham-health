import type { ReactNode } from 'react'

/** Decorative vector silhouettes share the active theme's semantic palette.
 * No images, fonts, network requests, or runtime AI generation.
 */
function Gunship() {
  return <g className="world-vessel">
    <path d="M-57 6 L-20 -10 L27 -8 L62 6 L22 17 L-22 17 Z" className="world-ink" />
    <path d="M-24 -8 L-13 -28 L13 -28 L26 -8 Z" className="world-mid" />
    <path d="M-53 4 L-105 -9 L-91 12 L-45 16 M55 4 L97 -14 L95 12 L46 15" className="world-ink" />
    <path d="M-36 18 L-42 28 L-25 28 L-20 17 M26 17 L31 28 L47 28 L38 15" className="world-ink" />
    <path d="M-17 2 L19 2 L27 9 L-23 9 Z" className="world-glint" />
    <path d="M-88 -15 L-90 -29 M92 -16 L94 -28" className="world-line" />
  </g>
}

function CapitalShip() {
  return <g>
    <path d="M-128 33 L99 -35 L145 -25 L-96 53 Z" className="world-ink" />
    <path d="M-89 29 L90 -28 L108 -23 L-78 43 Z" className="world-mid" />
    <path d="M-17 -14 L4 -45 L26 -45 L38 -29 Z" className="world-ink" />
    <path d="M-10 -47 V-63 H7 V-47 M20 -46 V-57 H29 V-46" className="world-line" />
    <path d="M-109 36 L98 -29 M-40 38 L109 -18" className="world-line" />
    <path d="M-105 43 L-68 44 M82 -17 L97 -22" className="world-glint" />
  </g>
}

/** Solar, moonlit and hazy variants depend solely on a Health calendar date,
 * never on subjective wellness ratings or health outcomes. */
export function sceneMoodForDate(date: string): { mood: 'daybreak' | 'dusk' | 'moonlit'; rare: boolean } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return { mood: 'dusk', rare: false }
  const dayIndex = Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000)
  return {
    mood: (['daybreak', 'dusk', 'moonlit'] as const)[((dayIndex % 3) + 3) % 3],
    rare: dayIndex % 29 === 7,
  }
}

export function ThemeWorldArtwork({ date }: { date?: string }) {
  const { mood, rare } = sceneMoodForDate(date ?? '2026-10-22')
  return <svg className="today-scene-art" viewBox="0 0 1000 320" preserveAspectRatio="xMidYMid slice"
    aria-hidden="true" focusable="false" data-scene-mood={mood} data-scene-rare={rare ? 'yes' : 'no'}>
    <circle className="today-scene-orb" cx="786" cy="92" r="60" />
    <g className="today-scene-stars">
      <circle cx="660" cy="42" r="3" /><circle cx="906" cy="38" r="2.5" />
      <circle cx="560" cy="91" r="2" /><circle cx="950" cy="133" r="2" />
      <circle cx="716" cy="20" r="1.8" /><circle cx="870" cy="152" r="2.2" />
    </g>
    <g className="today-scene-land">
      <path className="today-scene-ridge-back" d="M0 268 L172 202 L255 227 L399 139 L520 211 L664 114 L780 196 L893 108 L1000 174 L1000 320 L0 320 Z" />
      <path className="today-scene-ridge-front" d="M0 306 L164 268 L340 298 L510 223 L631 280 L793 178 L1000 274 L1000 320 L0 320 Z" />
    </g>
    <g className="today-scene-sea">
      <path className="today-scene-wave-back" d="M0 228 C120 196 210 258 336 226 S560 190 678 228 S880 252 1000 206 L1000 320 L0 320 Z" />
      <path className="today-scene-wave-front" d="M0 285 C150 251 226 311 374 277 S636 252 758 278 S902 291 1000 257 L1000 320 L0 320 Z" />
    </g>
    <g className="today-scene-cosmos">
      <ellipse className="today-cosmos-haze" cx="816" cy="150" rx="220" ry="119" />
      <circle className="today-cosmos-halo" cx="804" cy="113" r="83" />
      <circle className="today-cosmos-core" cx="804" cy="113" r="59" />
      <ellipse className="today-cosmos-ring" cx="804" cy="117" rx="155" ry="36" transform="rotate(-18 804 117)" />
      <path className="today-cosmos-horizon" d="M390 320 Q624 212 803 287 T1100 238 L1100 320 Z" />
      <path className="today-cosmos-streak" d="M490 194 Q600 113 693 155 M906 57 L955 13" />
    </g>
    <g className="today-scene-wasteland">
      <circle className="today-wasteland-sun" cx="807" cy="89" r="63" />
      <path className="today-wasteland-distant" d="M340 270 L471 213 L532 233 L630 168 L690 194 L769 138 L835 191 L947 155 L1000 183 L1000 320 L340 320 Z" />
      <path className="today-wasteland-ruins" d="M662 279 V187 H689 V216 H711 V158 H731 V192 H761 V234 H791 V180 H812 V268 H827 V218 H845 V279 Z" />
      <path className="today-wasteland-foreground" d="M280 315 L417 282 L548 296 L661 270 L784 284 L895 259 L1000 282 L1000 320 L280 320 Z" />
    </g>

    {/* Grand Line / Sun God — recognizable exploratory sailing silhouette, still mostly seascape. */}
    <g className="today-world today-world-onepiece">
      <path className="world-mist" d="M400 241 Q570 201 702 220 T1060 195 L1060 320 H400 Z" />
      <g className="world-boat">
        <path className="world-line" d="M728 99 V247 M726 121 L623 235 M731 131 L826 236" />
        <path className="world-mid" d="M732 110 Q782 126 810 216 Q769 207 732 220 Z" />
        <path className="world-glint" d="M722 124 Q671 145 649 217 Q681 202 721 220 Z" />
        <path className="world-ink" d="M610 243 Q736 257 856 236 L828 271 Q724 302 628 274 Z" />
        <path className="world-mid" d="M628 248 L852 241 L841 254 L630 259 Z" />
        <path className="world-ink" d="M856 235 Q890 214 903 221 Q908 236 883 241 Q891 250 878 265 L837 260 Z" />
        <path className="world-line" d="M729 109 V88 L774 101 L729 114 M664 238 L664 210 L696 210 L696 243" />
        <circle className="world-highlight" cx="901" cy="226" r="7" />
        <path className="world-line" d="M642 257 Q740 272 842 248 M735 98 L734 231" />
      </g>
      <path className="world-foreground" d="M400 292 Q500 273 604 287 T796 286 T1050 282 L1050 320 H400 Z" />
      <path className="world-line" d="M518 286 q34 -7 67 0 M845 286 q23 -5 48 0" />
    </g>

    {/* Bonfire / Abyss Knight — shrine arches, embedded sword, low ember glow. */}
    <g className="today-world today-world-bonfire">
      <path className="world-mist" d="M422 280 L543 190 L613 209 L696 123 L790 188 L868 115 L1000 218 L1000 320 L422 320 Z" />
      <path className="world-mid" d="M635 278 V120 Q635 51 723 51 H816 Q895 51 895 120 V278 H854 V124 Q854 86 813 86 H726 Q680 86 680 125 V278 Z" />
      <path className="world-ink" d="M617 289 V154 H646 V266 H678 V289 Z M850 288 V208 H895 V288 Z M906 288 V153 H936 V288 Z" />
      <path className="world-line" d="M635 123 L682 115 M855 119 L900 130 M630 183 L681 178 M860 219 L894 214" />
      <path className="world-foreground" d="M444 315 L551 287 L620 293 L667 279 L754 295 L847 279 L958 287 L1030 275 L1030 320 H444Z" />
      <ellipse className="world-fire-halo" cx="772" cy="255" rx="102" ry="40" />
      <path className="world-fire" d="M744 277 Q704 253 736 219 Q745 244 761 234 Q760 199 788 184 Q779 223 799 232 Q817 221 817 203 Q858 254 816 280 Z" />
      <path className="world-fire-core" d="M759 280 Q736 256 766 237 Q762 254 776 249 Q787 237 789 222 Q814 260 792 281 Z" />
      <path className="world-ink" d="M770 200 L778 200 L787 271 L773 277 Z M755 216 L796 211 L797 220 L757 226 Z" />
      <g className="world-embers">
        <circle className="world-spark" cx="737" cy="174" r="3" /><circle className="world-spark" cx="806" cy="162" r="2" />
        <circle className="world-spark" cx="760" cy="143" r="2" /><circle className="world-spark" cx="837" cy="186" r="2.8" />
      </g>
    </g>

    {/* Saiyan worlds — colossal distant serpentine dragon against a backlit celestial disk. */}
    <g className="today-world today-world-dragon">
      <circle className="world-moon-haze" cx="802" cy="105" r="112" />
      <circle className="world-moon" cx="802" cy="105" r="77" />
      <path className="world-dragon-outline" d="M601 278 C586 209 666 169 723 209 C782 255 870 248 901 187 C923 146 871 106 798 125 C719 146 701 86 745 57 C783 31 846 52 888 63" />
      <path className="world-dragon-spine" d="M606 278 C597 211 667 178 723 215 C781 257 862 235 890 181 C916 143 866 111 800 135 C729 161 718 86 757 62 C796 38 851 55 888 63" />
      <g className="world-dragon-head">
        <path className="world-ink" d="M875 62 L902 51 L925 64 L951 69 L937 81 L918 84 L899 77 L887 80 Z" />
        <path className="world-line" d="M888 54 L887 35 L900 46 L907 52 L923 33 L918 56 M935 79 Q962 86 973 106 M920 84 Q916 99 934 112" />
        <circle className="world-highlight" cx="924" cy="67" r="2.8" />
      </g>
      <path className="world-ink" d="M684 188 L669 164 L687 171 L698 189 M821 244 L832 219 L842 223 L833 250 M850 121 L839 104 L854 108 L866 124" />
      <path className="world-mist" d="M455 318 Q610 272 723 293 T1030 281 L1030 320 H455Z" />
    </g>

    {/* Hidden Leaf / Sage Storm — wooded valley and four sculpted mountain faces. */}
    <g className="today-world today-world-leaf">
      <path className="world-mist" d="M430 292 L560 190 L636 210 L717 100 L825 131 L899 87 L1040 219 L1040 320 L430 320 Z" />
      <path className="world-mid" d="M674 216 L712 105 L755 96 L791 121 L829 104 L866 114 L899 100 L949 224 Z" />
      <g className="world-carvings">
        <path d="M720 130 Q727 109 746 119 L759 145 L753 173 L732 180 L716 160 Z M769 132 Q777 111 798 124 L808 148 L800 174 L782 178 L767 153 Z M817 134 Q822 113 839 124 L855 145 L847 174 L827 176 L813 155 Z M866 127 Q873 106 889 117 L904 141 L897 169 L876 171 L862 149 Z" />
        <path d="M729 146 L742 142 M736 153 L749 153 L738 168 M777 146 L793 143 M782 153 L794 153 L787 167 M826 145 L840 143 M826 156 L841 153 L834 165 M875 139 L888 138 M878 150 L893 149 L884 164" />
      </g>
      <path className="world-ink" d="M400 304 L440 273 L465 278 L485 246 L513 278 L531 266 L551 306 L570 280 L596 252 L630 285 L661 266 L688 318 L688 320 H400Z" />
      <path className="world-foreground" d="M562 320 L599 267 L620 277 L642 224 L671 260 L688 246 L718 311 L749 265 L775 278 L813 234 L836 270 L852 249 L890 317 L917 273 L941 288 L966 247 L1012 320 Z" />
      <path className="world-line" d="M644 269 V315 M814 271 V320 M958 291 V320" />
    </g>

    {/* Republic Clone era — exactly three gunships approaching the near-side planet. */}
    <g className="today-world today-world-gunships">
      <circle className="world-moon-haze" cx="873" cy="118" r="140" />
      <circle className="world-moon" cx="873" cy="118" r="105" />
      <path className="world-line" d="M801 87 Q869 39 945 76 M800 125 Q879 156 966 114" />
      <g className="world-fly" transform="translate(670 154) scale(.75)"><Gunship /></g>
      <g className="world-fly" transform="translate(826 224) scale(1.03)"><Gunship /></g>
      <g className="world-fly" transform="translate(923 75) scale(.45)"><Gunship /></g>
      <path className="world-mist" d="M451 317 Q620 280 795 303 T1050 280 L1050 320 H451Z" />
    </g>

    {/* Republic Red / galactic fleet — vast wedge-shaped capital-ship formation. */}
    <g className="today-world today-world-fleet">
      <circle className="world-moon-haze" cx="847" cy="133" r="135" />
      <circle className="world-moon" cx="847" cy="133" r="99" />
      <path className="world-line" d="M769 98 Q860 54 935 109 M768 166 Q843 199 945 141" />
      <g className="world-fly" transform="translate(672 155) scale(.67)"><CapitalShip /></g>
      <g className="world-fly" transform="translate(817 222) scale(1.1)"><CapitalShip /></g>
      <g className="world-fly" transform="translate(937 74) scale(.36)"><CapitalShip /></g>
      <path className="world-mist" d="M470 320 Q637 255 818 299 T1040 284 V320Z" />
    </g>

    {/* Spartan / Mjolnir — monumental artificial ringworld and a distant craft. */}
    <g className="today-world today-world-ringworld">
      <ellipse className="world-moon-haze" cx="822" cy="118" rx="168" ry="128" />
      <circle className="world-moon" cx="818" cy="120" r="64" />
      <ellipse className="world-ring" cx="803" cy="124" rx="274" ry="61" transform="rotate(-26 803 124)" />
      <ellipse className="world-ring-glint" cx="803" cy="124" rx="274" ry="61" transform="rotate(-26 803 124)" />
      <path className="world-mid" d="M434 320 L579 264 L676 289 L795 245 L900 279 L1040 237 V320 Z" />
      <path className="world-ink" d="M725 211 L760 190 L787 200 L776 214 L742 220 Z" />
      <path className="world-line" d="M688 211 L726 209" />
    </g>

    {/* Sci-fi wasteland atmosphere — iconic distant infrastructure. */}
    <g className="today-world today-world-wasteland-detail">
      <path className="world-line" d="M821 167 V252 M788 186 H849 M806 190 L791 255 M831 190 L845 253" />
      <path className="world-ink" d="M785 156 L854 156 L842 174 H799 Z M787 154 Q822 128 850 154 Z" />
      <path className="world-ink" d="M536 280 V221 L547 208 L574 208 L582 219 V280 Z M566 211 V181 H571 V210" />
      <path className="world-line" d="M557 221 L557 253 M528 278 L593 277 M662 288 L679 276 L688 288" />
      <path className="world-mist" d="M412 320 Q564 276 674 296 T1020 274 L1020 320 H412Z" />
    </g>

    {/* Prestige worlds use an original celestial sanctuary rather than franchise art. */}
    <g className="today-world today-world-prestige">
      <circle className="world-moon-haze" cx="838" cy="112" r="117" />
      <circle className="world-moon" cx="838" cy="112" r="67" />
      <path className="world-ring" d="M580 144 Q789 -51 1030 156" />
      <path className="world-glint" d="M832 26 L861 103 L832 182 L804 103 Z" />
      <path className="world-mid" d="M710 320 L773 238 L816 263 L862 182 L907 269 L943 229 L1024 320 Z" />
      <path className="world-ink" d="M815 291 L837 239 L858 291Z M904 300 L924 265 L944 300Z" />
      <path className="world-line" d="M662 96 L683 74 M961 64 L979 45 M719 167 L737 178" />
    </g>
    <g className="today-scene-rare">
      <path className="world-rare-comet" d="M614 44 Q654 33 711 26 L721 15" />
      <circle className="world-highlight" cx="720" cy="15" r="3" />
      <path className="world-rare-star" d="M933 29 V44 M926 36 H940 M578 122 V132 M573 127 H583" />
    </g>
  </svg>
}
