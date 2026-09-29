import { MARK_ASPECT_RATIO, MARK_PATH, MARK_VIEWBOX, colors } from '@tuur/ui';

interface Props {
  size?: number;
  label: string;
  color?: string;
}

/** Brand loader: the heart-pin mark turning around its own vertical axis. Static under reduced motion. */
export function SpinningMark({ size = 72, label, color = colors.brand.red }: Props) {
  return (
    <div role="status" aria-label={label} className="tuur-spin-stage" style={{ width: size, height: size }}>
      <svg
        className="tuur-spin"
        viewBox={MARK_VIEWBOX}
        width={size * MARK_ASPECT_RATIO > size ? size : size * MARK_ASPECT_RATIO}
        height={size / (MARK_ASPECT_RATIO > 1 ? MARK_ASPECT_RATIO : 1)}
        aria-hidden="true"
      >
        <path d={MARK_PATH} fill={color} fillRule="evenodd" />
      </svg>
    </div>
  );
}
