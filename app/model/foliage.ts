import * as T from "three";

type LeafMotion = { rootFlex: number; tipFlex: number; flutter: number; phase: number };

export class PlantSurface {
  coordinates: number[] = [];
  colours: number[] = [];
  triangles: number[] = [];
  private windWeights: number[] = [];

  vertex(p: T.Vector3, tint: T.Color, tone = 1, flex = 0, flutter = 0, phase = 0) {
    const index = this.coordinates.length / 3;
    this.windWeights.push(flex, flutter, phase);
    this.coordinates.push(p.x, p.y, p.z);
    this.colours.push(tint.r * tone, tint.g * tone, tint.b * tone);
    return index;
  }
  quad(a: number, b: number, c: number, d: number) {
    this.triangles.push(a, b, d, b, c, d);
  }
  /** Crease a curved blade along its midrib and let its two edges twist in the breeze. */
  leaf(base: T.Vector3, control: T.Vector3, tip: T.Vector3, across: T.Vector3,
    halfWidth: number, tint: T.Color, { rootFlex, tipFlex, flutter, phase }: LeafMotion) {
    const widthAxis = across.clone();
    const normal = widthAxis.clone().cross(tip.clone().sub(base)).normalize();
    if (normal.y < 0) { normal.negate(); widthAxis.negate(); }
    const root = this.vertex(base, tint, .71, rootFlex);
    for (const [t, profile] of [[.29, 1], [.65, .63]]) {
      const center = base.clone().multiplyScalar((1 - t) ** 2)
        .addScaledVector(control, 2 * (1 - t) * t).addScaledVector(tip, t * t);
      const width = halfWidth * profile;
      const flex = T.MathUtils.lerp(rootFlex, tipFlex, t);
      const quiver = flutter * t;
      this.vertex(center.clone().addScaledVector(widthAxis, -width), tint, .89 + .08 * t, flex, quiver * .50, phase);
      this.vertex(center.clone().addScaledVector(normal, width * .43), tint, 1.13 - .13 * t, flex, quiver, phase);
      this.vertex(center.clone().addScaledVector(widthAxis, width * .89), tint, 1.02 - .11 * t, flex, quiver * 1.45, phase);
    }
    const end = this.vertex(tip, tint, .83, tipFlex, flutter, phase);
    this.triangles.push(root, root + 2, root + 1, root, root + 3, root + 2);
    this.quad(root + 1, root + 2, root + 5, root + 4);
    this.quad(root + 2, root + 3, root + 6, root + 5);
    this.triangles.push(root + 4, root + 5, end, root + 5, root + 6, end);
  }

  mesh(name: string, side: T.Side, wind: T.IUniform<number>, bark = false) {
    const shape = new T.BufferGeometry();
    shape.setIndex(this.triangles);
    shape.setAttribute("position", new T.Float32BufferAttribute(this.coordinates, 3));
    shape.setAttribute("color", new T.Float32BufferAttribute(this.colours, 3));
    shape.setAttribute("windWeights", new T.Float32BufferAttribute(this.windWeights, 3));
    shape.computeVertexNormals();
    shape.computeBoundingSphere();
    shape.boundingSphere!.radius += .5;
    const material = new T.MeshStandardMaterial({ vertexColors: true, roughness: bark ? .94 : .79, side });
    material.customProgramCacheKey = () => bark ? "bark-and-wind" : "leaves-and-wind";
    material.onBeforeCompile = shader => {
      shader.uniforms.breezeTime = wind;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
          uniform float breezeTime;
          attribute vec3 windWeights;
          ${bark ? "varying vec3 barkPoint;" : ""}
        `)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          ${bark ? "barkPoint = position;" : ""}
          vec2 ground = (modelMatrix * vec4(position, 1.0)).xz;
          float wave = dot(ground, vec2(.22, .13));
          float gust = .5 + .32 * sin(breezeTime * .87 + wave) + .18 * sin(breezeTime * 1.43 + wave * 1.7);
          float sway = (.038 + .205 * gust) * windWeights.x;
          float eddy = .064 * sin(breezeTime * .94 - wave * .83) * windWeights.x;
          float phase = windWeights.z;
          float flutter = (.68 * sin(breezeTime * 5.2 + phase) + .32 * sin(breezeTime * 8.3 - phase * .72))
            * windWeights.y * (.46 + .54 * gust);
          vec3 drift = vec3(.88 * sway - .47 * eddy, -.14 * sway + .068 * flutter, .47 * sway + .88 * eddy + .023 * flutter);
          // The group matrices are rigid transforms; their transpose rotates the wind back into local space.
          transformed += (vec4(drift, 0.0) * modelMatrix).xyz;
        `);
      if (bark) {
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec3 barkPoint;")
          .replace("#include <color_fragment>", `#include <color_fragment>
            float ridge = dot(barkPoint.xz, vec2(104.0, 139.0)) + 1.4 * sin(barkPoint.y * 4.3 + barkPoint.z * 23.0);
            float fibre = .5 + .5 * sin(ridge + 1.1 * sin(ridge * .61));
            float detail = 1.0 - smoothstep(.14, 2.2, fwidth(ridge));
            diffuseColor.rgb *= 1.0 - .28 * detail * fibre * fibre;
          `);
      }
    };
    const mesh = new T.Mesh(shape, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
}
