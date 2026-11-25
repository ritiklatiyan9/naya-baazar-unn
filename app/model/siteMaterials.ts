import * as T from "three";

export const facadeFinish = { plaster: "#efe8d9", edge: "#f4eee2", lining: "#e2d9c7", coping: "#323b40" };

function canvasTile(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return { canvas, context: canvas.getContext("2d")! };
}

// Deterministic grain keeps the miniature materials consistent between visits.
function noise(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function courtyardRosette() {
  const { canvas, context: c } = canvasTile(1024);
  c.translate(512, 512);
  const sample = noise(99);
  c.fillStyle = "#e9e5d9";
  c.fillRect(-512, -512, 1024, 1024);
  for (let i = 0; i < 39000; i++) {
    c.fillStyle = sample() > 0.5 ? "rgba(143,136,123,.08)" : "rgba(255,250,242,.2)";
    c.fillRect(sample() * 1024 - 512, sample() * 1024 - 512, 2, 2);
  }
  function ring(radius: number, width: number, color: string) {
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.lineWidth = width;
    c.strokeStyle = color;
    c.stroke();
  }
  function radialPavers(inner: number, outer: number, count: number, color: string, width: number) {
    c.strokeStyle = color;
    c.lineWidth = width;
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count;
      c.beginPath();
      c.moveTo(Math.sin(a) * inner, Math.cos(a) * inner);
      c.lineTo(Math.sin(a) * outer, Math.cos(a) * outer);
      c.stroke();
    }
  }
  radialPavers(373, 494, 24, "#646968", 4.8);
  radialPavers(493, 505, 48, "#858781", 3.2);
  ring(503, 11, "#485050");
  ring(480, 2.6, "#878982");
  ring(375, 8, "#525959");
  ring(367, 1.8, "#9b9b91");

  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = "#865552";
  c.lineWidth = 5.8;
  const petals = 12;
  for (let i = 0; i < petals; i++) {
    c.save();
    c.rotate((i * Math.PI * 2) / petals);
    c.beginPath();
    c.moveTo(-13, -58);
    c.bezierCurveTo(-24, -119, -70, -218, -58, -259);
    c.bezierCurveTo(-43, -310, 43, -310, 58, -259);
    c.bezierCurveTo(70, -218, 24, -119, 13, -58);
    c.stroke();
    c.restore();
  }
  ring(58, 6.5, "#865552");
  ring(8, 3.5, "#865552");
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return new T.MeshStandardMaterial({ map: texture, roughness: 0.92 });
}
