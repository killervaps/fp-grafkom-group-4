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
const moveSpeed = 160.0;
let prevTime = performance.now();
let frameCount = 0;
let logInterval = 0;

const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0); // Koordinat tengah layar (selalu 0,0)
let loadedModel = null; // Wadah untuk model agar bisa diakses di animate()
const infoPanel = document.getElementById("info-panel");
const infoContent = document.getElementById("info-content");
const interactionPrompt = document.getElementById("interaction-prompt");

// Virtual Canting System
let cantingObject = null; // Reference to Object_3_4
let cantingOriginalMaterial = null; // Store original material
let isCantingModalOpen = false; // Track modal state
let isLookingAtCantingObject = false; // Track if player is looking at Object_3_4

// Interaction system
const INTERACTION_DISTANCE = 20.0; // Distance threshold for interaction (meters)
let currentInteractableObject = null; // Object currently in range for interaction
let isInfoPanelOpen = false; // Track if info panel is open

// Collision detection variables
let collidableObjects = []; // Array untuk menyimpan objek yang bisa ditabrak
let groundObjects = [];
let nonGroundObjects = [];
const playerHeight = 13.0; // Tinggi pemain (meter) (for future use)
const playerRadius = 1.5; // Radius collider pemain (meter)
const GROUND_OFFSET = playerHeight; // Jarak dari posisi kamera ke tanah
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

// Virtual Canting Functions
function openCantingModal() {
  isCantingModalOpen = true;
  controls.unlock();
  document.getElementById('canting-modal').style.display = 'flex';
  console.log('Canting modal opened!');
}

function closeCantingModal() {
  isCantingModalOpen = false;
  document.getElementById('canting-modal').style.display = 'none';
  controls.lock();
  console.log('Canting modal closed!');
}

function selectMotif(motifPath) {
  console.log('Selected motif:', motifPath);
  
  // Hide selection screen, show canvas screen
  document.getElementById('motif-selection').style.display = 'none';
  document.getElementById('canvas-screen').style.display = 'flex';
  
  // Initialize canvas
  initCantingCanvas(motifPath);
}

let cantingCanvas, cantingCtx, isDrawing = false;
let bgImageLoaded = false; // Track if background image is loaded

function initCantingCanvas(motifPath) {
  console.log('🎨 Initializing canvas with motif:', motifPath);
  
  // Reset revealed areas
  revealedAreas = [];
  drawCount = 0;
  
  cantingCanvas = document.getElementById('canting-canvas');
  cantingCtx = cantingCanvas.getContext('2d');
  
  // Set canvas size
  cantingCanvas.width = 600;
  cantingCanvas.height = 600;
  
  console.log('📐 Canvas size set:', cantingCanvas.width, 'x', cantingCanvas.height);
  
  // Load background image
  const bgImage = new Image();
  bgImage.src = motifPath;
  bgImage.onload = function() {
    console.log('✅ Background image loaded successfully!');
    
    // Store the background image for persistent rendering
    cantingCanvas.bgImage = bgImage;
    
    // Draw background
    cantingCtx.drawImage(bgImage, 0, 0, cantingCanvas.width, cantingCanvas.height);
    console.log('🖼️ Background drawn on canvas');
    
    // Save the background state
    const backgroundData = cantingCtx.getImageData(0, 0, cantingCanvas.width, cantingCanvas.height);
    cantingCanvas.backgroundData = backgroundData;
    
    // Cover with white layer
    cantingCtx.fillStyle = 'white';
    cantingCtx.fillRect(0, 0, cantingCanvas.width, cantingCanvas.height);
    console.log('⬜ White layer applied on top');
    
    bgImageLoaded = true;
    console.log('Canvas initialized with motif:', motifPath);
    console.log('👆 Now try dragging your mouse on the canvas to reveal the pattern!');
  };
  
  bgImage.onerror = function() {
    console.error('❌ Failed to load motif image:', motifPath);
    console.error('Make sure the file exists at:', motifPath);
    // Fallback: just show white canvas
    cantingCtx.fillStyle = 'white';
    cantingCtx.fillRect(0, 0, cantingCanvas.width, cantingCanvas.height);
    bgImageLoaded = false;
  };
  
  // Store motif path for finish button
  cantingCanvas.dataset.motifPath = motifPath;
  
  // Setup mouse events
  cantingCanvas.addEventListener('mousedown', startDrawing);
  cantingCanvas.addEventListener('mousemove', draw);
  cantingCanvas.addEventListener('mouseup', stopDrawing);
  cantingCanvas.addEventListener('mouseleave', stopDrawing);
  
  console.log('🖱️ Mouse event listeners attached to canvas');
}

function startDrawing(e) {
  isDrawing = true;
  console.log('🖌️ Drawing started at:', e.clientX, e.clientY);
  draw(e);
}

let drawCount = 0; // Counter for logging
let revealedAreas = []; // Store areas that have been revealed

