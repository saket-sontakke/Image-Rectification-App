// utils/geometry.ts

export interface Point {
  x: number;
  y: number;
}

export const orderPoints = (pts: Point[]): Point[] => {
  const sortedY = [...pts].sort((a, b) => a.y - b.y);
  const top = sortedY.slice(0, 2).sort((a, b) => a.x - b.x);    
  const bottom = sortedY.slice(2, 4).sort((a, b) => a.x - b.x); 
  return [top[0], top[1], bottom[1], bottom[0]]; 
};

export function fmt(n: number): string {
  return n.toFixed(6);
}