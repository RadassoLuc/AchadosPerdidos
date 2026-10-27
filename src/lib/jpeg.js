import { HttpError } from './validate.js';

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/**
 * Valida a estrutura de um JPEG e REMOVE metadados (EXIF/GPS, XMP, comentários, Photoshop).
 * Mantém JFIF (APP0), perfil ICC (APP2) e Adobe (APP14). Lança HttpError se inválido.
 */
export function limparJpeg(buf, { maxLado = 4096, minLado = 32 } = {}) {
  const bad = (m = 'Imagem inválida. Envie uma foto JPEG.') => new HttpError(415, m);
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw bad();
  const partes = [buf.subarray(0, 2)];
  let i = 2, largura = 0, altura = 0, fimSos = false;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw bad();
    while (buf[i] === 0xff) i++; // padding
    const marcador = buf[i++];
    if (marcador === undefined) throw bad();
    if (marcador === 0xd9) { partes.push(Buffer.from([0xff, 0xd9])); fimSos = true; break; }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd8)) { partes.push(Buffer.from([0xff, marcador])); continue; }
    if (i + 2 > buf.length) throw bad();
    const len = buf.readUInt16BE(i);
    if (len < 2 || i + len > buf.length) throw bad();
    const seg = buf.subarray(i - 2, i + len);
    if (SOF.has(marcador)) {
      if (len < 8) throw bad();
      altura = buf.readUInt16BE(i + 3);
      largura = buf.readUInt16BE(i + 5);
    }
    const descartar = (marcador >= 0xe1 && marcador <= 0xef && marcador !== 0xe2 && marcador !== 0xee) || marcador === 0xfe;
    if (!descartar) partes.push(seg);
    i += len;
    if (marcador === 0xda) {
      // Dados da imagem até o EOI: copiados sem alteração.
      const fim = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
      if (fim < i) throw bad();
      partes.push(buf.subarray(i, fim + 2));
      fimSos = true;
      break;
    }
  }
  if (!fimSos || !largura || !altura) throw bad();
  if (largura > maxLado || altura > maxLado) throw bad('A imagem é grande demais.');
  if (largura < minLado || altura < minLado) throw bad('A imagem é pequena demais.');
  return { buffer: Buffer.concat(partes), largura, altura };
}
