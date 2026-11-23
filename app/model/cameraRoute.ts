import { sheetPoint } from "./geometry";
import { shopFloorHeight } from "./retailFrontages";

export type XYZ = [number, number, number];
export type Shot = { time: number; eye: XYZ; look: XYZ; chapter?: string };

const eyeHeight = shopFloorHeight.ground + 1.58;
export function plan(x: number, z: number, height = eyeHeight): XYZ {
  const p = sheetPoint(x, z);
  return [p.x, height, p.y];
}

export type CameraPose = { eye: XYZ; target: XYZ; chapter: string; aerial: boolean };
export type CameraRoute = { duration: number; chapters: { name: string; time: number }[]; sample: (seconds: number, aspect?: number) => CameraPose };

// Monotone cubic Hermite interpolation follows the measured openings exactly.
// Flat holds have zero speed at both ends and no segment overshoots its marks.
function tangents(values: number[], shots: Shot[]) {
  const slopes = values.slice(1).map((value, i) => (value - values[i]) / (shots[i+1].time - shots[i].time));
  return values.map((_, i) => {
    if (i === 0 || i === values.length - 1 || slopes[i-1] * slopes[i] <= 0) return 0;
    const before = shots[i].time - shots[i-1].time;
    const after = shots[i+1].time - shots[i].time;
    const a = 2 * after + before, b = after + 2 * before;
    return (a + b) / (a / slopes[i-1] + b / slopes[i]);
  });
}

function channel(values: number[], shots: Shot[]) {
  const velocity = tangents(values, shots);
  return (i: number, u: number, duration: number) => {
    const u2 = u * u, u3 = u2 * u;
    return (2*u3 - 3*u2 + 1) * values[i] + (u3 - 2*u2 + u) * duration * velocity[i] +
      (-2*u3 + 3*u2) * values[i+1] + (u3 - u2) * duration * velocity[i+1];
  };
}

export function cameraRoute(shots: Shot[]): CameraRoute {
  const duration = shots[shots.length - 1].time;
  const yaw: number[] = [];
  const pitch: number[] = [];
  const chapters: string[] = [];
  for (const { eye, look, chapter } of shots) {
    const dx = look[0] - eye[0], dz = look[2] - eye[2];
    const heading = Math.atan2(dx, dz);
    const last = yaw[yaw.length - 1] ?? heading;
    yaw.push(last + Math.atan2(Math.sin(heading - last), Math.cos(heading - last)));
    pitch.push(Math.atan2(look[1] - eye[1], Math.hypot(dx, dz)));
    chapters.push(chapter ?? chapters[chapters.length - 1]);
  }

  const position = [0, 1, 2].map(axis => channel(shots.map(shot => shot.eye[axis]), shots));
  const headingAt = channel(yaw, shots), pitchAt = channel(pitch, shots);

  /** Deterministic camera pose in model metres, sampled by the playback and seek controls. */
  function sample(seconds: number): CameraPose {
    const time = Math.max(0, Math.min(duration, seconds));
    let index = 0;
    while (index < shots.length - 2 && time >= shots[index + 1].time) index++;
    const interval = shots[index + 1].time - shots[index].time;
    const u = (time - shots[index].time) / interval;
    const eye: XYZ = [position[0](index, u, interval), position[1](index, u, interval), position[2](index, u, interval)];
    const yaw = headingAt(index, u, interval), pitch = pitchAt(index, u, interval);
    const reach = 8 * Math.cos(pitch);
    const target: XYZ = [eye[0] + Math.sin(yaw) * reach, eye[1] + 8 * Math.sin(pitch), eye[2] + Math.cos(yaw) * reach];
    return { eye, target, chapter: chapters[index], aerial: false };
  }
  return { duration, chapters: shots.flatMap(shot => shot.chapter ? [{ name: shot.chapter, time: shot.time }] : []), sample };
}
