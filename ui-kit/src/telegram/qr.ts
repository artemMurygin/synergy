import QRCode from 'qrcode'

/** SVG-разметка QR-кода ссылки; строится локально, без сети. */
export function qrSvg(link: string): Promise<string> {
  return QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
}

/** Ссылка для показа в чипе: без схемы. */
export function displayLink(link: string): string {
  return link.replace(/^https?:\/\//, '')
}
