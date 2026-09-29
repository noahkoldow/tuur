import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import i18n from '../i18n';
import { recordError } from '../telemetry';
import { Banner } from './Banner';
import { Button } from './Button';
import { Text } from './Text';

/** Last line of defence: a render error shows a calm message with a retry instead of a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    recordError(error); // no-op unless the user consented to crash reports
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: '#FFFFFF' }}>
        <Text variant="title" accessibilityRole="header">
          tuur
        </Text>
        <Banner tone="error" text={i18n.t('errors.generic')} />
        <Button label={i18n.t('common.retry')} onPress={() => this.setState({ failed: false })} />
      </View>
    );
  }
}
