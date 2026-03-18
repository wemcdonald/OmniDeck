export interface ButtonState {
  background?: string | Buffer;
  icon?: string | Buffer;
  iconColor?: string;
  label?: string;
  labelColor?: string;
  topLabel?: string;
  topLabelColor?: string;
  badge?: string | number;
  badgeColor?: string;
  opacity?: number;
  progress?: number; // 0-1, thin bar at bottom
}
