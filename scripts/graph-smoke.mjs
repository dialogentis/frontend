import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

function largeGraph(flowId) {
  const slot = { id: randomUUID(), code: 'order_set', name: 'Есть заказ', value_type: 'boolean' }
  const nodes = Array.from({ length: 300 }, (_, index) => ({
    id: randomUUID(),
    type: index === 0 ? 'start' : index === 299 ? 'end' : 'condition',
    position: { x: (index % 20) * 250, y: Math.floor(index / 20) * 150 },
    config: {},
  }))
  const edge = (index, target, handle) => ({
    id: randomUUID(), source: nodes[index].id, target: nodes[target].id, source_handle: handle,
  })
  const edges = [edge(0, 1, 'next')]
  for (let index = 1; index < nodes.length - 1; index++) {
    const branches = Array.from({ length: index <= 3 ? 2 : 1 }, () => ({
      id: randomUUID(), expression: { op: 'exists', slot_id: slot.id },
    }))
    nodes[index].config = { branches }
    edges.push(edge(index, index + 1, 'else'))
    for (const branch of branches) {
      edges.push(edge(index, Math.min(index + 2, nodes.length - 1), branch.id))
    }
  }
  assert.equal(edges.length, 600)
  return { slots: [slot], flow: { schema_version: 1, flow_id: flowId, nodes, edges, layout: {} } }
}

export async function verifyLargeGraph(page, click) {
  const path = new URL(page.url()).pathname.split('/')
  const api = `/api/v1/organizations/${path[3]}/agents/${path[5]}`
  const draft = await page.evaluate(async api => (await fetch(api + '/draft')).json(), api)
  const graph = largeGraph(draft.config.flow.flow_id)
  const result = await page.evaluate(async ({ api, config }) => {
    const session = await (await fetch('/api/v1/auth/me')).json()
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf_token }
    const lease = await fetch(api + '/edit-lease', {
      method: 'POST', headers, body: JSON.stringify({ tab_id: crypto.randomUUID() }),
    })
    if (!lease.ok) return lease.status
    const grant = await lease.json()
    headers['X-Edit-Lease'] = grant.lease_token
    headers['X-Edit-Fence'] = String(grant.fencing_counter)
    const before = await fetch(api + '/draft')
    const save = await fetch(api + '/draft', {
      method: 'PUT', headers: { ...headers, 'If-Match': before.headers.get('ETag') },
      body: JSON.stringify({ schema_version: 1, config }),
    })
    const release = await fetch(api + '/edit-lease', { method: 'DELETE', headers })
    return release.ok ? save.status : release.status
  }, { api, config: { ...draft.config, ...graph } })
  assert.equal(result, 200, 'The full graph must be saved through the backend')

  await page.evaluateOnNewDocument(() => {
    window.__graphTasks = []
    new PerformanceObserver(list => window.__graphTasks.push(...list.getEntries().map(entry => ({
      start: entry.startTime, duration: entry.duration,
    })))).observe({ type: 'longtask', buffered: true })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 300
    && document.querySelectorAll('.react-flow__edge').length === 600
    && document.querySelectorAll('.react-flow__minimap-node').length === 300)
  const opened = await page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now())))))
  if (opened > 3000) {
    console.error('Graph timing', await page.evaluate(() => ({
      document: performance.getEntriesByType('navigation').map(entry => ({
        responseStart: Math.round(entry.responseStart), domContentLoaded: Math.round(entry.domContentLoadedEventEnd),
      })),
      slowRequests: performance.getEntriesByType('resource').filter(entry => entry.duration > 500).map(entry => ({
        type: entry.initiatorType, start: Math.round(entry.startTime), duration: Math.round(entry.duration),
      })),
      longTasks: window.__graphTasks.map(task => ({ start: Math.round(task.start), duration: Math.round(task.duration) })),
    })))
  }
  assert.ok(opened <= 3000, `Large graph opened in ${Math.round(opened)} ms`)
  assert.equal(await page.$eval('.react-flow__minimap title', title => title.textContent), 'Миникарта сценария')

  await click('Начать редактирование')
  await page.waitForSelector('.react-flow__node.draggable')
  await page.$eval('.draft-canvas', element => element.scrollIntoView({ block: 'center' }))
  const viewport = '.react-flow__viewport'
  const interactiveStart = await page.evaluate(() => performance.now())
  const before = await page.$eval(viewport, element => element.style.transform)
  const zoom = await page.$('.react-flow__controls-zoomin')
  assert.ok(zoom)
  await zoom.click()
  await page.waitForFunction((selector, original) =>
    document.querySelector(selector)?.style.transform !== original, {}, viewport, before)
  const visible = await page.evaluate(() => {
    const canvas = document.querySelector('.draft-canvas').getBoundingClientRect()
    for (const node of document.querySelectorAll('.react-flow__node-condition.draggable')) {
      const rect = node.getBoundingClientRect()
      if (rect.left >= canvas.left + 10 && rect.right <= canvas.right - 60
        && rect.top >= Math.max(0, canvas.top) + 10 && rect.bottom <= Math.min(canvas.bottom, innerHeight) - 30) {
        return { id: node.dataset.id, x: rect.left + rect.width / 2, y: rect.top + 12 }
      }
    }
    return null
  })
  assert.ok(visible, 'A draggable graph node must be visible after zoom')
  await page.mouse.move(visible.x, visible.y)
  await page.mouse.down()
  await page.mouse.move(visible.x + 45, visible.y + 18, { steps: 12 })
  await page.mouse.up()
  const position = graph.flow.nodes.find(node => node.id === visible.id).position
  const moved = await page.waitForFunction(async ({ api, id, position }) => {
    const draft = await (await fetch(api + '/draft')).json()
    const current = draft.config.flow.nodes.find(node => node.id === id)?.position
    return current && (current.x !== position.x || current.y !== position.y) ? current : false
  }, { polling: 350 }, { api, id: visible.id, position })
  const movedPosition = await moved.jsonValue()
  await moved.dispose()
  const longest = await page.evaluate(start =>
    Math.max(0, ...window.__graphTasks.filter(task => task.start >= start).map(task => task.duration)),
  interactiveStart)
  assert.ok(longest <= 200, `Interaction blocked the main thread for ${longest} ms`)
  console.log(`PASS: 300 nodes and 600 links, opened in ${Math.round(opened)} ms, zoom and persisted drag, longest interaction task ${longest} ms`)

  await page.select('.draft-node-picker select', visible.id)
  await page.waitForFunction(id => document.querySelector('.draft-inspector p')?.textContent === id, {}, visible.id)
  const waitForPosition = expected => page.waitForFunction(async ({ api, id, expected }) => {
    const draft = await (await fetch(api + '/draft')).json()
    const current = draft.config.flow.nodes.find(node => node.id === id)?.position
    return current?.x === expected.x && current?.y === expected.y
  }, { polling: 350 }, { api, id: visible.id, expected })
  await page.focus('.draft-flow-history button:not([disabled])')
  await page.keyboard.down('Control')
  await page.keyboard.press('z')
  await page.keyboard.up('Control')
  await waitForPosition(position)
  await click('Повторить изменение')
  await waitForPosition(movedPosition)
  console.log('PASS: minimap, node list, keyboard undo and redo all work on the full graph')
}
