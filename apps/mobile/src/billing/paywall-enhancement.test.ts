import { createRequire } from 'node:module';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const report = vi.hoisted(() => vi.fn());
vi.mock('../telemetry', () => ({ recordError: report }));

import { PaywallEnhancement } from './paywall-enhancement';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: ReactNode) => string;
};

// SSR renders the actual child, but does not dispatch client error-boundary lifecycles.
// Drive those two React callbacks explicitly when fault injection makes the child throw.
function renderEnhancement(boundary: PaywallEnhancement) {
  try {
    return renderToStaticMarkup(boundary.render());
  } catch (error) {
    boundary.state = PaywallEnhancement.getDerivedStateFromError();
    boundary.componentDidCatch(error);
    return renderToStaticMarkup(boundary.render());
  }
}

describe('optional paywall content', () => {
  beforeEach(() => report.mockClear());

  it('keeps the same purchase action when the decorative renderer throws', () => {
    const purchase = vi.fn();
    const failure = new Error('Native decoration could not mount');
    const button = createElement('button', { onClick: purchase }, 'Monthly subscription');
    const boundary = new PaywallEnhancement({
      fallback: button,
      children: createElement(() => {
        throw failure;
      }),
    });

    expect(renderEnhancement(boundary)).toBe('<button>Monthly subscription</button>');
    const fallback = boundary.render() as ReactElement<{ onClick: () => void }>;
    expect(fallback).toBe(button);
    fallback.props.onClick();
    expect(purchase).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(failure);
  });

  it('removes a failed optional voice preview while the surrounding actions still render', () => {
    const boundary = new PaywallEnhancement({
      children: createElement(() => {
        throw new Error('Voice preview failed');
      }),
    });

    expect(renderEnhancement(boundary)).toBe('');
    const screen = renderToStaticMarkup(
      createElement(
        'main',
        null,
        createElement('button', null, 'Buy audio'),
        boundary.render(),
        createElement('button', null, 'Restore purchases'),
      ),
    );
    expect(screen).toContain('Buy audio');
    expect(screen).toContain('Restore purchases');
    expect(screen).not.toContain('Something went wrong');
  });

  it('keeps working enhancements and does not report an error', () => {
    const boundary = new PaywallEnhancement({ children: createElement('span', null, 'Voice preview') });
    expect(renderEnhancement(boundary)).toBe('<span>Voice preview</span>');
    expect(report).not.toHaveBeenCalled();
  });
});
