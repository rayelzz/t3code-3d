import { msg } from "gt-react";
import * as THREE from "three";
import { m } from "../i18n/messages";
import { observeResize } from "../lib/observeResize";
import {
  formatProjectStationSubtitle,
  renderDeskMonitorCanvas,
  renderUsageWallCanvas,
  renderWorkingBoardCanvas,
  statusAccentColor,
} from "./sceneTextures";
import type {
  FishingPhase,
  PlayerActivity,
  WorldFloatingLabel,
  WorldInteractable,
  WorldProjectSummary,
  WorldSceneSyncPayload,
  WorldSkinPalette,
} from "./types";
import {
  AGENT_STATION_SLOTS,
  computeGroundHeight,
  GRAVITY,
  ISLAND_MOUNDS,
  isPointInsidePool,
  JUMP_VELOCITY,
  PALM_TREE_SPOTS,
  POOL_BOUNDS,
  resolvePlayerPosition,
  ROUND_TREE_SPOTS,
  type CircleCollider,
} from "./worldPhysics";

/** 预设快捷传送坐标 */
export const WORLD_LANDMARKS = {
  desk: { x: 0, z: -4.2, yaw: Math.PI },
  projects: { x: -4.8, z: -4.8, yaw: Math.PI * 0.75 },
  usage: { x: 0, z: -5.4, yaw: Math.PI },
  settings: { x: 4.8, z: -4.8, yaw: -Math.PI * 0.75 },
  pool: { x: -7.5, z: 9.4, yaw: 0 },
  dock: { x: 0, z: 25.4, yaw: 0 },
  chair: { x: 8.6, z: 9.5, yaw: 0 },
} as const;

interface ProjectStationVisual {
  readonly group: THREE.Group;
  readonly robotGroup: THREE.Group;
  readonly leftArm: THREE.Mesh;
  readonly rightArm: THREE.Mesh;
  readonly antennaOrb: THREE.Mesh;
  readonly antennaMat: THREE.MeshStandardMaterial;
  readonly screenMat: THREE.MeshStandardMaterial;
  readonly alertRing: THREE.Mesh;
  readonly project: WorldProjectSummary;
}

export interface WorldEngineCallbacks {
  readonly onNearbyChange: (interactable: WorldInteractable | null) => void;
  readonly onHoverChange: (interactable: WorldInteractable | null) => void;
  readonly onInteract: (interactable: WorldInteractable) => void;
  readonly onActivityChange: (activity: PlayerActivity) => void;
  readonly onFishingPhaseChange: (phase: FishingPhase) => void;
  readonly onFishCaught: () => void;
  readonly onJump: () => void;
  readonly onFirstMove: () => void;
  readonly onFloatingLabelsChange: (labels: ReadonlyArray<WorldFloatingLabel>) => void;
}

/**
 * 纯 Three.js 驱动的《动森》治愈海岛 3D 世界引擎。
 * 渲染循环、人物移动、相机弹簧跟随、海浪波纹、钓鱼物理、泳池游泳与节能降帧均独立运行于 React 外部。
 */
