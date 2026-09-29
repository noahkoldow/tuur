import { useMemo } from 'react';
import Svg, { G, Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode';
import { MARK_ASPECT_RATIO, MARK_PATH, MARK_VIEWBOX, colors } from '@tuur/ui';

interface Props {
  value: string;
  size?: number;
  label: string;
}

const [, , VB_W, VB_H] = MARK_VIEWBOX.split(' ').map(Number) as [number, number, number, number];

/**
 * QR code in the tuur design: dark modules with the heart-pin mark in the middle. Error correction level H keeps the
 * code readable with the logo covering the center (about 6 % of the area).
 */
export function QrCode({ value, size = 240, label }: Props) {
  const { modules, count } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'H' });
    return { modules: qr.modules.data, count: qr.modules.size };
  }, [value]);
  const quiet = 2;
  const total = count + quiet * 2;
  const cell = size / total;
  const logo = count * 0.2;
  const logoH = logo / MARK_ASPECT_RATIO;
  const rects: { x: number; y: number }[] = [];
  const from = (count - logo) / 2 - 1;
  const to = (count + logo) / 2 + 1;
  for (let y = 0; y < count; y++)
    for (let x = 0; x < count; x++) {
      if (!modules[y * count + x]) continue;
      // leave the center free for the mark
      if (x >= from && x <= to && y >= (count - logoH) / 2 - 1 && y <= (count + logoH) / 2 + 1) continue;
      rects.push({ x, y });
    }
  const scale = (logo * cell) / VB_W;
  return (
    <Svg width={size} height={size} accessibilityLabel={label} accessible accessibilityRole="image">
      <Rect width={size} height={size} fill={colors.surface.base} />
      {rects.map((r) => (
        <Rect
          key={`${r.x}-${r.y}`}
          x={(r.x + quiet) * cell}
          y={(r.y + quiet) * cell}
          width={cell + 0.4}
          height={cell + 0.4}
          fill={colors.ink.primary}
        />
      ))}
      <G
        transform={`translate(${size / 2 - (VB_W * scale) / 2} ${size / 2 - (VB_H * scale) / 2}) scale(${scale})`}
      >
        <Path d={MARK_PATH} fill={colors.brand.red} />
      </G>
    </Svg>
  );
}
