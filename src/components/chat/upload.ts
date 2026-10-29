export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES = 10;

/** The parts of a File we check. Tests pass plain objects. */
export type FileLike = { name: string; type: string; size: number };

/**
 * Adds newly picked files to the current selection. Non-images and files over
 * 10 MB are rejected one by one. Anything past MAX_IMAGES is not added, with
 * one message saying how many were left out.
 */
export function addImageFiles<T extends FileLike>(
  current: readonly T[],
  incoming: readonly T[],
): { files: T[]; errors: string[] } {
  const errors: string[] = [];
  const valid: T[] = [];
  for (const file of incoming) {
    if (!file.type.startsWith("image/")) {
      errors.push(`${file.name} is not an image.`);
    } else if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`${file.name} is larger than 10 MB.`);
    } else {
      valid.push(file);
    }
  }

  const room = Math.max(0, MAX_IMAGES - current.length);
  const added = valid.slice(0, room);
  const dropped = valid.length - added.length;
  if (dropped > 0) {
    errors.push(
      `You can add up to ${MAX_IMAGES} images. ${dropped} ${dropped === 1 ? "was" : "were"} not added.`,
    );
  }
  return { files: [...current, ...added], errors };
}
