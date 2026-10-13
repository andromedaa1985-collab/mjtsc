export const MAX_DOCX_ENTRIES = 1_024;
export const MAX_DOCX_XML_BYTES = 4 * 1024 * 1024;
export const MAX_DOCX_EXPANDED_BYTES = 16 * 1024 * 1024;

const INVALID_ARCHIVE = 'DOCX 文件损坏或格式不正确，请另存为 TXT 或 DOCX 后重试。';
const UNSUPPORTED_ARCHIVE = '该 DOCX 文件格式暂不支持，请另存为 TXT 或普通 DOCX 后重试。';
const LARGE_ARCHIVE = 'DOCX 内含文件过多或展开内容过大，请另存为仅含剧本文字的 TXT 或 DOCX 后重试。';
const fail = (message = INVALID_ARCHIVE): never => { throw new Error(message); };

/**
 * Check ordinary ZIP metadata before Mammoth allocates expanded XML.
 * Record layouts: PKWARE APPNOTE 4.3.7, 4.3.9, 4.3.12 and 4.3.16.
 * https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 * Budgets use declared sizes. This is not a complete malicious-archive defense.
 */
export function validateDocxArchive(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  const inside = (offset: number, length: number, end = bytes.length) => {
    if (offset < 0 || length < 0 || offset + length > end) fail();
  };
  const decodeName = (value: Uint8Array): string => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(value); }
    catch { return fail(UNSUPPORTED_ARCHIVE); }
  };
  let endRecord = -1;
  // The final record is 22 bytes plus an optional 16-bit-length archive comment.
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 0xffff); offset--) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) {
      endRecord = offset;
      break;
    }
  }
  if (endRecord < 0) fail();
  const disk = u16(endRecord + 4);
  const directoryDisk = u16(endRecord + 6);
  const diskEntries = u16(endRecord + 8);
  const entries = u16(endRecord + 10);
  const directoryBytes = u32(endRecord + 12);
  const directoryStart = u32(endRecord + 16);
  if (disk === 0xffff || directoryDisk === 0xffff || entries === 0xffff || diskEntries === 0xffff
    || directoryBytes === 0xffffffff || directoryStart === 0xffffffff
    || (endRecord >= 20 && u32(endRecord - 20) === 0x07064b50)) fail(UNSUPPORTED_ARCHIVE);
  if (disk !== 0 || directoryDisk !== 0) fail(UNSUPPORTED_ARCHIVE);
  if (!entries || diskEntries !== entries || directoryBytes < entries * 46
    || directoryStart + directoryBytes !== endRecord) fail();
  if (entries > MAX_DOCX_ENTRIES) fail(LARGE_ARCHIVE);

  const checkExtraFields = (start: number, length: number, name: string) => {
    const end = start + length;
    for (let offset = start; offset < end;) {
      inside(offset, 4, end);
      const id = u16(offset);
      const size = u16(offset + 2);
      inside(offset + 4, size, end);
      if (id === 1) fail(UNSUPPORTED_ARCHIVE); // ZIP64 extended information.
      if (id === 0x7075) {
        // JSZip can substitute the Unicode path extra field for the raw name.
        // Do not let a different substitute evade the XML budget/name checks.
        if (size < 5 || bytes[offset + 4] !== 1) fail();
        const alternate = decodeName(bytes.subarray(offset + 9, offset + 4 + size));
        if (alternate !== name) fail(UNSUPPORTED_ARCHIVE);
      }
      offset += 4 + size;
    }
  };
  const names = new Set<string>();
  const localRanges: { start: number; end: number }[] = [];
  let expandedBytes = 0;
  let cursor = directoryStart;
  for (let index = 0; index < entries; index++) {
    inside(cursor, 46, endRecord);
    if (u32(cursor) !== 0x02014b50) fail();
    const flags = u16(cursor + 8);
    const method = u16(cursor + 10);
    const crc = u32(cursor + 16);
    const compressed = u32(cursor + 20);
    const expanded = u32(cursor + 24);
    const nameLength = u16(cursor + 28);
    const extraLength = u16(cursor + 30);
    const commentLength = u16(cursor + 32);
    const localStart = u32(cursor + 42);
    if (u16(cursor + 6) >= 45 || u16(cursor + 34) !== 0
      || compressed === 0xffffffff || expanded === 0xffffffff || localStart === 0xffffffff
      || (flags & ~0x080e) !== 0 || ![0, 8].includes(method)) fail(UNSUPPORTED_ARCHIVE);
    const entryLength = 46 + nameLength + extraLength + commentLength;
    inside(cursor, entryLength, endRecord);
    if (!nameLength) fail();
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decodeName(nameBytes);
    if (!name || /[\u0000\\]/.test(name) || name.startsWith('/')
      || name.split('/').some(part => part === '..' || part === '.') || names.has(name)) fail();
    names.add(name);
    checkExtraFields(cursor + 46 + nameLength, extraLength, name);
    expandedBytes += expanded;
    if (expandedBytes > MAX_DOCX_EXPANDED_BYTES
      || (/\.(?:xml|rels)$/i.test(name) && expanded > MAX_DOCX_XML_BYTES)) fail(LARGE_ARCHIVE);
    if (method === 0 && compressed !== expanded) fail();

    inside(localStart, 30, directoryStart);
    if (u32(localStart) !== 0x04034b50 || u16(localStart + 4) >= 45
      || u16(localStart + 6) !== flags || u16(localStart + 8) !== method) fail();
    const localNameLength = u16(localStart + 26);
    const localExtraLength = u16(localStart + 28);
    const dataStart = localStart + 30 + localNameLength + localExtraLength;
    inside(localStart, 30 + localNameLength + localExtraLength, directoryStart);
    if (localNameLength !== nameLength
      || nameBytes.some((byte, position) => byte !== bytes[localStart + 30 + position])) fail();
    checkExtraFields(localStart + 30 + localNameLength, localExtraLength, name);
    const descriptor = (flags & 8) !== 0;
    for (const [offset, expected] of [[14, crc], [18, compressed], [22, expanded]]) {
      const actual = u32(localStart + offset);
      if (actual !== expected && !(descriptor && actual === 0)) fail();
    }
    inside(dataStart, compressed, directoryStart);
    let dataEnd = dataStart + compressed;
    if (descriptor) {
      inside(dataEnd, 12, directoryStart);
      let descriptorStart = dataEnd;
      if (u32(dataEnd) !== crc || u32(dataEnd + 4) !== compressed || u32(dataEnd + 8) !== expanded) {
        if (u32(dataEnd) !== 0x08074b50) fail();
        descriptorStart += 4;
        inside(descriptorStart, 12, directoryStart);
        if (u32(descriptorStart) !== crc || u32(descriptorStart + 4) !== compressed
          || u32(descriptorStart + 8) !== expanded) fail();
      }
      dataEnd = descriptorStart + 12;
    }
    localRanges.push({ start: localStart, end: dataEnd });
    cursor += entryLength;
  }
  if (cursor !== endRecord) fail();
  // Ordinary DOCX files contain one contiguous set of local records, with no
  // hidden or overlapping entry regions before the central directory.
  localRanges.sort((left, right) => left.start - right.start);
  let localCursor = 0;
  for (const range of localRanges) {
    if (range.start !== localCursor) fail();
    localCursor = range.end;
  }
  if (localCursor !== directoryStart) fail();
}
