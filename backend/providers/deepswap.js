const DEEPSWAP_BASE_URL = 'https://api.deepswap.ai/fs';

// ======================================================
// CALLBACKS DE DEEPSWAP
// ======================================================
//
// DeepSwap puede marcar una tarea como SUCCEEDED antes de que
// GET /tasks/:id devuelva la URL final.
//
// La URL final llega mediante callbackUrl.
// Guardamos temporalmente el callback por taskId para que
// waitForDeepSwapTask() pueda recogerlo.
//
// Para nuestro Railway actual con una sola instancia funciona
// perfectamente. Si más adelante escalamos a varias instancias,
// lo pasaremos a Firestore/Redis.
//

const callbackStore = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getHeaders() {
  const apiKey = process.env.DEEPSWAP_API_KEY;

  if (!apiKey) {
    throw new Error('Falta DEEPSWAP_API_KEY');
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function deepswapRequest(path, options = {}) {
  const response = await fetch(
    `${DEEPSWAP_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        ...getHeaders(),
        ...(options.headers || {}),
      },
    }
  );

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `DeepSwap devolvió una respuesta no JSON (${response.status}): ${text}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `DeepSwap HTTP ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

// ======================================================
// BUSCAR IDs
// ======================================================

function findTaskId(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const direct =
    value.taskId ??
    value.task_id ??
    value.id ??
    value?.data?.taskId ??
    value?.data?.task_id ??
    value?.data?.id;

  if (direct !== undefined && direct !== null) {
    return String(direct);
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      const found = findTaskId(child);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

// ======================================================
// BUSCAR URL FINAL
// ======================================================

function looksLikeHttpUrl(value) {
  return (
    typeof value === 'string' &&
    /^https?:\/\//i.test(value)
  );
}

function findPreferredResultUrl(obj) {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  // Primero buscamos los nombres más probables.
  const preferredKeys = [
    'resultUrl',
    'result_url',
    'outputUrl',
    'output_url',
    'imageUrl',
    'image_url',
    'videoUrl',
    'video_url',
    'downloadUrl',
    'download_url',
    'fileUrl',
    'file_url',
  ];

  for (const key of preferredKeys) {
    const value = obj[key];

    if (looksLikeHttpUrl(value)) {
      return value;
    }
  }

  // Resultados dentro de arrays.
  const possibleArrays = [
    obj.results,
    obj.outputs,
    obj.files,
    obj.imageUrls,
    obj.videoUrls,
    obj.urls,
  ];

  for (const array of possibleArrays) {
    if (!Array.isArray(array)) {
      continue;
    }

    for (const item of array) {
      if (looksLikeHttpUrl(item)) {
        return item;
      }

      if (item && typeof item === 'object') {
        const nested =
          findPreferredResultUrl(item);

        if (nested) {
          return nested;
        }
      }
    }
  }

  // Después recorremos objetos anidados.
  for (const [key, value] of Object.entries(obj)) {
    if (
      value &&
      typeof value === 'object'
    ) {
      const nested =
        findPreferredResultUrl(value);

      if (nested) {
        return nested;
      }
    }

    // Usamos "url" genérico solo si el nombre del campo
    // parece relacionado con un resultado.
    if (
      looksLikeHttpUrl(value) &&
      /(result|output|image|video|download|file)/i.test(
        key
      )
    ) {
      return value;
    }
  }

  return null;
}

export function getDeepSwapResultUrl(data) {
  return findPreferredResultUrl(data);
}

// ======================================================
// GUARDAR CALLBACK
// ======================================================

export function saveDeepSwapCallback(payload) {
  const taskId = findTaskId(payload);

  console.log(
    'DeepSwap callback taskId detectado:',
    taskId
  );

  console.log(
    'DeepSwap callback payload completo:',
    JSON.stringify(payload, null, 2)
  );

  if (!taskId) {
    console.log(
      'DeepSwap callback sin taskId reconocible'
    );

    return null;
  }

  callbackStore.set(
    String(taskId),
    {
      payload,
      receivedAt: Date.now(),
    }
  );

  // Limpiar callbacks antiguos.
  const maxAge =
    30 * 60 * 1000;

  const now = Date.now();

  for (
    const [storedTaskId, entry]
    of callbackStore.entries()
  ) {
    if (
      now - entry.receivedAt >
      maxAge
    ) {
      callbackStore.delete(
        storedTaskId
      );
    }
  }

  return String(taskId);
}

function getStoredCallback(taskId) {
  const entry =
    callbackStore.get(
      String(taskId)
    );

  return entry?.payload || null;
}

function consumeStoredCallback(taskId) {
  const key = String(taskId);

  const entry =
    callbackStore.get(key);

  if (entry) {
    callbackStore.delete(key);
  }

  return entry?.payload || null;
}

// ======================================================
// MATERIAL
// ======================================================

export async function createDeepSwapMaterial(
  url
) {
  return deepswapRequest(
    '/openapi/v1/face-swap/materials',
    {
      method: 'POST',
      body: JSON.stringify({
        url,
      }),
    }
  );
}

export async function getDeepSwapMaterial(
  materialId
) {
  return deepswapRequest(
    `/openapi/v1/face-swap/materials/${materialId}`,
    {
      method: 'GET',
    }
  );
}

export async function waitForDeepSwapMaterial(
  materialId,
  {
    attempts = 60,
    delayMs = 2000,
  } = {}
) {
  for (
    let attempt = 1;
    attempt <= attempts;
    attempt++
  ) {
    const material =
      await getDeepSwapMaterial(
        materialId
      );

    console.log(
      `DeepSwap material ${materialId}: ${material.status} (${attempt}/${attempts})`
    );

    if (
      material.status ===
      'SUCCEEDED'
    ) {
      return material;
    }

    if (
      material.status ===
      'FAILED'
    ) {
      throw new Error(
        `DeepSwap material falló: ${material.errorCode || ''} ${material.errorMsg || ''}`
      );
    }

    await sleep(delayMs);
  }

  throw new Error(
    'Timeout esperando el material de DeepSwap'
  );
}

// ======================================================
// CREAR TAREA
// ======================================================

export async function createDeepSwapTask({
  materialId,
  sourceFaceId,
  targetFaceUrl,
  model = 'shapefusion1.0-fs',
  faceEnhance = true,
}) {
  return deepswapRequest(
    '/openapi/v1/face-swap/tasks',
    {
      method: 'POST',
      body: JSON.stringify({
        model,
        materialId,
        faceMappings: [
          {
            sourceFaceId,
            targetFaceUrl,
          },
        ],
        faceEnhance,

        callbackUrl:
          'https://reelswapai-production.up.railway.app/deepswap-callback',
      }),
    }
  );
}

// ======================================================
// CONSULTAR TAREA
// ======================================================

export async function getDeepSwapTask(
  taskId
) {
  return deepswapRequest(
    `/openapi/v1/tasks/${taskId}`,
    {
      method: 'GET',
    }
  );
}

// ======================================================
// ESPERAR CALLBACK
// ======================================================

async function waitForDeepSwapCallback(
  taskId,
  {
    attempts = 20,
    delayMs = 1000,
  } = {}
) {
  for (
    let attempt = 1;
    attempt <= attempts;
    attempt++
  ) {
    const callback =
      getStoredCallback(taskId);

    if (callback) {
      const url =
        getDeepSwapResultUrl(
          callback
        );

      console.log(
        `DeepSwap callback encontrado para ${taskId} (${attempt}/${attempts})`
      );

      console.log(
        'URL detectada en callback:',
        url
      );

      if (url) {
        consumeStoredCallback(
          taskId
        );

        return {
          ...callback,

          taskId:
            String(taskId),

          resultUrl:
            url,

          imageUrl:
            url,

          videoUrl:
            url,

          callbackPayload:
            callback,
        };
      }
    }

    await sleep(delayMs);
  }

  return null;
}

// ======================================================
// ESPERAR TAREA
// ======================================================

export async function waitForDeepSwapTask(
  taskId,
  {
    attempts = 90,
    delayMs = 2000,
  } = {}
) {
  for (
    let attempt = 1;
    attempt <= attempts;
    attempt++
  ) {
    const task =
      await getDeepSwapTask(
        taskId
      );

    console.log(
      `DeepSwap task ${taskId}: ${task.taskStatus} (${attempt}/${attempts})`
    );

    // A veces podría venir la URL directamente.
    const directUrl =
      getDeepSwapResultUrl(
        task
      );

    if (directUrl) {
      console.log(
        'DeepSwap URL encontrada directamente:',
        directUrl
      );

      return {
        ...task,
        resultUrl:
          directUrl,
        imageUrl:
          directUrl,
        videoUrl:
          directUrl,
      };
    }

    if (
      task.taskStatus ===
      'SUCCEEDED'
    ) {
      console.log(
        'DeepSwap tarea SUCCEEDED. Esperando callback con resultado...'
      );

      const callbackResult =
        await waitForDeepSwapCallback(
          taskId
        );

      if (callbackResult) {
        return {
          ...task,
          ...callbackResult,
        };
      }

      // Si todavía no llegó el callback,
      // continuamos unos ciclos más en vez
      // de devolver el task vacío.
      console.log(
        'Todavía no hay URL de resultado. Seguimos esperando...'
      );
    }

    if (
      task.taskStatus ===
      'FAILED'
    ) {
      throw new Error(
        `DeepSwap task falló: ${task.errorCode || ''} ${task.errorMsg || ''}`
      );
    }

    await sleep(delayMs);
  }

  throw new Error(
    'Timeout esperando resultado final de DeepSwap'
  );
}
export async function getDeepSwapFaceSwapTask(taskId) {
  return deepswapRequest(
    `/openapi/v1/face-swap/tasks/${taskId}`,
    {
      method: 'GET',
    }
  );
}