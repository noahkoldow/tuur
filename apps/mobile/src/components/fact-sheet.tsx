import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FactSheet } from '@tuur/shared';
import { metrics, sys } from '../theme';
import { ListGroup } from './ListGroup';
import { Text } from './Text';

const row = { paddingHorizontal: metrics.margin, paddingVertical: 11, gap: 2 } as const;

/**
 * Structured place fact sheet: summary, inset grouped "key facts" (label above value, wraps, never truncated) and one
 * grouped list per section with bulleted short items. Titles are localized from enum keys.
 */
export function FactSheetView({ sheet, ai }: { sheet: FactSheet; ai?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 16 }}>
      <Text variant="headline">{sheet.summary}</Text>
      {sheet.facts.length ? (
        <ListGroup title={t('factSheet.facts')}>
          {sheet.facts.map((fact) => (
            <View
              key={fact.key}
              style={row}
              accessible
              accessibilityLabel={`${t(`factSheet.fact.${fact.key}`)}: ${fact.value}`}
            >
              <Text variant="footnote">{t(`factSheet.fact.${fact.key}`)}</Text>
              <Text variant="body">{fact.value}</Text>
            </View>
          ))}
        </ListGroup>
      ) : null}
      {sheet.sections.map((section) => (
        <ListGroup key={section.kind} title={t(`factSheet.section.${section.kind}`)}>
          {section.items.map((item, i) => (
            <View key={i} style={{ ...row, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Text variant="body" color={sys.labelTertiary} accessibilityElementsHidden>
                •
              </Text>
              <Text variant="body" style={{ flex: 1 }}>
                {item}
              </Text>
            </View>
          ))}
        </ListGroup>
      ))}
      {ai ? <Text variant="caption">{t('factSheet.aiNote')}</Text> : null}
    </View>
  );
}
