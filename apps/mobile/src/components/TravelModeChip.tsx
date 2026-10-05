import { useTranslation } from 'react-i18next';
import type { TravelMode } from '@tuur/shared';
import { sys } from '../theme';
import { Glass } from './Glass';
import { Icon } from './Icon';
import { TRAVEL_ICON } from './icons';
import { Text } from './Text';

/** Floating pill with the travel mode the pacing engine currently assumes (stationary/walk/bike/vehicle). */
export function TravelModeChip({ mode }: { mode: TravelMode }) {
  const { t } = useTranslation();
  const label = t(`travel.${mode}`);
  return (
    <Glass
      style={{
        minHeight: 32,
        paddingHorizontal: 12,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 999,
        maxWidth: '100%',
        flexShrink: 1,
      }}
    >
      <Icon name={TRAVEL_ICON[mode]} size={16} color={sys.label} />
      <Text
        variant="footnote"
        color={sys.label}
        style={{ fontWeight: '600', flexShrink: 1 }}
        accessible
        accessibilityLabel={t('travel.detected', { mode: label })}
        accessibilityLiveRegion="polite"
      >
        {label}
      </Text>
    </Glass>
  );
}