export class WorldEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: WorldEngineCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private lastFrameMs = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();

  // 光照与天空
  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly studioLampLight: THREE.PointLight;
  private readonly studioFillLeftLight: THREE.PointLight;
  private readonly studioFillRightLight: THREE.PointLight;
  private readonly dockLanternLight: THREE.PointLight;
  private readonly skyDomeMat: THREE.ShaderMaterial;
  private readonly celestialBody: THREE.Mesh;
  private readonly celestialMat: THREE.MeshBasicMaterial;
  private readonly starsPoints: THREE.Points;
  private readonly cloudsGroup = new THREE.Group();

  // 动态海水与泳池
  private readonly oceanGeo: THREE.PlaneGeometry;
  private readonly oceanBasePos: Float32Array;
  private readonly oceanMat: THREE.MeshStandardMaterial;
  private readonly poolWaterMesh: THREE.Mesh;
  private readonly poolWaterMat: THREE.MeshStandardMaterial;
  private readonly floatRing: THREE.Mesh;

  // 随皮肤换装联动更新的材质引用
  private readonly grassMat: THREE.MeshStandardMaterial;
  private readonly grassAccentMat: THREE.MeshStandardMaterial;
  private readonly sandMat: THREE.MeshStandardMaterial;
  private readonly wallMat: THREE.MeshStandardMaterial;
  private readonly trimMat: THREE.MeshStandardMaterial;
  private readonly floorWoodMat: THREE.MeshStandardMaterial;
  private readonly deckWoodMat: THREE.MeshStandardMaterial;
  private readonly roofMat: THREE.MeshStandardMaterial;
  private readonly furnitureWoodMat: THREE.MeshStandardMaterial;
  private readonly accentMat: THREE.MeshStandardMaterial;
  private readonly accentSecondaryMat: THREE.MeshStandardMaterial;
  private readonly foliagePrimaryMat: THREE.MeshStandardMaterial;
  private readonly foliageSecondaryMat: THREE.MeshStandardMaterial;
  private readonly avatarShirtMat: THREE.MeshStandardMaterial;
  private readonly avatarHatMat: THREE.MeshStandardMaterial;
  private readonly lanternGlowMat: THREE.MeshStandardMaterial;

  // 实时 Canvas 纹理（主屏、黑板与天花板垂吊用量牌）
  private readonly deskMonitorCanvas: HTMLCanvasElement;
  private readonly deskMonitorTex: THREE.CanvasTexture;
  private readonly workingBoardCanvas: HTMLCanvasElement;
  private readonly workingBoardTex: THREE.CanvasTexture;
  private readonly usageWallCanvas: HTMLCanvasElement;
  private readonly usageWallTex: THREE.CanvasTexture;
  private hangingUsageSignPivot: THREE.Group | null = null;

  // 书架动态书本容器 & 咖啡热气粒子 & Agent 工位容器
  private readonly projectBooksGroup = new THREE.Group();
  private readonly steamPuffs: THREE.Mesh[] = [];
  private readonly agentStationsGroup = new THREE.Group();
  private agentVisuals: ProjectStationVisual[] = [];
  private readonly treesToSway: THREE.Object3D[] = [];

  // 可交互目标、3D 投影液态玻璃浮空标牌与地面高亮指示环
  private readonly interactableMeshes: THREE.Object3D[] = [];
  private readonly interactableMap = new Map<string, WorldInteractable>();
  private readonly staticInteractableTemplates: Array<{
    readonly id: string;
    readonly titleMsg: string;
    readonly subtitleMsg?: string;
  }> = [];
  private readonly staticLabelAnchors: Array<{
    readonly id: string;
    readonly anchor: THREE.Vector3;
    readonly titleMsg: string;
    readonly subtitleMsg?: string;
    readonly dotColor?: string;
  }> = [];
  private projectLabelAnchors: Array<{
    readonly id: string;
    readonly anchor: THREE.Vector3;
    readonly label: WorldFloatingLabel;
  }> = [];
  private readonly floatingLabelElements = new Map<string, HTMLElement>();
  private readonly floatingLabelStyleCache = new Map<string, string>();
  private readonly highlightRing: THREE.Mesh;
  private readonly highlightRingMat: THREE.MeshBasicMaterial;

  // 玩家角色与钓鱼竿 / 浮标 / 跃起鱼
  private readonly playerGroup = new THREE.Group();
  private readonly playerVisual = new THREE.Group();
  private readonly playerLeftLeg: THREE.Mesh;
  private readonly playerRightLeg: THREE.Mesh;
  private readonly playerLeftArm: THREE.Mesh;
  private readonly playerRightArm: THREE.Mesh;
  private readonly swimRippleRing: THREE.Mesh;
  private readonly swimRippleMat: THREE.MeshBasicMaterial;
  private readonly fishingRodGroup = new THREE.Group();
  private readonly bobberMesh: THREE.Mesh;
  private readonly fishingLine: THREE.Line;
  private readonly jumpingFish: THREE.Group;

  // 玩家物理与跳跃状态
  private playerX = 0;
  private playerY = 0.24;
  private playerZ = 0.6;
  private playerVy = 0;
  private isGrounded = true;
  private coyoteTimer = 0;
  private landingSquash = 0;
  private playerYaw = Math.PI;
  private walkCycle = 0;
  private playerActivity: PlayerActivity = "walking";
  private moveGoal: { x: number; z: number; interactable?: WorldInteractable } | null = null;
  private hasMovedOnce = false;
  private dynamicAgentColliders: CircleCollider[] = [];

  // 钓鱼状态机
  private fishingPhase: FishingPhase = "idle";
  private fishingTimer = 0;
  private fishingBiteAt = 0;
  private fishingBiteDeadline = 0;
  private jumpingFishProgress = 0;

  // 相机轨道参数（第三人称温暖微俯视角，开阔展示整墙巨幕黑板与天花板吊牌）
  private cameraYaw = 0;
  private cameraPitch = 0.5;
  private cameraDistance = 12.2;
  private readonly currentCameraLookAt = new THREE.Vector3(0, 1.3, 0.6);
  private readonly tempLabelWorldPos = new THREE.Vector3();

  // 输入与鼠标交互状态
  private readonly keysPressed = new Set<string>();
  private inputEnabled = true;
  private lowPowerMode = false;
  private isDraggingCamera = false;
  private pointerDownPos = { x: 0, y: 0 };
  private lastPointerPos = { x: 0, y: 0 };
  private dragDistance = 0;

  // 当前接近与悬停目标
  private nearbyId: string | null = null;
  private hoveredId: string | null = null;
  private lastSyncSignature = "";
  private lastLocale: string | null = null;
  private lastNightState: boolean | null = null;
  private lastSkinId: string | null = null;

  // 渲染循环控制
  private rafId: number | null = null;
  private disposed = false;
  private elapsedTime = 0;
  private lowPowerAccum = 0;
  private stopObserveResize: () => void;

  constructor(
    container: HTMLElement,
    initialPayload: WorldSceneSyncPayload,
    callbacks: WorldEngineCallbacks,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.inputEnabled = initialPayload.inputEnabled;
    this.lowPowerMode = initialPayload.lowPowerMode;

    // 1. 初始化渲染器（柔和色调映射 + 圆润阴影）
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.outline = "none";
    container.appendChild(this.renderer.domElement);

    // 2. 初始化场景、雾效与相机
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(initialPayload.skin.fogColor, 0.0085);

    const aspect = (container.clientWidth || 1280) / Math.max(1, container.clientHeight || 720);
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.2, 260);

    // 3. 创建公共调色板材质（方便换肤时零重建实时换装）
    const s = initialPayload.skin;
    this.grassMat = new THREE.MeshStandardMaterial({
      color: s.grass,
      roughness: 0.9,
      flatShading: true,
    });
    this.grassAccentMat = new THREE.MeshStandardMaterial({
      color: s.grassAccent,
      roughness: 0.88,
      flatShading: true,
    });
    this.sandMat = new THREE.MeshStandardMaterial({
      color: s.sand,
      roughness: 0.95,
      flatShading: true,
    });
    this.wallMat = new THREE.MeshStandardMaterial({ color: s.wallColor, roughness: 0.85 });
    this.trimMat = new THREE.MeshStandardMaterial({ color: s.trimColor, roughness: 0.8 });
    this.floorWoodMat = new THREE.MeshStandardMaterial({ color: s.floorWood, roughness: 0.78 });
    this.deckWoodMat = new THREE.MeshStandardMaterial({ color: s.deckWood, roughness: 0.85 });
    this.roofMat = new THREE.MeshStandardMaterial({
      color: s.roofColor,
      roughness: 0.72,
      flatShading: true,
    });
    this.furnitureWoodMat = new THREE.MeshStandardMaterial({
      color: s.furnitureWood,
      roughness: 0.72,
    });
    this.accentMat = new THREE.MeshStandardMaterial({ color: s.accent, roughness: 0.6 });
    this.accentSecondaryMat = new THREE.MeshStandardMaterial({
      color: s.accentSecondary,
      roughness: 0.55,
    });
    this.foliagePrimaryMat = new THREE.MeshStandardMaterial({
      color: s.foliagePrimary,
      roughness: 0.85,
      flatShading: true,
    });
    this.foliageSecondaryMat = new THREE.MeshStandardMaterial({
      color: s.foliageSecondary,
      roughness: 0.82,
      flatShading: true,
    });
    this.avatarShirtMat = new THREE.MeshStandardMaterial({ color: s.avatarShirt, roughness: 0.7 });
    this.avatarHatMat = new THREE.MeshStandardMaterial({ color: s.avatarHat, roughness: 0.72 });
    this.lanternGlowMat = new THREE.MeshStandardMaterial({
      color: "#fff2cc",
      emissive: new THREE.Color(s.lampColor),
      emissiveIntensity: s.isNight ? 1.8 : 0.4,
      roughness: 0.3,
    });

    // 4. 光照系统
    this.hemiLight = new THREE.HemisphereLight(s.hemiSky, s.hemiGround, s.hemiIntensity);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(s.directionalLight, s.directionalIntensity);
    this.sunLight.position.set(24, 34, 22);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 90;
    const shadowBound = 28;
    this.sunLight.shadow.camera.left = -shadowBound;
    this.sunLight.shadow.camera.right = shadowBound;
    this.sunLight.shadow.camera.top = shadowBound;
    this.sunLight.shadow.camera.bottom = -shadowBound;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // 室内温馨三点暖光与栈桥灯笼光（确保夜晚也能柔和照亮整个工作室）
    this.studioLampLight = new THREE.PointLight(s.lampColor, s.lampIntensity, 26, 1.2);
    this.studioLampLight.position.set(0, 4.6, -4.5);
    this.scene.add(this.studioLampLight);

    this.studioFillLeftLight = new THREE.PointLight(s.lampColor, s.lampIntensity * 0.55, 18, 1.3);
    this.studioFillLeftLight.position.set(-5.8, 3.4, -3.0);
    this.scene.add(this.studioFillLeftLight);

    this.studioFillRightLight = new THREE.PointLight(s.lampColor, s.lampIntensity * 0.55, 18, 1.3);
    this.studioFillRightLight.position.set(5.8, 3.4, -3.0);
    this.scene.add(this.studioFillRightLight);

    this.dockLanternLight = new THREE.PointLight(s.lampColor, s.isNight ? 2.4 : 0.3, 16, 1.4);
    this.dockLanternLight.position.set(1.6, 2.3, 25.8);
    this.scene.add(this.dockLanternLight);

    // 5. 渐变天空穹顶 + 太阳/月亮 + 星空 + 蓬松低模云朵
    this.skyDomeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(s.skyTop) },
        bottomColor: { value: new THREE.Color(s.skyHorizon) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          float t = pow(max(h, 0.0), 0.55);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), this.skyDomeMat);
    this.scene.add(skyDome);

    this.celestialMat = new THREE.MeshBasicMaterial({ color: s.sunColor });
    this.celestialBody = new THREE.Mesh(new THREE.SphereGeometry(5.5, 20, 16), this.celestialMat);
    this.celestialBody.position.set(48, 56, -72);
    this.scene.add(this.celestialBody);

    this.starsPoints = this.buildStarField();
    this.starsPoints.visible = s.isNight;
    this.scene.add(this.starsPoints);

    this.buildClouds();
    this.scene.add(this.cloudsGroup);

    // 6. 动态海面与海岛地形
    this.oceanGeo = new THREE.PlaneGeometry(280, 280, 48, 48);
    this.oceanGeo.rotateX(-Math.PI / 2);
    const oceanPosAttr = this.oceanGeo.attributes.position as THREE.BufferAttribute;
    this.oceanBasePos = new Float32Array(oceanPosAttr.array);
    this.oceanMat = new THREE.MeshStandardMaterial({
      color: s.oceanShallow,
      roughness: 0.28,
      metalness: 0.08,
      flatShading: true,
    });
    const oceanMesh = new THREE.Mesh(this.oceanGeo, this.oceanMat);
    oceanMesh.position.y = -0.45;
    oceanMesh.receiveShadow = true;
    this.scene.add(oceanMesh);

    this.buildIslandTerrain();

    // 7. 超清 HiDPI 实时画布纹理（2x~3x 超采样 + 硬件最大各向异性过滤，彻底消除斜视与缩小时文字模糊）
    const maxTexSize = this.renderer.capabilities.maxTextureSize || 2048;
    const maxAnisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy() || 1);
    const configureCrispTexture = (tex: THREE.CanvasTexture) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
    };

    const deskScale = maxTexSize >= 2048 ? 2.5 : 1.5;
    this.deskMonitorCanvas = document.createElement("canvas");
    this.deskMonitorCanvas.width = Math.round(640 * deskScale);
    this.deskMonitorCanvas.height = Math.round(300 * deskScale);
    this.deskMonitorTex = new THREE.CanvasTexture(this.deskMonitorCanvas);
    configureCrispTexture(this.deskMonitorTex);

    const boardScale = maxTexSize >= 4096 ? 2 : 1;
    this.workingBoardCanvas = document.createElement("canvas");
    this.workingBoardCanvas.width = Math.round(1680 * boardScale);
    this.workingBoardCanvas.height = Math.round(440 * boardScale);
    this.workingBoardTex = new THREE.CanvasTexture(this.workingBoardCanvas);
    configureCrispTexture(this.workingBoardTex);

    const usageScale = maxTexSize >= 2048 ? 3 : 2;
    this.usageWallCanvas = document.createElement("canvas");
    this.usageWallCanvas.width = Math.round(640 * usageScale);
    this.usageWallCanvas.height = Math.round(264 * usageScale);
    this.usageWallTex = new THREE.CanvasTexture(this.usageWallCanvas);
    configureCrispTexture(this.usageWallTex);

    // 8. 建造室内海景工作室 + 书架 + 控制台 + 装潢架 + 公告板
    this.buildStudioCottage();
    this.scene.add(this.projectBooksGroup);
    this.scene.add(this.agentStationsGroup);

    // 9. 建造室外露台 + 泳池 + 沙滩躺椅 + 钓鱼木栈桥 + 椰子树与花丛
    const poolSetup = this.buildPoolArea();
    this.poolWaterMesh = poolSetup.waterMesh;
    this.poolWaterMat = poolSetup.waterMat;
    this.floatRing = poolSetup.floatRing;

    this.buildFishingDock();
    this.buildBeachLoungeAndTrees();

    // 10. 地面交互高亮圆环
    this.highlightRingMat = new THREE.MeshBasicMaterial({
      color: "#fff7cc",
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    this.highlightRing = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.42, 32),
      this.highlightRingMat,
    );
    this.highlightRing.rotation.x = -Math.PI / 2;
    this.highlightRing.position.y = 0.22;
    this.highlightRing.visible = false;
    this.scene.add(this.highlightRing);

    // 11. 建造第三人称 Q 版主角小人 + 钓鱼装备 + 泳池涟漪环
    const avatarParts = this.buildPlayerAvatar();
    this.playerLeftLeg = avatarParts.leftLeg;
    this.playerRightLeg = avatarParts.rightLeg;
    this.playerLeftArm = avatarParts.leftArm;
    this.playerRightArm = avatarParts.rightArm;
    this.swimRippleMat = avatarParts.rippleMat;
    this.swimRippleRing = avatarParts.rippleRing;
    this.bobberMesh = avatarParts.bobber;
    this.fishingLine = avatarParts.line;
    this.jumpingFish = avatarParts.jumpingFish;

    this.playerGroup.position.set(this.playerX, 0.14, this.playerZ);
    this.playerGroup.rotation.y = this.playerYaw;
    this.scene.add(this.playerGroup);
    this.scene.add(this.bobberMesh);
    this.scene.add(this.fishingLine);
    this.scene.add(this.jumpingFish);

    // 12. 首次同步业务数据与主题
    this.syncData(initialPayload);
    this.updateCameraImmediate();

    // 13. 绑定事件监听
    this.bindEvents();
    this.stopObserveResize = observeResize(container, () => this.handleResize());

    // 14. 启动渲染循环（使用 performance.now 替代弃用的 THREE.Clock）
    this.lastFrameMs = performance.now();
    this.loop();
  }

  /** 创建夜空繁星点阵 */
  private buildStarField(): THREE.Points {
    const count = 240;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // 使用确定性分布避免随机闪烁
      const theta = ((i * 137.5) % 360) * (Math.PI / 180);
      const phi = Math.acos(0.18 + ((i * 0.6180339) % 0.8));
      const r = 155;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: "#fffbe8",
      size: 1.5,
      transparent: true,
      opacity: 0.88,
    });
    return new THREE.Points(geo, mat);
  }

  /** 建造漂浮的治愈系蓬松白云 */
  private buildClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.95,
      flatShading: true,
    });
    const specs = [
      { x: -34, y: 24, z: -28, s: 1.4 },
      { x: 28, y: 27, z: -36, s: 1.7 },
      { x: -46, y: 22, z: 18, s: 1.2 },
      { x: 42, y: 25, z: 24, s: 1.5 },
      { x: 0, y: 30, z: -55, s: 1.9 },
    ];
    for (const sp of specs) {
      const g = new THREE.Group();
      const parts = [
        { x: 0, y: 0, z: 0, r: 2.5 },
        { x: -2.1, y: -0.35, z: 0.4, r: 1.85 },
        { x: 2.2, y: -0.3, z: -0.3, r: 1.95 },
        { x: 0.4, y: 0.9, z: -0.2, r: 1.7 },
      ];
      for (const p of parts) {
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(p.r, 1), cloudMat);
        puff.position.set(p.x, p.y, p.z);
        g.add(puff);
      }
      g.position.set(sp.x, sp.y, sp.z);
      g.scale.setScalar(sp.s);
      g.userData.baseX = sp.x;
      this.cloudsGroup.add(g);
    }
  }

  /** 建造圆形低模海岛：外圈细沙沙滩 + 内圈青草高台 + 海岸装饰鹅卵石 */
  private buildIslandTerrain() {
    // 1. 柔和细沙底座（岛屿主体）
    const beachGeo = new THREE.CylinderGeometry(18.5, 22.8, 1.3, 28);
    const beachMesh = new THREE.Mesh(beachGeo, this.sandMat);
    beachMesh.position.set(0, -0.58, 1.8);
    beachMesh.receiveShadow = true;
    this.scene.add(beachMesh);

    // 海岸浅滩白色浪花环
    const foamMat = new THREE.MeshBasicMaterial({
      color: "#e6fbff",
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
    });
    const foamRing = new THREE.Mesh(new THREE.RingGeometry(19.6, 21.8, 36), foamMat);
    foamRing.rotation.x = -Math.PI / 2;
    foamRing.position.set(0, -0.35, 1.8);
    this.scene.add(foamRing);

    // 2. 略微抬升的中心青草地台
    const grassGeo = new THREE.CylinderGeometry(14.8, 16.0, 0.34, 24);
    const grassMesh = new THREE.Mesh(grassGeo, this.grassMat);
    grassMesh.position.set(0, -0.04, -0.4);
    grassMesh.receiveShadow = true;
    this.scene.add(grassMesh);

    // 点缀嫩草小丘（与 worldPhysics.ISLAND_MOUNDS 共用同一份几何参数）
    for (const m of ISLAND_MOUNDS) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(m.r, 12, 8), this.grassAccentMat);
      hill.scale.set(m.scaleX, m.scaleY, m.scaleZ);
      hill.position.set(m.x, m.baseY, m.z);
      hill.receiveShadow = true;
      this.scene.add(hill);
    }

    // 从露台通向海边栈桥的鹅卵石小路
    const stoneMat = new THREE.MeshStandardMaterial({ color: "#e5dccb", roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.09, 10), stoneMat);
      stone.position.set(i % 2 === 0 ? -0.32 : 0.32, 0.13, 6.9 + i * 1.25);
      stone.receiveShadow = true;
      this.scene.add(stone);
    }

    // 岛屿草地五彩小花簇与沙滩彩色小海星，提升动森治愈氛围
    const flowerColors = ["#ff8fab", "#ffd166", "#ffffff", "#a8dadc", "#f7a072"];
    const flowerSpots = [
      { x: -3.2, z: 7.8 },
      { x: 3.1, z: 7.4 },
      { x: 4.5, z: 10.6 },
      { x: -11.4, z: 4.8 },
      { x: 10.8, z: 4.5 },
      { x: -9.8, z: -8.6 },
      { x: 9.8, z: -8.4 },
    ];
    flowerSpots.forEach((spot, idx) => {
      const petalMat = new THREE.MeshStandardMaterial({
        color: flowerColors[idx % flowerColors.length]!,
        roughness: 0.7,
      });
      const centerMat = new THREE.MeshStandardMaterial({ color: "#ffe066", roughness: 0.6 });
      for (let f = 0; f < 3; f++) {
        const angle = f * 2.1 + idx;
        const fx = spot.x + Math.cos(angle) * 0.45;
        const fz = spot.z + Math.sin(angle) * 0.45;
        const flower = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), petalMat);
        flower.position.set(fx, 0.2, fz);
        this.scene.add(flower);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), centerMat);
        dot.position.set(fx, 0.29, fz);
        this.scene.add(dot);
      }
    });

    const starfishSpots = [
      { x: -3.8, z: 15.8, c: "#ff7b6b" },
      { x: 4.6, z: 15.2, c: "#ffb703" },
      { x: 8.8, z: 13.8, c: "#ff8fab" },
    ];
    for (const sf of starfishSpots) {
      const star = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.06, 5),
        new THREE.MeshStandardMaterial({ color: sf.c, roughness: 0.75 }),
      );
      star.position.set(sf.x, 0.1, sf.z);
      this.scene.add(star);
    }
  }

  /** 注册一个可交互的 3D 物体，并挂载原生液态玻璃 3D 空间标牌锚点（支持运行期动态切换语言） */
  private registerInteractable(
    interactable: WorldInteractable,
    hitTarget: THREE.Object3D,
    labelOptions?: {
      readonly xOffset?: number;
      readonly yOffset?: number;
      readonly zOffset?: number;
      readonly dotColor?: string;
    },
  ) {
    const titleMsg = interactable.title;
    const subtitleMsg = interactable.subtitle;
    const resolvedTitle = m(titleMsg);
    const resolvedSubtitle = subtitleMsg ? m(subtitleMsg) : undefined;
    const resolvedInteractable: WorldInteractable = {
      ...interactable,
      title: resolvedTitle,
      ...(resolvedSubtitle !== undefined ? { subtitle: resolvedSubtitle } : {}),
    };

    this.interactableMap.set(interactable.id, resolvedInteractable);
    this.staticInteractableTemplates.push({
      id: interactable.id,
      titleMsg,
      ...(subtitleMsg !== undefined ? { subtitleMsg } : {}),
    });
    hitTarget.traverse((obj) => {
      obj.userData.interactableId = interactable.id;
    });
    this.interactableMeshes.push(hitTarget);

    if (labelOptions) {
      this.staticLabelAnchors.push({
        id: interactable.id,
        anchor: new THREE.Vector3(
          interactable.worldX + (labelOptions.xOffset ?? 0),
          interactable.worldY + (labelOptions.yOffset ?? 2.3),
          interactable.worldZ + (labelOptions.zOffset ?? 0),
        ),
        titleMsg,
        ...(subtitleMsg !== undefined ? { subtitleMsg } : {}),
        ...(labelOptions.dotColor ? { dotColor: labelOptions.dotColor } : {}),
      });
    }
  }

  /** 建造温馨开放式海景工作室（无遮挡视野设计） */
  private buildStudioCottage() {
    const cottage = new THREE.Group();

    // 1. 室内暖木地板（宽 16m × 深 11m）
    const floor = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.24, 11.2), this.floorWoodMat);
    floor.position.set(0, 0.12, -4.0);
    floor.receiveShadow = true;
    cottage.add(floor);

    // 室内中央温馨编织圆地毯
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.25, 0.04, 28), this.accentMat);
    rug.position.set(0, 0.26, -3.5);
    rug.receiveShadow = true;
    cottage.add(rug);
    const rugInner = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.45, 0.05, 28), this.trimMat);
    rugInner.position.set(0, 0.265, -3.5);
    rugInner.receiveShadow = true;
    cottage.add(rugInner);

    // 2. 南向阳光木露台
    const deck = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.2, 4.6), this.deckWoodMat);
    deck.position.set(0, 0.1, 3.85);
    deck.receiveShadow = true;
    cottage.add(deck);

    // 露台木栏杆（左右两侧，中间留宽大出口通向海边与泳池）
    const railPositions = [-7.8, -5.6, -3.4, 3.4, 5.6, 7.8];
    for (const rx of railPositions) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), this.trimMat);
      post.position.set(rx, 0.65, 6.0);
      post.castShadow = true;
      cottage.add(post);
    }
    for (const side of [-1, 1]) {
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(4.65, 0.14, 0.18), this.trimMat);
      topRail.position.set(side * 5.6, 1.08, 6.0);
      topRail.castShadow = true;
      cottage.add(topRail);
    }

    // 3. 挑高北后墙（完整承载居中最大化巨幕工作黑板）
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(16.2, 5.4, 0.4), this.wallMat);
    backWall.position.set(0, 2.85, -9.5);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    cottage.add(backWall);

    // 东西两侧半通透玻璃矮墙（关闭 depthWrite 避免透明玻璃在深度缓冲中硬切标牌与室内物件）
    const glassMat = new THREE.MeshStandardMaterial({
      color: "#d9f6ff",
      transparent: true,
      opacity: 0.34,
      roughness: 0.1,
      depthWrite: false,
    });
    for (const side of [-1, 1]) {
      const lowWall = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.35, 11.2), this.wallMat);
      lowWall.position.set(side * 8.0, 0.85, -4.0);
      lowWall.castShadow = true;
      lowWall.receiveShadow = true;
      cottage.add(lowWall);

      const glassPane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.3, 10.6), glassMat);
      glassPane.position.set(side * 8.0, 3.15, -4.0);
      cottage.add(glassPane);

      // 四个挑高转角暖木立柱
      for (const pz of [-9.35, 1.45]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 5.5, 0.45), this.trimMat);
        pillar.position.set(side * 7.95, 2.9, pz);
        pillar.castShadow = true;
        cottage.add(pillar);
      }
    }

    // 4. 后墙上方挑高屋顶斜檐，保证整墙巨幕黑板全视野清晰无遮挡
    const roofBackSlope = new THREE.Mesh(new THREE.BoxGeometry(17.4, 0.38, 3.1), this.roofMat);
    roofBackSlope.position.set(0, 5.88, -8.8);
    roofBackSlope.rotation.x = -0.22;
    roofBackSlope.castShadow = true;
    cottage.add(roofBackSlope);

    // 仅在东西侧墙柱上方点缀小巧暖光串灯，不挡中央视线
    for (const side of [-1, 1]) {
      const sideBeam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 11.2), this.trimMat);
      sideBeam.position.set(side * 7.95, 5.5, -4.0);
      cottage.add(sideBeam);
      for (let z = -7.6; z <= 0.4; z += 2.6) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), this.lanternGlowMat);
        bulb.position.set(side * 7.75, 5.26, z);
        cottage.add(bulb);
      }
    }

    // 5. 室内角落盆栽装饰（后排盆栽外移至巨幕黑板两侧，避免遮挡画面）
    this.addPottedPlant(cottage, -7.1, 0.24, 0.8, 1.1);
    this.addPottedPlant(cottage, 7.1, 0.24, 0.8, 1.0);
    this.addPottedPlant(cottage, -6.15, 0.24, -8.65, 0.9);
    this.addPottedPlant(cottage, 6.15, 0.24, -8.65, 0.9);

    this.scene.add(cottage);

    // 6. 放置核心可交互室内设备（北墙大黑板 + 天花板垂吊用量牌）
    this.buildMainCodingDesk();
    this.buildWorkingBlackboard();
    this.buildHangingUsageSign();
    this.buildProjectsBookshelf();
    this.buildSettingsConsole();
    this.buildThemeWardrobe();
    this.buildPrNoticeBoard();
  }

  /** 添加一个可爱的圆盆绿植 */
  private addPottedPlant(parent: THREE.Group, x: number, y: number, z: number, scale: number) {
    const potGroup = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: "#d97a54", roughness: 0.85 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.28, 0.55, 10), potMat);
    pot.position.y = 0.28;
    pot.castShadow = true;
    potGroup.add(pot);

    const leaves1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), this.foliagePrimaryMat);
    leaves1.position.set(0, 0.82, 0);
    leaves1.castShadow = true;
    potGroup.add(leaves1);

    const leaves2 = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.32, 0),
      this.foliageSecondaryMat,
    );
    leaves2.position.set(0.22, 1.05, 0.1);
    potGroup.add(leaves2);

    potGroup.position.set(x, y, z);
    potGroup.scale.setScalar(scale);
    parent.add(potGroup);
  }

  /** 主编码工作台（带实时动态 Canvas 显示屏 + 冒热气咖啡杯） */
  private buildMainCodingDesk() {
    const deskGroup = new THREE.Group();
    deskGroup.position.set(0, 0.24, -6.7);

    // 宽原木桌面
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 1.65), this.furnitureWoodMat);
    top.position.y = 1.02;
    top.castShadow = true;
    top.receiveShadow = true;
    deskGroup.add(top);

    // 四条圆润桌腿
    for (const lx of [-1.65, 1.65]) {
      for (const lz of [-0.62, 0.62]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 1.02, 8), this.trimMat);
        leg.position.set(lx, 0.51, lz);
        leg.castShadow = true;
        deskGroup.add(leg);
      }
    }

    // 超宽显示器底座与外框
    const monitorStand = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.45, 0.22),
      new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.4 }),
    );
    monitorStand.position.set(0, 1.3, -0.36);
    deskGroup.add(monitorStand);

    const monitorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(2.55, 1.24, 0.12),
      new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.35 }),
    );
    monitorFrame.position.set(0, 1.88, -0.32);
    monitorFrame.castShadow = true;
    deskGroup.add(monitorFrame);

    // 实时动态屏幕面（关闭 toneMapped 保持文字 100% 原始锐利对比度）
    const screenPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.38, 1.1),
      new THREE.MeshBasicMaterial({ map: this.deskMonitorTex, toneMapped: false }),
    );
    screenPlane.position.set(0, 1.88, -0.25);
    deskGroup.add(screenPlane);

    // 机械键盘与鼠标
    const kb = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.06, 0.34),
      new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.5 }),
    );
    kb.position.set(-0.1, 1.13, 0.25);
    deskGroup.add(kb);

    const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), this.accentMat);
    mouse.scale.set(0.85, 0.45, 1.25);
    mouse.position.set(0.68, 1.13, 0.26);
    deskGroup.add(mouse);

    // 治愈系暖光桌灯
    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.08, 12),
      this.accentSecondaryMat,
    );
    lampBase.position.set(-1.42, 1.14, -0.2);
    deskGroup.add(lampBase);
    const lampStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.65, 8),
      this.trimMat,
    );
    lampStem.position.set(-1.42, 1.46, -0.2);
    deskGroup.add(lampStem);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.32, 12), this.lanternGlowMat);
    lampShade.position.set(-1.42, 1.8, -0.2);
    deskGroup.add(lampShade);

    // 桌边热咖啡杯 + 漂浮热气球
    const mug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.09, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: "#fff8f0", roughness: 0.3 }),
    );
    mug.position.set(1.32, 1.2, 0.22);
    deskGroup.add(mug);

    const steamMat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.45,
    });
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), steamMat);
      puff.position.set(1.32, 1.4 + i * 0.22, 0.22);
      puff.userData.phase = i * 2.1;
      deskGroup.add(puff);
      this.steamPuffs.push(puff);
    }

    // 舒适小转椅
    const chairSeat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.42, 0.14, 14),
      this.accentMat,
    );
    chairSeat.position.set(0, 0.62, 1.05);
    chairSeat.castShadow = true;
    deskGroup.add(chairSeat);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.62, 0.14), this.accentMat);
    chairBack.position.set(0, 1.02, 1.38);
    chairBack.castShadow = true;
    deskGroup.add(chairBack);
    const chairLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.56, 8), this.trimMat);
    chairLeg.position.set(0, 0.28, 1.05);
    deskGroup.add(chairLeg);

    this.scene.add(deskGroup);

    this.registerInteractable(
      {
        id: "main-desk",
        kind: "desk",
        title: msg("Coding Desk"),
        subtitle: msg("Open Chat, Diff & Terminal"),
        worldX: 0,
        worldY: 0.24,
        worldZ: -6.2,
        radius: 3.1,
      },
      deskGroup,
    );
  }

  /** 北后墙最大化巨幕大黑板：温润原木框、全幅粉笔槽、彩色粉笔与黑板擦，实时展示正在 Working 的会话 */
  private buildWorkingBlackboard() {
    const boardGroup = new THREE.Group();
    boardGroup.position.set(0, 3.54, -9.24);

    // 最大化教室级原木外框（宽 11.6m × 高 2.98m，横贯整面北后墙且首屏 100% 完整可见）
    const frameW = 11.6;
    const frameH = 2.98;
    const outerFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameW, frameH, 0.16),
      this.furnitureWoodMat,
    );
    outerFrame.castShadow = true;
    boardGroup.add(outerFrame);

    // 黑板实时粉笔书写面（关闭 toneMapped 保持粉笔字高亮清晰不发灰）
    const boardFace = new THREE.Mesh(
      new THREE.PlaneGeometry(frameW - 0.34, frameH - 0.34),
      new THREE.MeshBasicMaterial({ map: this.workingBoardTex, toneMapped: false }),
    );
    boardFace.position.z = 0.09;
    boardGroup.add(boardFace);

    // 底部全幅木质粉笔槽
    const tray = new THREE.Mesh(new THREE.BoxGeometry(frameW - 0.1, 0.12, 0.28), this.trimMat);
    tray.position.set(0, -frameH / 2 - 0.02, 0.14);
    tray.castShadow = true;
    boardGroup.add(tray);

    // 五支彩色粉笔与左右两块木质黑板擦
    const chalkColors = ["#f8fafc", "#fde047", "#7dd3fc", "#fda4af", "#86efac"];
    chalkColors.forEach((c, i) => {
      const chalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.28, 8),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }),
      );
      chalk.rotation.z = Math.PI / 2;
      chalk.position.set(-4.1 + i * 0.42, -frameH / 2 + 0.065, 0.18);
      boardGroup.add(chalk);
    });

    for (const ex of [-4.95, 4.35]) {
      const eraserBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.1, 0.14),
        new THREE.MeshStandardMaterial({ color: "#b07d4f", roughness: 0.85 }),
      );
      eraserBase.position.set(ex, -frameH / 2 + 0.085, 0.17);
      boardGroup.add(eraserBase);
      const eraserFelt = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.045, 0.14),
        new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.95 }),
      );
      eraserFelt.position.set(ex, -frameH / 2 + 0.035, 0.17);
      boardGroup.add(eraserFelt);
    }

    this.scene.add(boardGroup);

    this.registerInteractable(
      {
        id: "working-board",
        kind: "working-board",
        title: msg("Working Board"),
        subtitle: msg("Live running & waiting threads"),
        worldX: 0,
        worldY: 2.3,
        worldZ: -8.6,
        radius: 5.2,
      },
      boardGroup,
    );
  }

  /** 天花板双金属吊杆垂吊办公室用量牌（挂于东侧天花板悬臂梁下，彻底错开北墙巨幕黑板，双面实时显示用量） */
  private buildHangingUsageSign() {
    // 从东侧屋顶木梁（x = 7.95, y = 5.5）向室内延伸的银色天花板吊装横轨
    const mountX = 6.15;
    const mountZ = -4.9;
    const ceilingY = 5.45;

    const railMat = new THREE.MeshStandardMaterial({
      color: "#94a3b8",
      metalness: 0.55,
      roughness: 0.35,
    });
    const signFrameMat = new THREE.MeshStandardMaterial({
      color: "#1e293b",
      metalness: 0.35,
      roughness: 0.35,
    });

    // 固定在东侧顶部木梁并伸向室内的铝制天花板悬臂吊装横梁（确保 360° 视角实体承重不悬空）
    const cantileverArm = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.11, 0.18), railMat);
    cantileverArm.position.set(6.35, ceilingY + 0.04, mountZ);
    this.scene.add(cantileverArm);

    // 与东侧木梁连接的金属固定座
    const beamBracket = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.32), railMat);
    beamBracket.position.set(7.92, ceilingY + 0.04, mountZ);
    this.scene.add(beamBracket);

    // 悬吊枢轴（放在天花板横梁下方挂点，带真实办公室吊牌微风轻摆动画）
    const pivot = new THREE.Group();
    pivot.position.set(mountX, ceilingY, mountZ);
    pivot.rotation.y = -0.52;

    // 吊装法兰底座 + 两根银色金属吊杆 + 顶部夹扣
    const rodLength = 1.08;
    for (const rx of [-1.15, 1.15]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 12), railMat);
      flange.position.set(rx, -0.04, 0);
      pivot.add(flange);

      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, rodLength, 10), railMat);
      rod.position.set(rx, -rodLength / 2, 0);
      pivot.add(rod);

      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), railMat);
      clamp.position.set(rx, -rodLength - 0.02, 0);
      pivot.add(clamp);
    }

    // 办公室横版双面吊牌本体（位于 y ≈ 3.83，不挡黑板、不挡 Settings 与工位名牌）
    const signW = 3.05;
    const signH = 1.32;
    const signCenterY = -rodLength - signH / 2 - 0.04;

    const signBody = new THREE.Mesh(new THREE.BoxGeometry(signW, signH, 0.1), signFrameMat);
    signBody.position.set(0, signCenterY, 0);
    signBody.castShadow = true;
    pivot.add(signBody);

    // 吊牌正反双面都贴上实时用量画布，关闭 toneMapped 保持数字和文字 100% 清晰锐利
    const frontFace = new THREE.Mesh(
      new THREE.PlaneGeometry(signW - 0.14, signH - 0.14),
      new THREE.MeshBasicMaterial({ map: this.usageWallTex, toneMapped: false }),
    );
    frontFace.position.set(0, signCenterY, 0.055);
    pivot.add(frontFace);

    const backFace = new THREE.Mesh(
      new THREE.PlaneGeometry(signW - 0.14, signH - 0.14),
      new THREE.MeshBasicMaterial({ map: this.usageWallTex, toneMapped: false }),
    );
    backFace.position.set(0, signCenterY, -0.055);
    backFace.rotation.y = Math.PI;
    pivot.add(backFace);

    // 吊牌底部细长柔和主题色灯条
    const glowBar = new THREE.Mesh(new THREE.BoxGeometry(signW - 0.2, 0.045, 0.11), this.accentMat);
    glowBar.position.set(0, signCenterY - signH / 2 - 0.01, 0);
    pivot.add(glowBar);

    this.scene.add(pivot);
    this.hangingUsageSignPivot = pivot;

    this.registerInteractable(
      {
        id: "usage-wall",
        kind: "usage-wall",
        title: msg("Usage & Limits"),
        subtitle: msg("Provider quotas & spend"),
        worldX: mountX,
        worldY: 3.4,
        worldZ: mountZ,
        radius: 3.6,
      },
      pivot,
    );
  }

  /** 项目书架（动态按真实项目数量摆放彩色文件夹） */
  private buildProjectsBookshelf() {
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(-6.9, 0.24, -7.1);
    shelfGroup.rotation.y = 0.42;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.5, 0.65), this.furnitureWoodMat);
    frame.position.y = 1.25;
    frame.castShadow = true;
    frame.receiveShadow = true;
    shelfGroup.add(frame);

    // 三层隔板凹槽装饰
    for (const sy of [0.65, 1.35, 2.0]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.7), this.trimMat);
      plank.position.set(0, sy, 0.03);
      shelfGroup.add(plank);
    }

    // 同步书本位置锚点
    this.projectBooksGroup.position.copy(shelfGroup.position);
    this.projectBooksGroup.rotation.copy(shelfGroup.rotation);

    this.scene.add(shelfGroup);
    this.registerInteractable(
      {
        id: "projects-shelf",
        kind: "projects-shelf",
        title: msg("Projects Shelf"),
        subtitle: msg("Browse projects & threads"),
        worldX: -6.9,
        worldY: 0.24,
        worldZ: -7.1,
        radius: 3.0,
      },
      shelfGroup,
      { xOffset: 0.45, yOffset: 3.05, zOffset: 0.45, dotColor: "#4ade80" },
    );
  }

  /** 设置控制台 */
  private buildSettingsConsole() {
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(6.9, 0.24, -7.1);
    consoleGroup.rotation.y = -0.42;

    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.45, 0.9), this.furnitureWoodMat);
    cabinet.position.y = 0.725;
    cabinet.castShadow = true;
    consoleGroup.add(cabinet);

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.85, 0.16),
      new THREE.MeshStandardMaterial({ color: "#273449", roughness: 0.4 }),
    );
    panel.position.set(0, 1.72, -0.15);
    panel.rotation.x = -0.25;
    panel.castShadow = true;
    consoleGroup.add(panel);

    // 彩色小旋钮与指示灯
    const knobColors = ["#38bdf8", "#fbbf24", "#4ade80", "#f472b6"];
    knobColors.forEach((c, i) => {
      const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.12, 12),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35 }),
      );
      knob.rotation.x = Math.PI / 2 - 0.25;
      knob.position.set(-0.54 + i * 0.36, 1.72, -0.04);
      consoleGroup.add(knob);
    });

    this.scene.add(consoleGroup);
    this.registerInteractable(
      {
        id: "settings-console",
        kind: "settings-console",
        title: msg("Settings"),
        subtitle: msg("Providers, keys & system"),
        worldX: 6.9,
        worldY: 0.24,
        worldZ: -7.1,
        radius: 3.0,
      },
      consoleGroup,
      { xOffset: -0.45, yOffset: 2.15, zOffset: 0.45, dotColor: "#a78bfa" },
    );
  }

  /** 皮肤装潢画架（换 T3 Code 皮肤 = 换整个房间与世界装潢） */
  private buildThemeWardrobe() {
    const easelGroup = new THREE.Group();
    easelGroup.position.set(7.2, 0.24, -2.0);
    easelGroup.rotation.y = -Math.PI / 2 + 0.2;

    // 木质三脚画架
    for (const lx of [-0.4, 0.4]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8),
        this.furnitureWoodMat,
      );
      leg.position.set(lx, 0.96, 0.15);
      leg.rotation.x = -0.12;
      leg.castShadow = true;
      easelGroup.add(leg);
    }
    const backLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8),
      this.furnitureWoodMat,
    );
    backLeg.position.set(0, 0.96, -0.35);
    backLeg.rotation.x = 0.25;
    easelGroup.add(backLeg);

    // 画布（随皮肤主题色变换）
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 0.08), this.wallMat);
    board.position.set(0, 1.38, 0.14);
    board.rotation.x = -0.12;
    board.castShadow = true;
    easelGroup.add(board);

    const swatch1 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), this.accentMat);
    swatch1.scale.set(1, 1, 0.35);
    swatch1.position.set(-0.24, 1.46, 0.2);
    easelGroup.add(swatch1);

    const swatch2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), this.accentSecondaryMat);
    swatch2.scale.set(1, 1, 0.35);
    swatch2.position.set(0.24, 1.32, 0.2);
    easelGroup.add(swatch2);

    this.scene.add(easelGroup);
    this.registerInteractable(
      {
        id: "theme-wardrobe",
        kind: "theme-wardrobe",
        title: msg("World Skins"),
        subtitle: msg("Room & island decor"),
        worldX: 7.2,
        worldY: 0.24,
        worldZ: -2.0,
        radius: 2.8,
      },
      easelGroup,
      { xOffset: -0.72, yOffset: 2.55, dotColor: "#f472b6" },
    );
  }

  /** PR / Issues / Workflows 软木公告板 */
  private buildPrNoticeBoard() {
    const boardGroup = new THREE.Group();
    boardGroup.position.set(-7.2, 0.24, -2.0);
    boardGroup.rotation.y = Math.PI / 2 - 0.2;

    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.1, 0.14), this.trimMat);
    stand.position.y = 1.05;
    stand.castShadow = true;
    boardGroup.add(stand);

    const cork = new THREE.Mesh(
      new THREE.BoxGeometry(1.22, 1.15, 0.16),
      new THREE.MeshStandardMaterial({ color: "#c99666", roughness: 0.92 }),
    );
    cork.position.y = 1.36;
    boardGroup.add(cork);

    const noteColors = ["#fde047", "#93c5fd", "#fca5a5", "#86efac"];
    noteColors.forEach((c, idx) => {
      const note = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.32, 0.04),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }),
      );
      note.position.set(idx % 2 === 0 ? -0.26 : 0.26, idx < 2 ? 1.58 : 1.12, 0.1);
      note.rotation.z = idx % 2 === 0 ? 0.08 : -0.07;
      boardGroup.add(note);
    });

    this.scene.add(boardGroup);
    this.registerInteractable(
      {
        id: "pr-board",
        kind: "pr-board",
        title: msg("Board & PRs"),
        subtitle: msg("PRs, Issues & Workflows"),
        worldX: -7.2,
        worldY: 0.24,
        worldZ: -2.0,
        radius: 2.8,
      },
      boardGroup,
      { xOffset: 0.72, yOffset: 2.55, dotColor: "#fbbf24" },
    );
  }

  /** 建造西侧无边泳池（走进即可自动游泳！） */
  private buildPoolArea() {
    const poolGroup = new THREE.Group();
    const cx = (POOL_BOUNDS.minX + POOL_BOUNDS.maxX) / 2;
    const cz = (POOL_BOUNDS.minZ + POOL_BOUNDS.maxZ) / 2;
    const width = POOL_BOUNDS.maxX - POOL_BOUNDS.minX;
    const depth = POOL_BOUNDS.maxZ - POOL_BOUNDS.minZ;
    poolGroup.position.set(cx, 0, cz);

    // 浅石砖池边外框
    const borderMat = new THREE.MeshStandardMaterial({ color: "#f2ece1", roughness: 0.8 });
    const outerDeck = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.1, 0.26, depth + 1.1),
      borderMat,
    );
    outerDeck.position.y = 0.02;
    outerDeck.receiveShadow = true;
    poolGroup.add(outerDeck);

    // 泳池蓝底槽
    const poolFloor = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.1, 0.16, depth - 0.1),
      new THREE.MeshStandardMaterial({ color: "#1d8ea8", roughness: 0.5 }),
    );
    poolFloor.position.y = 0.09;
    poolGroup.add(poolFloor);

    // 晶莹动态泳池水面
    const waterMat = new THREE.MeshStandardMaterial({
      color: this.accentSecondaryMat.color,
      transparent: true,
      opacity: 0.78,
      roughness: 0.12,
      metalness: 0.05,
    });
    const waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.12, depth - 0.12, 12, 12),
      waterMat,
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = 0.19;
    poolGroup.add(waterMesh);

    // 金属扶梯
    const ladderMat = new THREE.MeshStandardMaterial({
      color: "#e2e8f0",
      metalness: 0.7,
      roughness: 0.25,
    });
    for (const lz of [-0.35, 0.35]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), ladderMat);
      rail.position.set(width / 2 + 0.1, 0.52, lz);
      poolGroup.add(rail);
    }

    // 漂浮的粉色甜甜圈泳圈
    const floatRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.2, 12, 20),
      new THREE.MeshStandardMaterial({ color: "#ff7eb6", roughness: 0.4 }),
    );
    floatRing.rotation.x = Math.PI / 2;
    floatRing.position.set(-1.1, 0.26, 0.9);
    floatRing.castShadow = true;
    poolGroup.add(floatRing);

    this.scene.add(poolGroup);
    this.registerInteractable(
      {
        id: "pool-ladder",
        kind: "pool-ladder",
        title: msg("Infinity Pool"),
        subtitle: msg("Jump in & swim"),
        worldX: cx + width / 2 + 0.3,
        worldY: 0.2,
        worldZ: cz,
        radius: 3.4,
      },
      poolGroup,
      { yOffset: 2.1, dotColor: "#38bdf8" },
    );

    return { waterMesh, waterMat, floatRing };
  }

  /** 建造正南黄金沙滩延伸出深海的木质钓鱼栈桥 */
  private buildFishingDock() {
    const dockGroup = new THREE.Group();

    // 栈桥木板（延伸至 z=26.6 伸入碧蓝深海）
    for (let z = 14.0; z <= 26.6; z += 0.78) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 0.64), this.deckWoodMat);
      plank.position.set(0, 0.14, z);
      plank.castShadow = true;
      plank.receiveShadow = true;
      dockGroup.add(plank);
    }

    // 栈桥木桩（插入海中）
    for (const pz of [15.0, 18.4, 21.8, 25.0, 26.4]) {
      for (const px of [-1.62, 1.62]) {
        const pile = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.19, 2.0, 8),
          this.furnitureWoodMat,
        );
        pile.position.set(px, -0.32, pz);
        pile.castShadow = true;
        dockGroup.add(pile);
      }
    }

    // 栈桥尽头挂着温暖小海港灯笼的木柱
    const lanternPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 2.4, 8),
      this.furnitureWoodMat,
    );
    lanternPost.position.set(1.62, 1.35, 26.0);
    lanternPost.castShadow = true;
    dockGroup.add(lanternPost);

    const lantern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), this.lanternGlowMat);
    lantern.position.set(1.62, 2.35, 26.0);
    dockGroup.add(lantern);

    // 栈桥边的小木鱼桶
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.25, 0.48, 10),
      new THREE.MeshStandardMaterial({ color: "#b07d4f", roughness: 0.85 }),
    );
    bucket.position.set(-1.2, 0.44, 25.4);
    bucket.castShadow = true;
    dockGroup.add(bucket);

    this.scene.add(dockGroup);

    this.registerInteractable(
      {
        id: "fishing-dock",
        kind: "fishing-dock",
        title: msg("Fishing Pier"),
        subtitle: msg("Cast a line by the sea"),
        worldX: 0,
        worldY: 0.25,
        worldZ: 25.4,
        radius: 4.2,
      },
      dockGroup,
      { yOffset: 2.3, dotColor: "#fbbf24" },
    );
  }

  /** 建造东侧沙滩躺椅、遮阳伞、摇曳椰子树与花丛 */
  private buildBeachLoungeAndTrees() {
    // 沙滩躺椅与遮阳伞
    const loungeGroup = new THREE.Group();
    loungeGroup.position.set(8.6, 0.08, 9.6);
    loungeGroup.rotation.y = -0.35;

    const chairFrame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.16, 2.2), this.trimMat);
    chairFrame.position.y = 0.34;
    chairFrame.castShadow = true;
    loungeGroup.add(chairFrame);

    const cushion = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 1.55), this.accentMat);
    cushion.position.set(0, 0.45, 0.22);
    loungeGroup.add(cushion);

    const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.82), this.accentMat);
    backrest.position.set(0, 0.72, -0.78);
    backrest.rotation.x = 0.65;
    loungeGroup.add(backrest);

    // 遮阳伞
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 8), this.trimMat);
    pole.position.set(1.2, 1.4, -0.3);
    pole.rotation.z = 0.1;
    loungeGroup.add(pole);
    const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.65, 10), this.accentSecondaryMat);
    umbrella.position.set(1.05, 2.75, -0.3);
    umbrella.rotation.z = 0.1;
    umbrella.castShadow = true;
    loungeGroup.add(umbrella);

    this.scene.add(loungeGroup);
    this.registerInteractable(
      {
        id: "beach-chair",
        kind: "beach-chair",
        title: msg("Beach Lounge"),
        subtitle: msg("Relax & listen to waves"),
        worldX: 8.6,
        worldY: 0.15,
        worldZ: 9.6,
        radius: 2.8,
      },
      loungeGroup,
      { yOffset: 3.1, dotColor: "#ff8866" },
    );

    // 海岛周围的摇曳椰子树与圆滚滚低模树（坐标与物理树干碰撞体完全一致）
    for (const p of PALM_TREE_SPOTS) {
      const palm = this.createPalmTree();
      palm.position.set(p.x, 0.05, p.z);
      palm.rotation.y = p.rot;
      palm.scale.setScalar(p.s);
      this.scene.add(palm);
      this.treesToSway.push(palm);
    }

    for (const t of ROUND_TREE_SPOTS) {
      const tree = this.createCozyRoundTree(t.blossom);
      tree.position.set(t.x, 0.08, t.z);
      tree.scale.setScalar(t.s);
      this.scene.add(tree);
      this.treesToSway.push(tree);
    }
  }

  /** 创建弯弯的海岛椰子树 */
  private createPalmTree(): THREE.Group {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#b68557", roughness: 0.9 });
    let curY = 0;
    let curX = 0;
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24 - i * 0.022, 0.28 - i * 0.022, 0.92, 7),
        trunkMat,
      );
      curX += i * 0.09;
      curY += 0.82;
      seg.position.set(curX, curY - 0.35, 0);
      seg.rotation.z = -i * 0.08;
      seg.castShadow = true;
      group.add(seg);
    }

    const crown = new THREE.Group();
    crown.position.set(curX + 0.15, curY + 0.1, 0);
    for (let f = 0; f < 6; f++) {
      const angle = (f / 6) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.3, 5), this.foliagePrimaryMat);
      frond.scale.set(1, 1, 0.26);
      frond.position.set(Math.cos(angle) * 0.95, -0.1, Math.sin(angle) * 0.95);
      frond.rotation.y = -angle + Math.PI / 2;
      frond.rotation.x = 1.15;
      frond.castShadow = true;
      crown.add(frond);
    }
    group.add(crown);
    return group;
  }

  /** 创建动森风圆滚滚树冠的治愈大树 */
  private createCozyRoundTree(useSecondaryFoliage: boolean): THREE.Group {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.38, 2.1, 8),
      new THREE.MeshStandardMaterial({ color: "#9c6f4a", roughness: 0.92 }),
    );
    trunk.position.y = 1.05;
    trunk.castShadow = true;
    group.add(trunk);

    const mat = useSecondaryFoliage ? this.foliageSecondaryMat : this.foliagePrimaryMat;
    const puffs = [
      { x: 0, y: 2.75, z: 0, r: 1.35 },
      { x: -0.75, y: 2.25, z: 0.4, r: 0.95 },
      { x: 0.78, y: 2.3, z: -0.3, r: 0.95 },
      { x: 0.1, y: 2.2, z: -0.75, r: 0.85 },
    ];
    for (const p of puffs) {
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(p.r, 1), mat);
      mesh.position.set(p.x, p.y, p.z);
      mesh.castShadow = true;
      group.add(mesh);
    }
    return group;
  }

  /** 建造《动森》三头身 Q 版开发者主角 + 钓竿 + 浮标 + 跃起大鱼 */
  private buildPlayerAvatar() {
    const skinMat = new THREE.MeshStandardMaterial({ color: "#ffd8b8", roughness: 0.75 });
    const darkMat = new THREE.MeshStandardMaterial({ color: "#2b2420", roughness: 0.4 });
    const cheekMat = new THREE.MeshStandardMaterial({ color: "#ff9aa2", roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: "#3d5575", roughness: 0.82 });

    // 圆滚滚小身体（卫衣）
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.34, 8, 12), this.avatarShirtMat);
    body.position.y = 0.78;
    body.castShadow = true;
    this.playerVisual.add(body);

    // 可爱小双肩包
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.22), this.avatarHatMat);
    backpack.position.set(0, 0.82, -0.32);
    backpack.castShadow = true;
    this.playerVisual.add(backpack);

    // 大大圆脑袋
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), skinMat);
    head.position.y = 1.48;
    head.castShadow = true;
    this.playerVisual.add(head);

    // 渔夫帽
    const hatTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.42, 0.24, 14),
      this.avatarHatMat,
    );
    hatTop.position.set(0, 1.84, 0);
    hatTop.castShadow = true;
    this.playerVisual.add(hatTop);
    const hatBrim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.58, 0.06, 16),
      this.avatarHatMat,
    );
    hatBrim.position.set(0, 1.72, 0);
    this.playerVisual.add(hatBrim);

    // 眼睛和害羞小腮红（朝向 +Z 为正面）
    for (const ex of [-0.14, 0.14]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), darkMat);
      eye.position.set(ex, 1.5, 0.37);
      this.playerVisual.add(eye);

      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), cheekMat);
      cheek.scale.set(1.2, 0.65, 0.4);
      cheek.position.set(ex * 1.55, 1.4, 0.35);
      this.playerVisual.add(cheek);
    }

    // 小短腿
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.24, 6, 8);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.15, 0.26, 0);
    leftLeg.castShadow = true;
    this.playerVisual.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.15, 0.26, 0);
    rightLeg.castShadow = true;
    this.playerVisual.add(rightLeg);

    // 小手臂
    const armGeo = new THREE.CapsuleGeometry(0.09, 0.28, 6, 8);
    const leftArm = new THREE.Mesh(armGeo, this.avatarShirtMat);
    leftArm.position.set(-0.4, 0.82, 0);
    leftArm.castShadow = true;
    this.playerVisual.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, this.avatarShirtMat);
    rightArm.position.set(0.4, 0.82, 0);
    rightArm.castShadow = true;
    this.playerVisual.add(rightArm);

    // 3D 钓鱼竿（平时隐藏，钓鱼时拿在右手）
    const rodShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.045, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: "#8c5a32", roughness: 0.7 }),
    );
    rodShaft.position.set(0, 1.3, 0);
    this.fishingRodGroup.add(rodShaft);
    this.fishingRodGroup.position.set(0.42, 0.92, 0.25);
    this.fishingRodGroup.rotation.x = 0.85;
    this.fishingRodGroup.visible = false;
    this.playerVisual.add(this.fishingRodGroup);

    this.playerGroup.add(this.playerVisual);

    // 泳池划水时的白色水波扩散圆环
    const rippleMat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const rippleRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 24), rippleMat);
    rippleRing.rotation.x = -Math.PI / 2;
    rippleRing.position.y = 0.24;
    rippleRing.visible = false;
    this.playerGroup.add(rippleRing);

    // 红白钓鱼浮标
    const bobber = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshStandardMaterial({ color: "#ef4444", roughness: 0.3 }),
    );
    bobber.visible = false;

    // 鱼线
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -1, 2),
    ]);
    const line = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.85 }),
    );
    line.visible = false;

    // 收杆跃出水面的快乐小鱼
    const jumpingFish = new THREE.Group();
    const fishBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshStandardMaterial({ color: "#fbbf24", roughness: 0.3 }),
    );
    fishBody.scale.set(0.65, 0.8, 1.5);
    jumpingFish.add(fishBody);
    const fishTail = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.34, 5),
      new THREE.MeshStandardMaterial({ color: "#ff7f45", roughness: 0.4 }),
    );
    fishTail.rotation.x = Math.PI / 2;
    fishTail.position.z = -0.45;
    jumpingFish.add(fishTail);
    jumpingFish.visible = false;

    return {
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      rippleMat,
      rippleRing,
      bobber,
      line,
      jumpingFish,
    };
  }

  /** 注册或注销 3D 投影液态玻璃标牌的原生 DOM 节点 */
  public setFloatingLabelElement(id: string, el: HTMLElement | null) {
    if (el) {
      this.floatingLabelElements.set(id, el);
      this.floatingLabelStyleCache.delete(id);
    } else {
      this.floatingLabelElements.delete(id);
      this.floatingLabelStyleCache.delete(id);
    }
  }

  /** 由原生 DOM 标牌悬停事件同步 3D 地面高亮光环 */
  public setHoveredInteractableId(id: string | null) {
    this.hoveredId = id;
  }

  /** 将 React 侧同步的真实 T3 Code 状态更新到 3D 场景 */
  public syncData(payload: WorldSceneSyncPayload) {
    this.inputEnabled = payload.inputEnabled;
    this.lowPowerMode = payload.lowPowerMode;
    if (!payload.inputEnabled) {
      this.keysPressed.clear();
      this.isDraggingCamera = false;
    }

    // 1. 皮肤装潢、昼夜光影与界面语言同步
    const localeChanged = this.lastLocale !== payload.locale;
    this.lastLocale = payload.locale;
    this.applySkinPalette(payload.skin);
    if (localeChanged) {
      this.refreshStaticLocalization();
    }

    // 2. 重绘主办公桌实时大屏、北墙巨幕黑板与天花板用量吊牌
    const runningCount = payload.stations.filter((st) => st.status === "running").length;
    const screenSig = JSON.stringify({
      locale: payload.locale,
      skin: `${payload.skin.id}:${payload.skin.isNight}`,
      t: payload.activeThreadTitle,
      s: payload.activeThreadStatus,
      p: payload.activeProjectName,
      rc: runningCount,
      tc: payload.stations.length,
      ut: payload.usage.totalTokens,
      uc: Math.round(payload.usage.totalCostUsd * 100),
      up: payload.usage.providers.map((pr) => `${pr.id}:${pr.tokens}:${pr.limitRemainingPercent}`),
      pr: payload.projects.map(
        (pr) =>
          `${pr.key}:${pr.name}:${pr.status}:${pr.threadCount}:${pr.runningCount}:${pr.waitingCount}:${pr.isActive}:${pr.accentColor}`,
      ),
      wb: payload.stations
        .slice(0, 9)
        .map((st) => `${st.key}:${st.status}:${st.title}:${st.projectName}`),
    });

    if (screenSig === this.lastSyncSignature) return;
    this.lastSyncSignature = screenSig;

    renderDeskMonitorCanvas(this.deskMonitorCanvas, {
      skin: payload.skin,
      projectName: payload.activeProjectName,
      threadTitle: payload.activeThreadTitle,
      status: payload.activeThreadStatus,
      runningCount,
      totalThreads: payload.stations.length,
    });
    this.deskMonitorTex.needsUpdate = true;

    renderWorkingBoardCanvas(this.workingBoardCanvas, {
      skin: payload.skin,
      stations: payload.stations,
    });
    this.workingBoardTex.needsUpdate = true;

    renderUsageWallCanvas(this.usageWallCanvas, {
      skin: payload.skin,
      usage: payload.usage,
    });
    this.usageWallTex.needsUpdate = true;

    // 3. 更新项目书架上的彩色文件夹
    this.rebuildProjectBooks(payload.projects);

    // 4. 按项目生成房间内专属小电脑工位（一个项目占一个固定工位）并更新液态玻璃浮空标牌
    this.rebuildProjectStations(payload.projects);

    // 5. 若当前靠近或悬停在某个工位上，把最新语言/状态文本同步给 HUD 提示气泡
    if (this.nearbyId) {
      this.callbacks.onNearbyChange(this.interactableMap.get(this.nearbyId) ?? null);
    }
    if (this.hoveredId) {
      this.callbacks.onHoverChange(this.interactableMap.get(this.hoveredId) ?? null);
    }
  }

  /** 应用皮肤装潢配色与昼夜模式，返回是否发生变化 */
  private applySkinPalette(skin: WorldSkinPalette): boolean {
    const changed = this.lastSkinId !== skin.id || this.lastNightState !== skin.isNight;
    if (!changed) return false;
    this.lastSkinId = skin.id;
    this.lastNightState = skin.isNight;

    const topUniform = this.skyDomeMat.uniforms.topColor;
    const bottomUniform = this.skyDomeMat.uniforms.bottomColor;
    if (topUniform) (topUniform.value as THREE.Color).set(skin.skyTop);
    if (bottomUniform) (bottomUniform.value as THREE.Color).set(skin.skyHorizon);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(skin.fogColor);
    }

    this.celestialMat.color.set(skin.sunColor);
    this.celestialBody.position.set(skin.isNight ? -46 : 48, skin.isNight ? 48 : 56, -72);
    this.starsPoints.visible = skin.isNight;

    this.sunLight.color.set(skin.directionalLight);
    this.sunLight.intensity = skin.directionalIntensity;
    this.hemiLight.color.set(skin.hemiSky);
    this.hemiLight.groundColor.set(skin.hemiGround);
    this.hemiLight.intensity = skin.hemiIntensity;
    this.studioLampLight.color.set(skin.lampColor);
    this.studioLampLight.intensity = skin.lampIntensity;
    this.studioFillLeftLight.color.set(skin.lampColor);
    this.studioFillLeftLight.intensity = skin.lampIntensity * 0.55;
    this.studioFillRightLight.color.set(skin.lampColor);
    this.studioFillRightLight.intensity = skin.lampIntensity * 0.55;
    this.dockLanternLight.color.set(skin.lampColor);
    this.dockLanternLight.intensity = skin.isNight ? 2.4 : 0.35;
    this.lanternGlowMat.emissive.set(skin.lampColor);
    this.lanternGlowMat.emissiveIntensity = skin.isNight ? 1.9 : 0.38;

    this.oceanMat.color.set(skin.oceanShallow);
    this.poolWaterMat.color.set(skin.poolWater);
    this.grassMat.color.set(skin.grass);
    this.grassAccentMat.color.set(skin.grassAccent);
    this.sandMat.color.set(skin.sand);
    this.wallMat.color.set(skin.wallColor);
    this.trimMat.color.set(skin.trimColor);
    this.floorWoodMat.color.set(skin.floorWood);
    this.deckWoodMat.color.set(skin.deckWood);
    this.roofMat.color.set(skin.roofColor);
    this.furnitureWoodMat.color.set(skin.furnitureWood);
    this.accentMat.color.set(skin.accent);
    this.accentSecondaryMat.color.set(skin.accentSecondary);
    this.foliagePrimaryMat.color.set(skin.foliagePrimary);
    this.foliageSecondaryMat.color.set(skin.foliageSecondary);
    this.avatarShirtMat.color.set(skin.avatarShirt);
    this.avatarHatMat.color.set(skin.avatarHat);
    return true;
  }

  /** 语言切换时，同步刷新全部静态 3D 设施交互文案并重新下发液态玻璃浮空标牌 */
  private refreshStaticLocalization() {
    for (const entry of this.staticInteractableTemplates) {
      const existing = this.interactableMap.get(entry.id);
      if (!existing) continue;
      const resolvedTitle = m(entry.titleMsg);
      const resolvedSubtitle = entry.subtitleMsg ? m(entry.subtitleMsg) : undefined;
      this.interactableMap.set(entry.id, {
        ...existing,
        title: resolvedTitle,
        ...(resolvedSubtitle !== undefined ? { subtitle: resolvedSubtitle } : {}),
      });
    }

    this.emitFloatingLabels();

    if (this.nearbyId) {
      this.callbacks.onNearbyChange(this.interactableMap.get(this.nearbyId) ?? null);
    }
    if (this.hoveredId) {
      this.callbacks.onHoverChange(this.interactableMap.get(this.hoveredId) ?? null);
    }
  }

  /** 将全部静态设施与项目工位的最新 3D 液态玻璃标牌元数据推送给 React 浮层 */
  private emitFloatingLabels() {
    const labels: WorldFloatingLabel[] = [];
    for (const item of this.staticLabelAnchors) {
      const interactable = this.interactableMap.get(item.id);
      if (!interactable) continue;
      const resolvedSubtitle = item.subtitleMsg ? m(item.subtitleMsg) : undefined;
      labels.push({
        id: item.id,
        title: m(item.titleMsg),
        ...(resolvedSubtitle ? { subtitle: resolvedSubtitle } : {}),
        ...(item.dotColor ? { dotColor: item.dotColor } : {}),
        isProject: false,
        interactable,
      });
    }
    for (const projItem of this.projectLabelAnchors) {
      labels.push(projItem.label);
    }
    this.callbacks.onFloatingLabelsChange(labels);
  }

  /** 按真实项目列表在书架上生成彩色书脊 */
  private rebuildProjectBooks(projects: WorldSceneSyncPayload["projects"]) {
    while (this.projectBooksGroup.children.length > 0) {
      const child = this.projectBooksGroup.children.pop()!;
      this.disposeObject3D(child);
    }
    const maxBooks = Math.min(18, Math.max(projects.length, 4));
    const fallbackColors = ["#38bdf8", "#4ade80", "#fbbf24", "#f472b6", "#a78bfa", "#fb923c"];
    for (let i = 0; i < maxBooks; i++) {
      const row = Math.floor(i / 6);
      const col = i % 6;
      const color = projects[i]?.accentColor ?? fallbackColors[i % fallbackColors.length]!;
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.44 + (i % 3) * 0.05, 0.46),
        new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
      );
      book.position.set(-0.72 + col * 0.28, 0.92 + row * 0.68, 0.08);
      book.userData.interactableId = "projects-shelf";
      this.projectBooksGroup.add(book);
    }
  }

  /** 按真实项目列表在房间内排布专属小电脑工位（一个项目一个固定位置） */
  private rebuildProjectStations(projects: ReadonlyArray<WorldProjectSummary>) {
    // 先清理旧工位
    for (const vis of this.agentVisuals) {
      const interactId = `project:${vis.project.key}`;
      this.interactableMap.delete(interactId);
      const idx = this.interactableMeshes.indexOf(vis.group);
      if (idx !== -1) this.interactableMeshes.splice(idx, 1);
      this.agentStationsGroup.remove(vis.group);
      this.disposeObject3D(vis.group);
    }
    this.agentVisuals = [];
    this.dynamicAgentColliders = [];
    this.projectLabelAnchors = [];

    const visible = projects.slice(0, AGENT_STATION_SLOTS.length);
    visible.forEach((project, index) => {
      const slot = AGENT_STATION_SLOTS[index]!;
      this.dynamicAgentColliders.push({ x: slot.x, z: slot.z, r: 0.72 });
      const group = new THREE.Group();
      group.position.set(slot.x, 0.24, slot.z);
      group.rotation.y = slot.rotY;

      const statusColor = statusAccentColor(project.status);

      // 迷你圆木桌
      const desk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.66, 0.62, 0.09, 14),
        this.furnitureWoodMat,
      );
      desk.position.y = 0.72;
      desk.castShadow = true;
      desk.receiveShadow = true;
      group.add(desk);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.72, 10), this.trimMat);
      stand.position.y = 0.36;
      group.add(stand);

      // 桌上的迷你发光显示器
      const screenMat = new THREE.MeshStandardMaterial({
        color: "#0f172a",
        emissive: new THREE.Color(statusColor),
        emissiveIntensity:
          project.status === "running" || project.status === "waiting" ? 0.95 : 0.32,
        roughness: 0.25,
      });
      const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.46, 0.08), screenMat);
      monitor.position.set(0, 1.02, 0.14);
      monitor.castShadow = true;
      group.add(monitor);

      // 可爱 Q 版项目专属小助手机器人（配色与项目文件夹一致）
      const robotGroup = new THREE.Group();
      robotGroup.position.set(0, 0.2, -0.52);

      const bodyMat = new THREE.MeshStandardMaterial({
        color: project.accentColor || "#6366f1",
        roughness: 0.52,
      });
      const headMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.4 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: statusColor });

      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.24, 6, 10), bodyMat);
      torso.position.y = 0.42;
      torso.castShadow = true;
      robotGroup.add(torso);

      const rHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), headMat);
      rHead.position.y = 0.92;
      rHead.castShadow = true;
      robotGroup.add(rHead);

      // 大眼睛面罩
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.16, 0.12),
        new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.2 }),
      );
      visor.position.set(0, 0.94, 0.21);
      robotGroup.add(visor);

      for (const ex of [-0.09, 0.09]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), eyeMat);
        eye.position.set(ex, 0.94, 0.27);
        robotGroup.add(eye);
      }

      // 头顶发光天线状态球
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), this.trimMat);
      stem.position.y = 1.28;
      robotGroup.add(stem);
      const antennaMat = new THREE.MeshStandardMaterial({
        color: statusColor,
        emissive: new THREE.Color(statusColor),
        emissiveIntensity: 1.1,
      });
      const antennaOrb = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), antennaMat);
      antennaOrb.position.y = 1.42;
      robotGroup.add(antennaOrb);

      // 小助手手臂（敲键盘 / 举手提醒动画用）
      const armGeo = new THREE.CapsuleGeometry(0.065, 0.2, 6, 8);
      const leftArm = new THREE.Mesh(armGeo, bodyMat);
      leftArm.position.set(-0.28, 0.56, 0.12);
      leftArm.rotation.x = 0.85;
      robotGroup.add(leftArm);

      const rightArm = new THREE.Mesh(armGeo, bodyMat);
      rightArm.position.set(0.28, 0.56, 0.12);
      rightArm.rotation.x = 0.85;
      robotGroup.add(rightArm);

      group.add(robotGroup);

      // 地面状态脉冲光环
      const alertRing = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 0.94, 24),
        new THREE.MeshBasicMaterial({
          color: statusColor,
          transparent: true,
          opacity:
            project.isActive || project.status === "running" || project.status === "waiting"
              ? 0.72
              : 0.24,
          side: THREE.DoubleSide,
        }),
      );
      alertRing.rotation.x = -Math.PI / 2;
      alertRing.position.y = 0.03;
      group.add(alertRing);

      const interactId = `project:${project.key}`;
      const interactable: WorldInteractable = {
        id: interactId,
        kind: "project-station",
        title: project.name || m(msg("Project")),
        subtitle:
          project.latestThreadTitle ??
          (project.threadCount > 0
            ? m(msg("{total} threads", { total: project.threadCount }))
            : m(msg("Start a new thread"))),
        worldX: slot.x,
        worldY: 0.24,
        worldZ: slot.z,
        radius: 2.35,
        projectRef: project.projectRef,
        projectKey: project.key,
        ...(project.latestThreadRef ? { threadRef: project.latestThreadRef } : {}),
        status: project.status,
      };
      this.interactableMap.set(interactId, interactable);
      group.traverse((obj) => {
        obj.userData.interactableId = interactId;
      });
      this.interactableMeshes.push(group);
      this.agentStationsGroup.add(group);

      // 挂载 3D 空间投影液态玻璃项目名牌锚点（替代模糊的 Sprite，获得视网膜锐利文字与实时毛玻璃折射）
      this.projectLabelAnchors.push({
        id: interactId,
        anchor: new THREE.Vector3(slot.x, 0.24 + 2.08, slot.z),
        label: {
          id: interactId,
          title: project.name || m(msg("Project")),
          subtitle: formatProjectStationSubtitle(project),
          dotColor: statusColor,
          status: project.status,
          isProject: true,
          isActive: project.isActive,
          interactable,
        },
      });

      this.agentVisuals.push({
        group,
        robotGroup,
        leftArm,
        rightArm,
        antennaOrb,
        antennaMat,
        screenMat,
        alertRing,
        project,
      });
    });

    this.emitFloatingLabels();
  }

  /** 将角色传送到指定地标（用于 HUD 快捷前往或 Agent 提醒闪回） */
  public teleportTo(x: number, z: number, yaw?: number, activity?: PlayerActivity) {
    this.cancelFishingInternal();
    this.moveGoal = null;
    const resolved = resolvePlayerPosition(x, z, this.dynamicAgentColliders);
    this.playerX = resolved.x;
    this.playerZ = resolved.z;
    if (yaw !== undefined) {
      this.playerYaw = yaw;
      this.cameraYaw = z > 18 ? Math.PI * 0.85 : 0;
    }
    const nextActivity =
      activity ?? (isPointInsidePool(this.playerX, this.playerZ) ? "swimming" : "walking");
    this.setPlayerActivityInternal(nextActivity);
    this.playerY = this.getPlayerGroundY();
    this.playerVy = 0;
    this.isGrounded = true;
    this.playerGroup.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerGroup.rotation.y = this.playerYaw;
  }

  /** 提供给自动化验证读取当前 3D 角色坐标、跳跃高度与交互状态 */
  public getDebugState() {
    return {
      playerX: Number(this.playerX.toFixed(2)),
      playerY: Number(this.playerY.toFixed(2)),
      playerZ: Number(this.playerZ.toFixed(2)),
      playerVy: Number(this.playerVy.toFixed(2)),
      isGrounded: this.isGrounded,
      groundY: Number(this.getPlayerGroundY().toFixed(2)),
      playerYaw: Number(this.playerYaw.toFixed(2)),
      cameraYaw: Number(this.cameraYaw.toFixed(2)),
      cameraDistance: Number(this.cameraDistance.toFixed(2)),
      activity: this.playerActivity,
      fishingPhase: this.fishingPhase,
      nearbyId: this.nearbyId,
      agentStationCount: this.agentVisuals.length,
      interactableCount: this.interactableMap.size,
      lowPowerMode: this.lowPowerMode,
    };
  }

  /** 触发一次空格跳跃（泳池中激起小水花轻跃，躺椅上直接跳起起身） */
  public triggerJump() {
    if (this.playerActivity === "fishing") {
      this.triggerFishingAction();
      return;
    }
    if (this.playerActivity === "lounging") {
      this.stopLeisureActivity();
      this.playerVy = JUMP_VELOCITY * 0.85;
      this.isGrounded = false;
      this.callbacks.onJump();
      return;
    }
    if (this.playerActivity === "swimming") {
      if (this.playerVy <= 0.1) {
        this.playerVy = JUMP_VELOCITY * 0.52;
        this.isGrounded = false;
        this.callbacks.onJump();
      }
      return;
    }
    if (this.isGrounded || this.coyoteTimer > 0) {
      this.playerVy = JUMP_VELOCITY;
      this.isGrounded = false;
      this.coyoteTimer = 0;
      this.callbacks.onJump();
    }
  }

  /** 从 React / 快捷键触发一次钓鱼抛竿或收杆 */
  public triggerFishingAction() {
    if (this.playerActivity !== "fishing") {
      // 自动站到伸入碧蓝大海的栈桥尽头面向海面甩杆，并顺滑旋转镜头面向大海
      this.moveGoal = null;
      this.playerX = 0;
      this.playerZ = 25.9;
      this.playerYaw = 0;
      this.cameraYaw = Math.PI * 0.85;
      this.setPlayerActivityInternal("fishing");
      this.startCast();
      return;
    }

    if (this.fishingPhase === "biting") {
      // 成功收杆！
      this.fishingPhase = "caught";
      this.jumpingFishProgress = 0.001;
      this.jumpingFish.visible = true;
      this.bobberMesh.visible = false;
      this.fishingLine.visible = false;
      this.callbacks.onFishingPhaseChange("caught");
      this.callbacks.onFishCaught();
      this.fishingTimer = 0;
    } else if (this.fishingPhase === "waiting" || this.fishingPhase === "casting") {
      // 提前收杆取消
      this.cancelFishingInternal();
    } else {
      // 刚钓完或错过，继续下一杆
      this.startCast();
    }
  }

  /** 主动退出钓鱼或躺椅状态 */
  public stopLeisureActivity() {
    if (this.playerActivity === "fishing") {
      this.cancelFishingInternal();
    } else if (this.playerActivity === "lounging") {
      this.setPlayerActivityInternal("walking");
      this.playerX = 7.4;
      this.playerZ = 9.8;
    } else if (this.playerActivity === "swimming") {
      this.setPlayerActivityInternal("walking");
      this.playerX = -3.4;
      this.playerZ = 9.4;
    }
  }

  /** 进入泳池游泳 */
  public enterPoolSwim() {
    this.cancelFishingInternal();
    this.moveGoal = null;
    if (this.playerActivity === "swimming") {
      this.stopLeisureActivity();
      return;
    }
    this.playerX = -7.5;
    this.playerZ = 9.4;
    this.playerYaw = 0;
    this.setPlayerActivityInternal("swimming");
  }

  /** 坐上沙滩躺椅休息 */
  public toggleBeachLounge() {
    this.cancelFishingInternal();
    this.moveGoal = null;
    if (this.playerActivity === "lounging") {
      this.stopLeisureActivity();
      return;
    }
    this.playerX = 8.6;
    this.playerZ = 9.6;
    this.playerYaw = -0.35;
    this.setPlayerActivityInternal("lounging");
  }

  private startCast() {
    this.fishingPhase = "casting";
    this.fishingTimer = 0;
    this.fishingBiteAt = 2.4 + ((this.elapsedTime * 1.73) % 3.2);
    this.fishingBiteDeadline = this.fishingBiteAt + 2.6;
    this.fishingRodGroup.visible = true;
    this.bobberMesh.visible = true;
    this.fishingLine.visible = true;
    this.bobberMesh.position.set(this.playerX, -0.36, this.playerZ + 4.4);
    this.callbacks.onFishingPhaseChange("casting");
  }

  private cancelFishingInternal() {
    if (this.fishingPhase !== "idle") {
      this.fishingPhase = "idle";
      this.callbacks.onFishingPhaseChange("idle");
    }
    this.fishingRodGroup.visible = false;
    this.bobberMesh.visible = false;
    this.fishingLine.visible = false;
    if (this.playerActivity === "fishing") {
      this.setPlayerActivityInternal("walking");
    }
  }

  private setPlayerActivityInternal(next: PlayerActivity) {
    if (this.playerActivity === next) return;
    this.playerActivity = next;
    this.swimRippleRing.visible = next === "swimming";
    if (next !== "fishing") {
      this.fishingRodGroup.visible = false;
      this.bobberMesh.visible = false;
      this.fishingLine.visible = false;
    }
    this.callbacks.onActivityChange(next);
  }

  private getPlayerGroundY(): number {
    return computeGroundHeight(this.playerX, this.playerZ, this.playerActivity);
  }

  private bindEvents() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onWindowBlur);
    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    dom.addEventListener("wheel", this.onWheel, { passive: false });
    dom.addEventListener("contextmenu", this.onContextMenu);
  }

  private readonly onWindowBlur = () => {
    this.keysPressed.clear();
    this.isDraggingCamera = false;
  };

  private readonly onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!this.inputEnabled) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.closest("[data-command-palette]") !== null ||
        target.closest("[data-app-modal]") !== null)
    ) {
      return;
    }

    const code = event.code;
    if (
      code === "KeyW" ||
      code === "KeyA" ||
      code === "KeyS" ||
      code === "KeyD" ||
      code === "ArrowUp" ||
      code === "ArrowDown" ||
      code === "ArrowLeft" ||
      code === "ArrowRight"
    ) {
      this.keysPressed.add(code);
      this.moveGoal = null;
      if (!this.hasMovedOnce) {
        this.hasMovedOnce = true;
        this.callbacks.onFirstMove();
      }
      if (this.playerActivity === "fishing" || this.playerActivity === "lounging") {
        this.stopLeisureActivity();
      }
      return;
    }

    if (code === "Space") {
      event.preventDefault();
      if (!event.repeat) {
        this.triggerJump();
      }
      return;
    }

    if (code === "KeyE") {
      event.preventDefault();
      if (this.playerActivity === "fishing") {
        this.triggerFishingAction();
        return;
      }
      if (this.nearbyId) {
        const item = this.interactableMap.get(this.nearbyId);
        if (item) this.callbacks.onInteract(item);
      }
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keysPressed.delete(event.code);
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.inputEnabled) return;
    this.isDraggingCamera = true;
    this.dragDistance = 0;
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
    this.lastPointerPos = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.inputEnabled) return;
    if (this.isDraggingCamera) {
      const dx = event.clientX - this.lastPointerPos.x;
      const dy = event.clientY - this.lastPointerPos.y;
      this.dragDistance += Math.hypot(dx, dy);
      this.lastPointerPos = { x: event.clientX, y: event.clientY };
      this.cameraYaw -= dx * 0.0065;
      this.cameraPitch = Math.max(0.24, Math.min(1.12, this.cameraPitch + dy * 0.005));
      return;
    }

    // 非拖拽时检测鼠标悬停的可交互 3D 物体
    const hit = this.pickInteractable(event.clientX, event.clientY);
    const nextHoverId = hit?.id ?? null;
    if (nextHoverId !== this.hoveredId) {
      this.hoveredId = nextHoverId;
      this.renderer.domElement.style.cursor = hit ? "pointer" : "grab";
      this.callbacks.onHoverChange(hit);
    }
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    if (!this.isDraggingCamera) return;
    this.isDraggingCamera = false;
    if (!this.inputEnabled) return;

    // 轻微移动视为点击交互（避免和拖动旋转镜头冲突）
    if (this.dragDistance < 7 && event.button === 0) {
      const hit = this.pickInteractable(this.pointerDownPos.x, this.pointerDownPos.y);
      if (hit) {
        this.callbacks.onInteract(hit);
      } else if (this.playerActivity === "fishing") {
        this.triggerFishingAction();
      }
    }
  };

  private readonly onWheel = (event: WheelEvent) => {
    if (!this.inputEnabled) return;
    event.preventDefault();
    this.cameraDistance = Math.max(6.2, Math.min(24.0, this.cameraDistance + event.deltaY * 0.01));
  };

  private pickInteractable(clientX: number, clientY: number): WorldInteractable | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactableMeshes, true);
    for (const hit of hits) {
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        const id = cur.userData.interactableId as string | undefined;
        if (id) {
          return this.interactableMap.get(id) ?? null;
        }
        cur = cur.parent;
      }
    }
    return null;
  }

  private handleResize() {
    if (this.disposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private updateCameraImmediate() {
    const targetY = this.playerActivity === "swimming" ? 0.6 : 1.45;
    this.currentCameraLookAt.set(this.playerX, targetY, this.playerZ);
    const horiz = Math.cos(this.cameraPitch) * this.cameraDistance;
    const vert = Math.sin(this.cameraPitch) * this.cameraDistance;
    this.camera.position.set(
      this.currentCameraLookAt.x + Math.sin(this.cameraYaw) * horiz,
      this.currentCameraLookAt.y + vert,
      this.currentCameraLookAt.z + Math.cos(this.cameraYaw) * horiz,
    );
    this.camera.lookAt(this.currentCameraLookAt);
  }

  /** 主渲染与物理更新循环 */
  private readonly loop = () => {
    if (this.disposed) return;
    this.rafId = window.requestAnimationFrame(this.loop);

    // 浏览器标签页不可见时完全休眠
    const nowMs = performance.now();
    const rawDelta = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;
    if (document.hidden) return;

    // 当用户正在工作台专注编码或打开设置大弹窗时，降帧至约 10fps 保护 GPU/续航
    if (this.lowPowerMode) {
      this.lowPowerAccum += rawDelta;
      if (this.lowPowerAccum < 0.1) return;
      const dt = this.lowPowerAccum;
      this.lowPowerAccum = 0;
      this.elapsedTime += dt;
      this.updateAmbientAnimations(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.elapsedTime += rawDelta;
    this.updatePlayerMovement(rawDelta);
    this.updateFishingPhysics(rawDelta);
    this.updateNearbyInteractable();
    this.updateAmbientAnimations(rawDelta);
    this.updateCameraSmooth(rawDelta);
    this.updateFloatingLabelPositions();
    this.renderer.render(this.scene, this.camera);
  };

  /** 第三人称角色移动、泳池自动切换与动画 */
  private updatePlayerMovement(dt: number) {
    let moveForward = 0;
    let moveRight = 0;
    if (this.inputEnabled) {
      if (this.keysPressed.has("KeyW") || this.keysPressed.has("ArrowUp")) moveForward += 1;
      if (this.keysPressed.has("KeyS") || this.keysPressed.has("ArrowDown")) moveForward -= 1;
      if (this.keysPressed.has("KeyD") || this.keysPressed.has("ArrowRight")) moveRight += 1;
      if (this.keysPressed.has("KeyA") || this.keysPressed.has("ArrowLeft")) moveRight -= 1;
    }

    let isMoving = false;
    let vx = 0;
    let vz = 0;

    if (moveForward !== 0 || moveRight !== 0) {
      const len = Math.hypot(moveForward, moveRight);
      const nf = moveForward / len;
      const nr = moveRight / len;
      // 相对当前相机偏航角计算世界方向
      const forwardX = -Math.sin(this.cameraYaw);
      const forwardZ = -Math.cos(this.cameraYaw);
      const rightX = Math.cos(this.cameraYaw);
      const rightZ = -Math.sin(this.cameraYaw);
      vx = forwardX * nf + rightX * nr;
      vz = forwardZ * nf + rightZ * nr;
      isMoving = true;
    } else if (this.moveGoal) {
      const dx = this.moveGoal.x - this.playerX;
      const dz = this.moveGoal.z - this.playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.35) {
        vx = dx / dist;
        vz = dz / dist;
        isMoving = true;
      } else {
        const goalInteractable = this.moveGoal.interactable;
        this.moveGoal = null;
        if (goalInteractable) this.callbacks.onInteract(goalInteractable);
      }
    }

    if (isMoving && this.playerActivity !== "fishing" && this.playerActivity !== "lounging") {
      const speed = this.playerActivity === "swimming" ? 4.4 : 6.8;
      const resolved = resolvePlayerPosition(
        this.playerX + vx * speed * dt,
        this.playerZ + vz * speed * dt,
        this.dynamicAgentColliders,
      );
      this.playerX = resolved.x;
      this.playerZ = resolved.z;

      // 平滑转向目标朝向
      const targetYaw = Math.atan2(vx, vz);
      let diff = targetYaw - this.playerYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.playerYaw += diff * Math.min(1, dt * 13);

      // 自动识别进出无边泳池
      const inPool = isPointInsidePool(this.playerX, this.playerZ);
      if (inPool && this.playerActivity !== "swimming") {
        this.setPlayerActivityInternal("swimming");
      } else if (!inPool && this.playerActivity === "swimming") {
        this.setPlayerActivityInternal("walking");
      }

      this.walkCycle += dt * (this.playerActivity === "swimming" ? 7.5 : 11.5);
    }

    // 真实地形坡面贴合 + 空格跳跃重力与落地弹性物理
    const groundY = this.getPlayerGroundY();
    if (this.playerActivity === "fishing" || this.playerActivity === "lounging") {
      this.playerY += (groundY - this.playerY) * Math.min(1, dt * 14);
      this.playerVy = 0;
      this.isGrounded = true;
      this.coyoteTimer = 0.08;
    } else if (!this.isGrounded || this.playerVy > 0 || this.playerY > groundY + 0.06) {
      this.playerVy -= GRAVITY * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= groundY) {
        this.playerY = groundY;
        if (this.playerVy < -2.2) {
          this.landingSquash = 1;
        }
        this.playerVy = 0;
        this.isGrounded = true;
        this.coyoteTimer = 0.08;
      } else {
        this.isGrounded = false;
        this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      }
    } else {
      // 贴地行走时丝滑跟坡（上草丘绝不穿模！）
      this.playerY += (groundY - this.playerY) * Math.min(1, dt * 20);
      if (Math.abs(this.playerY - groundY) < 0.01) this.playerY = groundY;
      this.isGrounded = true;
      this.coyoteTimer = 0.08;
    }

    // 落地瞬间弹性缩放回弹
    if (this.landingSquash > 0) {
      this.landingSquash = Math.max(0, this.landingSquash - dt * 6.5);
    }
    const squashAmt = Math.sin(this.landingSquash * Math.PI) * 0.16;
    const airStretch =
      !this.isGrounded && this.playerVy > 0 ? Math.min(0.12, this.playerVy * 0.015) : 0;
    this.playerVisual.scale.set(
      1 + squashAmt * 0.7 - airStretch * 0.4,
      1 - squashAmt + airStretch,
      1 + squashAmt * 0.7 - airStretch * 0.4,
    );

    this.playerGroup.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerGroup.rotation.y = this.playerYaw;

    if (this.playerActivity === "swimming") {
      this.playerVisual.rotation.x = 0.58;
      this.playerVisual.position.y = Math.sin(this.elapsedTime * 3.4) * 0.06;
      const stroke = Math.sin(this.walkCycle);
      this.playerLeftArm.rotation.x = -1.2 + stroke * 0.9;
      this.playerRightArm.rotation.x = -1.2 - stroke * 0.9;
      this.playerLeftLeg.rotation.x = stroke * 0.5;
      this.playerRightLeg.rotation.x = -stroke * 0.5;

      const ripplePulse = (this.elapsedTime * 1.1) % 1;
      this.swimRippleRing.scale.setScalar(0.85 + ripplePulse * 1.15);
      this.swimRippleMat.opacity = (1 - ripplePulse) * 0.65;
    } else if (this.playerActivity === "lounging") {
      this.playerVisual.rotation.x = -0.82;
      this.playerVisual.position.y = 0.16;
      this.playerLeftArm.rotation.x = 0.2;
      this.playerRightArm.rotation.x = 0.2;
      this.playerLeftLeg.rotation.x = 0.12;
      this.playerRightLeg.rotation.x = 0.12;
    } else if (this.playerActivity === "fishing") {
      this.playerVisual.rotation.x = 0;
      this.playerVisual.position.y = Math.sin(this.elapsedTime * 2.4) * 0.02;
      const biteShake = this.fishingPhase === "biting" ? Math.sin(this.elapsedTime * 32) * 0.16 : 0;
      this.fishingRodGroup.rotation.x = 0.85 + biteShake;
      this.playerRightArm.rotation.x = -0.7 + biteShake;
      this.playerLeftArm.rotation.x = -0.3;
      this.playerLeftLeg.rotation.x = 0;
      this.playerRightLeg.rotation.x = 0;
    } else if (!this.isGrounded) {
      // 空中跳跃动森欢快姿势：双臂举高、小短腿微收
      this.playerVisual.rotation.x = 0;
      this.playerVisual.position.y = 0;
      this.playerLeftArm.rotation.x = -2.1;
      this.playerRightArm.rotation.x = -2.1;
      this.playerLeftLeg.rotation.x = 0.35;
      this.playerRightLeg.rotation.x = -0.25;
    } else {
      this.playerVisual.rotation.x = 0;
      if (isMoving) {
        const swing = Math.sin(this.walkCycle);
        this.playerLeftLeg.rotation.x = swing * 0.65;
        this.playerRightLeg.rotation.x = -swing * 0.65;
        this.playerLeftArm.rotation.x = -swing * 0.55;
        this.playerRightArm.rotation.x = swing * 0.55;
        this.playerVisual.position.y = Math.abs(Math.cos(this.walkCycle)) * 0.09;
      } else {
        this.playerLeftLeg.rotation.x *= 0.8;
        this.playerRightLeg.rotation.x *= 0.8;
        this.playerLeftArm.rotation.x *= 0.8;
        this.playerRightArm.rotation.x *= 0.8;
        this.playerVisual.position.y = Math.sin(this.elapsedTime * 2.6) * 0.025;
      }
    }
  }

  /** 海边钓鱼浮标与咬钩状态机 */
  private updateFishingPhysics(dt: number) {
    if (this.jumpingFishProgress > 0) {
      this.jumpingFishProgress += dt * 1.4;
      if (this.jumpingFishProgress >= 1) {
        this.jumpingFishProgress = 0;
        this.jumpingFish.visible = false;
      } else {
        const p = this.jumpingFishProgress;
        const arcY = Math.sin(p * Math.PI) * 3.1;
        this.jumpingFish.position.set(
          this.playerX,
          -0.2 + arcY,
          this.playerZ + 4.4 * (1 - p) + 0.5,
        );
        this.jumpingFish.rotation.x = -Math.PI * 0.4 + p * Math.PI * 1.4;
      }
    }

    if (this.playerActivity !== "fishing") return;
    this.fishingTimer += dt;

    if (this.fishingPhase === "casting" && this.fishingTimer > 0.55) {
      this.fishingPhase = "waiting";
      this.callbacks.onFishingPhaseChange("waiting");
    } else if (this.fishingPhase === "waiting" && this.fishingTimer >= this.fishingBiteAt) {
      this.fishingPhase = "biting";
      this.callbacks.onFishingPhaseChange("biting");
    } else if (this.fishingPhase === "biting" && this.fishingTimer >= this.fishingBiteDeadline) {
      this.fishingPhase = "missed";
      this.bobberMesh.visible = false;
      this.fishingLine.visible = false;
      this.callbacks.onFishingPhaseChange("missed");
    }

    if (this.bobberMesh.visible) {
      const waveY = Math.sin(this.elapsedTime * 3.1) * 0.08;
      const biteDip =
        this.fishingPhase === "biting" ? -0.26 + Math.sin(this.elapsedTime * 28) * 0.14 : 0;
      this.bobberMesh.position.set(this.playerX, -0.34 + waveY + biteDip, this.playerZ + 4.4);

      // 更新鱼线两端顶点（竿尖 → 浮标）
      const rodTip = new THREE.Vector3(0, 2.7, 0);
      this.fishingRodGroup.localToWorld(rodTip);
      const posAttr = this.fishingLine.geometry.attributes.position as THREE.BufferAttribute;
      posAttr.setXYZ(0, rodTip.x, rodTip.y, rodTip.z);
      posAttr.setXYZ(
        1,
        this.bobberMesh.position.x,
        this.bobberMesh.position.y + 0.12,
        this.bobberMesh.position.z,
      );
      posAttr.needsUpdate = true;
    }
  }

  /** 检测角色身边最近的可交互物体，并移动地面高亮光环 */
  private updateNearbyInteractable() {
    let closest: WorldInteractable | null = null;
    let closestDist = Infinity;

    for (const item of this.interactableMap.values()) {
      const dist = Math.hypot(this.playerX - item.worldX, this.playerZ - item.worldZ);
      if (dist <= item.radius && dist < closestDist) {
        closest = item;
        closestDist = dist;
      }
    }

    const nextId = closest?.id ?? null;
    if (nextId !== this.nearbyId) {
      this.nearbyId = nextId;
      this.callbacks.onNearbyChange(closest);
    }

    const focusItem =
      this.playerActivity === "fishing"
        ? null
        : ((this.hoveredId ? this.interactableMap.get(this.hoveredId) : null) ?? closest);
    if (focusItem) {
      this.highlightRing.visible = true;
      this.highlightRing.position.set(focusItem.worldX, focusItem.worldY + 0.04, focusItem.worldZ);
      const pulse = 1 + Math.sin(this.elapsedTime * 5) * 0.07;
      this.highlightRing.scale.setScalar(pulse);
    } else {
      this.highlightRing.visible = false;
    }
  }

  /** 海浪、漂浮云朵、咖啡热气、摇曳树冠与所有 Agent 小助手的实时动画 */
  private updateAmbientAnimations(dt: number) {
    const t = this.elapsedTime;

    // 1. 动态低模海浪起伏
    const pos = this.oceanGeo.attributes.position as THREE.BufferAttribute;
    const base = this.oceanBasePos;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3]!;
      const bz = base[i * 3 + 2]!;
      const wave = Math.sin(bx * 0.11 + t * 1.4) * 0.16 + Math.cos(bz * 0.13 + t * 1.1) * 0.14;
      pos.setY(i, wave);
    }
    pos.needsUpdate = true;

    // 2. 泳池轻波与甜甜圈泳圈漂浮
    this.poolWaterMesh.position.y = 0.19 + Math.sin(t * 2.2) * 0.018;
    this.floatRing.position.y = 0.25 + Math.sin(t * 2.1) * 0.03;
    this.floatRing.rotation.z = t * 0.25;

    // 3. 蓬松白云缓缓飘过天空
    for (const cloud of this.cloudsGroup.children) {
      cloud.position.x += dt * 0.55;
      if (cloud.position.x > 65) cloud.position.x = -65;
    }

    // 4. 海风轻拂椰子树与花树
    this.treesToSway.forEach((tree, i) => {
      tree.rotation.z = Math.sin(t * 1.3 + i * 1.1) * 0.03;
    });

    // 5. 咖啡杯袅袅热气
    for (const puff of this.steamPuffs) {
      const phase = (t * 0.7 + (puff.userData.phase as number)) % 1;
      puff.position.y = 1.34 + phase * 0.62;
      puff.position.x = 1.32 + Math.sin(t * 3 + phase * 6) * 0.04;
      puff.scale.setScalar(0.6 + phase * 0.9);
    }

    // 5.5 天花板垂吊用量牌微风轻摆动画
    if (this.hangingUsageSignPivot) {
      this.hangingUsageSignPivot.rotation.x = Math.sin(t * 1.05) * 0.018;
      this.hangingUsageSignPivot.rotation.z = Math.cos(t * 0.78) * 0.01;
    }

    // 6. 房间内每个项目专属小助手根据该项目实时状态生动演出
    this.agentVisuals.forEach((vis, idx) => {
      const status = vis.project.status;
      const offset = idx * 0.9;
      if (status === "running") {
        // 疯狂敲键盘写代码 + 天线强呼吸灯
        vis.robotGroup.position.y = 0.2 + Math.abs(Math.sin(t * 9 + offset)) * 0.06;
        vis.leftArm.rotation.x = 0.8 + Math.sin(t * 18 + offset) * 0.35;
        vis.rightArm.rotation.x = 0.8 - Math.sin(t * 18 + offset) * 0.35;
        vis.antennaMat.emissiveIntensity = 1.1 + Math.sin(t * 8 + offset) * 0.7;
        vis.alertRing.scale.setScalar(1 + Math.sin(t * 6 + offset) * 0.1);
      } else if (status === "waiting") {
        // 高举双手左右挥舞提醒你审批/回复！
        vis.robotGroup.position.y = 0.2 + Math.abs(Math.sin(t * 5 + offset)) * 0.14;
        vis.leftArm.rotation.x = -2.4 + Math.sin(t * 10) * 0.25;
        vis.rightArm.rotation.x = -2.4 - Math.sin(t * 10) * 0.25;
        vis.antennaMat.emissiveIntensity = 1.6 + Math.sin(t * 12) * 0.8;
        vis.alertRing.scale.setScalar(1.06 + Math.sin(t * 9) * 0.14);
      } else if (status === "completed") {
        // 悠闲晃动庆祝完工
        vis.robotGroup.position.y = 0.2 + Math.sin(t * 3 + offset) * 0.04;
        vis.leftArm.rotation.x = 0.4 + Math.sin(t * 3 + offset) * 0.15;
        vis.rightArm.rotation.x = 0.4 - Math.sin(t * 3 + offset) * 0.15;
        vis.antennaMat.emissiveIntensity = 0.8;
      } else if (status === "error") {
        // 焦急摇头红灯闪烁
        vis.robotGroup.rotation.y = Math.sin(t * 14) * 0.25;
        vis.antennaMat.emissiveIntensity = 1.4 + Math.sin(t * 16) * 0.9;
      } else {
        vis.robotGroup.position.y = 0.2 + Math.sin(t * 2 + offset) * 0.025;
      }
    });
  }

  /** 将 3D 空间锚点实时投影到屏幕坐标，直接更新原生 DOM 液态玻璃标牌（零 React 重渲染，60fps 丝滑跟随） */
  private updateFloatingLabelPositions() {
    if (!this.inputEnabled || this.floatingLabelElements.size === 0) return;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (width <= 0 || height <= 0) return;

    this.camera.updateMatrixWorld();
    const camPos = this.camera.position;
    const fadeStart = 22;
    const fadeRange = 8;

    const projectAnchor = (id: string, anchor: THREE.Vector3, hiddenByActivity: boolean) => {
      const el = this.floatingLabelElements.get(id);
      if (!el) return;

      if (hiddenByActivity) {
        if (this.floatingLabelStyleCache.get(id) !== "hidden") {
          this.floatingLabelStyleCache.set(id, "hidden");
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
        }
        return;
      }

      const dist = camPos.distanceTo(anchor);
      const opacity = Math.max(0, Math.min(1, 1 - (dist - fadeStart) / fadeRange));
      if (opacity <= 0.01) {
        if (this.floatingLabelStyleCache.get(id) !== "hidden") {
          this.floatingLabelStyleCache.set(id, "hidden");
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
        }
        return;
      }

      this.tempLabelWorldPos.copy(anchor).project(this.camera);
      const nx = this.tempLabelWorldPos.x;
      const ny = this.tempLabelWorldPos.y;
      const nz = this.tempLabelWorldPos.z;

      // 在相机背面或视口外较远处直接隐藏
      if (nz < -1 || nz > 1 || nx < -1.25 || nx > 1.25 || ny < -1.25 || ny > 1.25) {
        if (this.floatingLabelStyleCache.get(id) !== "hidden") {
          this.floatingLabelStyleCache.set(id, "hidden");
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
        }
        return;
      }

      const sx = (nx * 0.5 + 0.5) * width;
      const sy = (-ny * 0.5 + 0.5) * height;
      const scale = Math.max(0.76, Math.min(1.04, 13.4 / Math.max(8, dist)));
      const zIndex = Math.max(1, Math.round(1000 - dist * 10));
      const key = `${sx.toFixed(1)}:${sy.toFixed(1)}:${scale.toFixed(2)}:${opacity.toFixed(2)}:${zIndex}`;

      if (this.floatingLabelStyleCache.get(id) === key) return;
      this.floatingLabelStyleCache.set(id, key);
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(2);
      el.style.zIndex = String(zIndex);
      el.style.pointerEvents = "auto";
    };

    for (const item of this.staticLabelAnchors) {
      const hidden = this.playerActivity === "fishing" && item.id === "fishing-dock";
      projectAnchor(item.id, item.anchor, hidden);
    }
    for (const item of this.projectLabelAnchors) {
      projectAnchor(item.id, item.anchor, false);
    }
  }

  /** 第三人称弹簧阻尼相机跟踪（柔和跟随草坡与跳跃高度） */
  private updateCameraSmooth(dt: number) {
    const baseHeight = this.playerActivity === "swimming" ? 0.55 : this.playerY + 1.28;
    const desiredTarget = new THREE.Vector3(
      this.playerX,
      baseHeight,
      this.playerZ + (this.playerActivity === "fishing" ? 1.8 : 0),
    );
    this.currentCameraLookAt.lerp(desiredTarget, Math.min(1, dt * 8.5));

    const dist =
      this.playerActivity === "fishing" ? Math.max(9.5, this.cameraDistance) : this.cameraDistance;
    const horiz = Math.cos(this.cameraPitch) * dist;
    const vert = Math.sin(this.cameraPitch) * dist;
    const desiredCamPos = new THREE.Vector3(
      this.currentCameraLookAt.x + Math.sin(this.cameraYaw) * horiz,
      this.currentCameraLookAt.y + vert,
      this.currentCameraLookAt.z + Math.cos(this.cameraYaw) * horiz,
    );
    this.camera.position.lerp(desiredCamPos, Math.min(1, dt * 9.5));
    this.camera.lookAt(this.currentCameraLookAt);
  }

  private disposeObject3D(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Line ||
        child instanceof THREE.Points
      ) {
        child.geometry.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if ("map" in mat && mat.map instanceof THREE.Texture) mat.map.dispose();
          mat.dispose();
        }
      } else if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    });
  }

  /** 彻底清理 WebGL 资源与监听 */
  public dispose() {
    this.disposed = true;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stopObserveResize();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    const dom = this.renderer.domElement;
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("wheel", this.onWheel);
    dom.removeEventListener("contextmenu", this.onContextMenu);

    this.floatingLabelElements.clear();
    this.floatingLabelStyleCache.clear();
    this.deskMonitorTex.dispose();
    this.workingBoardTex.dispose();
    this.usageWallTex.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if ("map" in mat && mat.map instanceof THREE.Texture) mat.map.dispose();
          mat.dispose();
        }
      } else if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });
    this.renderer.dispose();
    dom.remove();
  }
}
