'use client';

import { QRCodeSVG } from 'qrcode.react';

export function QRCode({ text, size = 180 }: { text: string; size?: number }) {
  return (
    <QRCodeSVG
      value={text}
      size={size}
      level="M"
      marginSize={4}
      bgColor="#FFFFFF"
      fgColor="#000000"
      title={`QR code for ${text}`}
      style={{ backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8 }}
    />
  );
}
