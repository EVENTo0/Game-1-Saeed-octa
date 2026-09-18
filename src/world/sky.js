/**
 * Physically-flavoured desert sky.
 *
 * Two jobs: it is what you see above the horizon, and it is what LIGHTS the
 * scene. The same dome is rendered into an environment map (PMREM), so every
 * PBR surface picks up warm bounce from the sand and cool light from the zenith
 * instead of a flat ambient term. That single step is most of the difference
 * between "toy" and "outdoors".
 */
import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */`
  varying vec3 vWorld;
  uniform vec3 uSun;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uMid;
  uniform vec3 uGround;
  uniform float uHaze;
  uniform float uIntensity;

  void main() {
    vec3 dir = normalize(vWorld);
    float h = dir.y;

    // Three-stop gradient. Going straight from a warm horizon to a blue zenith
    // passes through magenta, which is why a two-stop desert sky always looks
    // like a bad sunset; the pale mid stop is what keeps it midday.
    float t = clamp(h * 1.35 + 0.06, 0.0, 1.0);
    vec3 sky = t < 0.45
      ? mix(uHorizon, uMid, smoothstep(0.0, 0.45, t))
      : mix(uMid, uZenith, smoothstep(0.45, 1.0, t));

    // Warm scatter piled up around the sun. Kept tight and pale — a broad warm
    // term over blue reads as magenta, which is the classic "wrong sunset" look.
    float sunDot = max(dot(dir, normalize(uSun)), 0.0);
    sky += vec3(1.0, 0.86, 0.66) * pow(sunDot, 22.0) * 0.30 * uHaze;
    sky += vec3(1.0, 0.92, 0.78) * pow(sunDot, 180.0) * 1.4;

    // the sun itself
    float disc = smoothstep(0.9993, 0.9997, sunDot);
    sky = mix(sky, vec3(1.9, 1.75, 1.5), disc);

    // dusty ground bounce below the horizon so the env map is not black
    float below = smoothstep(0.02, -0.18, h);
    sky = mix(sky, uGround, below);

    // The sky is a light source, not a painted backdrop: it has to be well
    // above mid grey or ACES tone mapping crushes it to dusk.
    gl_FragColor = vec4(sky * uIntensity, 1.0);
  }
`;

export function createSky({ sunDirection = new THREE.Vector3(0.45, 0.62, 0.3) } = {}) {
  const uniforms = {
    uSun: { value: sunDirection.clone().normalize() },
    uZenith: { value: new THREE.Color(0x6fb0e8).convertSRGBToLinear() },
    uHorizon: { value: new THREE.Color(0xeee0c6).convertSRGBToLinear() },
    uMid: { value: new THREE.Color(0xbfd9ef).convertSRGBToLinear() },
    uGround: { value: new THREE.Color(0xb5936a).convertSRGBToLinear() },
    uHaze: { value: 1.0 },
    uIntensity: { value: 2.2 },
  };
  const geometry = new THREE.SphereGeometry(1, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Must sit INSIDE the camera's far plane or it gets clipped away, which
  // leaves a black band across the horizon.
  mesh.scale.setScalar(340);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;

  return {
    mesh,
    uniforms,
    /** Colour the fog so distant geometry dissolves into the actual horizon. */
    horizonColor() {
      return new THREE.Color().copy(uniforms.uHorizon.value).convertLinearToSRGB();
    },
    /** Render the dome into an environment map for image-based lighting. */
    buildEnvironment(renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const scene = new THREE.Scene();
      const clone = new THREE.Mesh(geometry, material);
      clone.scale.setScalar(1);
      scene.add(clone);
      const target = pmrem.fromScene(scene, 0.04);
      pmrem.dispose();
      return target.texture;
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
