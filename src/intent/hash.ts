export function sourceHash(input: string): string {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9 ^ input.length;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ (code + index), 0x85ebca6b);
  }

  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

export function shortHash(input: string): string {
  return sourceHash(input).slice(0, 10);
}
