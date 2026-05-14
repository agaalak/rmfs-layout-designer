import { Arrow, Circle, Group, Rect, Text } from "react-konva";
import type { WarehouseLayout } from "../../models/layout";
import type { SimulationState } from "../../models/simulation";
import { robotCarriedRackOffsets } from "../../simulation/simulationEngine";

export function RobotLayer({
  layout,
  simulation,
  cellSize,
  showLabels,
  showLoadedEnvelope = false
}: {
  layout: WarehouseLayout;
  simulation: SimulationState;
  cellSize: number;
  showLabels: boolean;
  showLoadedEnvelope?: boolean;
}) {
  return (
    <Group>
      {simulation.robots.map((robot) => {
        const x = robot.pose.x * cellSize;
        const y = robot.pose.y * cellSize;
        const carriedOffsets = robot.carryingRackId ? robotCarriedRackOffsets(layout, robot) : [];
        return (
          <Group key={robot.robotId} x={x} y={y} listening={false}>
            {robot.carryingRackId
              ? carriedOffsets.map((offset) => (
                  <Group key={`${robot.robotId}_${offset.row}_${offset.col}`}>
                    <Rect
                      x={(offset.col - 0.5) * cellSize}
                      y={(offset.row - 0.5) * cellSize}
                      width={cellSize}
                      height={cellSize}
                      fill="#2563eb"
                      opacity={0.78}
                      stroke="#082f49"
                      strokeWidth={1.5}
                      cornerRadius={2}
                    />
                    {showLoadedEnvelope ? (
                      <Rect
                        x={(offset.col - 0.5) * cellSize}
                        y={(offset.row - 0.5) * cellSize}
                        width={cellSize}
                        height={cellSize}
                        fill="transparent"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dash={[4, 3]}
                      />
                    ) : null}
                  </Group>
                ))
              : null}
            {showLoadedEnvelope && robot.carryingRackId ? (
              <Rect
                x={-cellSize / 2}
                y={-cellSize / 2}
                width={cellSize}
                height={cellSize}
                fill="transparent"
                stroke="#f59e0b"
                strokeWidth={2}
                dash={[4, 3]}
              />
            ) : null}
            <Circle radius={cellSize * 0.34} fill={robot.color} stroke={robot.state === "BLOCKED" || robot.state === "ERROR" ? "#7f1d1d" : "#0f172a"} strokeWidth={2} />
            <Arrow
              rotation={robot.pose.yawDeg}
              points={[0, 0, 0, -cellSize * 0.32]}
              stroke="#f8fafc"
              fill="#f8fafc"
              strokeWidth={2}
              pointerLength={4}
              pointerWidth={4}
            />
            {showLabels ? (
              <Text
                text={robot.robotId.replace("robot_", "")}
                x={-cellSize / 2}
                y={cellSize * 0.38}
                width={cellSize}
                align="center"
                fontSize={8}
                fill="#0f172a"
                fontStyle="bold"
              />
            ) : null}
          </Group>
        );
      })}
    </Group>
  );
}
