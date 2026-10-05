import type { ImageRef } from '../schemas';
import photos from './place-photos.json';

/** Real place photographs, resolved from their Wikipedia articles and Commons license metadata.
 * Only named region fixtures use these source IDs; synthetic places never receive real-place photos.
 * Refresh with `node scripts/refresh-demo-photos.mjs`.
 */
export const FIXTURE_IMAGES = new Map<string, ImageRef>(photos.map(({ image }) => [image.file, image]));

export const fixtureImageFile = (sourceId: string): string | undefined =>
  photos.find((photo) => photo.sourceIds.includes(sourceId))?.image.file;
