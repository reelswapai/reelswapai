import { chromium } from 'playwright';

const HISTORY_URL =
  'https://www.deepswap.ai/es/my/history/face-swap/creations';

function getChromiumPath() {
  return (
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    '/usr/bin/chromium'
  );
}

function getDeepSwapCookies() {
  const accessToken =
    process.env.DEEPSWAP_ACCESS_TOKEN;

  const userIdentity =
    process.env.DEEPSWAP_USER_IDENTITY;

  const deviceId =
    process.env.DEEPSWAP_DEVICE_ID;

  if (!accessToken) {
    throw new Error('Falta DEEPSWAP_ACCESS_TOKEN');
  }

  if (!userIdentity) {
    throw new Error('Falta DEEPSWAP_USER_IDENTITY');
  }

  if (!deviceId) {
    throw new Error('Falta DEEPSWAP_DEVICE_ID');
  }

  return [
    {
      name: 'access_token',
      value: accessToken,
      domain: '.deepswap.ai',
      path: '/',
      secure: true,
      sameSite: 'Lax',
    },
    {
      name: 'user_identity',
      value: userIdentity,
      domain: '.deepswap.ai',
      path: '/',
      secure: true,
      sameSite: 'Lax',
    },
    {
      name: 'x-device-id',
      value: deviceId,
      domain: '.deepswap.ai',
      path: '/',
      secure: true,
      sameSite: 'Lax',
    },
  ];
}

function isOssUrl(url) {
  return (
    typeof url === 'string' &&
    url.includes(
      'oss-accelerate-overseas.aliyuncs.com'
    )
  );
}

function matchesResult(url, taskId, materialId) {
  if (!isOssUrl(url)) return false;

  if (
    taskId &&
    !url.includes(`/${taskId}/`)
  ) {
    return false;
  }

  if (
    materialId &&
    !url.includes(String(materialId))
  ) {
    return false;
  }

  return true;
}

async function getOssLinks(page) {
  return page.evaluate(() => {
    const urls = new Set();

    const elements =
      document.querySelectorAll(
        'a[href], img[src], video[src], source[src]'
      );

    for (const element of elements) {
      const url =
        element.href ||
        element.src;

      if (
        typeof url === 'string' &&
        url.includes(
          'oss-accelerate-overseas.aliyuncs.com'
        )
      ) {
        urls.add(url);
      }
    }

    return [...urls];
  });
}

async function findResultOnPage(
  page,
  taskId,
  materialId
) {
  const links =
    await getOssLinks(page);

  console.log(
    'Enlaces OSS encontrados:',
    links.length
  );

  const exact =
    links.find((url) =>
      matchesResult(
        url,
        taskId,
        materialId
      )
    );

  if (exact) {
    return exact;
  }

  const byTask =
    links.find(
      (url) =>
        isOssUrl(url) &&
        taskId &&
        url.includes(`/${taskId}/`)
    );

  return byTask || null;
}

async function getPossibleResultPages(page) {
  const links =
    await page
      .locator('a[href]')
      .evaluateAll(
        (elements) =>
          elements
            .map(
              (element) =>
                element.href
            )
            .filter(Boolean)
      );

  const unique =
    [...new Set(links)];

  return unique.filter(
    (url) =>
      url.includes('deepswap.ai') &&
      (
        url.includes('/result') ||
        url.includes('/history') ||
        url.includes('/face-swap')
      )
  );
}

export async function findDeepSwapDownloadUrl({
  taskId,
  materialId,
  timeoutMs = 120000,
}) {
  console.log(
    'Iniciando fallback web DeepSwap'
  );

  console.log('taskId:', taskId);
  console.log('materialId:', materialId);

  const browser =
    await chromium.launch({
      headless: true,
      executablePath:
        getChromiumPath(),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

  try {
    const context =
      await browser.newContext({
        viewport: {
          width: 1440,
          height: 1000,
        },
      });

    await context.addCookies(
      getDeepSwapCookies()
    );

    const page =
      await context.newPage();

    page.on(
      'response',
      (response) => {
        const url =
          response.url();

        if (isOssUrl(url)) {
          console.log(
            'OSS detectado en red:',
            url
          );
        }
      }
    );

    console.log(
      'Abriendo historial DeepSwap...'
    );

    await page.goto(
      HISTORY_URL,
      {
        waitUntil:
          'domcontentloaded',
        timeout: 60000,
      }
    );

    await page.waitForTimeout(3000);

    console.log(
      'URL actual DeepSwap:',
      page.url()
    );

    if (
      page.url().includes('/login')
    ) {
      throw new Error(
        'La sesión web de DeepSwap no es válida'
      );
    }

    let resultUrl =
      await findResultOnPage(
        page,
        taskId,
        materialId
      );

    if (resultUrl) {
      console.log(
        'URL DeepSwap encontrada:',
        resultUrl
      );

      return resultUrl;
    }

    const resultPages =
      await getPossibleResultPages(
        page
      );

    console.log(
      'Páginas candidatas:',
      resultPages.length
    );

    for (
      const url
      of resultPages.slice(0, 30)
    ) {
      try {
        await page.goto(
          url,
          {
            waitUntil:
              'domcontentloaded',
            timeout: 30000,
          }
        );

        await page.waitForTimeout(
          1500
        );

        resultUrl =
          await findResultOnPage(
            page,
            taskId,
            materialId
          );

        if (resultUrl) {
          console.log(
            'URL DeepSwap encontrada en detalle:',
            resultUrl
          );

          return resultUrl;
        }
      } catch (error) {
        console.log(
          'Error revisando página:',
          error?.message || error
        );
      }
    }

    const deadline =
      Date.now() + timeoutMs;

    while (
      Date.now() < deadline
    ) {
      console.log(
        'Esperando enlace OSS en DeepSwap...'
      );

      await page.goto(
        HISTORY_URL,
        {
          waitUntil:
            'domcontentloaded',
          timeout: 60000,
        }
      );

      await page.waitForTimeout(
        3000
      );

      resultUrl =
        await findResultOnPage(
          page,
          taskId,
          materialId
        );

      if (resultUrl) {
        console.log(
          'URL encontrada tras refrescar:',
          resultUrl
        );

        return resultUrl;
      }

      const pages =
        await getPossibleResultPages(
          page
        );

      for (
        const url
        of pages.slice(0, 10)
      ) {
        try {
          await page.goto(
            url,
            {
              waitUntil:
                'domcontentloaded',
              timeout: 30000,
            }
          );

          await page.waitForTimeout(
            1000
          );

          resultUrl =
            await findResultOnPage(
              page,
              taskId,
              materialId
            );

          if (resultUrl) {
            console.log(
              'URL DeepSwap FINAL encontrada:',
              resultUrl
            );

            return resultUrl;
          }
        } catch {
          // seguimos
        }
      }

      await page.waitForTimeout(
        5000
      );
    }

    throw new Error(
      `No se encontró la descarga web para taskId ${taskId}`
    );
  } finally {
    await browser.close();

    console.log(
      'Chromium DeepSwap cerrado'
    );
  }
}
