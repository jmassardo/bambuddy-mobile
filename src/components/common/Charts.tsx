import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Rect, Text as SvgText, Line } from 'react-native-svg';
import { useTheme } from '@/theme';

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  horizontal?: boolean;
  formatValue?: (v: number) => string;
}

export function SimpleBarChart({
  data,
  height = 160,
  horizontal = false,
  formatValue = (v) => String(Math.round(v)),
}: BarChartProps) {
  const { colors } = useTheme();
  const maxValue = Math.max(...data.map(d => d.value), 1);

  if (horizontal) {
    const barHeight = 28;
    const labelWidth = 80;
    const chartHeight = data.length * (barHeight + 8) + 8;

    return (
      <View style={{ height: chartHeight }}>
        <Svg width="100%" height={chartHeight}>
          {data.map((item, i) => {
            const y = i * (barHeight + 8) + 4;
            const barWidth = (item.value / maxValue) * 70; // percentage of available width
            return (
              <React.Fragment key={item.label}>
                <SvgText
                  x={0}
                  y={y + barHeight / 2 + 4}
                  fontSize={11}
                  fill={colors.textSecondary}
                >
                  {item.label.length > 12 ? item.label.slice(0, 11) + '…' : item.label}
                </SvgText>
                <Rect
                  x={`${labelWidth}`}
                  y={y}
                  width={`${barWidth}%`}
                  height={barHeight}
                  rx={4}
                  fill={item.color || colors.accent}
                />
                <SvgText
                  x={`${barWidth + 2}%`}
                  y={y + barHeight / 2 + 4}
                  fontSize={11}
                  fill={colors.textSecondary}
                  dx={labelWidth + 4}
                >
                  {formatValue(item.value)}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>
    );
  }

  // Vertical bar chart
  const barWidth = Math.min(32, Math.floor(280 / data.length) - 8);
  const chartWidth = data.length * (barWidth + 8);
  const paddingTop = 20;
  const paddingBottom = 40;
  const chartAreaHeight = height - paddingTop - paddingBottom;

  return (
    <View style={{ height, overflow: 'hidden' }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${Math.max(chartWidth, 280)} ${height}`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = paddingTop + chartAreaHeight * (1 - frac);
          return (
            <Line
              key={frac}
              x1={0}
              y1={y}
              x2={Math.max(chartWidth, 280)}
              y2={y}
              stroke={colors.borderSubtle}
              strokeWidth={0.5}
            />
          );
        })}
        {/* Bars */}
        {data.map((item, i) => {
          const barH = (item.value / maxValue) * chartAreaHeight;
          const x = i * (barWidth + 8) + 4;
          const y = paddingTop + chartAreaHeight - barH;
          return (
            <React.Fragment key={item.label}>
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={3}
                fill={item.color || colors.accent}
              />
              <SvgText
                x={x + barWidth / 2}
                y={height - paddingBottom + 14}
                fontSize={10}
                fill={colors.textTertiary}
                textAnchor="middle"
              >
                {item.label.length > 5 ? item.label.slice(0, 4) + '…' : item.label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

export function SimpleDonutChart({ data, size = 120 }: DonutChartProps) {
  const { colors } = useTheme();
  const total = data.reduce((acc, d) => acc + d.value, 0) || 1;
  const radius = size / 2 - 10;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceElevated}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {data.map((item, i) => {
          const fraction = item.value / total;
          const dash = fraction * circumference;
          const gap = circumference - dash;
          const rotation = (cumulativeOffset / circumference) * 360 - 90;
          cumulativeOffset += dash;
          if (fraction === 0) return null;
          return (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={item.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="butt"
              rotation={rotation}
              origin={`${size / 2}, ${size / 2}`}
            />
          );
        })}
      </Svg>
      <View style={styles.legendWrap}>
        {data.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>
              {item.label} ({Math.round((item.value / total) * 100)}%)
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
  },
});
