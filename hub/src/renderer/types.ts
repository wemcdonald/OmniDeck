export interface ButtonState {
  background?: string | Buffer;
  icon?: string | Buffer;
  label?: string;
  topLabel?: string;
  badge?: string | number;
  badgeColor?: string;
  opacity?: number;
  progress?: number; // 0-1, thin bar at bottom
}
