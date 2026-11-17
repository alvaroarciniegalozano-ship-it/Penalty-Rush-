// ============================================================================
//  PENALTY RUSH - configuración global
//  Unidades: 1 unidad Three.js = 1 metro.
//  Sistema lógico: X = lateral (derecha +), Y = altura, Z = profundidad.
//  Línea de gol: Z = 0 (centro de la portería X = 0). El jugador está en +Z
//  mirando hacia -Z. La red de la portería se extiende hacia -Z.
// ============================================================================

export const MODEL_PATHS = {
  stadium: 'assets/models/stadium.glb', // PIA REALIDAD VIRTUAL.glb
  keeper: 'assets/models/keeper.glb',   // PORTERO.glb
  ball: 'assets/models/ball.glb',       // BALÓN.glb
  limbs: 'assets/models/limbs.glb',     // Brazos y piernas.glb
};

// Referencias reales pedidas
export const REF = {
  GOAL_W: 7.32,
  GOAL_H: 2.44,
  KEEPER_H: 1.85,
  BALL_D: 0.22,
  EYE_H: 1.65,
  PENALTY_DIST: 11,
};

// ---------------------------------------------------------------------------
//  Medidas del escenario original (unidades del GLB, ejes del GLB).
//  Obtenidas con tools/inspect-glb.mjs y análisis de vértices:
//   - La portería (nodo "Plane") abre hacia +X del GLB.
//   - El marco frontal (línea de gol) está en x = -5.355.
//   - Postes: z ∈ [-8.442,-8.211] y [0.882,1.101]; larguero y ∈ [3.695,3.884].
//   - Red trasera en x = -8.373. Suelo (césped) en y = 0.4848.
//  Estos valores se verifican en tiempo de ejecución contra el Box3 real.
// ---------------------------------------------------------------------------
export const STADIUM_SRC = {
  goalLineX: -5.355,
  innerZMin: -8.211,
  innerZMax: 0.882,
  outerZMin: -8.442,
  outerZMax: 1.101,
  crossbarBottomY: 3.695,
  crossbarTopY: 3.884,
  netBackX: -8.373,
  netTopY: 3.80,
  groundY: 0.4848,
};

// ---------------------------------------------------------------------------
//  Medidas de los modelos del portero y de las extremidades (unidades GLB).
//  Ambos miran hacia -Z del GLB (las puntas de las botas apuntan a -Z).
// ---------------------------------------------------------------------------
export const KEEPER_SRC = {
  centerX: 0.7145,
  waistY: 2.2,            // pivote de cintura / giro de la estirada
  minY: -0.043,           // suela
  // grupos de piezas (nombres originales del GLB)
  parts: {
    core: ['Plane', 'Cube', 'Plane.002'],        // camiseta, cabeza, pantalón
    armA: ['Plane.001', 'Plane.007'],            // brazo + guante lado +X del GLB
    armB: ['Plane.009', 'Plane.010'],            // brazo + guante lado -X del GLB
    legA: ['Plane.003', 'Plane.004', 'Plane.011'],
    legB: ['Plane.005', 'Plane.006', 'Plane.013'],
  },
  shoulderA: [1.192, 2.967, 0.051],
  shoulderB: [0.214, 2.967, -0.029],
  hipA: [0.915, 1.2, 0.01],
  hipB: [0.5145, 1.2, 0.01],
};

export const LIMBS_SRC = {
  parts: {
    armR: ['Plane.008'],
    armL: ['Plane.001'],
    legL: ['Plane.021', 'Plane.020', 'Plane.018'],
    footL: ['Plane.019'],
    legR: ['Plane.017', 'Plane.016', 'Plane.014'],
    footR: ['Plane.015'],
  },
  shoulderR: [2.232, 3.008, 0.078],
  shoulderL: [0.952, 3.008, 0.078],
  kneeL: [1.409, 1.214, 0.01],
  kneeR: [1.775, 1.214, 0.01],
  ankleL: [1.419, 0.256, 0.006],
  ankleR: [1.765, 0.256, 0.006],
};

