import { describe, expect, it } from 'vitest';
import { retainCarouselSelection } from './carouselSelection';

describe('the visible nearby place', () => {
  it('opens the place explicitly selected on the map instead of the previously visible card', () => {
    expect(
      retainCarouselSelection(['tower', 'fountain', 'museum'], { id: 'tower', index: 0 }, 'museum'),
    ).toEqual({ id: 'museum', index: 2 });
  });

  it('keeps the visible card while a selected map place is still loading', () => {
    expect(retainCarouselSelection(['tower', 'fountain'], { id: 'fountain', index: 1 }, 'museum')).toEqual({
      id: 'fountain',
      index: 1,
    });
    expect(
      retainCarouselSelection(['museum', 'tower', 'fountain'], { id: 'fountain', index: 1 }, 'museum'),
    ).toEqual({ id: 'museum', index: 0 });
  });

  it('stays selected when live distance ranking moves it to another card position', () => {
    expect(retainCarouselSelection(['tower', 'fountain', 'museum'], { id: 'tower', index: 2 })).toEqual({
      id: 'tower',
      index: 0,
    });
  });

  it('uses the next available card when the selected destination is removed', () => {
    expect(retainCarouselSelection(['tower', 'museum'], { id: 'fountain', index: 1 })).toEqual({
      id: 'museum',
      index: 1,
    });
  });

  it('clamps to the last remaining card when results shrink', () => {
    expect(retainCarouselSelection(['tower'], { id: 'museum', index: 5 })).toEqual({
      id: 'tower',
      index: 0,
    });
  });

  it('recovers when there are temporarily no nearby destinations', () => {
    const empty = retainCarouselSelection([], { id: 'tower', index: 3 });
    expect(empty).toEqual({ id: null, index: 0 });
    expect(retainCarouselSelection(['museum', 'tower'], empty)).toEqual({ id: 'museum', index: 0 });
  });
});
