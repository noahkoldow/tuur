import { HStack, Image, ProgressView, Spacer, Text, VStack, type ImageProps } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityLabel,
  activityBackgroundTint,
  font,
  foregroundStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  padding,
  progressViewStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { LiveActivityContent } from './model';

const TourActivity = (props: LiveActivityContent, environment: LiveActivityEnvironment) => {
  'widget';

  // Widgets run outside the app. Keep constants here instead of importing the app theme.
  const accent = environment.isLuminanceReduced ? '#C7C7CC' : '#FF5B63';
  const primary = environment.isLuminanceReduced ? '#C7C7CC' : '#FFFFFF';
  const secondary = '#AEAEB2';
  // ActivityKit sets isStale even when iOS has suspended or terminated the app.
  const status = environment.isStale ? props.staleStatus : props.status;
  const distance = environment.isStale ? '' : props.distance;
  const compactText = environment.isStale ? props.staleCompact : props.compactText;
  const symbol = (environment.isStale ? 'location.slash' : props.symbol) as ImageProps['systemName'];
  const compactLabel =
    !environment.isStale && props.symbol === 'location.fill' && distance ? distance : status;

  return {
    banner: (
      <VStack
        alignment="leading"
        spacing={10}
        modifiers={[padding({ all: 16 }), activityBackgroundTint('#000000')]}
      >
        <HStack alignment="top" spacing={12}>
          <Image systemName={symbol} size={24} color={accent} modifiers={[accessibilityHidden(true)]} />
          <VStack alignment="leading" spacing={3}>
            <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(accent), lineLimit(2)]}>
              {status}
            </Text>
            <Text
              modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(primary), lineLimit(2)]}
            >
              {props.title}
            </Text>
            {props.subtitle !== props.title ? (
              <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(1)]}>
                {props.subtitle}
              </Text>
            ) : null}
          </VStack>
          <Spacer minLength={0} />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(accent)]}>tuur</Text>
        </HStack>
        <HStack spacing={12}>
          {distance ? (
            <Text
              modifiers={[
                font({ size: 12, weight: 'medium' }),
                foregroundStyle(primary),
                monospacedDigit(),
                lineLimit(1),
                minimumScaleFactor(0.8),
              ]}
            >
              {distance}
            </Text>
          ) : null}
          <Spacer minLength={0} />
          <Text
            modifiers={[
              font({ size: 11 }),
              foregroundStyle(secondary),
              monospacedDigit(),
              lineLimit(1),
              minimumScaleFactor(0.8),
            ]}
          >
            {props.progress}
          </Text>
        </HStack>
        <ProgressView
          value={props.progressValue}
          modifiers={[progressViewStyle('linear'), tint(accent), accessibilityLabel(props.progress)]}
        />
      </VStack>
    ),
    bannerSmall: (
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[padding({ all: 12 }), activityBackgroundTint('#000000')]}
      >
        <HStack spacing={6}>
          <Image systemName={symbol} size={14} color={accent} modifiers={[accessibilityHidden(true)]} />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(accent), lineLimit(2)]}>
            {status}
          </Text>
        </HStack>
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(primary), lineLimit(2)]}>
          {props.title}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(secondary), lineLimit(1)]}>
          {distance || props.progress}
        </Text>
      </VStack>
    ),
    compactLeading: (
      <Image systemName={symbol} size={16} color={accent} modifiers={[accessibilityLabel(status)]} />
    ),
    compactTrailing: (
      <Text
        modifiers={[
          font({ size: 12, weight: 'semibold' }),
          foregroundStyle(primary),
          monospacedDigit(),
          lineLimit(1),
          minimumScaleFactor(0.8),
          accessibilityLabel(compactLabel),
        ]}
      >
        {compactText}
      </Text>
    ),
    minimal: (
      <Image
        systemName={symbol}
        size={16}
        color={accent}
        modifiers={[accessibilityLabel(`${status}: ${props.title}`)]}
      />
    ),
    expandedLeading: (
      <HStack spacing={6}>
        <Image systemName={symbol} size={18} color={accent} modifiers={[accessibilityHidden(true)]} />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(accent)]}>tuur</Text>
      </HStack>
    ),
    expandedTrailing: (
      <Text
        modifiers={[
          font({ size: 11 }),
          foregroundStyle(secondary),
          monospacedDigit(),
          lineLimit(1),
          minimumScaleFactor(0.8),
        ]}
      >
        {props.progress}
      </Text>
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={5} modifiers={[padding({ top: 6, bottom: 8 })]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(accent), lineLimit(2)]}>
          {status}
        </Text>
        <Text modifiers={[font({ size: 17, weight: 'semibold' }), foregroundStyle(primary), lineLimit(2)]}>
          {props.title}
        </Text>
        {props.subtitle !== props.title ? (
          <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(1)]}>
            {props.subtitle}
          </Text>
        ) : null}
        {distance ? (
          <Text
            modifiers={[
              font({ size: 13, weight: 'medium' }),
              foregroundStyle(primary),
              monospacedDigit(),
              lineLimit(1),
            ]}
          >
            {distance}
          </Text>
        ) : null}
        <ProgressView
          value={props.progressValue}
          modifiers={[
            progressViewStyle('linear'),
            tint(accent),
            padding({ top: 5 }),
            accessibilityLabel(props.progress),
          ]}
        />
      </VStack>
    ),
  };
};

export default createLiveActivity('TuurTourActivity', TourActivity);
