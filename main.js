import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let camera, scene, renderer, controls;
let moveForward = false,
  moveBackward = false,
  moveLeft = false,
  moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
const moveSpeed = 80.0;
let prevTime = performance.now();
let frameCount = 0;
let logInterval = 0;

const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0); // Koordinat tengah layar (selalu 0,0)
let loadedModel = null; // Wadah untuk model agar bisa diakses di animate()
const infoPanel = document.getElementById("info-panel");
const infoContent = document.getElementById("info-content");
const interactionPrompt = document.getElementById("interaction-prompt");

// Interaction system
const INTERACTION_DISTANCE = 20.0; // Distance threshold for interaction (meters)
let currentInteractableObject = null; // Object currently in range for interaction
let isInfoPanelOpen = false; // Track if info panel is open

// Collision detection variables
let collidableObjects = []; // Array untuk menyimpan objek yang bisa ditabrak
const playerHeight = 2.0; // Tinggi pemain (meter) (for future use)
const playerRadius = 1.5; // Radius collider pemain (meter)
const collisionRaycaster = new THREE.Raycaster(
  new THREE.Vector3(),
  new THREE.Vector3(),
  0,
  playerRadius
);
const collisionDirections = [
  new THREE.Vector3(1, 0, 0), // Kanan
  new THREE.Vector3(-1, 0, 0), // Kiri
  new THREE.Vector3(0, 0, 1), // Depan
  new THREE.Vector3(0, 0, -1), // Belakang
  new THREE.Vector3(0.707, 0, 0.707), // Diagonal kanan-depan
  new THREE.Vector3(-0.707, 0, 0.707), // Diagonal kiri-depan
  new THREE.Vector3(0.707, 0, -0.707), // Diagonal kanan-belakang
  new THREE.Vector3(-0.707, 0, -0.707), // Diagonal kiri-belakang
];

// Path ke file GLB
const modelPath = "./scene.glb";

init();
animate();

