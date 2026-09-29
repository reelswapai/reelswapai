const DEEPSWAP_BASE_URL =
  'https://api.deepswap.ai/fs';

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

const callbackStore = new Map();

function findTaskId(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const direct =
    value.taskId ??
    value.task_id ??
    value?.data?.taskId ??
    value?.data?.task_id;

  if (direct !== undefined && direct !== null) {
    return String(direct);
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      const found = findTaskId(child);
      if (found) return found;
    }
  }

  return null;
}

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

  callbackStore.set(String(taskId), {
    payload,
    receivedAt: Date.now(),
  });

  const maxAge = 30 * 60 * 1000;
  const now = Date.now();

  for (const [storedTaskId, entry] of callbackStore.entries()) {
    if (now - entry.receivedAt > maxAge) {
      callbackStore.delete(storedTaskId);
    }
  }

  return String(taskId);
}

export async function createDeepSwapMaterial(url) {
  return deepswapRequest(
    '/openapi/v1/face-swap/materials',
    {
      method: 'POST',
      body: JSON.stringify({ url }),
    }
  );
}

export async function getDeepSwapMaterial(materialId) {
  return deepswapRequest(
    `/openapi/v1/face-swap/materials/${materialId}`,
    {
      method: 'GET',
    }
  );
}

export async function waitForDeepSwapMaterial(
  materialId,
  { attempts = 60, delayMs = 2000 } = {}
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const material = await getDeepSwapMaterial(materialId);

    console.log(
      `DeepSwap material ${materialId}: ${material.status} (${attempt}/${attempts})`
    );

    if (material.status === 'SUCCEEDED') {
      return material;
    }

    if (material.status === 'FAILED') {
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

export async function getDeepSwapTask(taskId) {
  return deepswapRequest(
    `/openapi/v1/tasks/${taskId}`,
    {
      method: 'GET',
    }
  );
}

function getTaskResultUrl(task) {
  if (!task) return null;

  if (
    typeof task.videoUrl === 'string' &&
    task.videoUrl.startsWith('http')
  ) {
    return task.videoUrl;
  }

  if (
    Array.isArray(task.imageUrls) &&
    task.imageUrls.length > 0
  ) {
    const firstImage = task.imageUrls[0];

    if (
      typeof firstImage === 'string' &&
      firstImage.startsWith('http')
    ) {
      return firstImage;
    }
  }

  return null;
}

export async function waitForDeepSwapTask(
  taskId,
  { attempts = 90, delayMs = 2000 } = {}
) {
  let succeededWithoutUrlCount = 0;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const task = await getDeepSwapTask(taskId);

    console.log(
      `DeepSwap task ${taskId}: ${task.taskStatus} (${attempt}/${attempts})`
    );

    const resultUrl = getTaskResultUrl(task);

    if (resultUrl) {
      console.log(
        'DeepSwap URL FINAL encontrada:',
        resultUrl
      );

      return {
        ...task,
        resultUrl,
        imageUrl: resultUrl,
        videoUrl: resultUrl,
      };
    }

    if (task.taskStatus === 'FAILED') {
      throw new Error(
        `DeepSwap task falló: ${task.errorCode || ''} ${task.errorMsg || ''}`
      );
    }

    if (task.taskStatus === 'SUCCEEDED') {
      succeededWithoutUrlCount++;

      console.log(
        `DeepSwap SUCCEEDED pero aún sin URL (${succeededWithoutUrlCount})`
      );

      if (succeededWithoutUrlCount >= 3) {
        console.log(
          'DeepSwap API sigue sin URL. Pasamos al fallback web.'
        );

        return task;
      }

      console.log(
        'Esperamos un poco más antes del fallback web...'
      );
    }

    await sleep(delayMs);
  }

  throw new Error(
    'Timeout esperando resultado final de DeepSwap'
  );
}
