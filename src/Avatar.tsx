import { useState } from 'react'
import { HEADSHOTS } from './headshots'
import { localImg } from './imgMap'

/** A round headshot with the party colour as its ring; initials if there is no photo (or it fails to load). */
export function Avatar({ p, colorOf }: { p: { name: string; abbrev: string; img?: string | null | undefined }; colorOf: (abbrev: string) => string }) {
  const [bad, setBad] = useState(false)
  const initials = p.name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('')
  const raw = p.img || HEADSHOTS[p.name]
  const src = raw ? localImg(raw) : raw
  return (
    <span className="mp-ava" style={{ borderColor: colorOf(p.abbrev), background: colorOf(p.abbrev) }}>
      {src && !bad ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <span>{initials}</span>}
    </span>
  )
}
