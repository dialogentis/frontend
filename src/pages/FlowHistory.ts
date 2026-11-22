import type { components } from '../api/schema'

type Flow = components['schemas']['Flow']
export type HistoryDirection = 'undo' | 'redo'

export class FlowHistory {
  private previous: Flow[] = []
  private next: Flow[] = []

  get canUndo() { return this.previous.length > 0 }
  get canRedo() { return this.next.length > 0 }

  record(flow: Flow) {
    this.previous.push(flow)
    if (this.previous.length > 50) this.previous.shift()
    this.next = []
  }

  restore(direction: HistoryDirection, current: Flow) {
    const source = direction === 'undo' ? this.previous : this.next
    const destination = direction === 'undo' ? this.next : this.previous
    const flow = source.pop()
    if (flow) destination.push(current)
    return flow
  }

  clear() {
    this.previous = []
    this.next = []
  }
}