// ---------------------------------------------------------------------------
//  Cámara POV
// ---------------------------------------------------------------------------
export const CAMERA = {
  fov: 66,
  near: 0.05,
  far: 400,
  pitchDeg: -15,      // inclinación base hacia el suelo
  backFromBall: 2.0,  // metros detrás del balón
  lookYawDeg: 3.0,    // giro máximo de "mirada" hacia el cursor
  lookPitchDeg: 2.0,
};

// Pose de reposo y de patada de las extremidades, en espacio de cámara.
export const POV = {
  // [x, y, z] del pivote (rodilla / hombro) en espacio de cámara; ángulos en grados
  legL: { pos: [-0.28, -0.24, -0.30], tilt: 70, yaw: -5, foot: -50 },
  legR: { pos: [0.28, -0.24, -0.30], tilt: 70, yaw: 5, foot: -50 },
  armL: { pos: [-0.74, -0.25, -0.12], tilt: 80, yaw: -24, roll: 0 },
  armR: { pos: [0.74, -0.25, -0.12], tilt: 80, yaw: 24, roll: 0 },
};

// ---------------------------------------------------------------------------
//  Disparo
// ---------------------------------------------------------------------------
export const SHOT = {
  minSpeed: 14,      // m/s con potencia mínima
  maxSpeed: 31,      // m/s con potencia máxima
  chargeTime: 1.35,  // segundos para llegar de 0 a 100 %
  minPower: 0.12,
  scatterStart: 0.72, // a partir de aquí la precisión empeora
  scatterMax: 0.55,   // metros de desviación (σ) con potencia 100 %
  aimMarginX: 2.6,    // margen lateral más allá de los postes que se puede apuntar
  aimMarginY: 1.5,    // margen por encima del larguero
  windup: 0.30,       // s entre soltar el clic y el golpe
  recoil: 0.18,
};

export const LEVELS = [
  {
    id: 1, key: 'training', name: 'ENTRENAMIENTO', short: 'Nivel 1', attempts: 10, keeper: false,
    blurb: 'Portería libre. Practica la puntería y la potencia.',
  },
  {
    id: 2, key: 'intermediate', name: 'INTERMEDIO', short: 'Nivel 2', attempts: 5, keeper: true,
    blurb: 'Un portero lento y algo torpe defiende la portería.',
  },
  {
    id: 3, key: 'pro', name: 'PROFESIONAL', short: 'Nivel 3', attempts: 5, keeper: true,
    blurb: 'Un portero de élite: rápido, anticipa y se lanza a ambos lados.',
  },
];

// Parámetros de IA del portero por nivel (ver keeperCore.js)
export const KEEPER_AI = {
  2: {
    reactionMin: 0.30, reactionMax: 0.50,   // s tras el golpe hasta decidir
    obsSigmaX: 0.75, obsSigmaY: 0.55,       // ruido al estimar el punto de llegada
    wrongWayProb: 0.16,                      // se lanza al lado equivocado
    diveSpeed: 4.4,                          // m/s lateral medio de la estirada
    reach: 0.9,                             // fracción del alcance real que usa
    cueAccuracy: 0.0,                        // no lee el cuerpo del tirador
    cueLead: 0.0,
    idleAmp: 0.55, idlePeriod: [0.8, 1.5], idleSpeed: 1.3,
    stumbleProb: 0.18,                       // tropiezo: pierde tiempo extra
    prepTime: 0.7,
  },
  3: {
    reactionMin: 0.10, reactionMax: 0.17,
    obsSigmaX: 0.28, obsSigmaY: 0.30,
    wrongWayProb: 0.09,
    diveSpeed: 6.0,
    reach: 1.0,
    cueAccuracy: 0.34,                       // prob. de leer el lado del disparo
    cueLead: 0.16,                           // s antes del golpe empieza a moverse
    idleAmp: 0.85, idlePeriod: [0.5, 1.0], idleSpeed: 2.6,
    stumbleProb: 0.0,
    prepTime: 0.9,
  },
};

export const KEEPER_Z = 0.45; // m por delante de la línea de gol
