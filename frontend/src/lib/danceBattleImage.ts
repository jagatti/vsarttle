export function removeEdgeBackgroundPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  const colorAt = (index: number) => [
    pixels[index * 4]!,
    pixels[index * 4 + 1]!,
    pixels[index * 4 + 2]!,
  ] as const;
  const distance = (index: number, color: readonly number[]) => {
    const [red, green, blue] = colorAt(index);
    return Math.hypot(red - color[0]!, green - color[1]!, blue - color[2]!);
  };
  const border = new Set<number>();
  for (let x = 0; x < width; x += 1) {
    border.add(x);
    border.add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    border.add(y * width);
    border.add(y * width + width - 1);
  }
  const background = corners
    .map((index) => colorAt(index))
    .sort((left, right) =>
      [...border].filter((index) => distance(index, right) <= 42).length -
      [...border].filter((index) => distance(index, left) <= 42).length)[0]!;
  let head = 0;
  let tail = 0;
  const isBackground = (index: number) => distance(index, background) <= 42;
  const enqueue = (index: number) => {
    if (!visited[index] && isBackground(index)) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  for (let index = 0; index < visited.length; index += 1) {
    if (visited[index]) pixels[index * 4 + 3] = 0;
  }
  return pixels;
}
