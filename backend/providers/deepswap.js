const DEEPSWAP_BASE_URL = 'https://api.deepswap.ai/fs';

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
  const response = await fetch(`${DEEPSWAP_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });

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

export async function createDeepSwapMaterial(url) {
  return deepswapRequest('/openapi/v1/face-swap/materials', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
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

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Timeout esperando el material de DeepSwap');
}

export async function createDeepSwapTask({
  materialId,
  sourceFaceId,
  targetFaceUrl,
  model = 'shapefusion1.0-fs',
  faceEnhance = true,
}) {
  return deepswapRequest('/openapi/v1/face-swap/tasks', {
    method: 'POST',
    body: JSON.stringify({
      model,
      materialId: Number(materialId),
      faceMappings: [
        {
          sourceFaceId: Number(sourceFaceId),
          targetFaceUrl,
        },
      ],
      faceEnhance,
    }),
  });
}

export async function getDeepSwapTask(taskId) {
  return deepswapRequest(`/openapi/v1/tasks/${taskId}`, {
    method: 'GET',
  });
}

export async function waitForDeepSwapTask(
  taskId,
  { attempts = 90, delayMs = 2000 } = {}
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const task = await getDeepSwapTask(taskId);

    console.log(
      `DeepSwap task ${taskId}: ${task.taskStatus} (${attempt}/${attempts})`
    );

    if (task.taskStatus === 'SUCCEEDED') {
      return task;
    }

    if (task.taskStatus === 'FAILED') {
      throw new Error(
        `DeepSwap task falló: ${task.errorCode || ''} ${task.errorMsg || ''}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Timeout esperando la tarea de DeepSwap');
}