import { useEffect, useId, useRef, useState } from 'react'
import { Boxes, Check, ChevronsUpDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import './workspace-switcher.css'

type Organization = { id: string; name: string; initials: string }

export function WorkspaceSwitcher({ value, onChange, organizations, compact = false }: {
  value: string; onChange: (id: string) => void; organizations: readonly Organization[]; compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const options = useRef<(HTMLButtonElement | null)[]>([])
  const selected = organizations.findIndex(o => o.id === value)
  const current = organizations[selected]
  const focusOption = (index: number) => options.current[(index + organizations.length) % organizations.length]?.focus()
  const close = () => { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open || selected < 0) return
    focusOption(selected)
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, selected, organizations.length])
  if (!current) return null
  return <div className={compact ? 'workspace-switcher workspace-switcher-compact' : 'workspace-switcher'} ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={event => {
      if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
    }}>
    <input type="hidden" name="organization" value={value}/>
    <button ref={trigger} type="button" className="workspace-trigger" aria-label={`Рабочее пространство: ${current.name}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen(v => !v)} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (open) focusOption(event.key === 'ArrowUp' ? organizations.length - 1 : 0); else setOpen(true) }
    }}>
      <span className="workspace-avatar" aria-hidden="true">{current.initials}</span>
      <span className="workspace-trigger-copy"><span>Пространство</span><strong>{current.name}</strong></span>
      <ChevronsUpDown size={15} aria-hidden="true"/>
    </button>
    {open && <div className="workspace-options">
      <div id={listId} className="workspace-option-list" role="listbox" aria-label="Рабочие пространства" onKeyDown={event => {
        const index = options.current.indexOf(document.activeElement as HTMLButtonElement)
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); focusOption(index + (event.key === 'ArrowDown' ? 1 : -1)) }
        if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); focusOption(event.key === 'Home' ? 0 : organizations.length - 1) }
        if (event.key.length === 1 && event.key !== ' ') { const match = organizations.findIndex(o => o.name.toLocaleLowerCase('ru').startsWith(event.key.toLocaleLowerCase('ru'))); if (match >= 0) focusOption(match) }
      }}>
        {organizations.map((organization, index) => <button key={organization.id} ref={el => { options.current[index] = el }} type="button" role="option" aria-selected={organization.id === value} tabIndex={-1} className="workspace-option" onClick={() => { close(); if (organization.id !== value) onChange(organization.id) }}>
          <span className="workspace-avatar" aria-hidden="true">{organization.initials}</span><span>{organization.name}</span><span className="workspace-selection">{organization.id === value && <Check size={16} aria-hidden="true"/>}</span>
        </button>)}
      </div>
      <div className="workspace-options-footer">
        <Link to="/app/organizations" className="workspace-option" onClick={close}>
          <Boxes size={18} aria-hidden="true"/>Все пространства
        </Link>
      </div>
    </div>}
  </div>
}
