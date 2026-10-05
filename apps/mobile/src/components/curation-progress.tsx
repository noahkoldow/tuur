import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { LatLng } from '@tuur/shared';
import { BRAND_RED, radii, spacing, sys } from '../theme';
import { Icon } from './Icon';
import { Mascot, type MascotPose } from './Mascot';
import { SpinningMark } from './SpinningMark';
import { Text } from './Text';

export interface CurationStage {
  id: string;
  label: string;
  state: 'pending' | 'active' | 'complete';
}

interface Props {
  title: string;
  detail?: string;
  stages: readonly CurationStage[];
  /** The actual candidate or confirmed route; omitted while no route exists. */
  route?: readonly LatLng[];
  pose?: MascotPose;
}

/** A small, decorative rendering of supplied coordinates, never a fabricated route. */
function RouteSketch({ route }: { route: readonly LatLng[] }) {
  const valid = route.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (valid.length < 2) return null;
  const origin = valid[0]!;
  const longitudeScale = Math.cos((origin.lat * Math.PI) / 180);
  const points = valid.map((point) => ({
    x: (((point.lng - origin.lng + 540) % 360) - 180) * longitudeScale,
    y: origin.lat - point.lat,
  }));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const scale = 80 / Math.max(maxX - minX, maxY - minY, 0.00001);
  const projected = points.map((point) => ({
    x: 56 + (point.x - (minX + maxX) / 2) * scale,
    y: 56 + (point.y - (minY + maxY) / 2) * scale,
  }));
  const first = projected[0]!;
  const last = projected[projected.length - 1]!;
  return (
    <View style={styles.sketch}>
      <Svg width="100%" height="100%" viewBox="0 0 112 112">
        <Path
          d={projected.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={BRAND_RED}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={first.x} cy={first.y} r={4} fill={BRAND_RED} />
        <Circle cx={last.x} cy={last.y} r={6} fill="none" stroke={BRAND_RED} strokeWidth={2} />
      </Svg>
    </View>
  );
}

/**
 * Stage changes are owned by real async work in the caller. The stage track is intentionally
 * un-timed: Tuu and the current-stage mark provide motion without implying invented progress.
 */
export function CurationProgress({ title, detail, stages, route, pose = 'map' }: Props) {
  const active = stages.find((stage) => stage.state === 'active');
  return (
    <View
      accessible
      accessibilityRole={active ? 'progressbar' : 'text'}
      accessibilityLabel={[title, active?.label, detail].filter(Boolean).join('. ')}
      accessibilityState={{ busy: Boolean(active) }}
      accessibilityLiveRegion="polite"
      style={styles.container}
    >
      <View style={styles.header}>
        <View
          style={styles.illustration}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          {route && <RouteSketch route={route} />}
          <Mascot pose={pose} size={112} />
        </View>
        <View style={styles.copy}>
          <Text variant="headline">{title}</Text>
          {detail && (
            <Text variant="subheadline" color={sys.labelSecondary}>
              {detail}
            </Text>
          )}
        </View>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {stages.map((stage, index) => (
          <View key={stage.id} style={styles.stage}>
            <View style={styles.track}>
              {index < stages.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    { backgroundColor: stage.state === 'complete' ? sys.success : sys.separator },
                  ]}
                />
              )}
              <View
                style={[
                  styles.node,
                  { backgroundColor: stage.state === 'active' ? sys.accentTint : sys.grouped },
                ]}
              >
                {stage.state === 'complete' ? (
                  <Icon name="check-circle" size={20} color={sys.success} />
                ) : stage.state === 'active' ? (
                  <SpinningMark size={20} label={stage.label} />
                ) : (
                  <View style={styles.pendingDot} />
                )}
              </View>
            </View>
            <Text
              variant={stage.state === 'active' ? 'headline' : 'subheadline'}
              color={stage.state === 'pending' ? sys.labelSecondary : sys.label}
              style={styles.stageLabel}
            >
              {stage.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  illustration: { width: 112, height: 112 },
  sketch: { position: 'absolute', inset: 0, opacity: 0.2 },
  copy: { flex: 1, gap: spacing.xs },
  stage: { flexDirection: 'row', gap: spacing.sm, minHeight: spacing.xxl },
  track: { width: spacing.xl, alignItems: 'center' },
  node: {
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: { position: 'absolute', top: spacing.md, bottom: -spacing.md, width: 2 },
  pendingDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: sys.separator,
  },
  stageLabel: { flex: 1, paddingTop: spacing.xs, paddingBottom: spacing.md },
});
