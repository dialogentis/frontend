import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { organizations } from '../model'
import './workspace-switcher.css'

export function WorkspaceSwitcher({ value, onChange, disabled = false }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const options = useRef<(HTMLButtonElement | null)[]>([])
  const current = organizations.find(o => o.id === value) ?? organizations[0]
  const focusOption = (index: number) => options.current[(index + organizations.length) % organizations.length]?.focus()
  const close = () => { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    focusOption(organizations.findIndex(o => o.id === value))
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, value])
  return <div className="workspace-switcher" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <input type="hidden" name="organization" value={value}/>
    <button ref={trigger} disabled={disabled} type="button" className="workspace-trigger" aria-label={`Рабочее пространство: ${current.name}`} aria-haspopup="listbox" aria-expanded={open} aria-controls="workspace-options" onClick={() => setOpen(v => !v)} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (open) focusOption(event.key === 'ArrowUp' ? organizations.length - 1 : 0); else setOpen(true) }
    }}>
      <span className="workspace-avatar" aria-hidden="true">{current.initials}</span>
      <span className="workspace-trigger-copy"><span>Пространство</span><strong>{current.name}</strong></span>
      <ChevronsUpDown size={15} aria-hidden="true"/>
    </button>
    {open && <div id="workspace-options" className="workspace-options" role="listbox" aria-label="Рабочие пространства" onKeyDown={event => {
      const index = options.current.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); focusOption(index + (event.key === 'ArrowDown' ? 1 : -1)) }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); focusOption(event.key === 'Home' ? 0 : organizations.length - 1) }
      if (event.key.length === 1 && event.key !== ' ') { const match = organizations.findIndex(o => o.name.toLocaleLowerCase('ru').startsWith(event.key.toLocaleLowerCase('ru'))); if (match >= 0) focusOption(match) }
    }}>
      {organizations.map((organization, index) => <button key={organization.id} ref={el => { options.current[index] = el }} type="button" role="option" aria-selected={organization.id === value} tabIndex={-1} className="workspace-option" onClick={() => { close(); if (organization.id !== value) onChange(organization.id) }}>
        <span className="workspace-avatar" aria-hidden="true">{organization.initials}</span><span>{organization.name}</span><span className="workspace-selection">{organization.id === value && <Check size={16} aria-hidden="true"/>}</span>
      </button>)}
    </div>}
  </div>
}
