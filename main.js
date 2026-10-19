import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';

// --- NEW: Fat Lines Imports ---
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { Wireframe } from 'three/addons/lines/Wireframe.js';
import { WireframeGeometry2 } from 'three/addons/lines/WireframeGeometry2.js';

// --- Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(15, 15, 15);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// --- Post-Processing (Fading Contrails) ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const afterimagePass = new AfterimagePass();
afterimagePass.uniforms['damp'].value = 0.95; 
composer.addPass(afterimagePass);

// --- State & Parameters ---
const maxParticles = 50000;
const params = {
    density: 10000,
    speedMultiplier: 1.0,
    speedOpacity: 2.0,
    exponentialOpacity: false, // NEW: Toggle exponential opacity
    trailLength: 0.95,
    lifespan: 5.0,             // NEW: Lifespan in seconds
    showAxes: false,
    showBoundaryBox: false,
    equationPreset: 'Swirl',
    eqX: '-y',
    eqY: 'x',
    eqZ: '0',
    minX: -10, maxX: 10,
    minY: -10, maxY: 10,
    minZ: -10, maxZ: 10,
    targetX: 0, targetY: 0, targetZ: 0, // NEW: Camera orbit target
    lockTopView: () => {
        camera.position.set(params.targetX, 25, params.targetZ);
        camera.lookAt(params.targetX, params.targetY, params.targetZ);
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = 0;
    },
    freeOrbit: () => {
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI;
    }
};

// --- Equation Parsing ---
let compiledEq = { x: null, y: null, z: null };
function compileEquations() {
    try {
        compiledEq.x = math.compile(params.eqX);
        compiledEq.y = math.compile(params.eqY);
        compiledEq.z = math.compile(params.eqZ);
    } catch (e) {
        // Silently catch intermediate typing states
    }
}
compileEquations();

// --- NEW: 3px Thick Axes (Fat Lines) ---
const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
const axesMaterial = new LineMaterial({ 
    color: 0xffffff, 
    linewidth: 3, 
    resolution: resolution, 
    transparent: true, 
    opacity: 0.5 
});

const axesGroup = new THREE.Group();
const axisLength = 50;

const xGeo = new LineGeometry().setPositions([-axisLength, 0, 0, axisLength, 0, 0]);
const yGeo = new LineGeometry().setPositions([0, -axisLength, 0, 0, axisLength, 0]);
const zGeo = new LineGeometry().setPositions([0, 0, -axisLength, 0, 0, axisLength]);

axesGroup.add(new Line2(xGeo, axesMaterial));
axesGroup.add(new Line2(yGeo, axesMaterial));
axesGroup.add(new Line2(zGeo, axesMaterial));
axesGroup.visible = params.showAxes;
scene.add(axesGroup);

// --- NEW: 3px Thick Wireframe Boundary Box ---
const boxMaterial = new LineMaterial({ 
    color: 0xffffff, 
    linewidth: 3, 
    resolution: resolution, 
    transparent: true, 
    opacity: 0.3 
});
const baseBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const boxWireframeGeo = new WireframeGeometry2(baseBoxGeometry);
const boundaryBox = new Wireframe(boxWireframeGeo, boxMaterial);
boundaryBox.computeLineDistances(); // Required for LineMaterial
boundaryBox.visible = params.showBoundaryBox;
scene.add(boundaryBox);

function updateBoundaryBox() {
    const width = params.maxX - params.minX;
    const height = params.maxY - params.minY;
    const depth = params.maxZ - params.minZ;
    
    boundaryBox.scale.set(width, height, depth);
    boundaryBox.position.set(
        params.minX + width / 2,
        params.minY + height / 2,
        params.minZ + depth / 2
    );
}
updateBoundaryBox();

function updateCameraTarget() {
    controls.target.set(params.targetX, params.targetY, params.targetZ);
    controls.update();
}

// --- Circular Particle Texture ---
function createCircleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.beginPath();
    context.arc(32, 32, 30, 0, 2 * Math.PI, false);
    context.fillStyle = 'white';
    context.fill();
    return new THREE.CanvasTexture(canvas);
}

// --- Particle System ---
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(maxParticles * 3);
const colors = new Float32Array(maxParticles * 3);
const ages = new Float32Array(maxParticles); // NEW: Track particle lifespan

function spawnParticle(index) {
    positions[index * 3] = THREE.MathUtils.randFloat(params.minX, params.maxX);
    positions[index * 3 + 1] = THREE.MathUtils.randFloat(params.minY, params.maxY);
    positions[index * 3 + 2] = THREE.MathUtils.randFloat(params.minZ, params.maxZ);
    ages[index] = 0; // Reset age on spawn
}

for (let i = 0; i < maxParticles; i++) {
    spawnParticle(i);
    // Randomize initial ages so they don't all die at the exact same time
    ages[i] = THREE.MathUtils.randFloat(0, params.lifespan); 
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setDrawRange(0, params.density);

const material = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    map: createCircleTexture(), 
    alphaTest: 0.1              
});

