import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as THREE from "three";
import { api } from "../lib/api";

export default function Landing() {
  const nav = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [joinModal, setJoinModal] = useState(false);
  const [joinToken, setJoinToken] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const currentSlideRef = useRef(0);
  currentSlideRef.current = currentSlide;
  const isTransitioningRef = useRef(false);
  isTransitioningRef.current = isTransitioning;

  const TOTAL_SLIDES = 4;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
    }, 3200);
  };

  // Three.js 3D Sculptures and Kinetic Motion Setup
  useEffect(() => {
    if (!canvasRef.current || !deckRef.current) return;

    const canvas = canvasRef.current;
    const container = deckRef.current;

    let width = container.clientWidth;
    let height = container.clientHeight;

    const PALETTE = {
      bg: 0xEFECE4,
      coral: 0xDF6235,
      mossGreen: 0x486444,
      cobaltBlue: 0x2E4166,
      salmonPink: 0xD79E92,
      monolithCream: 0xD8D4C8,
      leverGreen: 0x7E9A68,
      lightFloor: 0xE2DFD6,
    };

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0, 18);
    scene.add(camera);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xFFFAF2, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xFFF7EC, 1.4);
    dirLight1.position.set(12, 20, 15);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 40;
    dirLight1.shadow.bias = -0.0004;
    dirLight1.shadow.radius = 3.5;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xCFE0F5, 0.45);
    dirLight2.position.set(-14, -8, 8);
    scene.add(dirLight2);

    const rimLight = new THREE.DirectionalLight(0xFFE8D6, 0.5);
    rimLight.position.set(0, 14, -10);
    scene.add(rimLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const createClayMaterial = (color: number, roughness = 0.72) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: 0.02,
        flatShading: false,
      });

    // -------------------------------------------------------------
    // SCENE 1 SCULPTURE: 3D Books, Desk Calendar & Pencil Set
    // -------------------------------------------------------------
    const sculptureGroup1 = new THREE.Group();
    sculptureGroup1.position.set(4.4, 0.1, 0);

    // Helper: Create Hardcover Book with inner paper core
    const createHardcoverBook = (
      width: number,
      height: number,
      depth: number,
      coverColor: number,
      roughness = 0.68
    ) => {
      const bookGroup = new THREE.Group();
      const coverThickness = 0.055;
      const coverMat = createClayMaterial(coverColor, roughness);
      const paperMat = createClayMaterial(0xF6F2E8, 0.9);

      // Left cover plate
      const leftCover = new THREE.Mesh(
        new THREE.BoxGeometry(coverThickness, height, depth),
        coverMat
      );
      leftCover.position.x = -width / 2 + coverThickness / 2;
      leftCover.castShadow = true;
      leftCover.receiveShadow = true;
      bookGroup.add(leftCover);

      // Right cover plate
      const rightCover = new THREE.Mesh(
        new THREE.BoxGeometry(coverThickness, height, depth),
        coverMat
      );
      rightCover.position.x = width / 2 - coverThickness / 2;
      rightCover.castShadow = true;
      rightCover.receiveShadow = true;
      bookGroup.add(rightCover);

      // Spine (back)
      const spine = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, coverThickness),
        coverMat
      );
      spine.position.z = -depth / 2 + coverThickness / 2;
      spine.castShadow = true;
      spine.receiveShadow = true;
      bookGroup.add(spine);

      // Paper block inside
      const paperBlock = new THREE.Mesh(
        new THREE.BoxGeometry(
          width - coverThickness * 2 - 0.02,
          height - 0.14,
          depth - coverThickness - 0.08
        ),
        paperMat
      );
      paperBlock.position.set(0, 0, 0.04);
      paperBlock.castShadow = true;
      paperBlock.receiveShadow = true;
      bookGroup.add(paperBlock);

      return bookGroup;
    };

    // Helper: Create Sharpened Pencil
    const createPencil = (length: number, bodyColor: number) => {
      const pencilGroup = new THREE.Group();
      const radius = 0.095;
      const bodyLen = length - 0.36;

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, bodyLen, 8),
        createClayMaterial(bodyColor, 0.62)
      );
      body.castShadow = true;
      body.receiveShadow = true;
      pencilGroup.add(body);

      const woodCone = new THREE.Mesh(
        new THREE.ConeGeometry(radius, 0.28, 8),
        createClayMaterial(0xE2C799, 0.75)
      );
      woodCone.position.y = bodyLen / 2 + 0.14;
      woodCone.castShadow = true;
      pencilGroup.add(woodCone);

      const leadCone = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.38, 0.1, 8),
        createClayMaterial(0x222220, 0.5)
      );
      leadCone.position.y = bodyLen / 2 + 0.28 + 0.04;
      leadCone.castShadow = true;
      pencilGroup.add(leadCone);

      return pencilGroup;
    };

    // 1. Books row (Mustard, Forest Green, Terracotta, Teal)
    const book1 = createHardcoverBook(0.55, 4.1, 2.9, 0xC9962B); // Yellow/Mustard
    book1.position.set(-3.2, 0.05, -1.3);
    sculptureGroup1.add(book1);

    const book2 = createHardcoverBook(0.56, 4.7, 3.0, 0x4A5C3C); // Forest Green
    book2.position.set(-2.6, 0.35, -1.0);
    sculptureGroup1.add(book2);

    const book3 = createHardcoverBook(0.58, 4.9, 3.1, 0xA64D37); // Terracotta Red
    book3.position.set(-2.0, 0.45, -0.7);
    sculptureGroup1.add(book3);

    const book4 = createHardcoverBook(0.86, 4.4, 3.2, 0x2C525E); // Deep Teal
    book4.position.set(-1.25, 0.2, -0.4);
    sculptureGroup1.add(book4);

    // 2. Desk Calendar / Folded Notepad Stand with Grid
    const calGroup = new THREE.Group();
    const calMat = createClayMaterial(0xD5CFC4, 0.78);

    // Front flat fold / base resting on desk
    const baseFlap = new THREE.Mesh(
      new THREE.BoxGeometry(3.7, 0.07, 3.1),
      calMat
    );
    baseFlap.position.set(0, -1.96, 1.55);
    baseFlap.castShadow = true;
    baseFlap.receiveShadow = true;
    calGroup.add(baseFlap);

    // Canvas texture for the grid on the upright notepad face
    const gridCanvas = document.createElement("canvas");
    gridCanvas.width = 512;
    gridCanvas.height = 512;
    const gctx = gridCanvas.getContext("2d");
    if (gctx) {
      gctx.fillStyle = "#D5CFC4";
      gctx.fillRect(0, 0, 512, 512);
      gctx.strokeStyle = "#807A70";
      gctx.lineWidth = 6;
      const startX = 110;
      const startY = 110;
      const step = 95;
      for (let i = 0; i <= 3; i++) {
        gctx.beginPath();
        gctx.moveTo(startX + i * step, startY);
        gctx.lineTo(startX + i * step, startY + 3 * step);
        gctx.stroke();

        gctx.beginPath();
        gctx.moveTo(startX, startY + i * step);
        gctx.lineTo(startX + 3 * step, startY + i * step);
        gctx.stroke();
      }
    }
    const gridTex = new THREE.CanvasTexture(gridCanvas);
    gridTex.anisotropy = 4;
    const gridMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      roughness: 0.78,
      metalness: 0.02,
    });

    // Upright slanted notepad board (faces user)
    const frontBoard = new THREE.Mesh(
      new THREE.BoxGeometry(3.7, 3.6, 0.07),
      [calMat, calMat, calMat, calMat, gridMat, calMat]
    );
    frontBoard.position.set(0, -0.28, 0.15);
    frontBoard.rotation.x = -0.32;
    frontBoard.castShadow = true;
    frontBoard.receiveShadow = true;
    calGroup.add(frontBoard);

    // Back supporting slant leg
    const backLeg = new THREE.Mesh(
      new THREE.BoxGeometry(3.7, 3.4, 0.07),
      calMat
    );
    backLeg.position.set(0, -0.45, -0.85);
    backLeg.rotation.x = 0.42;
    backLeg.castShadow = true;
    backLeg.receiveShadow = true;
    calGroup.add(backLeg);

    calGroup.position.set(1.5, 0.0, 0.5);
    sculptureGroup1.add(calGroup);

    // 3. Terracotta Pencil Holder Cup
    const cupMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 1.55, 32),
      createClayMaterial(0xB65438, 0.65)
    );
    cupMesh.position.set(4.3, -1.22, 0.3);
    cupMesh.castShadow = true;
    cupMesh.receiveShadow = true;
    sculptureGroup1.add(cupMesh);

    // Standing pencils inside cup
    const cupPencil1 = createPencil(2.6, 0x2C525E); // Teal
    cupPencil1.position.set(4.1, -0.1, 0.2);
    cupPencil1.rotation.z = 0.12;
    cupPencil1.rotation.x = -0.12;
    sculptureGroup1.add(cupPencil1);

    const cupPencil2 = createPencil(2.3, 0xC9962B); // Yellow
    cupPencil2.position.set(4.35, -0.25, 0.15);
    cupPencil2.rotation.z = -0.08;
    cupPencil2.rotation.x = -0.16;
    sculptureGroup1.add(cupPencil2);

    const cupPencil3 = createPencil(2.5, 0xA64D37); // Terracotta
    cupPencil3.position.set(4.45, -0.12, 0.45);
    cupPencil3.rotation.z = -0.14;
    cupPencil3.rotation.x = 0.1;
    sculptureGroup1.add(cupPencil3);

    // 4. Three Pencils Lying on the Desk in Front
    const deskPencil1 = createPencil(2.4, 0xA64D37); // Terracotta
    deskPencil1.position.set(2.6, -1.92, 2.5);
    deskPencil1.rotation.set(Math.PI / 2, 0, -0.65);
    sculptureGroup1.add(deskPencil1);

    const deskPencil2 = createPencil(2.3, 0xC9962B); // Yellow
    deskPencil2.position.set(3.1, -1.92, 2.9);
    deskPencil2.rotation.set(Math.PI / 2, 0, -0.65);
    sculptureGroup1.add(deskPencil2);

    const deskPencil3 = createPencil(2.4, 0x9B4B38); // Rust
    deskPencil3.position.set(3.6, -1.92, 3.3);
    deskPencil3.rotation.set(Math.PI / 2, 0, -0.65);
    sculptureGroup1.add(deskPencil3);

    // Shadow receiver ground plane under the composition
    const shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.ShadowMaterial({ opacity: 0.14 })
    );
    shadowFloor.rotation.x = -Math.PI / 2;
    shadowFloor.position.y = -2.0;
    shadowFloor.receiveShadow = true;
    sculptureGroup1.add(shadowFloor);

    rootGroup.add(sculptureGroup1);

    // -------------------------------------------------------------
    // SCENE 2 SCULPTURE: Beveled Clocks Cluster & Connected Cubes Chain
    // -------------------------------------------------------------
    const sculptureGroup2 = new THREE.Group();
    sculptureGroup2.position.set(4.4, 0.1, 0);

    // Helper: Create Beveled Polyhedral Clock
    const createPolyClock = (
      radius: number,
      depth: number,
      rimColor: number,
      faceColor: number,
      hourRot: number,
      minuteRot: number,
      sides = 12
    ) => {
      const clockGroup = new THREE.Group();
      const rimMat = createClayMaterial(rimColor, 0.65);
      const faceMat = createClayMaterial(faceColor, 0.72);
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xC69A4E,
        roughness: 0.4,
        metalness: 0.35,
      });

      // Outer beveled ring / casing
      const casing = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.96, radius * 1.05, depth, sides),
        rimMat
      );
      casing.rotation.x = Math.PI / 2;
      casing.castShadow = true;
      casing.receiveShadow = true;
      clockGroup.add(casing);

      // Recessed face
      const face = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.76, radius * 0.76, depth * 1.02, sides),
        faceMat
      );
      face.rotation.x = Math.PI / 2;
      face.position.z = 0.01;
      face.castShadow = true;
      face.receiveShadow = true;
      clockGroup.add(face);

      // Hour Hand
      const hourHand = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, radius * 0.48, 0.04),
        goldMat
      );
      hourHand.position.set(
        Math.sin(hourRot) * (radius * 0.22),
        Math.cos(hourRot) * (radius * 0.22),
        depth / 2 + 0.04
      );
      hourHand.rotation.z = -hourRot;
      hourHand.castShadow = true;
      clockGroup.add(hourHand);

      // Minute Hand
      const minuteHand = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, radius * 0.64, 0.04),
        goldMat
      );
      minuteHand.position.set(
        Math.sin(minuteRot) * (radius * 0.29),
        Math.cos(minuteRot) * (radius * 0.29),
        depth / 2 + 0.04
      );
      minuteHand.rotation.z = -minuteRot;
      minuteHand.castShadow = true;
      clockGroup.add(minuteHand);

      // Center gold cap
      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12),
        goldMat
      );
      pin.rotation.x = Math.PI / 2;
      pin.position.z = depth / 2 + 0.05;
      pin.castShadow = true;
      clockGroup.add(pin);

      return clockGroup;
    };

    // 1. Clock Cluster (Floating in upper-right area)
    // Clock 1: Navy Blue (Top Left)
    const clock1 = createPolyClock(1.35, 0.55, 0x223249, 0x223249, -0.4, 2.3, 12);
    clock1.position.set(-1.4, 2.2, -0.3);
    clock1.rotation.set(-0.05, 0.12, 0);
    sculptureGroup2.add(clock1);

    // Clock 2: Teal with Cream Face (Top Right)
    const clock2 = createPolyClock(1.35, 0.55, 0x2B525F, 0xD6D1C5, 0.2, 1.2, 12);
    clock2.position.set(0.8, 2.7, -0.5);
    clock2.rotation.set(-0.06, -0.1, 0);
    sculptureGroup2.add(clock2);

    // Clock 3: Forest Green (Bottom Center - Large Foreground)
    const clock3 = createPolyClock(1.65, 0.6, 0x364E32, 0x364E32, -2.1, 2.1, 12);
    clock3.position.set(0.1, 0.35, 0.6);
    clock3.rotation.set(0.02, 0.04, 0);
    sculptureGroup2.add(clock3);

    // Clock 4: Terracotta / Orange-Brown (Bottom Right)
    const clock4 = createPolyClock(1.3, 0.5, 0xB65438, 0xB65438, 0.25, 1.5, 12);
    clock4.position.set(2.3, 0.75, 0.1);
    clock4.rotation.set(0.04, -0.15, 0);
    sculptureGroup2.add(clock4);

    // 2. Connected Diagonal Cubes Chain (Ascending stair line)
    const cubeGroup = new THREE.Group();
    const cubeColors = [0xC7C2B6, 0xAF5C48, 0xD4CFC3, 0xBAB6AA, 0xB4604C];
    const pStart = new THREE.Vector3(-1.0, -2.1, 1.8);
    const pEnd = new THREE.Vector3(3.4, 0.4, -1.8);

    const numCubes = 5;
    for (let i = 0; i < numCubes; i++) {
      const t = i / (numCubes - 1);
      const pos = new THREE.Vector3().lerpVectors(pStart, pEnd, t);

      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.92, 0.92),
        createClayMaterial(cubeColors[i], 0.7)
      );
      cube.position.copy(pos);
      cube.rotation.set(0.12, -0.32, 0.06);
      cube.castShadow = true;
      cube.receiveShadow = true;
      cubeGroup.add(cube);
    }

    // Precise connecting rod running through all cube centers
    const rodDir = new THREE.Vector3().subVectors(pEnd, pStart);
    const rodLen = rodDir.length();
    const rodMid = new THREE.Vector3().addVectors(pStart, pEnd).multiplyScalar(0.5);

    const rodGeo = new THREE.CylinderGeometry(0.038, 0.038, rodLen, 16);
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0x9E603E,
      roughness: 0.45,
      metalness: 0.4,
    });
    const rod = new THREE.Mesh(rodGeo, rodMat);
    rod.position.copy(rodMid);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rodDir.clone().normalize());
    rod.castShadow = true;
    cubeGroup.add(rod);

    sculptureGroup2.add(cubeGroup);

    // 3. Open Folded Papers on the Ground
    // Left Open V-Card / Booklet
    const paperGroup1 = new THREE.Group();
    const paperMat = createClayMaterial(0xDDD8CD, 0.85);
    const flap1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 1.1), paperMat);
    flap1.position.set(-0.55, 0.35, 0);
    flap1.rotation.z = -0.55;
    flap1.castShadow = true;
    paperGroup1.add(flap1);

    const flap2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 1.1), paperMat);
    flap2.position.set(0.55, 0.35, 0);
    flap2.rotation.z = 0.55;
    flap2.castShadow = true;
    paperGroup1.add(flap2);

    paperGroup1.position.set(-2.5, -1.6, 0.8);
    paperGroup1.rotation.set(0.15, 0.35, 0);
    sculptureGroup2.add(paperGroup1);

    // Right Paper Sheet with Folded Corner
    const paperGroup2 = new THREE.Group();
    const baseSheet = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 1.1), paperMat);
    baseSheet.castShadow = true;
    baseSheet.receiveShadow = true;
    paperGroup2.add(baseSheet);

    const foldCorner = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.55), paperMat);
    foldCorner.position.set(0.5, 0.18, 0.28);
    foldCorner.rotation.set(-0.25, 0.35, 0.55);
    foldCorner.castShadow = true;
    paperGroup2.add(foldCorner);

    paperGroup2.position.set(2.9, -1.85, 2.2);
    paperGroup2.rotation.set(0.12, -0.38, 0);
    sculptureGroup2.add(paperGroup2);

    // Subtle 4-point star accent near right paper
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xF2ECE0,
      roughness: 0.5,
      metalness: 0.1,
    });
    const starH = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.06), starMat);
    const starV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.06), starMat);
    const starGroup = new THREE.Group();
    starGroup.add(starH);
    starGroup.add(starV);
    starGroup.position.set(3.8, -1.2, 1.6);
    starGroup.rotation.z = Math.PI / 4;
    sculptureGroup2.add(starGroup);

    // Floor Shadow Receiver for Scene 2
    const shadowFloor2 = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.ShadowMaterial({ opacity: 0.12 })
    );
    shadowFloor2.rotation.x = -Math.PI / 2;
    shadowFloor2.position.y = -2.2;
    shadowFloor2.receiveShadow = true;
    sculptureGroup2.add(shadowFloor2);

    rootGroup.add(sculptureGroup2);

    // -------------------------------------------------------------
    // SCENE 3 SCULPTURE: Architectural Integrity Fortress & Pillar
    // -------------------------------------------------------------
    const sculptureGroup3 = new THREE.Group();
    sculptureGroup3.position.set(4.4, 0.1, 0);

    const terracottaMat = createClayMaterial(0xB3583C, 0.68);
    const tealMat = createClayMaterial(0x274C58, 0.65);
    const roofMat = createClayMaterial(0x485D75, 0.7);
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xC8A058,
      roughness: 0.45,
      metalness: 0.3,
    });

    // 1. Square Crenelated Fortress Base
    const baseGroup = new THREE.Group();
    const basePlinth = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 0.65, 4.8),
      terracottaMat
    );
    basePlinth.position.y = -2.1;
    basePlinth.castShadow = true;
    basePlinth.receiveShadow = true;
    baseGroup.add(basePlinth);

    // Crenelations (battlements) around outer wall
    const battlementSize = 0.42;
    const halfWidth = 2.4 - battlementSize / 2;
    const numPerSide = 5;
    const step = (halfWidth * 2) / (numPerSide - 1);

    for (let i = 0; i < numPerSide; i++) {
      const offset = -halfWidth + i * step;

      // North & South wall teeth
      [-halfWidth, halfWidth].forEach((sideZ) => {
        const merlon = new THREE.Mesh(
          new THREE.BoxGeometry(battlementSize, 0.38, battlementSize),
          terracottaMat
        );
        merlon.position.set(offset, -1.6, sideZ);
        merlon.castShadow = true;
        merlon.receiveShadow = true;
        baseGroup.add(merlon);
      });

      // East & West wall teeth (skip corners already placed)
      if (i > 0 && i < numPerSide - 1) {
        [-halfWidth, halfWidth].forEach((sideX) => {
          const merlon = new THREE.Mesh(
            new THREE.BoxGeometry(battlementSize, 0.38, battlementSize),
            terracottaMat
          );
          merlon.position.set(sideX, -1.6, offset);
          merlon.castShadow = true;
          merlon.receiveShadow = true;
          baseGroup.add(merlon);
        });
      }
    }
    sculptureGroup3.add(baseGroup);

    // 2. Stepped Octagonal Plinth Base
    const octPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.85, 0.45, 8),
      tealMat
    );
    octPlinth.position.y = -1.65;
    octPlinth.castShadow = true;
    octPlinth.receiveShadow = true;
    sculptureGroup3.add(octPlinth);

    // 3. Central Octagonal Column
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.45, 3.8, 8),
      tealMat
    );
    column.position.y = 0.45;
    column.castShadow = true;
    column.receiveShadow = true;
    sculptureGroup3.add(column);

    // 4. Capital Collar & Blue-Slate Beveled Roof Cap
    const capitalCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 1.55, 0.32, 8),
      terracottaMat
    );
    capitalCollar.position.y = 2.45;
    capitalCollar.castShadow = true;
    capitalCollar.receiveShadow = true;
    sculptureGroup3.add(capitalCollar);

    const roofCap = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.8, 0.75, 8),
      roofMat
    );
    roofCap.position.y = 2.95;
    roofCap.castShadow = true;
    roofCap.receiveShadow = true;
    sculptureGroup3.add(roofCap);

    // 5. Security Key Mounted on Left Pillar Facet
    const keyGroup = new THREE.Group();
    const keyMat = createClayMaterial(0x43869A, 0.65);

    // Key bow / head (hexagonal ring with inner recess)
    const keyHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.08, 6),
      keyMat
    );
    keyHead.rotation.x = Math.PI / 2;
    keyHead.position.y = 0.8;
    keyHead.castShadow = true;
    keyGroup.add(keyHead);

    const keyHeadCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.09, 6),
      createClayMaterial(0x1F3E48, 0.7)
    );
    keyHeadCore.rotation.x = Math.PI / 2;
    keyHeadCore.position.y = 0.8;
    keyGroup.add(keyHeadCore);

    // Key blade / shaft
    const keyShaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 1.4, 0.08),
      keyMat
    );
    keyShaft.position.y = 0.0;
    keyShaft.castShadow = true;
    keyGroup.add(keyShaft);

    // Key teeth notches
    [-0.3, -0.55].forEach((yPos) => {
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.14, 0.08),
        keyMat
      );
      tooth.position.set(0.14, yPos, 0);
      tooth.castShadow = true;
      keyGroup.add(tooth);
    });

    keyGroup.position.set(-1.0, 0.5, 0.85);
    keyGroup.rotation.y = -Math.PI / 8;
    sculptureGroup3.add(keyGroup);

    // 6. Security Padlock Mounted on Right Pillar Facet
    const lockGroup = new THREE.Group();
    const lockBodyMat = createClayMaterial(0x2E5361, 0.65);

    // Padlock body
    const lockBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.95, 0.38),
      lockBodyMat
    );
    lockBody.castShadow = true;
    lockBody.receiveShadow = true;
    lockGroup.add(lockBody);

    // Keyhole slot on lock body
    const keyholeRound = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.4, 16),
      goldMat
    );
    keyholeRound.rotation.x = Math.PI / 2;
    keyholeRound.position.y = 0.05;
    lockGroup.add(keyholeRound);

    const keyholeSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.14, 0.4),
      goldMat
    );
    keyholeSlot.position.y = -0.05;
    lockGroup.add(keyholeSlot);

    // Padlock U-Shackle
    const shackleGeo = new THREE.TorusGeometry(0.28, 0.065, 16, 32, Math.PI);
    const shackleMat = new THREE.MeshStandardMaterial({
      color: 0xD4C6B2,
      roughness: 0.4,
      metalness: 0.35,
    });
    const shackle = new THREE.Mesh(shackleGeo, shackleMat);
    shackle.position.y = 0.48;
    shackle.castShadow = true;
    lockGroup.add(shackle);

    lockGroup.position.set(0.95, 0.35, 0.9);
    lockGroup.rotation.y = Math.PI / 8;
    sculptureGroup3.add(lockGroup);

    // 7. Sparkle Star Accent
    const starMat3 = new THREE.MeshStandardMaterial({
      color: 0xF5F0E6,
      roughness: 0.4,
      metalness: 0.1,
    });
    const starH3 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.06), starMat3);
    const starV3 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.06), starMat3);
    const starGroup3 = new THREE.Group();
    starGroup3.add(starH3);
    starGroup3.add(starV3);
    starGroup3.position.set(3.6, -1.2, 1.8);
    starGroup3.rotation.z = Math.PI / 4;
    sculptureGroup3.add(starGroup3);

    // Shadow ground plane
    const shadowFloor3 = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.ShadowMaterial({ opacity: 0.14 })
    );
    shadowFloor3.rotation.x = -Math.PI / 2;
    shadowFloor3.position.y = -2.42;
    shadowFloor3.receiveShadow = true;
    sculptureGroup3.add(shadowFloor3);

    rootGroup.add(sculptureGroup3);

    // -------------------------------------------------------------
    // SCENE 4 SCULPTURE: Continuous Learning Shield & Book Stack
    // -------------------------------------------------------------
    const sculptureGroup4 = new THREE.Group();
    sculptureGroup4.position.set(4.4, 0.1, 0);

    const shieldMat = createClayMaterial(0x6E9A90, 0.65);
    const badgeMat = createClayMaterial(0xD2B38A, 0.7);

    // 1. Medieval / Heraldic Shield Frame
    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(0, 3.2);
    shieldShape.lineTo(-2.2, 3.0);
    shieldShape.quadraticCurveTo(-2.5, 0.8, 0, -2.9);
    shieldShape.quadraticCurveTo(2.5, 0.8, 2.2, 3.0);
    shieldShape.lineTo(0, 3.2);

    // Inner cutout hole for hollow frame
    const shieldHole = new THREE.Path();
    shieldHole.moveTo(0, 2.65);
    shieldHole.lineTo(-1.65, 2.48);
    shieldHole.quadraticCurveTo(-1.85, 0.75, 0, -2.25);
    shieldHole.quadraticCurveTo(1.85, 0.75, 1.65, 2.48);
    shieldHole.lineTo(0, 2.65);
    shieldShape.holes.push(shieldHole);

    const extrudeSettings = {
      depth: 0.65,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.08,
      bevelThickness: 0.08,
    };

    const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, extrudeSettings);
    shieldGeo.center();
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.position.set(0, 0.35, -0.2);
    shieldMesh.castShadow = true;
    shieldMesh.receiveShadow = true;
    sculptureGroup4.add(shieldMesh);

    // 2. Shield Badges (Gear, Clock, Bar Chart)
    // Left Gear Badge
    const gearGroup = new THREE.Group();
    const gearBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.68, 0.18),
      createClayMaterial(0x568078, 0.68)
    );
    gearBase.castShadow = true;
    gearGroup.add(gearBase);

    // Gear teeth accents
    const gearTooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.19), createClayMaterial(0x568078, 0.68));
    const gearTooth2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, 0.19), createClayMaterial(0x568078, 0.68));
    gearGroup.add(gearTooth1);
    gearGroup.add(gearTooth2);

    const gearCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.22, 16),
      createClayMaterial(0x274C58, 0.8)
    );
    gearCore.rotation.x = Math.PI / 2;
    gearGroup.add(gearCore);

    gearGroup.position.set(-2.2, 0.9, 0.15);
    sculptureGroup4.add(gearGroup);

    // Right Clock Badge
    const clockBadgeGroup = new THREE.Group();
    const clockBadgeBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.68, 0.18),
      badgeMat
    );
    clockBadgeBase.castShadow = true;
    clockBadgeGroup.add(clockBadgeBase);

    const clockH = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.05), goldMat);
    clockH.position.set(0, 0.06, 0.11);
    const clockM = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), goldMat);
    clockM.position.set(0.06, 0, 0.11);
    clockBadgeGroup.add(clockH);
    clockBadgeGroup.add(clockM);

    clockBadgeGroup.position.set(2.1, 0.2, 0.15);
    sculptureGroup4.add(clockBadgeGroup);

    // Bottom-Left Analytics / Bar Chart Badge
    const chartBadgeGroup = new THREE.Group();
    const chartBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.65, 0.18),
      createClayMaterial(0x4F7B72, 0.68)
    );
    chartBase.castShadow = true;
    chartBadgeGroup.add(chartBase);

    // Mini chart bars
    [
      { h: 0.18, x: -0.15 },
      { h: 0.32, x: 0.0 },
      { h: 0.44, x: 0.15 },
    ].forEach((bar) => {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, bar.h, 0.05),
        goldMat
      );
      b.position.set(bar.x, -0.22 + bar.h / 2, 0.11);
      chartBadgeGroup.add(b);
    });

    chartBadgeGroup.position.set(-1.25, -1.9, 0.15);
    sculptureGroup4.add(chartBadgeGroup);

    // 3. Books Nested Inside the Shield
    // Base horizontal book (foundation)
    const baseBook = new THREE.Group();
    const bCoverMat = createClayMaterial(0xB2644F, 0.68);
    const bPaperMat = createClayMaterial(0xF7F4EC, 0.9);

    const bottomCover = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.06, 2.7), bCoverMat);
    bottomCover.position.y = -0.27;
    bottomCover.castShadow = true;
    baseBook.add(bottomCover);

    const topCover = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.06, 2.7), bCoverMat);
    topCover.position.y = 0.27;
    topCover.castShadow = true;
    baseBook.add(topCover);

    const baseSpine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 2.7), bCoverMat);
    baseSpine.position.x = -1.62;
    baseSpine.castShadow = true;
    baseBook.add(baseSpine);

    const basePaper = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.48, 2.5), bPaperMat);
    basePaper.position.x = 0.05;
    basePaper.castShadow = true;
    basePaper.receiveShadow = true;
    baseBook.add(basePaper);

    baseBook.position.set(0.0, -1.05, 0.25);
    sculptureGroup4.add(baseBook);

    // Vertical Books standing on the base book
    // Book 1: Dark Teal (Left)
    const vBook1 = createHardcoverBook(0.55, 3.1, 2.3, 0x2D5662);
    vBook1.position.set(-0.65, 0.85, 0.2);
    sculptureGroup4.add(vBook1);

    // Book 2: Mint / Pale Sage (Center)
    const vBook2 = createHardcoverBook(0.56, 3.4, 2.35, 0x5E8E84);
    vBook2.position.set(-0.05, 1.0, 0.25);
    sculptureGroup4.add(vBook2);

    // Book 3: Warm Peach / Terracotta (Right, Leaning)
    const vBook3 = createHardcoverBook(0.52, 2.9, 2.2, 0xD6957A);
    vBook3.position.set(0.65, 0.72, 0.3);
    vBook3.rotation.z = -0.22;
    sculptureGroup4.add(vBook3);

    // 4. Ground Shadow Receiver for Scene 4
    const shadowFloor4 = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 32),
      new THREE.ShadowMaterial({ opacity: 0.14 })
    );
    shadowFloor4.rotation.x = -Math.PI / 2;
    shadowFloor4.position.y = -2.25;
    shadowFloor4.receiveShadow = true;
    sculptureGroup4.add(shadowFloor4);

    rootGroup.add(sculptureGroup4);

    // Mouse parallax
    let targetMouseX = 0, targetMouseY = 0;
    let mouseX = 0, mouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetMouseX = x * 1.8;
      targetMouseY = y * 1.2;
    };

    const handleMouseLeave = () => {
      targetMouseX = 0;
      targetMouseY = 0;
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;

      if (width < 600) {
        camera.position.z = 24;
        camera.position.y = -0.5;
      } else if (width < 960) {
        camera.position.z = 20;
        camera.position.y = 0;
      } else {
        camera.position.z = 18;
        camera.position.y = 0;
      }

      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    // Animation Loop
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      sculptureGroup1.rotation.y = -0.42 + mouseX * 0.22 + Math.sin(elapsed * 0.3) * 0.02;
      sculptureGroup1.rotation.x = 0.22 - mouseY * 0.14 + Math.cos(elapsed * 0.25) * 0.015;

      sculptureGroup2.rotation.y = mouseX * 0.14 + Math.sin(elapsed * 0.22) * 0.012;
      sculptureGroup2.rotation.x = -mouseY * 0.08 + Math.cos(elapsed * 0.2) * 0.008;

      sculptureGroup3.rotation.y = -0.45 + mouseX * 0.2 + Math.sin(elapsed * 0.25) * 0.015;
      sculptureGroup3.rotation.x = 0.22 - mouseY * 0.12 + Math.cos(elapsed * 0.22) * 0.01;

      sculptureGroup4.rotation.y = -0.38 + mouseX * 0.2 + Math.sin(elapsed * 0.25) * 0.015;
      sculptureGroup4.rotation.x = 0.18 - mouseY * 0.12 + Math.cos(elapsed * 0.22) * 0.01;

      // Smooth vertical slide positioning (top to bottom)
      const isMobile = window.innerWidth < 960;
      const targetX = isMobile ? 0 : 4.4;
      const targetY = isMobile ? (window.innerWidth < 600 ? -2.4 : -1.5) : -0.2;
      const offTop = 16;
      const offBottom = -16;
      const lerpSpeed = 0.065;

      const groups = [sculptureGroup1, sculptureGroup2, sculptureGroup3, sculptureGroup4];
      const cur = currentSlideRef.current;

      groups.forEach((g, idx) => {
        let destY;
        let destScale;
        if (cur === idx) {
          destY = targetY;
          destScale = 1.0;
        } else if (idx < cur) {
          destY = offTop;
          destScale = 0.88;
        } else {
          destY = offBottom;
          destScale = 0.88;
        }

        g.position.x += (targetX - g.position.x) * lerpSpeed;
        g.position.y += (destY - g.position.y) * lerpSpeed;
        const curS = g.scale.x;
        const nxtS = curS + (destScale - curS) * lerpSpeed;
        g.scale.set(nxtS, nxtS, nxtS);
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      renderer.dispose();
    };
  }, []);

  const goToSlide = (idx: number) => {
    if (idx < 0 || idx >= TOTAL_SLIDES || idx === currentSlide || isTransitioning) return;
    setIsTransitioning(true);
    setCurrentSlide(idx);
    setTimeout(() => {
      setIsTransitioning(false);
    }, 700);
  };

  const handleNext = () => goToSlide(currentSlide + 1);
  const handlePrev = () => goToSlide(currentSlide - 1);

  // Keyboard navigation (Arrow keys & Space)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (joinModal) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        handleNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        handlePrev();
      } else if (e.key === "Home") {
        goToSlide(0);
      } else if (e.key === "End") {
        goToSlide(TOTAL_SLIDES - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentSlide, isTransitioning, joinModal]);

  // Trackpad / Wheel scroll transition handling
  useEffect(() => {
    let wheelAccumulator = 0;
    let wheelTimer: any = null;

    const onWheel = (e: WheelEvent) => {
      if (joinModal || isTransitioningRef.current) return;
      wheelAccumulator += e.deltaY + e.deltaX;

      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelAccumulator = 0;
      }, 180);

      if (wheelAccumulator > 45) {
        wheelAccumulator = 0;
        if (currentSlideRef.current < TOTAL_SLIDES - 1) {
          goToSlide(currentSlideRef.current + 1);
        }
      } else if (wheelAccumulator < -45) {
        wheelAccumulator = 0;
        if (currentSlideRef.current > 0) {
          goToSlide(currentSlideRef.current - 1);
        }
      }
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [joinModal, isTransitioning]);

  // Touch swipe handling
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || joinModal) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length !== 1 || isTransitioningRef.current || joinModal) return;
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;
      const duration = Date.now() - touchStartTime;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (duration < 500 && (absX > 40 || absY > 40)) {
        if (absX >= absY) {
          if (deltaX < -40) handleNext();
          else if (deltaX > 40) handlePrev();
        } else {
          if (deltaY < -40) handleNext();
          else if (deltaY > 40) handlePrev();
        }
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [joinModal, isTransitioning, currentSlide]);

  const handleJoinExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const tok = joinToken.trim();
    if (!tok) return;
    setErr("");
    setBusy(true);
    try {
      const { data } = await api.post("/exams/join", { access_token: tok });
      nav(`/exam/attempt/${data.attempt_id}`);
    } catch (e: any) {
      setErr(e.response?.data?.detail || "Unable to join session. Please check your token.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 bg-[#DFDCD4] text-[#1F1E1B] font-['Plus_Jakarta_Sans',sans-serif] overflow-hidden select-none">
      <main
        ref={deckRef}
        className="relative w-full h-full max-w-[1800px] max-h-[1100px] bg-[#EFECE4] rounded-2xl sm:rounded-3xl shadow-[0_20px_48px_-12px_rgba(28,27,24,0.1)] border border-black/8 overflow-hidden flex flex-col"
        aria-roledescription="carousel"
        aria-label="Interactive Presentation Deck"
      >
        {/* Background Large Typographic Watermark (Behind 3D Scene and Foreground Text) */}
        <div
          className={`absolute inset-0 pointer-events-none z-0 select-none overflow-hidden px-4 sm:px-8 transition-all duration-700 ease-out ${
            currentSlide === 0
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 -translate-y-12 scale-95"
          }`}
          aria-hidden="true"
        >
          {/* Top Title Watermark */}
          <div className="absolute top-[18%] sm:top-[20%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <span
              className="text-[clamp(3.2rem,10.5vw,10.2rem)] font-black uppercase tracking-normal text-[#1F1E1B]/[0.22] whitespace-nowrap leading-none select-none"
              style={{
                textShadow: "0 4px 24px rgba(31, 30, 27, 0.12)",
                letterSpacing: "0.02em",
              }}
            >
              SECURE CLASS
            </span>
          </div>

          {/* Subtitle Positioned Below Student Experience, Shifted 250px Right and Extending Under Books */}
          <div className="absolute top-[64%] sm:top-[68%] left-6 sm:left-14 md:left-16 translate-x-[250px] flex flex-col items-start text-left gap-1.5 sm:gap-2.5">
            <span
              className="text-[clamp(1.6rem,3.8vw,3.5rem)] font-extrabold tracking-wide text-[#1F1E1B]/[0.20] whitespace-nowrap leading-none select-none"
              style={{
                textShadow: "0 3px 20px rgba(31, 30, 27, 0.10)",
                letterSpacing: "0.04em",
              }}
            >
              Secure Learning.
            </span>
            <span
              className="text-[clamp(1.6rem,3.8vw,3.5rem)] font-extrabold tracking-wide text-[#1F1E1B]/[0.20] whitespace-nowrap leading-none select-none"
              style={{
                textShadow: "0 3px 20px rgba(31, 30, 27, 0.10)",
                letterSpacing: "0.04em",
              }}
            >
              Smarter Assessments.
            </span>
          </div>
        </div>

        {/* Continuous WebGL Canvas for 3D Abstract Sculptures */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10 opacity-100"
        />

        {/* Top Deck Header Navigation */}
        <header className="absolute top-4 sm:top-8 left-4 sm:left-10 right-4 sm:right-10 flex items-center justify-between z-30 pointer-events-auto">
          <div className="w-20 sm:w-28" />

          <div className="flex items-center gap-3 bg-white/45 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-black/8 shadow-xs text-xs font-semibold text-[#6B6861]">
            <span className="font-bold text-[#1F1E1B]">0{currentSlide + 1}</span>
            <div className="w-12 h-0.5 bg-black/10 rounded-full overflow-hidden relative">
              <div
                className="absolute top-0 left-0 h-full bg-[#1F1E1B] rounded-full transition-all duration-700 ease-out"
                style={{ width: `${((currentSlide + 1) / TOTAL_SLIDES) * 100}%` }}
              />
            </div>
            <span>0{TOTAL_SLIDES}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setJoinModal(true)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-white/80 border border-black/10 hover:bg-white text-[#1F1E1B] transition shadow-xs cursor-pointer"
            >
              Join Exam
            </button>
            <Link
              to="/login"
              className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#1F1E1B] text-[#F3F1E9] hover:bg-black transition shadow-xs"
            >
              Sign In →
            </Link>
          </div>
        </header>

        {/* Vertical Floating Navigation Arrows (↑ and ↓) */}
        <div className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 z-30 pointer-events-auto">
          <button
            onClick={handlePrev}
            disabled={currentSlide === 0}
            aria-label="Previous Slide"
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/70 hover:bg-white border border-black/10 flex items-center justify-center text-lg font-bold shadow-md transition disabled:opacity-20 cursor-pointer hover:scale-105 active:scale-95"
          >
            <svg className="w-5 h-5 stroke-current fill-none stroke-[2.2]" viewBox="0 0 24 24">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>

          <button
            onClick={handleNext}
            disabled={currentSlide === TOTAL_SLIDES - 1}
            aria-label="Next Slide"
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/70 hover:bg-white border border-black/10 flex items-center justify-center text-lg font-bold shadow-md transition disabled:opacity-20 cursor-pointer hover:scale-105 active:scale-95"
          >
            <svg className="w-5 h-5 stroke-current fill-none stroke-[2.2]" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* ===================== SLIDE 1: HERO / EXAMS REIMAGINED ===================== */}
        <section
          className={`absolute inset-0 p-6 sm:p-14 flex flex-col justify-between transition-all duration-700 ease-out z-20 pointer-events-none ${
            currentSlide === 0
              ? "opacity-100 visible translate-y-0 scale-100 pointer-events-auto"
              : currentSlide > 0
              ? "opacity-0 invisible -translate-y-12 scale-95"
              : "opacity-0 invisible translate-y-12 scale-95"
          }`}
        >
          <div className="my-auto max-w-xl">
            <p className="font-['Newsreader',serif] italic text-base sm:text-xl text-[#6B6861] mb-2 font-medium">
              Academic integrity & modern assessment
            </p>
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[0.92] text-[#1F1E1B]">
              <span className="block">Exams.</span>
              <span className="block">Reimagined.</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#686760] mt-3 max-w-md leading-relaxed">
              A secure digital examination platform designed to protect academic integrity without disrupting the student experience.
            </p>
          </div>
        </section>

        {/* ===================== SLIDE 2: RETHINKING ONLINE ASSESSMENTS ===================== */}
        <section
          className={`absolute inset-0 p-6 sm:p-14 flex flex-col justify-between transition-all duration-700 ease-out z-20 pointer-events-none ${
            currentSlide === 1
              ? "opacity-100 visible translate-y-0 scale-100 pointer-events-auto"
              : currentSlide > 1
              ? "opacity-0 invisible -translate-y-12 scale-95"
              : "opacity-0 invisible translate-y-12 scale-95"
          }`}
        >
          <div className="my-auto max-w-xl">
            <p className="font-['Newsreader',serif] italic text-base sm:text-xl text-[#6B6861] mb-2 font-medium">
              Precision in every question
            </p>
            <h2 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[0.92] text-[#1F1E1B]">
              <span className="block">Rethinking</span>
              <span className="block">Online Assessments.</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#686760] mt-3 max-w-md leading-relaxed">
              Built for modern education, SecureClass combines intelligent assessment tools with a secure and focused examination environment.
            </p>
          </div>
        </section>

        {/* ===================== SLIDE 3: BUILT FOR FAIRNESS ===================== */}
        <section
          className={`absolute inset-0 p-6 sm:p-14 flex flex-col justify-between transition-all duration-700 ease-out z-20 pointer-events-none ${
            currentSlide === 2
              ? "opacity-100 visible translate-y-0 scale-100 pointer-events-auto"
              : currentSlide > 2
              ? "opacity-0 invisible -translate-y-12 scale-95"
              : "opacity-0 invisible translate-y-12 scale-95"
          }`}
        >
          <div className="my-auto max-w-xl">
            <p className="font-['Newsreader',serif] italic text-base sm:text-xl text-[#6B6861] mb-2 font-medium">
              Structure, security & simplicity
            </p>
            <h2 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[0.92] text-[#1F1E1B]">
              <span className="block">Built for</span>
              <span className="block">Better Assessment</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#686760] mt-3 max-w-md leading-relaxed">
              Everything you need to create consistent, controlled, and reliable online examinations.
            </p>

            <div className="flex flex-wrap gap-2.5 mt-6">
              <span className="px-4 py-2 rounded-full text-xs font-semibold bg-white/70 backdrop-blur-md border border-black/8 text-[#1F1E1B] shadow-xs hover:-translate-y-0.5 transition">
                ✓ Balanced Assessments
              </span>
              <span className="px-4 py-2 rounded-full text-xs font-semibold bg-white/70 backdrop-blur-md border border-black/8 text-[#1F1E1B] shadow-xs hover:-translate-y-0.5 transition">
                ◉ Question Coverage
              </span>
              <span className="px-4 py-2 rounded-full text-xs font-semibold bg-white/70 backdrop-blur-md border border-black/8 text-[#1F1E1B] shadow-xs hover:-translate-y-0.5 transition">
                ● Immutable Attempts
              </span>
              <span className="px-4 py-2 rounded-full text-xs font-semibold bg-white/70 backdrop-blur-md border border-black/8 text-[#1F1E1B] shadow-xs hover:-translate-y-0.5 transition">
                ↻ Regrade Support
              </span>
            </div>
          </div>
        </section>

        {/* ===================== SLIDE 4: POWERFUL TOOLS / SIMPLE CONTROL ===================== */}
        <section
          className={`absolute inset-0 p-6 sm:p-14 flex flex-col justify-between transition-all duration-700 ease-out z-20 pointer-events-none ${
            currentSlide === 3
              ? "opacity-100 visible translate-y-0 scale-100 pointer-events-auto"
              : currentSlide > 3
              ? "opacity-0 invisible -translate-y-12 scale-95"
              : "opacity-0 invisible translate-y-12 scale-95"
          }`}
        >
          <div className="my-auto max-w-xl">
            <p className="font-['Newsreader',serif] italic text-base sm:text-xl text-[#6B6861] mb-2 font-medium">
              Built for educators & institutions
            </p>
            <h2 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[0.92] text-[#1F1E1B]">
              <span className="block">Powerful Tools</span>
              <span className="block">Simple Control</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#686760] mt-3 max-w-md leading-relaxed">
              Create assessments, manage students, monitor exam sessions, and review results — all from one streamlined platform.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 mt-6 pointer-events-auto">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#1F1E1B] text-[#EFECE4] rounded-full text-xs sm:text-sm font-bold shadow-lg hover:bg-black hover:-translate-y-0.5 transition active:scale-95"
              >
                <span>Create Exam</span>
                <span>→</span>
              </Link>
              <button
                onClick={() => setJoinModal(true)}
                className="inline-flex items-center px-5 py-3.5 bg-transparent text-[#1F1E1B] rounded-full text-xs sm:text-sm font-semibold border border-black/20 hover:bg-white/50 hover:border-black hover:-translate-y-0.5 transition active:scale-95 cursor-pointer"
              >
                Explore Platform
              </button>
            </div>
          </div>
        </section>

        {/* Bottom Left Keyboard & Scroll Hints */}
        <aside className="absolute bottom-4 left-6 hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-[#6B6861]/70 z-30 pointer-events-none">
          <span>Navigate</span>
          <span className="px-1.5 py-0.5 rounded bg-white/70 border border-black/10 font-mono text-[10px]">
            ↑
          </span>
          <span className="px-1.5 py-0.5 rounded bg-white/70 border border-black/10 font-mono text-[10px]">
            ↓
          </span>
          <span>or Scroll</span>
        </aside>

        {/* Toast Pill Notification */}
        <div
          className={`absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#1F1E1B] text-[#F5F3EC] px-5 py-2.5 rounded-full text-xs font-semibold shadow-xl flex items-center gap-2 z-50 pointer-events-none transition-all duration-300 ${
            toastVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <span>{toastMessage}</span>
        </div>

        {/* Quick Join Modal */}
        {joinModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in pointer-events-auto">
            <div className="bg-[#EFECE4] border border-black/10 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-4 text-center">
              <div className="flex justify-between items-center border-b border-black/8 pb-3">
                <h3 className="font-bold text-base text-[#1F1E1B]">Join Exam Session</h3>
                <button
                  onClick={() => setJoinModal(false)}
                  className="w-7 h-7 rounded-full bg-white text-xs text-[#6B6861] hover:text-black cursor-pointer flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-[#6B6861]">
                Enter the access token or code provided by your instructor:
              </p>

              <form onSubmit={handleJoinExam} className="space-y-3">
                <input
                  type="text"
                  className="input font-mono font-bold text-center tracking-widest uppercase text-base"
                  placeholder="e.g. A9F482"
                  value={joinToken}
                  onChange={(e) => setJoinToken(e.target.value)}
                  required
                />

                {err && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                    {err}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!joinToken.trim() || busy}
                  className="btn-primary w-full py-2.5 text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  {busy ? "Connecting…" : "Join Exam Session →"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
