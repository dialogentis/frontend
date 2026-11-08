import assert from 'node:assert/strict'
import { withoutSecrets } from '../src/sanitize.ts'

const input = { flow: [{ text: 'пример', clientSecret: 'private', api_key: 'private', tokenizer: 'word', token_limit: 42, nested: { accessToken: 'private', safe: 1 } }], password: 'private' }
assert.deepEqual(withoutSecrets(input), { flow: [{ text: 'пример', tokenizer: 'word', token_limit: 42, nested: { safe: 1 } }] })
assert.equal(input.password, 'private')
console.log('PASS: export removes credential fields without mutating the draft')