const particleSystem = new THREE.Points(geometry, material);
scene.add(particleSystem);

// --- GUI Setup ---
const gui = new GUI({ title: 'Vector Field Settings' });

const eqFolder = gui.addFolder('Equations');
const presets = {
    'Swirl': { x: '-y', y: 'x', z: '0' },
    'Lorenz Attractor': { x: '10*(y - x)', y: 'x*(28 - z) - y', z: 'x*y - (8/3)*z' },
    'Outward Flow': { x: 'x', y: 'y', z: 'z' }
};
eqFolder.add(params, 'equationPreset', Object.keys(presets)).onChange(v => {
    params.eqX = presets[v].x; params.eqY = presets[v].y; params.eqZ = presets[v].z;
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    compileEquations();
});
eqFolder.add(params, 'eqX').onFinishChange(compileEquations);
eqFolder.add(params, 'eqY').onFinishChange(compileEquations);
eqFolder.add(params, 'eqZ').onFinishChange(compileEquations);

const visualFolder = gui.addFolder('Visuals');
visualFolder.add(params, 'density', 100, maxParticles, 100).onChange(v => geometry.setDrawRange(0, v));
visualFolder.add(params, 'speedMultiplier', 0.1, 5.0, 0.1).name('Speed Multiplier');
visualFolder.add(params, 'speedOpacity', 0.1, 10.0, 0.1).name('Opacity Sensitivity');
visualFolder.add(params, 'exponentialOpacity').name('Exponential Opacity');
visualFolder.add(params, 'trailLength', 0.0, 0.99, 0.01).onChange(v => afterimagePass.uniforms['damp'].value = v);
visualFolder.add(params, 'lifespan', 0.5, 20.0, 0.5).name('Max Lifespan (s)');
visualFolder.add(params, 'showAxes').name('Show White Axes').onChange(v => axesGroup.visible = v);
visualFolder.add(params, 'showBoundaryBox').name('Show Boundary Box').onChange(v => boundaryBox.visible = v);

const boundsFolder = gui.addFolder('Boundaries');
['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'].forEach(prop => {
    boundsFolder.add(params, prop, -50, 50, 1).onChange(updateBoundaryBox);
});

const camFolder = gui.addFolder('Camera Settings');
camFolder.add(params, 'targetX', -50, 50, 1).name('Orbit Target X').onChange(updateCameraTarget);
camFolder.add(params, 'targetY', -50, 50, 1).name('Orbit Target Y').onChange(updateCameraTarget);
camFolder.add(params, 'targetZ', -50, 50, 1).name('Orbit Target Z').onChange(updateCameraTarget);
camFolder.add(params, 'lockTopView').name('Lock to Top-Down');
camFolder.add(params, 'freeOrbit').name('Unlock Free Orbit');

// --- Animation Loop ---
const dt = 0.016; 

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    const pos = geometry.attributes.position.array;
    const col = geometry.attributes.color.array;
    const scope = { x: 0, y: 0, z: 0 };
    
    const baseR = 0.2, baseG = 0.6, baseB = 1.0;

    for (let i = 0; i < params.density; i++) {
        const idx = i * 3;
        scope.x = pos[idx];
        scope.y = pos[idx + 1];
        scope.z = pos[idx + 2];
        
        ages[i] += dt; // Increment particle age

        try {
            const vx = compiledEq.x.evaluate(scope);
            const vy = compiledEq.y.evaluate(scope);
            const vz = compiledEq.z.evaluate(scope);

            pos[idx] += vx * dt * params.speedMultiplier;
            pos[idx + 1] += vy * dt * params.speedMultiplier;
            pos[idx + 2] += vz * dt * params.speedMultiplier;

            const speed = Math.sqrt(vx*vx + vy*vy + vz*vz);
            let intensity = speed * params.speedOpacity * 0.1;

            // NEW: Exponential Opacity Logic
            if (params.exponentialOpacity) {
                intensity = Math.pow(intensity, 2); 
            }
            
            intensity = Math.min(intensity, 1.0);
            
            col[idx] = baseR * intensity;
            col[idx + 1] = baseG * intensity;
            col[idx + 2] = baseB * intensity;

            // NEW: Respawn condition includes lifespan
            if (ages[i] > params.lifespan ||
                pos[idx] < params.minX || pos[idx] > params.maxX ||
                pos[idx + 1] < params.minY || pos[idx + 1] > params.maxY ||
                pos[idx + 2] < params.minZ || pos[idx + 2] > params.maxZ) {
                spawnParticle(i);
            }
        } catch (e) {
            // Keep app from crashing on bad formula
        }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;

    composer.render();
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    
    // NEW: Update Fat Lines resolution on resize to maintain 3px thickness
    axesMaterial.resolution.set(window.innerWidth, window.innerHeight);
    boxMaterial.resolution.set(window.innerWidth, window.innerHeight);
});

animate();