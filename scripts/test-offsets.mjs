import assert from 'node:assert/strict'
import { codePointOffset } from '../src/textOffsets.ts'

const text = 'Я 👩🏽‍💻 е\u0308'
assert.equal(codePointOffset(text, 2), 2)
assert.equal(codePointOffset(text, 3), null)
assert.equal(codePointOffset(text, 9), 6)
assert.equal(codePointOffset(text, text.length), Array.from(text).length)
assert.equal(codePointOffset(text, -1), null)
console.log('PASS: UTF-16 selections convert to Unicode code-point offsets')
