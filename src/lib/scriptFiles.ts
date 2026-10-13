import { validateDocxArchive } from './docxArchive';

export const MAX_SCRIPT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SCRIPT_CHARACTERS = 30_000;

export type ScriptFileEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030' | 'docx';
export interface ScriptFileInfo { text: string; encoding: ScriptFileEncoding; warning?: string }

const ENCODING_ERROR = '文件编码无法识别或含有明显乱码，请将文件另存为 UTF-8 后重试。';
const DOCX_ERROR = 'DOCX 文件损坏或格式不正确，请另存为 TXT 或 DOCX 后重试。';
const LEGACY_DOC_ERROR = '暂不支持旧版 .doc 文件，请先另存为 .docx 后导入。';
const PDF_ERROR = '暂不支持 PDF 导入，请先转为 TXT、Markdown 或 DOCX；扫描件需另行 OCR。';

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function decodeText(bytes: Uint8Array): ScriptFileInfo {
  // A BOM declares the encoding. Do not reinterpret damaged BOM-marked text.
  const encoding = startsWith(bytes, [0xff, 0xfe]) ? 'utf-16le'
    : startsWith(bytes, [0xfe, 0xff]) ? 'utf-16be'
    : undefined;

  if (encoding) {
    try {
      return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding };
    } catch {
      throw new Error(ENCODING_ERROR);
    }
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    if (startsWith(bytes, [0xef, 0xbb, 0xbf])) throw new Error(ENCODING_ERROR);
    try {
      // GB18030 also covers the common GBK/GB2312 Chinese text files.
      return { text: new TextDecoder('gb18030', { fatal: true }).decode(bytes), encoding: 'gb18030',
        warning: '按 GB18030 编码读取，请核对中文、标点和对白；如有乱码，请另存为 UTF-8 后再导入。' };
    } catch {
      throw new Error(ENCODING_ERROR);
    }
  }
}

function validateText(rawText: string): string {
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim()) {
    throw new Error('文档中没有可读取的剧本文字，请选择包含文字的文件。');
  }
  // Replacement characters and binary control bytes are observable corruption.
  // This is deliberately conservative: valid Chinese cannot always be
  // distinguished from text that was saved using the wrong encoding.
  if (/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(text)
    || /锟斤拷/.test(text)) {
    throw new Error(ENCODING_ERROR);
  }
  if (text.length > MAX_SCRIPT_CHARACTERS) {
    throw new Error('剧本文字超过 30,000 字符，请拆分后再导入。');
  }
  return text;
}

/** Read locally selected script text without sending the file to an AI service. */
export async function readScriptFile(file: File): Promise<string> {
  return (await readScriptFileWithInfo(file)).text;
}

/** Include the chosen text encoding so an ambiguous legacy decode is visible. */
export async function readScriptFileWithInfo(file: File): Promise<ScriptFileInfo> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'doc') throw new Error(LEGACY_DOC_ERROR);
  if (extension === 'pdf') throw new Error(PDF_ERROR);
  if (!['txt', 'md', 'docx'].includes(extension ?? '')) {
    throw new Error('请选择 TXT、Markdown（.md）或 DOCX 文件。');
  }
  if (file.size > MAX_SCRIPT_FILE_BYTES) {
    throw new Error('文件超过 5 MB，请缩小文件或拆分剧本后再导入。');
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    throw new Error('无法读取该文件，请重新选择文件后重试。');
  }
  if (arrayBuffer.byteLength > MAX_SCRIPT_FILE_BYTES) {
    throw new Error('文件超过 5 MB，请缩小文件或拆分剧本后再导入。');
  }
  const bytes = new Uint8Array(arrayBuffer);
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    throw new Error(LEGACY_DOC_ERROR);
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw new Error(PDF_ERROR);

  if (extension !== 'docx') {
    const result = decodeText(bytes);
    return { ...result, text: validateText(result.text) };
  }
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) throw new Error(DOCX_ERROR);
  validateDocxArchive(bytes);

  let rawText: string;
  try {
    const mammoth = await import('mammoth');
    // Vite selects Mammoth's browser reader (arrayBuffer); Node tests select its
    // server reader (buffer). Both readers receive the same file bytes.
    const input = { arrayBuffer, buffer: bytes };
    const result = await mammoth.extractRawText(input);
    if (result.messages.some(message => message.type === 'error')) throw new Error(DOCX_ERROR);
    rawText = result.value;
  } catch {
    throw new Error(DOCX_ERROR);
  }
  return { text: validateText(rawText), encoding: 'docx' };
}
