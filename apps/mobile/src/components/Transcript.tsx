import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { tokenize, wordAt, type Paragraph } from '@tuur/shared';
import { colors, fonts } from '../theme';
import { Text } from './Text';

/**
 * Narration transcript (spec 11). The current paragraph is emphasised; with `highlight` the word being spoken is
 * marked as well (estimated from the paragraph timings, see `wordAt`).
 */
export function Transcript({
  paragraphs,
  positionMs,
  paragraphIndex,
  highlight,
  label,
  onActiveParagraphY,
}: {
  paragraphs: Paragraph[];
  positionMs: number;
  paragraphIndex: number;
  highlight: boolean;
  label: string;
  /** Reports the y offset (within the transcript) of the paragraph being read, to keep it in view. */
  onActiveParagraphY?: (y: number) => void;
}) {
  const at = highlight ? wordAt(paragraphs, positionMs) : undefined;
  const ys = useRef<number[]>([]);
  useEffect(() => {
    const y = ys.current[paragraphIndex];
    if (y !== undefined) onActiveParagraphY?.(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphIndex]);
  return (
    <View style={{ gap: 12 }} accessibilityLabel={label}>
      {paragraphs.map((p, i) => {
        const current = i === paragraphIndex;
        const style = {
          opacity: current ? 1 : 0.6,
          fontFamily: current ? fonts.headingMedium : fonts.body,
        };
        const record = (e: { nativeEvent: { layout: { y: number } } }) => {
          ys.current[i] = e.nativeEvent.layout.y;
        };
        if (!at || at.paragraph !== i)
          return (
            <View key={i} onLayout={record}>
              <Text variant="body" style={style}>
                {p.text}
              </Text>
            </View>
          );
        return (
          <View key={i} onLayout={record}>
            <Text variant="body" style={style}>
              {tokenize(p.text).map((tok, j) =>
                j === at.token ? (
                  <Text
                    key={j}
                    style={{ backgroundColor: colors.brand.redTint, color: colors.brand.redPressed }}
                  >
                    {tok}
                  </Text>
                ) : (
                  tok
                ),
              )}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
