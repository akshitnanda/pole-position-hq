"use client";

import { useEffect, useRef, useState } from "react";

// A procedural concept, not a scan of a real team's car. No models or remote textures.
export default function DriverCarScene({ color, paused, enabled }: { color: string; paused: boolean; enabled: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const playing = useRef(!paused);
  const resume = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState("loading");
  useEffect(() => { playing.current = !paused; resume.current?.(); }, [paused]);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let cleanup = () => {};
    void import("three").then((T) => {
      if (disposed || !host.current) return;
      const element = host.current;
      let renderer: InstanceType<typeof T.WebGLRenderer>;
      try { renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
      catch { setStatus("static"); return; }
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(34, 1, .1, 50);
      camera.position.set(5.1, 3.1, 5.9);
      camera.lookAt(0, .25, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.5;
      element.appendChild(renderer.domElement);
      const paint = new T.MeshStandardMaterial({ color, metalness: .65, roughness: .25 });
      const carbon = new T.MeshStandardMaterial({ color: "#141923", metalness: .65, roughness: .38 });
      const rubber = new T.MeshStandardMaterial({ color: "#090b10", roughness: .8 });
      const chrome = new T.MeshStandardMaterial({ color: "#c7d5df", metalness: .85, roughness: .25 });
      const glow = new T.MeshBasicMaterial({ color });
      const car = new T.Group();
      scene.add(car);
      function box(x: number, y: number, z: number, px: number, py: number, pz: number, material = paint) {
        const mesh = new T.Mesh(new T.BoxGeometry(x, y, z), material);
        mesh.position.set(px, py, pz); car.add(mesh); return mesh;
      }
      function shell(points: number[][], base: number, height: number) {
        const shape = new T.Shape();
        points.forEach(([x, z], index) => { if (index === 0) shape.moveTo(x, z); else shape.lineTo(x, z); });
        shape.closePath();
        const geometry = new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelSize: .035, bevelThickness: .025, bevelSegments: 3, steps: 1 });
        geometry.rotateX(Math.PI / 2); geometry.translate(0, base + height, 0);
        car.add(new T.Mesh(geometry, paint));
      }
      box(2.9, .13, 1.05, 0, .24, 0, carbon); // floor
      shell([[-1.2,-.12],[-.75,-.3],[.3,-.26],[.6,-.14],[.6,.14],[.3,.26],[-.75,.3],[-1.2,.12]], .29, .28);
      shell([[.3,-.2],[1.7,-.06],[1.7,.06],[.3,.2]], .29, .12); // tapered nose
      box(.38, .09, 1.65, 1.65, .22, 0, carbon);
      box(.16, .06, 1.65, 1.82, .29, 0);
      box(.42, .1, 1.35, -1.42, .85, 0);
      box(.11, .6, .1, -1.43, .51, -.52, carbon);
      box(.11, .6, .1, -1.43, .51, .52, carbon);
      for (const sign of [-1, 1]) shell([[-1.05,.24*sign],[-.65,.58*sign],[.35,.56*sign],[.45,.3*sign]], .28, .22);
      const cockpit = new T.Mesh(new T.SphereGeometry(.29, 24, 12), carbon);
      cockpit.scale.set(1.25, .7, .8); cockpit.position.set(.05, .69, 0); car.add(cockpit);
      const halo = new T.Mesh(new T.TorusGeometry(.29, .027, 8, 32, Math.PI * 1.6), chrome);
      halo.rotation.x = Math.PI / 2; halo.position.set(.06, .83, 0); car.add(halo);
      box(.05, .23, .05, .33, .71, 0, chrome);
      const intake = new T.Mesh(new T.ConeGeometry(.22, .6, 3), paint);
      intake.rotation.z = -.35; intake.position.set(-.52, .85, 0); car.add(intake);
      for (const x of [-1.02, 1.1]) for (const z of [-.77, .77]) {
        const tyre = new T.Mesh(new T.CylinderGeometry(.34, .34, .3, 32), rubber);
        tyre.rotation.x = Math.PI / 2; tyre.position.set(x, .34, z); car.add(tyre);
        const rim = new T.Mesh(new T.CylinderGeometry(.19, .19, .315, 20), carbon);
        rim.rotation.x = Math.PI / 2; rim.position.copy(tyre.position); car.add(rim);
        const stripe = new T.Mesh(new T.TorusGeometry(.275, .012, 6, 32), glow);
        stripe.position.set(x, .34, z + Math.sign(z) * .155); car.add(stripe);
        box(.08, .055, .6, x, .3, z / 2, chrome);
      }
      const platform = new T.Mesh(new T.CylinderGeometry(2.65, 2.8, .12, 80), carbon);
      platform.position.y = -.09; scene.add(platform);
      const ring = new T.Mesh(new T.TorusGeometry(2.68, .015, 8, 96), glow);
      ring.rotation.x = Math.PI / 2; ring.position.y = -.02; scene.add(ring);
      scene.add(new T.HemisphereLight(0xcfe8ff, 0x242b3d, 3));
      const key = new T.DirectionalLight(0xffffff, 5); key.position.set(3, 6, 3); scene.add(key);
      const rimLight = new T.PointLight(color, 30, 15); rimLight.position.set(-3, 3, -2); scene.add(rimLight);
      let frame = 0, last = 0, visible = true, lost = false, angle = -.35;
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const render = () => { if (!disposed && !lost) renderer.render(scene, camera); };
      const tick = (now: number) => {
        if (disposed || lost || !visible || document.hidden || !playing.current || motion.matches) return;
        if (now - last >= 32) {
          angle += Math.min(now - last, 50) * .00012;
          car.rotation.y = angle; render(); last = now;
        }
        frame = requestAnimationFrame(tick);
      };
      const sync = () => { cancelAnimationFrame(frame); last = performance.now(); render(); frame = requestAnimationFrame(tick); };
      resume.current = sync;
      const resize = new ResizeObserver(() => {
        const { width, height } = element.getBoundingClientRect();
        renderer.setSize(width, height); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); render();
      });
      resize.observe(element);
      const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }); observer.observe(element);
      const onLost = (event: Event) => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); setStatus("static"); };
      renderer.domElement.addEventListener("webglcontextlost", onLost);
      motion.addEventListener("change", sync); document.addEventListener("visibilitychange", sync);
      car.rotation.y = angle; sync(); setStatus("ready");
      cleanup = () => {
        resume.current = null; cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect();
        motion.removeEventListener("change", sync); document.removeEventListener("visibilitychange", sync);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        scene.traverse((object) => { if (object instanceof T.Mesh) object.geometry.dispose(); });
        [paint, carbon, rubber, chrome, glow].forEach((material) => material.dispose());
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      };
    }).catch(() => { if (!disposed) setStatus("static"); });
    return () => { disposed = true; cleanup(); };
  }, [color, enabled]);
  return <div aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
    <div ref={host} data-scene-status={enabled ? status : "static"} style={{ position: "absolute", inset: 0, opacity: enabled && status === "ready" ? 1 : 0 }} />
    {(!enabled || status !== "ready") && <svg viewBox="0 0 600 300" style={{ width: "100%", height: "100%" }}>
      <ellipse cx="300" cy="230" rx="220" ry="40" fill="#111926" stroke={color}/>
      <g transform="translate(90 70) skewY(-8)" fill={color} stroke="#d4dfed" strokeWidth="2">
        <path d="M55 100h250l60 30H40zM115 75h110l35 25H85zM305 100v-35h40v65M35 112v-18h70"/>
        {[85,275].map(x=><g key={x}><ellipse cx={x} cy="135" rx="28" ry="38" fill="#10141d"/><ellipse cx={x} cy="135" rx="13" ry="20" fill="#283345"/></g>)}
      </g>
    </svg>}
  </div>;
}