function init() {
  // 1. Setup Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  // 2. Setup Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcccccc);

  // 3. Setup Kamera (Standing Position)
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(-23.427, 19.0, 49.81);

  // Make camera look DOWN towards the model center
  camera.rotation.x = -0.3; // Tilt down about 17 degrees

  console.log("Initial Camera Position:", camera.position);
  console.log("Camera rotation (looking down):", camera.rotation);

  // 4. Setup PointerLockControls
  controls = new PointerLockControls(camera, renderer.domElement);

  // Get UI elements from HTML
  const welcomeScreen = document.getElementById("welcome-screen");
  const pauseScreen = document.getElementById("pause-screen");
  const startBtn = document.getElementById("start-btn");

  // Start button - lock pointer and hide welcome screen
  startBtn.addEventListener("click", function () {
    controls.lock();
    welcomeScreen.style.display = "none";
  });

  // Pause screen click handler
  pauseScreen.addEventListener("click", function () {
    controls.lock();
  });

  controls.addEventListener("lock", function () {
    pauseScreen.style.display = "none";
  });

  controls.addEventListener("unlock", function () {
    pauseScreen.style.display = "flex";
  });

  // Keyboard controls
  const onKeyDown = function (event) {
    switch (event.code) {
      case "KeyW":
        moveForward = true;
        break;
      case "KeyS":
        moveBackward = true;
        break;
      case "KeyA":
        moveLeft = true;
        break;
      case "KeyD":
        moveRight = true;
        break;
      case "KeyE":
        // Toggle info panel when E is pressed
        if (currentInteractableObject && controls.isLocked) {
          isInfoPanelOpen = !isInfoPanelOpen;
          updateInfoPanelVisibility();
        }
        break;
    }
  };

  const onKeyUp = function (event) {
    switch (event.code) {
      case "KeyW":
        moveForward = false;
        break;
      case "KeyS":
        moveBackward = false;
        break;
      case "KeyA":
        moveLeft = false;
        break;
      case "KeyD":
        moveRight = false;
        break;
    }
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  // 6. Tambahkan Cahaya
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 74.26, 7.48);
  scene.add(directionalLight);

  // 7. Load Model GLB
  const loader = new GLTFLoader();

  loader.load(
    modelPath,
    function (gltf) {
      console.log("MODEL LOADED SUCCESSFULLY!");
      const model = gltf.scene;
      scene.add(model);

      // Store reference for raycasting
      loadedModel = model;

      // Hitung Bounding Box
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      console.log(
        "Model Size:",
        `X:${size.x.toFixed(2)} Y:${size.y.toFixed(2)} Z:${size.z.toFixed(2)}`
      );
      console.log(
        "Model Center:",
        `X:${center.x.toFixed(2)} Y:${center.y.toFixed(2)} Z:${center.z.toFixed(
          2
        )}`
      );
      console.log(
        "Camera Position:",
        `X:${camera.position.x.toFixed(3)} Y:${camera.position.y.toFixed(
          3
        )} Z:${camera.position.z.toFixed(3)}`
      );
      console.log(
        "Distance from camera to model center:",
        camera.position.distanceTo(center).toFixed(2)
      );

      if (size.length() === 0) {
        console.error("!!!MODEL KOSONG!!!");
        return;
      }

      console.log("Model loaded at original position - no repositioning");

      // Setup collision objects - collect all meshes from the model
      model.traverse((child) => {
        if (child.isMesh) {
          collidableObjects.push(child);
        }
      });
      console.log(
        `Collision system ready with ${collidableObjects.length} collidable objects`
      );
    },
    function (xhr) {
      const percent = ((xhr.loaded / xhr.total) * 100).toFixed(2);
      console.log(`Loading: ${percent}%`);
    },
    function (error) {
      console.error("ERROR:", error);
      console.error("Pastikan file 'scene.glb' ada di folder yang sama!");
    }
  );
  // Handle Resize Window
  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Check if object name indicates it's a plane
function isPlaneObject(name) {
  if (!name) return false;
  const lowerName = name.toLowerCase();
  return lowerName.includes("plane") || lowerName.startsWith("plane");
}

// Update info panel visibility
function updateInfoPanelVisibility() {
  if (isInfoPanelOpen && currentInteractableObject) {
    infoPanel.classList.remove("hidden");
  } else {
    infoPanel.classList.add("hidden");
  }
}

function updateRaycaster() {
  // Jika model belum dimuat, jangan lakukan apa-apa
  if (!loadedModel) {
    interactionPrompt.classList.remove("visible");
    currentInteractableObject = null;
    isInfoPanelOpen = false;
    updateInfoPanelVisibility();
    return;
  }

  // 1. Update arah Raycaster dari Kamera ke tengah layar (0,0)
  raycaster.setFromCamera(centerScreen, camera);

  // 2. Cari objek yang berpotongan
  // true = recursive (cek sampai anak cucu objek)
  const intersects = raycaster.intersectObjects(loadedModel.children, true);

  if (intersects.length > 0) {
    // Objek terdekat adalah index ke-0
    const objectHit = intersects[0].object;
    const distance = intersects[0].distance;
    const point = intersects[0].point;

    // Get object type and material info
    const objectType = objectHit.type;
    const materialName = objectHit.material?.name || "Unknown";
    const materialColor = objectHit.material?.color;

    // Check if it's a plane/mesh
    const geometryType = objectHit.geometry?.type || "Unknown";

    // Get object name
    const displayName = objectHit.name || "Unnamed Object";

    // Check if this is a plane and within interaction distance
    const isPlane = isPlaneObject(displayName);
    const canInteract = isPlane && distance <= INTERACTION_DISTANCE;

    if (canInteract) {
      // Show interaction prompt
      currentInteractableObject = objectHit;
      interactionPrompt.classList.add("visible");

      // Build info HTML (will be shown when E is pressed)
      let infoHTML = `
                <div class="info-row">
                    <div class="info-label">Object:</div>
                    <div class="info-value highlight">${displayName}</div>
                </div>
                <div class="separator"></div>
                <div class="info-row">
                    <div class="info-label">Type:</div>
                    <div class="info-value">${objectType}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Geometry:</div>
                    <div class="info-value">${geometryType}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Distance:</div>
                    <div class="info-value">${distance.toFixed(2)}m</div>
                </div>
                <div class="separator"></div>
                <div class="info-row">
                    <div class="info-label">Material:</div>
                    <div class="info-value">${materialName}</div>
                </div>
            `;

      // Add color info if available
      if (materialColor) {
        const colorHex = "#" + materialColor.getHexString();
        infoHTML += `
                    <div class="info-row">
                        <div class="info-label">Color:</div>
                        <div class="info-value">
                            <span style="display:inline-block;width:12px;height:12px;background:${colorHex};border:1px solid #fff;margin-right:5px;vertical-align:middle;"></span>
                            ${colorHex.toUpperCase()}
                        </div>
                    </div>
                `;
      }

      // Add position info
      infoHTML += `
                <div class="separator"></div>
                <div class="info-row">
                    <div class="info-label">Position:</div>
                    <div class="info-value" style="font-size:11px;">
                        X: ${point.x.toFixed(1)}<br>
                        Y: ${point.y.toFixed(1)}<br>
                        Z: ${point.z.toFixed(1)}
                    </div>
                </div>
            `;

      // Add vertices count if available
      if (objectHit.geometry?.attributes?.position) {
        const vertexCount = objectHit.geometry.attributes.position.count;
        infoHTML += `
                    <div class="info-row">
                        <div class="info-label">Vertices:</div>
                        <div class="info-value">${vertexCount.toLocaleString()}</div>
                    </div>
                `;
      }

      infoContent.innerHTML = infoHTML;
      updateInfoPanelVisibility();
    } else {
      // Not a plane or too far away
      currentInteractableObject = null;
      isInfoPanelOpen = false;
      interactionPrompt.classList.remove("visible");
      updateInfoPanelVisibility();
    }

    // Console log untuk detail lebih lengkap (setiap 1 detik)
    if (frameCount % 60 === 0 && controls.isLocked) {
      console.log("Raycaster Hit:", {
        name: objectHit.name || "unnamed",
        type: objectType,
        geometry: geometryType,
        distance: distance.toFixed(2),
        isPlane: isPlane,
        canInteract: canInteract,
        position: {
          x: point.x.toFixed(2),
          y: point.y.toFixed(2),
          z: point.z.toFixed(2),
        },
        material: materialName,
      });
    }
  } else {
    // Jika tidak melihat apa-apa (lihat langit/kosong)
    currentInteractableObject = null;
    isInfoPanelOpen = false;
    interactionPrompt.classList.remove("visible");
    updateInfoPanelVisibility();
  }
}

// Check collision in a given direction and return true if blocked
function checkCollision(moveVector) {
  if (collidableObjects.length === 0) return false;

  let isBlocked = false;

  // Test from player's center (camera position)
  for (let i = 0; i < collisionDirections.length; i++) {
    const dir = collisionDirections[i].clone();

    // Rotate direction based on movement vector
    const angle = Math.atan2(moveVector.x, moveVector.z);
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);

    collisionRaycaster.set(camera.position, dir);

    const intersections = collisionRaycaster.intersectObjects(
      collidableObjects,
      false
    );

    if (intersections.length > 0 && intersections[0].distance < playerRadius) {
      isBlocked = true;

      // Optional: Show collision warning in console (not too spammy)
      if (frameCount % 30 === 0) {
        console.log(
          "Collision detected!",
          intersections[0].distance.toFixed(2) + "m"
        );
      }
      break;
    }
  }

  return isBlocked;
}

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now();
  const delta = (time - prevTime) / 1000;

  // Log position even when NOT locked (every 2 seconds)
  logInterval += delta;
  if (logInterval >= 2.0) {
    console.log(
      "Current Camera:",
      `X:${camera.position.x.toFixed(3)} Y:${camera.position.y.toFixed(
        3
      )} Z:${camera.position.z.toFixed(3)}`,
      `Locked: ${controls.isLocked}`
    );
    logInterval = 0;
  }

  if (controls.isLocked) {
    // Reset velocity
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;

    // Calculate movement direction
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    if (moveForward || moveBackward)
      velocity.z -= direction.z * moveSpeed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * moveSpeed * delta;

    // Store old position for collision rollback
    const oldPosition = camera.position.clone();

    // Calculate intended movement vector
    const moveVector = new THREE.Vector3(
      -velocity.x * delta,
      0,
      -velocity.z * delta
    );

    // Apply movement
    controls.moveRight(moveVector.x);
    controls.moveForward(moveVector.z);

    // Check collision after movement
    if (checkCollision(moveVector)) {
      // Rollback movement if collision detected
      camera.position.copy(oldPosition);
    }

    // Debug camera position every 60 frames (~1 second)
    frameCount++;
    if (frameCount >= 60) {
      console.log("Camera Position:", {
        x: camera.position.x.toFixed(3),
        y: camera.position.y.toFixed(3),
        z: camera.position.z.toFixed(3),
      });
      frameCount = 0;
    }
  }

  prevTime = time;
  updateRaycaster();
  renderer.render(scene, camera);
}
