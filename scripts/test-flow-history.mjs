import assert from 'node:assert/strict'
import { FlowHistory } from '../src/pages/FlowHistory.ts'

const graph = revision => ({ revision })
const history = new FlowHistory()
for (let revision = 0; revision < 52; revision++) history.record(graph(revision))
let current = graph(52)
for (let revision = 51; revision >= 2; revision--) {
  current = history.restore('undo', current)
  assert.equal(current.revision, revision)
}
assert.equal(history.canUndo, false)
assert.equal(history.restore('undo', current), undefined)
for (let revision = 3; revision <= 52; revision++) {
  current = history.restore('redo', current)
  assert.equal(current.revision, revision)
}
assert.equal(history.canRedo, false)
current = history.restore('undo', current)
history.record(current)
assert.equal(history.canRedo, false)
history.clear()
assert.equal(history.canUndo, false)
assert.equal(history.canRedo, false)
console.log('PASS: 50 reversible graph actions, branch replacement and reset')
