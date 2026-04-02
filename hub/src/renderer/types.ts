export interface ButtonState {
  background?: string | Buffer;
  icon?: string | Buffer;
  iconFullBleed?: boolean;
  iconColor?: string;
  label?: string;
  labelColor?: string;
  scrollLabel?: boolean;
  topLabel?: string;
  topLabelColor?: string;
  scrollTopLabel?: boolean;
  badge?: string | number;
  badgeColor?: string;
  opacity?: number;
  progress?: number; // 0-1, thin bar at bottom
}
