// Independently read central directory records and verify stored bytes and CRC.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function readZip(name) {
  const data = fs.readFileSync(path.join(__dirname, '..', 'test-results', name));
  const end = data.length - 22;
  assert.equal(data.readUInt32LE(end), 0x06054b50);
  const count = data.readUInt16LE(end + 10);
  let cursor = data.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(data.readUInt32LE(cursor), 0x02014b50);
    assert.equal(data.readUInt16LE(cursor + 10), 0, 'store-only ZIP');
    const crc = data.readUInt32LE(cursor + 16);
    const size = data.readUInt32LE(cursor + 20);
    assert.equal(size, data.readUInt32LE(cursor + 24));
    const nameLength = data.readUInt16LE(cursor + 28);
    const filename = data.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const local = data.readUInt32LE(cursor + 42);
    assert.equal(data.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    const content = data.subarray(start, start + size);
    assert.equal(content.length, size);
    let actual = 0xffffffff;
    for (const byte of content) {
      actual ^= byte;
      for (let bit = 0; bit < 8; bit++) actual = (actual >>> 1) ^ ((actual & 1) ? 0xedb88320 : 0);
    }
    assert.equal((actual ^ 0xffffffff) >>> 0, crc, filename + ' CRC');
    if (!filename.endsWith('/')) assert.match(content.toString('utf8'), /^<svg /);
    entries.push(filename);
    cursor += 46 + nameLength + data.readUInt16LE(cursor + 30) + data.readUInt16LE(cursor + 32);
  }
  assert.equal(cursor, end);
  return entries.sort();
}

assert.deepEqual(readZip('selected-regions.zip'), [
  '范围验证/产品图片/', '范围验证/产品描述/',
  ...Array.from({length: 5}, (_, i) => `范围验证/产品图片/${String(i + 1).padStart(4, '0')}_main-${i + 1}.svg`),
  ...Array.from({length: 10}, (_, i) => `范围验证/产品描述/${String(i + 1).padStart(4, '0')}_detail-${i + 1}.svg`),
].sort());
assert.deepEqual(readZip('single-category.zip'), [
  '单区验证/产品图片/', '单区验证/产品描述/', '单区验证/产品图片/0001_new-product.svg',
].sort());
console.log('ZIP contents, both subfolders, independent numbering and CRC verified.');
