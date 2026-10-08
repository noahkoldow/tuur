import { Component, type ReactNode } from 'react';
import { recordError } from '../telemetry';

/** Optional decoration or previews must never replace the purchase screen with an error screen. */
export class PaywallEnhancement extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    recordError(error);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