function draw(e) {
  if (!isDrawing) return;
  
  const rect = cantingCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // Log every 10th draw to avoid spam
  if (drawCount % 10 === 0) {
    console.log('✏️ Drawing at canvas position:', Math.round(x), Math.round(y));
  }
  drawCount++;
  
  // Store revealed area
  revealedAreas.push({x, y, radius: 60});
  
  // Redraw entire canvas: background first, then white layer with holes
  redrawCanvas();
}

function redrawCanvas() {
  if (!cantingCanvas.bgImage) {
    console.warn('⚠️ Background image not loaded yet!');
    return;
  }
  
  // Clear canvas
  cantingCtx.clearRect(0, 0, cantingCanvas.width, cantingCanvas.height);
  
  // Step 1: Draw the background pattern
  cantingCtx.drawImage(cantingCanvas.bgImage, 0, 0, cantingCanvas.width, cantingCanvas.height);
  
  // Step 2: Use a mask approach - draw white everywhere EXCEPT where user has drawn
  // Set composite mode to draw white on top
  cantingCtx.globalCompositeOperation = 'source-over';
  
  // Create a temporary canvas for the white mask
  if (!cantingCanvas.maskCanvas) {
    cantingCanvas.maskCanvas = document.createElement('canvas');
    cantingCanvas.maskCanvas.width = cantingCanvas.width;
    cantingCanvas.maskCanvas.height = cantingCanvas.height;
    cantingCanvas.maskCtx = cantingCanvas.maskCanvas.getContext('2d');
  }
  
  const maskCtx = cantingCanvas.maskCtx;
  
  // Clear mask canvas and fill with white
  maskCtx.clearRect(0, 0, cantingCanvas.width, cantingCanvas.height);
  maskCtx.fillStyle = 'white';
  maskCtx.fillRect(0, 0, cantingCanvas.width, cantingCanvas.height);
  
  // Cut holes in the mask where user has drawn
  maskCtx.globalCompositeOperation = 'destination-out';
  for (let area of revealedAreas) {
    maskCtx.beginPath();
    maskCtx.arc(area.x, area.y, area.radius, 0, Math.PI * 2);
    maskCtx.fill();
  }
  maskCtx.globalCompositeOperation = 'source-over';
  
  // Now draw the mask on top of the background
  cantingCtx.drawImage(cantingCanvas.maskCanvas, 0, 0);
  
  // Log only on first few redraws
  if (revealedAreas.length <= 3) {
    console.log('🔄 Canvas redrawn with', revealedAreas.length, 'revealed areas');
  }
}

function stopDrawing() {
  if (isDrawing) {
    console.log('🛑 Drawing stopped. Total strokes:', drawCount);
  }
  isDrawing = false;
}

function finishCanting() {
  const motifPath = cantingCanvas.dataset.motifPath;
  
  if (!cantingObject || !motifPath) {
    console.error('Cannot apply texture: object or motif not found');
    return;
  }
  
  // Load texture and apply to Object_3_4
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    motifPath,
    function(texture) {
      // Apply texture to the object with double-sided rendering
      cantingObject.material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide  // Render both front and back
      });
      
      console.log('Texture applied to Object_3_4 (double-sided)!');
      
      // Close modal and return to game
      closeCantingModal();
      
      // Reset canvas screen
      document.getElementById('canvas-screen').style.display = 'none';
      document.getElementById('motif-selection').style.display = 'block';
    },
    undefined,
    function(error) {
      console.error('Failed to load texture:', error);
    }
  );
}

// Expose functions to global scope for HTML onclick handlers
window.openCantingModal = openCantingModal;
window.closeCantingModal = closeCantingModal;
window.selectMotif = selectMotif;
window.finishCanting = finishCanting;

