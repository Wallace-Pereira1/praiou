function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

export const LOCAL_BEACH_PHOTOS = {
  ipanemaDoisIrmaos: svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0284C7"/>
          <stop offset="62%" stop-color="#7DD3FC"/>
          <stop offset="100%" stop-color="#FEF3C7"/>
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0369A1"/>
          <stop offset="100%" stop-color="#14B8A6"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#sky)"/>
      <circle cx="620" cy="120" r="46" fill="#FDE68A" opacity="0.95"/>
      <path d="M0 285 L95 215 L155 155 L210 205 L265 135 L335 245 L420 285 Z" fill="#1E293B" opacity="0.72"/>
      <rect y="285" width="800" height="115" fill="url(#sea)"/>
      <path d="M0 320 Q160 308 320 322 T640 318 T800 322" fill="none" stroke="#FFFFFF" stroke-width="4" opacity="0.55"/>
      <path d="M0 365 Q200 350 400 366 T800 360" fill="none" stroke="#FFFFFF" stroke-width="5" opacity="0.7"/>
      <path d="M0 400 Q260 385 520 398 T800 394 L800 500 L0 500 Z" fill="#FDE68A"/>
      <path d="M0 420 Q280 406 560 418 T800 412 L800 500 L0 500 Z" fill="#FCD34D" opacity="0.5"/>
    </svg>
  `),
  arpoadorRocks: svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0EA5E9"/>
          <stop offset="100%" stop-color="#E0F2FE"/>
        </linearGradient>
        <linearGradient id="sea2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0284C7"/>
          <stop offset="100%" stop-color="#0D9488"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#sky2)"/>
      <circle cx="150" cy="110" r="38" fill="#FEF08A"/>
      <rect y="260" width="800" height="240" fill="url(#sea2)"/>
      <path d="M470 290 L555 215 L650 225 L750 185 L800 225 L800 395 L510 385 Z" fill="#334155"/>
      <path d="M510 385 L620 305 L735 320 L800 290 L800 425 L480 410 Z" fill="#1E293B"/>
      <path d="M0 340 Q140 315 280 345 T540 345" fill="none" stroke="#FFFFFF" stroke-width="6" opacity="0.8"/>
      <path d="M0 415 Q200 395 430 418 T800 415 L800 500 L0 500 Z" fill="#FDE68A"/>
    </svg>
  `),
  copacabanaCalcadao: svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="sky3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#38BDF8"/>
          <stop offset="100%" stop-color="#BAE6FD"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#sky3)"/>
      <path d="M580 230 L640 140 L700 230 Z" fill="#475569" opacity="0.55"/>
      <rect y="230" width="800" height="110" fill="#0284C7"/>
      <path d="M0 315 Q200 302 400 316 T800 312" fill="none" stroke="#FFFFFF" stroke-width="5" opacity="0.75"/>
      <rect y="340" width="800" height="90" fill="#FDE68A"/>
      <rect y="430" width="800" height="70" fill="#F1F5F9"/>
      <path d="M0 455 Q50 438 100 455 T200 455 T300 455 T400 455 T500 455 T600 455 T700 455 T800 455" fill="none" stroke="#0F172A" stroke-width="10"/>
      <path d="M0 480 Q50 463 100 480 T200 480 T300 480 T400 480 T500 480 T600 480 T700 480 T800 480" fill="none" stroke="#0F172A" stroke-width="10"/>
    </svg>
  `),
  barraHorizonte: svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="sky4" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0284C7"/>
          <stop offset="100%" stop-color="#E0F2FE"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#sky4)"/>
      <ellipse cx="220" cy="115" rx="75" ry="22" fill="#FFFFFF" opacity="0.8"/>
      <ellipse cx="590" cy="145" rx="95" ry="26" fill="#FFFFFF" opacity="0.65"/>
      <rect y="255" width="800" height="125" fill="#0369A1"/>
      <path d="M0 305 Q120 292 240 308 T480 306 T720 304 T800 306" fill="none" stroke="#E0F2FE" stroke-width="5" opacity="0.7"/>
      <path d="M0 348 Q180 332 360 350 T720 346 T800 348" fill="none" stroke="#FFFFFF" stroke-width="6" opacity="0.85"/>
      <rect y="380" width="800" height="120" fill="#FDE68A"/>
    </svg>
  `),
  saoConradoSwell: svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="sky5" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#64748B"/>
          <stop offset="100%" stop-color="#CBD5E1"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#sky5)"/>
      <path d="M0 265 L120 130 L260 155 L340 265 Z" fill="#334155" opacity="0.82"/>
      <rect y="265" width="800" height="135" fill="#1E3A8A" opacity="0.85"/>
      <path d="M0 320 Q100 280 200 322 T400 318 T600 325 T800 316" fill="none" stroke="#FFFFFF" stroke-width="8" opacity="0.8"/>
      <path d="M0 368 Q120 335 240 368 T480 366 T720 370 T800 364" fill="none" stroke="#FFFFFF" stroke-width="9" opacity="0.9"/>
      <rect y="400" width="800" height="100" fill="#E2C799"/>
    </svg>
  `),
  recreioPontal: svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="sky6" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0EA5E9"/>
          <stop offset="100%" stop-color="#FEF9C3"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(#sky6)"/>
      <circle cx="670" cy="105" r="40" fill="#FDE047"/>
      <path d="M470 275 Q560 190 660 275 Z" fill="#475569" opacity="0.78"/>
      <rect y="275" width="800" height="115" fill="#0D9488"/>
      <path d="M0 340 Q190 320 380 342 T760 338 T800 340" fill="none" stroke="#FFFFFF" stroke-width="6" opacity="0.75"/>
      <rect y="390" width="800" height="110" fill="#FDE68A"/>
    </svg>
  `),
};
