import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { MAX_SCRIPT_CHARACTERS, MAX_SCRIPT_FILE_BYTES, readScriptFile, readScriptFileWithInfo } from './scriptFiles.ts';
import { MAX_DOCX_ENTRIES, MAX_DOCX_EXPANDED_BYTES, MAX_DOCX_XML_BYTES, validateDocxArchive } from './docxArchive.ts';

function scriptFile(name: string, content: string | Uint8Array): File {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : Uint8Array.from(content);
  return new File([bytes.buffer], name);
}

async function docxFile(text: string, compressed = false, streamFiles = false): Promise<File> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escaped}</w:t></w:r></w:p></w:body></w:document>`);
  return scriptFile('剧本.docx', await zip.generateAsync({ type: 'uint8array', compression: compressed ? 'DEFLATE' : 'STORE', streamFiles }));
}

async function archiveBytes(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content, { createFolders: false });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function archiveOffsets(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22; // Fixtures are produced without archive comments.
  assert.equal(view.getUint32(end, true), 0x06054b50);
  return { view, end, central: view.getUint32(end + 16, true) };
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

test('encoding metadata warns on GB18030 fallback while string API stays compatible', async () => {
  const legacy = scriptFile('旧剧本.txt', Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]));
  const result = await readScriptFileWithInfo(legacy);
  assert.equal(result.text, '你好');
  assert.equal(result.encoding, 'gb18030');
  assert.match(result.warning!, /核对.*对白/);
  assert.equal(await readScriptFile(legacy), result.text);
  // The byte sequence may be truncated UTF-8 or valid GB18030: warn, do not
  // pretend that heuristic decoding can establish the original intention.
  const ambiguous = await readScriptFileWithInfo(scriptFile('ambiguous.txt', new TextEncoder().encode('你好').slice(0, 4)));
  assert.equal(ambiguous.text, '浣犲');
  assert.equal(ambiguous.encoding, 'gb18030');
  assert.ok(ambiguous.warning);
});

test('declared Unicode encodings and DOCX carry metadata without legacy warning', async () => {
  const utf8 = await readScriptFileWithInfo(scriptFile('unicode.txt', '她来了。'));
  assert.deepEqual(utf8, { text: '她来了。', encoding: 'utf-8' });
  const text = '她来了。';
  const utf16le = Uint8Array.from([0xff, 0xfe, ...Buffer.from(text, 'utf16le')]);
  assert.deepEqual(await readScriptFileWithInfo(scriptFile('unicode.md', utf16le)), { text, encoding: 'utf-16le' });
  const utf16be = Uint8Array.from([0xfe, 0xff, ...Buffer.from(text, 'utf16le').swap16()]);
  assert.deepEqual(await readScriptFileWithInfo(scriptFile('unicode.md', utf16be)), { text, encoding: 'utf-16be' });
  assert.deepEqual(await readScriptFileWithInfo(await docxFile(text)), { text, encoding: 'docx' });
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

test('ordinary deflated and streamed DOCX archives pass preflight and extract text', async () => {
  for (const streamFiles of [false, true]) {
    const file = await docxFile('她说：“别走。”', true, streamFiles);
    const bytes = new Uint8Array(await file.arrayBuffer());
    assert.doesNotThrow(() => validateDocxArchive(bytes));
    assert.equal(await readScriptFile(file), '她说：“别走。”');
  }
});

test('high-compression XML is rejected by archive budget before Mammoth text extraction', async () => {
  const file = await docxFile('中'.repeat(2_000_000), true);
  assert.ok(file.size < 20_000);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.throws(() => validateDocxArchive(bytes), /展开内容过大/);
  // The archive error occurs outside Mammoth's catch and before importing it.
  // A late extracted-text limit would instead report "30,000 字符".
  await assert.rejects(readScriptFile(file), /展开内容过大.*TXT.*DOCX/);
});

test('expanded total, XML/RELS entry sizes and entry count are independently bounded', async () => {
  const atXmlLimit = await archiveBytes({ 'word/document.xml': new Uint8Array(MAX_DOCX_XML_BYTES) });
  assert.doesNotThrow(() => validateDocxArchive(atXmlLimit));
  const overRelsLimit = await archiveBytes({ 'word/_rels/document.xml.rels': new Uint8Array(MAX_DOCX_XML_BYTES + 1) });
  assert.throws(() => validateDocxArchive(overRelsLimit), /展开内容过大/);
  const overTotal = await archiveBytes({
    'a.bin': new Uint8Array(MAX_DOCX_EXPANDED_BYTES / 2),
    'b.bin': new Uint8Array(MAX_DOCX_EXPANDED_BYTES / 2 + 1),
  });
  assert.throws(() => validateDocxArchive(overTotal), /展开内容过大/);
  const manyFiles = Object.fromEntries(Array.from({ length: MAX_DOCX_ENTRIES + 1 }, (_, index) => [`entry-${index}.txt`, '']));
  const tooMany = await archiveBytes(manyFiles);
  assert.throws(() => validateDocxArchive(tooMany), /文件过多/);
});

test('central directory bounds/count and local header mismatch cannot reach extraction', async () => {
  const original = await archiveBytes({ 'word/document.xml': '<document>文字</document>' });
  const mutations: ((bytes: Uint8Array) => void)[] = [
    bytes => { const { view, end } = archiveOffsets(bytes); view.setUint16(end + 10, 2, true); },
    bytes => { const { view, end } = archiveOffsets(bytes); view.setUint32(end + 12, 1, true); },
    bytes => { const { view, end } = archiveOffsets(bytes); view.setUint32(end + 16, bytes.length, true); },
    bytes => { const { view, central } = archiveOffsets(bytes); view.setUint16(central + 28, 0xffff, true); },
    bytes => { const { view, central } = archiveOffsets(bytes); view.setUint32(central + 42, central, true); },
    bytes => { const { central } = archiveOffsets(bytes); bytes[central + 46] = 0x78; },
    bytes => { const { view, central } = archiveOffsets(bytes); view.setUint32(central + 24, 1, true); },
  ];
  for (const mutate of mutations) {
    const bytes = Uint8Array.from(original); mutate(bytes);
    assert.throws(() => validateDocxArchive(bytes), /DOCX/);
    await assert.rejects(readScriptFile(scriptFile('mutated.docx', bytes)), /DOCX/);
  }
});

test('ZIP64, encryption and split archives are rejected before Mammoth', async () => {
  const original = await archiveBytes({ 'word/document.xml': '<document>文字</document>' });
  const mutations: ((bytes: Uint8Array) => void)[] = [
    bytes => { const { view, end } = archiveOffsets(bytes); view.setUint16(end + 10, 0xffff, true); },
    bytes => { const { view, end } = archiveOffsets(bytes); view.setUint32(end + 12, 0xffffffff, true); },
    bytes => { const { view, central } = archiveOffsets(bytes); view.setUint32(central + 24, 0xffffffff, true); },
    bytes => { const { view, central } = archiveOffsets(bytes); view.setUint16(central + 6, 45, true); },
    bytes => { const { view, central } = archiveOffsets(bytes); view.setUint16(central + 8, 1, true); },
    bytes => { const { view, end } = archiveOffsets(bytes); view.setUint16(end + 4, 1, true); },
  ];
  for (const mutate of mutations) {
    const bytes = Uint8Array.from(original); mutate(bytes);
    await assert.rejects(readScriptFile(scriptFile('unsupported.docx', bytes)), /暂不支持.*TXT.*DOCX/);
  }
  // A ZIP64 extra field must also be refused even without sentinel size fields.
  const { view: oldView, central, end } = archiveOffsets(original);
  const insertAt = central + 46 + oldView.getUint16(central + 28, true);
  const withZip64Extra = new Uint8Array(original.length + 4);
  withZip64Extra.set(original.subarray(0, insertAt));
  withZip64Extra.set([1, 0, 0, 0], insertAt);
  withZip64Extra.set(original.subarray(insertAt), insertAt + 4);
  const view = new DataView(withZip64Extra.buffer);
  view.setUint16(central + 30, 4, true);
  view.setUint32(end + 4 + 12, oldView.getUint32(end + 12, true) + 4, true);
  assert.throws(() => validateDocxArchive(withZip64Extra), /暂不支持/);
});

test('duplicate names and overlapping local records are rejected', async () => {
  const original = await archiveBytes({ 'word/document.xml': 'x', 'word/stylesxx.xml': 'y' });
  const { view, central } = archiveOffsets(original);
  const firstLength = view.getUint16(central + 28, true);
  const second = central + 46 + firstLength + view.getUint16(central + 30, true) + view.getUint16(central + 32, true);
  assert.equal(view.getUint16(second + 28, true), firstLength);
  const duplicate = Uint8Array.from(original);
  duplicate.set(original.subarray(central + 46, central + 46 + firstLength), second + 46);
  assert.throws(() => validateDocxArchive(duplicate), /DOCX/);
  const overlapping = Uint8Array.from(original);
  new DataView(overlapping.buffer).setUint32(second + 42, view.getUint32(central + 42, true), true);
  assert.throws(() => validateDocxArchive(overlapping), /DOCX/);
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
