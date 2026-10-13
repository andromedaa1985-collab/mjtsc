import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { MAX_SCRIPT_CHARACTERS, MAX_SCRIPT_FILE_BYTES, readScriptFile } from './scriptFiles.ts';

function scriptFile(name: string, content: string | Uint8Array): File {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : Uint8Array.from(content);
  return new File([bytes.buffer], name);
}

async function docxFile(text: string): Promise<File> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escaped}</w:t></w:r></w:p></w:body></w:document>`);
  return scriptFile('剧本.docx', await zip.generateAsync({ type: 'uint8array' }));
}

test('TXT and Markdown preserve UTF-8 Chinese, emoji, and line breaks', async () => {
  assert.equal(await readScriptFile(scriptFile('剧本.TXT', '外景·夜\r\n她说：“你好。” 🌙')), '外景·夜\n她说：“你好。” 🌙');
  assert.equal(await readScriptFile(scriptFile('剧本.md', '# 第一幕\n\n她走入雨中。')), '# 第一幕\n\n她走入雨中。');
});

test('UTF-8 BOM and UTF-16 BOM encodings are decoded explicitly', async () => {
  const text = '第一幕：她来了。';
  const utf8 = new TextEncoder().encode(text);
  assert.equal(await readScriptFile(scriptFile('utf8.txt', Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]))), text);
  const littleEndian = Buffer.from(text, 'utf16le');
  assert.equal(await readScriptFile(scriptFile('utf16le.txt', Uint8Array.from([0xff, 0xfe, ...littleEndian]))), text);
  const bigEndian = Buffer.from(littleEndian).swap16();
  assert.equal(await readScriptFile(scriptFile('utf16be.md', Uint8Array.from([0xfe, 0xff, ...bigEndian]))), text);
});

test('common GBK / GB18030 Chinese text is a fallback after strict UTF-8', async () => {
  // GBK bytes for 你好, followed by an ASCII line break and title.
  const bytes = Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3, 0x0a, 0x31]);
  assert.equal(await readScriptFile(scriptFile('旧剧本.txt', bytes)), '你好\n1');
});

test('invalid encodings, damaged BOM-marked text, and binary content are rejected', async () => {
  for (const bytes of [
    Uint8Array.from([0xff]),
    Uint8Array.from([0xff, 0xfe, 0x41]),
    Uint8Array.from([0xef, 0xbb, 0xbf, 0xff]),
    Uint8Array.from([0x41, 0, 0x42, 0]),
  ]) {
    await assert.rejects(readScriptFile(scriptFile('broken.txt', bytes)), /编码|乱码/);
  }
  await assert.rejects(readScriptFile(scriptFile('replacement.md', '她说：�')), /乱码/);
  await assert.rejects(readScriptFile(scriptFile('mojibake.txt', '锟斤拷锟斤拷')), /乱码/);
});

test('empty files and invisible-only files produce a readable error', async () => {
  for (const content of ['', ' \t\r\n', '\uFEFF\u200B\u2060']) {
    await assert.rejects(readScriptFile(scriptFile('empty.txt', content)), /没有可读取/);
  }
});

test('30,000-character boundary is accepted, then longer text is rejected', async () => {
  const text = '中'.repeat(MAX_SCRIPT_CHARACTERS);
  assert.equal((await readScriptFile(scriptFile('boundary.txt', text))).length, MAX_SCRIPT_CHARACTERS);
  await assert.rejects(readScriptFile(scriptFile('too-long.md', `${text}。`)), /30,000/);
});

test('file size limit is checked before reading the bytes', async () => {
  let reads = 0;
  const file = new File([new ArrayBuffer(MAX_SCRIPT_FILE_BYTES + 1)], 'large.txt');
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => { reads += 1; return new ArrayBuffer(0); },
  });
  await assert.rejects(readScriptFile(file), /5 MB/);
  assert.equal(reads, 0);
});

test('exactly 5 MiB is allowed when the extracted text stays within the character limit', async () => {
  const bytes = new Uint8Array(MAX_SCRIPT_FILE_BYTES).fill(0x20);
  bytes[0] = 0x41;
  assert.equal(await readScriptFile(scriptFile('boundary.txt', bytes)), 'A');
});

test('file read failure is explained without exposing native errors', async () => {
  const file = scriptFile('locked.md', '外景·夜');
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => { throw new Error('native file access failure'); },
  });
  await assert.rejects(readScriptFile(file), /无法读取该文件/);
});

test('real DOCX ZIP fixture is extracted through Mammoth as plain text', async () => {
  assert.equal(await readScriptFile(await docxFile('她说：<别走> & 等等。')), '她说：<别走> & 等等。');
});

test('DOCX extracted text must be nonempty and respect the character limit', async () => {
  await assert.rejects(readScriptFile(await docxFile('')), /没有可读取/);
  await assert.rejects(readScriptFile(await docxFile('中'.repeat(MAX_SCRIPT_CHARACTERS + 1))), /30,000/);
});

test('damaged DOCX, truncated ZIP, and unrelated ZIP files are rejected', async () => {
  await assert.rejects(readScriptFile(scriptFile('broken.docx', '不是 Word 文件')), /DOCX 文件损坏/);
  await assert.rejects(readScriptFile(scriptFile('truncated.docx', Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0xff]))), /DOCX 文件损坏/);
  const zip = new JSZip(); zip.file('random.txt', 'Hello');
  await assert.rejects(readScriptFile(scriptFile('archive.docx', await zip.generateAsync({ type: 'uint8array' }))), /DOCX 文件损坏/);
});

test('old DOC and PDF get actionable errors, including disguised file signatures', async () => {
  await assert.rejects(readScriptFile(scriptFile('old.doc', 'legacy')), /旧版 \.doc/);
  await assert.rejects(readScriptFile(scriptFile('scan.pdf', '%PDF-1.7')), /PDF.*OCR/);
  await assert.rejects(readScriptFile(scriptFile('renamed.txt', '%PDF-1.7')), /PDF/);
  await assert.rejects(readScriptFile(scriptFile('renamed.docx', Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))), /旧版 \.doc/);
  await assert.rejects(readScriptFile(scriptFile('image.png', 'image')), /TXT.*Markdown.*DOCX/);
});
