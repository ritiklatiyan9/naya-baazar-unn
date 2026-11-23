import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Open neck, cuffs and hem, with folds running from the hanger to the bottom edge. */
export function hangingShirt() {
  const positions: number[] = [], colours: number[] = [], indices: number[] = [];
  const segments = 20;
  type Section = [x: number, y: number, halfWidth: number, depth: number];
  function sew(sections: Section[], sleeve: boolean) {
    const offset = positions.length / 3;
    sections.forEach(([cx, y, rx, rz], row) => {
      for (let i = 0; i < segments; i++) {
        const angle = i * 2 * Math.PI / segments;
        const u = Math.cos(angle), v = Math.sin(angle);
        const drape = (sleeve ? .18 : .31 - y * .53) * Math.sin(10*u + .6*v);
        const edge = row === 0 || row === sections.length - 1;
        positions.push(cx + u * rx, y + (edge ? .007 * drape : 0), v * rz * (1 + drape));
        const c = (edge ? .84 : .98) + .055 * drape;
        colours.push(c,c,c);
        if (row + 1 < sections.length) {
          const a = offset + row * segments + i, b = offset + row * segments + (i+1)%segments;
          indices.push(a, a+segments, b, a+segments, b+segments, b);
        }
      }
    });
  }
  sew([[0,-.32,.232,.052],[0,-.305,.23,.052],[0,-.18,.212,.050],[0,.06,.196,.047],
    [0,.20,.219,.054],[0,.265,.207,.047],[0,.313,.097,.031],[0,.304,.084,.029]], false);
  for (const side of [-1,1]) {
    sew([[side*.315,.019,.092,.043],[side*.313,.034,.092,.043],[side*.271,.135,.087,.046],
      [side*.217,.239,.077,.049],[side*.193,.265,.044,.044]], true);
  }
  const mesh = new T.BufferGeometry();
  mesh.setAttribute("position", new T.Float32BufferAttribute(positions,3));
  mesh.setAttribute("color", new T.Float32BufferAttribute(colours,3));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  return mesh;
}

/** A blade with a raised midrib and a tip that bends under its own weight. */
export function floristLeaf() {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute([
    0,-.5,0,  -.31,-.24,.06,  0,-.20,.20,  .32,-.24,.06,
    -.46,.10,.12,  0,.13,.28,  .46,.10,.12,  -.26,.34,.07,  .25,.34,.07,  .04,.50,-.12,
  ],3));
  const shades = [.68,.82,1.18,.90,.84,1.15,.97,.86,.96,.80];
  geometry.setAttribute("color", new T.Float32BufferAttribute(shades.flatMap(c=>[c,c,c*.94]),3));
  geometry.setIndex([0,2,1,0,3,2,1,2,4,4,2,5,2,3,6,2,6,5,4,5,7,7,5,9,5,6,8,5,8,9]);
  geometry.computeVertexNormals();
  return geometry;
}

export function floristBloom() {
  const petals = Array.from({ length: 7 }, (_, i) => {
    const angle = i * 2 * Math.PI / 7;
    const petal = new T.SphereGeometry(.5,6,4);
    petal.scale(.33,.17,.53);
    petal.rotateX(-.27);
    petal.translate(0,.018,.23);
    petal.rotateY(angle);
    return petal;
  });
  const centre = new T.SphereGeometry(.14,8,5);
  centre.translate(0,.09,0);
  const pieces = [...petals,centre];
  pieces.forEach((piece,i)=>{
    const shade = i === 7 ? [.53,.32,.13] : [1, .94 + .05 * Math.cos(i), .93];
    const colours = new T.Float32BufferAttribute(piece.getAttribute("position").count * 3,3);
    for(let j=0;j<colours.count;j++) colours.setXYZ(j,shade[0],shade[1],shade[2]);
    piece.setAttribute("color",colours);
  });
  const geometry = mergeGeometries(pieces)!;
  pieces.forEach(piece=>piece.dispose());
  return geometry;
}
