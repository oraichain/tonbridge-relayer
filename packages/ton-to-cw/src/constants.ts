export const OPCODES = [2790003363, 2928262747];
export function intToIP(int: number) {
  const part1 = int & 255;
  const part2 = (int >> 8) & 255;
  const part3 = (int >> 16) & 255;
  const part4 = (int >> 24) & 255;

  return part4 + "." + part3 + "." + part2 + "." + part1;
}