console.log('Canting functions exposed to window:', {
  openCantingModal: typeof window.openCantingModal,
  closeCantingModal: typeof window.closeCantingModal,
  selectMotif: typeof window.selectMotif,
  finishCanting: typeof window.finishCanting
});

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
      case "KeyQ":
        // Open Canting modal when Q is pressed on Object_3_4
        if (isLookingAtCantingObject && controls.isLocked && !isCantingModalOpen) {
          openCantingModal();
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
          const name = child.name.toLowerCase();
          
          // Check the mesh's PARENT name (because paving/lantai are parent groups)
          const parentName = child.parent?.name?.toLowerCase() || '';
          
          // Identify ground objects by checking both mesh name AND parent name
          if (name.includes('paving') || 
              name.includes('lantai') || 
              name.includes('ramp') || 
              parentName.includes('paving') ||
              parentName.includes('lantai') ||
              parentName.includes('ramp')) {
            groundObjects.push(child);
            console.log("Ground object found:", child.name, "| Parent:", child.parent?.name);
          } else {
            // Everything else is a non-ground object
            nonGroundObjects.push(child);
          }
          
          // All objects can still be collided with horizontally
          collidableObjects.push(child);
        }
      });

      console.log(`Collision system ready:`);
      console.log(`- Ground objects: ${groundObjects.length}`);
      console.log(`- Wall objects: ${nonGroundObjects.length}`);
      console.log(`- Total collidable: ${collidableObjects.length}`);

      // Virtual Canting: Find Object_3_4 and make it white
      model.traverse((child) => {
        if (child.isMesh && child.name === 'Object_3_4') {
          cantingObject = child;
          cantingOriginalMaterial = child.material.clone();
          
          // Make it pure white initially with double-sided rendering
          child.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.7,
            metalness: 0.1,
            side: THREE.DoubleSide  // Render both front and back
          });
          
          console.log('Virtual Canting: Object_3_4 found and set to white (double-sided)!');
        }
      });

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
  
  // Setup Canting Modal Event Listeners (backup for onclick)
  document.addEventListener('DOMContentLoaded', function() {
    // Close button
    const closeBtn = document.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeCantingModal);
    }
    
    // Motif selection
    const motifCard = document.querySelector('.motif-card');
    if (motifCard) {
      motifCard.addEventListener('click', function() {
        selectMotif('./assets/megamendung.jpg');
      });
    }
    
    // Finish button
    const finishBtn = document.querySelector('.finish-btn');
    if (finishBtn) {
      finishBtn.addEventListener('click', finishCanting);
    }
    
    // Back button
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        document.getElementById('canvas-screen').style.display = 'none';
        document.getElementById('motif-selection').style.display = 'block';
      });
    }
    
    console.log('Canting modal event listeners attached!');
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Check if object name indicates it's a plane
function isBatikObject(name, parentName) {
  if (!name && !parentName) return false;
  
  const lowerName = name ? name.toLowerCase() : '';
  const lowerParentName = parentName ? parentName.toLowerCase() : '';
  
  // Check if the object name or parent name contains 'batik'
  return lowerName.includes("batik") || 
         lowerParentName.includes("batik") ||
         lowerParentName.startsWith("batik_");
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
    isLookingAtCantingObject = false;
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
    const parentName = objectHit.parent?.name || "";

    // Check if this is Object_3_4 (Canting object)
    const isCantingObj = displayName === 'Object_3_4';

    // Check if this is a plane and within interaction distance
    const isBatik = isBatikObject(displayName, parentName);
    const canInteract = (isBatik || isCantingObj) && distance <= INTERACTION_DISTANCE;

    if (canInteract) {
      // Show interaction prompt
      currentInteractableObject = objectHit;
      isLookingAtCantingObject = isCantingObj;
      
      // Update prompt text based on object type
      if (isCantingObj) {
        interactionPrompt.innerHTML = 'Press <span class="key">E</span> to view info | <span class="key">Q</span> to use Canting';
      } else {
        interactionPrompt.innerHTML = 'Press <span class="key">E</span> to view info';
      }
      
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
      // Not a batik or too far away
      currentInteractableObject = null;
      isInfoPanelOpen = false;
      isLookingAtCantingObject = false;
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
        isBatik: isBatik,
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
    isLookingAtCantingObject = false;
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

function adjustHeightToGround() {
  if (collidableObjects.length === 0) return false;

  const downRaycaster = new THREE.Raycaster(
    camera.position,
    new THREE.Vector3(0, -1, 0),
    0,
    100
  );

  // Check ALL objects first to see what's directly below
  const allIntersections = downRaycaster.intersectObjects(collidableObjects, false);
  
  if (allIntersections.length === 0) {
    // Nothing below at all
    if (frameCount % 30 === 0) {
      console.log("WARNING: Nothing below player!");
    }
    return false;
  }

  // Get the CLOSEST object below (what player is standing on)
  const closestObject = allIntersections[0];
  const closestDistance = closestObject.distance;

  // Now check if that closest object is actually ground
  const groundIntersections = downRaycaster.intersectObjects(groundObjects, false);
  
  if (groundIntersections.length === 0) {
    // No ground objects below at all
    if (frameCount % 30 === 0) {
      console.log("WARNING: No ground below! Standing on:", closestObject.object.name);
    }
    return false;
  }

  const closestGround = groundIntersections[0];
  const groundDistance = closestGround.distance;

  // Check if the closest object IS the ground
  // Allow small tolerance (0.1m) for floating point errors
  if (Math.abs(closestDistance - groundDistance) < 0.1) {
    // Player is on valid ground
    const groundY = closestGround.point.y;
    const desiredHeight = groundY + GROUND_OFFSET;
    camera.position.y = desiredHeight;

    if (frameCount % 120 === 0) {
      console.log(`On valid ground: ${closestGround.object.name}`);
    }
    return true;
  } else {
    // There's something between player and ground (standing on obstacle)
    if (frameCount % 30 === 0) {
      console.log(
        `WARNING: Standing on obstacle "${closestObject.object.name}" ` +
        `(${closestDistance.toFixed(2)}m below), ground is ${groundDistance.toFixed(2)}m below`
      );
    }
    return false;
  }
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
    } else {
      const hasValidGround = adjustHeightToGround();
      
      // If no valid ground detected, also rollback (prevents walking on objects)
      if (!hasValidGround) {
        camera.position.copy(oldPosition);
        console.log("Rollback: No valid ground below!");
      }
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
