import * as T from "three";
import { Parts } from "./geometry";

export function addRoofTanks(
  parent: T.Group,
  roofs: ReadonlyArray<{ centre: T.Vector2; yaw: number }>,
  roofY: number,
) {
  const group = new T.Group();
  group.name = "Mumti water tanks";
  parent.add(group);

  // Mould the ribs, rounded shoulder and capped opening into one continuous shell.
  const profile = [
    [0, 0], [.57, 0], [.63, .018], [.665, .053], [.668, .104], [.648, .15],
  ];
  for (const y of [.27, .49, .71, .93]) {
    profile.push([.648, y - .048], [.674, y - .019], [.676, y + .012], [.648, y + .039]);
  }
  profile.push(
    [.648, 1.014], [.633, 1.087], [.587, 1.144], [.497, 1.196], [.379, 1.232], [.218, 1.252],
    [.218, 1.272], [.243, 1.272], [.243, 1.312], [.221, 1.329], [0, 1.329],
  );
  const geometry = new T.LatheGeometry(profile.map(([radius, y]) => new T.Vector2(radius, y)), 40);
  const material = new T.MeshStandardMaterial({ color: "#30383e", roughness: .54 });
  const tanks = new T.InstancedMesh(geometry, material, roofs.length);
  tanks.name = "Ribbed rooftop tank shells";
  tanks.castShadow = tanks.receiveShadow = true;
  group.add(tanks);

  const padsAndPipes = new Parts();
  const tankScale = 1.35;
  const padHeight = .11 * tankScale, padSide = 1.58 * tankScale;
  const matrix = new T.Matrix4().makeScale(tankScale, tankScale, tankScale);
  roofs.forEach(({ centre, yaw }, index) => {
    const base = roofY + padHeight;
    tanks.setMatrixAt(index, matrix.setPosition(centre.x, base, centre.y));
    padsAndPipes.box("#b0aba0", centre.x, roofY + padHeight / 2, centre.y, padSide, padHeight, padSide, yaw);
    padsAndPipes.box("#40494d", centre.x, base + 1.344 * tankScale, centre.y,
      .23 * tankScale, .03 * tankScale, .065 * tankScale, yaw);

    // Run the outlet back down into the stair enclosure roof, away from the door.
    const rear = (distance: number, height: number) => new T.Vector3(
      centre.x - Math.sin(yaw) * distance * tankScale,
      roofY + height,
      centre.y - Math.cos(yaw) * distance * tankScale,
    );
    const pipeHeight = padHeight + .17 * tankScale;
    const pipeRadius = .034 * tankScale;
    const pipeReach = .85;
    const elbow = rear(pipeReach, pipeHeight);
    const pipe = "#aeb5b1";
    padsAndPipes.rod("#626b6a", rear(.63, pipeHeight), rear(.73, pipeHeight), .051 * tankScale);
    padsAndPipes.rod(pipe, rear(.72, pipeHeight), elbow, pipeRadius);
    padsAndPipes.rod(pipe, elbow, rear(pipeReach, -.012), pipeRadius);
    padsAndPipes.add("round", pipe, elbow, new T.Vector3().setScalar(2 * pipeRadius));
  });
  tanks.instanceMatrix.needsUpdate = true;
  padsAndPipes.build(group);
}
