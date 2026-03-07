import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { createRequire } from 'module'
import { existsSync, readFileSync } from 'fs'
import { createServer, Server } from 'http'
import { Builder, WebDriver, By, until, logging } from 'selenium-webdriver'

const require = createRequire(import.meta.url)

const __dirname = dirname(fileURLToPath(import.meta.url))
const APOLLO_ROOT = resolve(__dirname, '../../..')

const TEST_DATA_DIR =
  process.env.TEST_DATA_DIR ??
  resolve(__dirname, '../../../../jbrowse-components2/test_data/volvox')

const APOLLO_TEST_DATA = resolve(__dirname, '../test_data')

const isWindows = process.platform === 'win32'

const APP_BINARY =
  process.env.JBROWSE_DESKTOP_BINARY ??
  resolve(
    __dirname,
    isWindows
      ? '../../../../jbrowse-components2/products/jbrowse-desktop/dist/unpacked/jbrowse-desktop-win32-x64/jbrowse-desktop.exe'
      : '../../../../jbrowse-components2/products/jbrowse-desktop/dist/unpacked/jbrowse-desktop-linux-x64/jbrowse-desktop',
  )

const CHROMEDRIVER_PORT = 9515

const isHeadless =
  process.argv.includes('--headless') || process.env.HEADLESS === 'true'

const electronChromedriverDir = dirname(
  require.resolve('electron-chromedriver/package.json'),
)
const CHROMEDRIVER_PATH = join(
  electronChromedriverDir,
  'bin',
  isWindows ? 'chromedriver.exe' : 'chromedriver',
)

const PLUGIN_DIST_DIR = resolve(
  APOLLO_ROOT,
  'packages/jbrowse-plugin-apollo/dist',
)
const PLUGIN_SERVER_PORT = 9876

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let chromedriverProcess: ChildProcess | null = null
let driver: WebDriver | null = null
let pluginServer: Server | null = null

function startPluginServer() {
  return new Promise<void>((resolve) => {
    pluginServer = createServer((req, res) => {
      const filePath = join(PLUGIN_DIST_DIR, req.url ?? '/')
      try {
        const content = readFileSync(filePath)
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(content)
      } catch {
        res.writeHead(404)
        res.end('Not found')
      }
    })
    pluginServer.listen(PLUGIN_SERVER_PORT, () => {
      console.log(
        `Plugin server listening on http://localhost:${PLUGIN_SERVER_PORT}`,
      )
      resolve()
    })
  })
}

interface TestResult {
  name: string
  passed: boolean
  error?: string
  duration: number
}

const results: TestResult[] = []

async function startChromedriver() {
  return new Promise<void>((resolve, reject) => {
    console.log(`  Launching: ${CHROMEDRIVER_PATH}`)
    chromedriverProcess = spawn(
      CHROMEDRIVER_PATH,
      [`--port=${CHROMEDRIVER_PORT}`],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )

    chromedriverProcess.on('error', (err) => {
      console.error('  ChromeDriver spawn error:', err)
      reject(err)
    })

    chromedriverProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      console.log('  ChromeDriver stdout:', output.trim())
      if (output.includes('was started successfully')) {
        resolve()
      }
    })

    chromedriverProcess.stderr?.on('data', (data) => {
      console.log('  ChromeDriver stderr:', data.toString().trim())
    })

    setTimeout(resolve, 5000)
  })
}

async function createDriver() {
  const chromeArgs = ['--no-sandbox', '--disable-extensions']

  if (isHeadless) {
    chromeArgs.push(
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--force-device-scale-factor=1',
    )
  }

  const prefs = new logging.Preferences()
  prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL)

  const d = await new Builder()
    .usingServer(`http://localhost:${CHROMEDRIVER_PORT}`)
    .withCapabilities({
      'goog:chromeOptions': {
        binary: APP_BINARY,
        args: chromeArgs,
      },
      'goog:loggingPrefs': {
        browser: 'ALL',
      },
    })
    .setLoggingPrefs(prefs)
    .forBrowser('chrome')
    .build()

  await d.manage().setTimeouts({
    implicit: 500,
    pageLoad: 120000,
    script: 60000,
  })

  return d
}

async function flushBrowserLogs(d: WebDriver) {
  try {
    const logs = await d.manage().logs().get(logging.Type.BROWSER)
    for (const entry of logs) {
      console.log(`    [Browser ${entry.level.name}] ${entry.message}`)
    }
  } catch {
    // ignore
  }
}

function textContainsXPath(text: string, elementType = '*') {
  const lowerText = text.toLowerCase()
  return `//${elementType}[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${lowerText}')]`
}

async function findByText(d: WebDriver, text: string, timeout = 30000) {
  return d.wait(
    until.elementLocated(By.xpath(textContainsXPath(text))),
    timeout,
  )
}

async function clickButton(d: WebDriver, text: string, timeout = 10000) {
  const button = await d.wait(
    until.elementLocated(By.xpath(textContainsXPath(text, 'button'))),
    timeout,
  )
  await d.wait(until.elementIsVisible(button), timeout)
  await d.executeScript('arguments[0].click();', button)
}

async function waitForStartScreen(d: WebDriver, timeout = 30000) {
  await findByText(d, 'Launch new session', timeout)
}

async function waitForSessionLoad(d: WebDriver, timeout = 30000) {
  await d.wait(async () => {
    const launchBtns = await d.findElements(
      By.xpath("//button[contains(., 'Launch view')]"),
    )
    if (launchBtns.length > 0) {
      return true
    }
    const inputs = await d.findElements(
      By.css('input[placeholder="Search for location"]'),
    )
    return inputs.length > 0
  }, timeout)

  const launchBtns = await d.findElements(
    By.xpath("//button[contains(., 'Launch view')]"),
  )
  if (launchBtns.length > 0) {
    await launchBtns[0].click()
  }

  return d.wait(
    until.elementLocated(By.css('input[placeholder="Search for location"]')),
    timeout,
  )
}

async function navigateToRegion(d: WebDriver, region: string) {
  const searchInput = await d.findElement(
    By.css('input[placeholder="Search for location"]'),
  )
  await searchInput.click()
  await d.actions().keyDown('\uE009').sendKeys('a').keyUp('\uE009').perform()
  await d.actions().sendKeys('\uE017').perform()
  await searchInput.sendKeys(region)
  await searchInput.sendKeys('\uE007')
  await d.wait(until.elementLocated(By.css('[data-testid="zoom_in"]')), 15000)
  // Let the view fully render interactive overlays (rubberband, etc.)
  await delay(1000)
}

async function returnToStartScreen(d: WebDriver) {
  const zoomButtons = await d.findElements(By.css('[data-testid="zoom_in"]'))
  if (zoomButtons.length > 0) {
    await clickButton(d, 'File')
    const returnItem = await d.wait(
      until.elementLocated(
        By.xpath("//*[contains(text(), 'Return to start screen')]"),
      ),
      5000,
    )
    await d.executeScript('arguments[0].click();', returnItem)
  }
  await waitForStartScreen(d)
}

async function cleanupUI(d: WebDriver) {
  const dialogs = await d.findElements(By.css('.MuiDialog-root'))
  if (dialogs.length === 0) {
    return
  }
  for (let i = 0; i < 5; i++) {
    const remaining = await d.findElements(By.css('.MuiDialog-root'))
    if (remaining.length === 0) {
      break
    }
    await d.actions().sendKeys('\uE00C').perform()
    await delay(200)
  }
}

async function runTest(
  name: string,
  fn: (d: WebDriver) => Promise<void>,
  d: WebDriver,
) {
  const start = Date.now()
  process.stdout.write(`  ⏳ ${name}...`)

  try {
    await cleanupUI(d)
    await fn(d)
    const duration = Date.now() - start
    results.push({ name, passed: true, duration })
    console.log(`\r  ✓ ${name} (${duration}ms)`)
    await flushBrowserLogs(d)
  } catch (e) {
    const duration = Date.now() - start
    const error = e instanceof Error ? e.message : String(e)
    results.push({ name, passed: false, error, duration })
    console.log(`\r  ✗ ${name}`)
    console.log(`    Error: ${error}`)
    await flushBrowserLogs(d)

    try {
      const title = await d.getTitle()
      const url = await d.getCurrentUrl()
      console.log(`    DEBUG: Page title: ${title}`)
      console.log(`    DEBUG: Page URL: ${url}`)
      const dialogs = await d.findElements(By.css('.MuiDialog-root'))
      console.log(`    DEBUG: Number of open dialogs: ${dialogs.length}`)
    } catch {
      console.log('    DEBUG: Could not capture additional debug info')
    }
  }
}

async function createApolloProject(
  d: WebDriver,
  opts: {
    assemblyName: string
    gff3Path?: string
    region: string
    sessionTimeout?: number
  },
) {
  await clickButton(d, 'Open GFF3 + FASTA as Apollo project')
  await findByText(d, 'New Apollo annotation project', 10000)

  const assemblyInput = await d.wait(
    until.elementLocated(By.css('input[type="text"]')),
    10000,
  )
  await assemblyInput.sendKeys(opts.assemblyName)

  const urlToggleButtons = await d.findElements(
    By.xpath("//button[contains(., 'URL')]"),
  )

  const filePaths = [
    join(TEST_DATA_DIR, 'volvox.fa'),
    join(TEST_DATA_DIR, 'volvox.fa.fai'),
    ...(opts.gff3Path ? [opts.gff3Path] : []),
  ]

  for (let i = 0; i < filePaths.length; i++) {
    if (urlToggleButtons.length > i) {
      await urlToggleButtons[i].click()
      await delay(200)
    }
    const urlInputs = await d.findElements(By.css('[data-testid="urlInput"]'))
    if (urlInputs.length > i) {
      await urlInputs[i].sendKeys(`file://${filePaths[i]}`)
    }
  }

  const createButton = await d.wait(
    until.elementLocated(
      By.xpath(
        "//div[contains(@class, 'MuiDialogActions')]//button[contains(., 'Create')]",
      ),
    ),
    10000,
  )
  await d.executeScript('arguments[0].scrollIntoView(true);', createButton)
  await delay(100)
  await d.executeScript('arguments[0].click();', createButton)

  await waitForSessionLoad(d, opts.sessionTimeout ?? 30000)
  await navigateToRegion(d, opts.region)
}

// --- Test cases ---

async function testApolloStartScreenButton(d: WebDriver) {
  await waitForStartScreen(d)
  await findByText(d, 'Open GFF3 + FASTA as Apollo project', 15000)
}

async function testApolloMenuEntry(d: WebDriver) {
  await waitForStartScreen(d)

  const iconButtons = await d.findElements(By.css('button svg'))
  if (iconButtons.length === 0) {
    throw new Error('No icon buttons found on start screen')
  }
  const menuButton = await iconButtons[0].findElement(By.xpath('./..'))
  await d.executeScript('arguments[0].click();', menuButton)

  await findByText(d, 'New Apollo annotation session', 10000)

  await d.actions().sendKeys('\uE00C').perform()
}

async function testOpenApolloDialog(d: WebDriver) {
  await waitForStartScreen(d)
  await clickButton(d, 'Open GFF3 + FASTA as Apollo project')

  await findByText(d, 'New Apollo annotation project', 10000)

  await findByText(d, 'Assembly name', 5000)
  await findByText(d, 'FASTA file', 5000)
  await findByText(d, 'GFF3 file', 5000)
  await findByText(d, 'SQLite database path', 5000)

  const cancelButton = await d.wait(
    until.elementLocated(
      By.xpath(
        "//div[contains(@class, 'MuiDialogActions')]//button[contains(., 'Cancel')]",
      ),
    ),
    10000,
  )
  await d.executeScript('arguments[0].click();', cancelButton)

  await waitForStartScreen(d)
}

async function testCreateApolloProject(d: WebDriver) {
  await waitForStartScreen(d)
  await createApolloProject(d, {
    assemblyName: 'volvox',
    region: 'ctgA:1-10000',
  })
}

async function testCreateApolloProjectWithGFF3(d: WebDriver) {
  await returnToStartScreen(d)
  await createApolloProject(d, {
    assemblyName: 'volvox-gff3',
    gff3Path: join(APOLLO_TEST_DATA, 'volvox.sort.gff3'),
    region: 'ctgA:1000-9000',
    sessionTimeout: 60000,
  })
}

async function testCreateAnnotationAndExportGFF3(d: WebDriver) {
  await returnToStartScreen(d)
  await createApolloProject(d, {
    assemblyName: 'annot-test',
    region: 'ctgA:1000-5000',
  })

  console.log('    Setting up PnP module resolution...')
  const pnpSetupPath = resolve(__dirname, '.pnp-setup.cjs').replace(/\\/g, '/')
  const resolveResult = await d.executeScript(`
    try {
      globalThis.require('${pnpSetupPath}');

      var Module = globalThis.require('module');
      var pnpResolve = Module._resolveFilename;
      var pluginPkg = '${resolve(APOLLO_ROOT, 'packages/jbrowse-plugin-apollo/package.json').replace(/\\/g, '/')}';
      var fakeParent = new Module(pluginPkg);
      fakeParent.filename = pluginPkg;
      fakeParent.paths = Module._nodeModulePaths('${resolve(APOLLO_ROOT, 'packages/jbrowse-plugin-apollo').replace(/\\/g, '/')}');
      Module._resolveFilename = function(request, parent, isMain, options) {
        try {
          return pnpResolve.call(this, request, parent, isMain, options);
        } catch(e) {
          return pnpResolve.call(this, request, fakeParent, isMain, options);
        }
      };
      return 'ok';
    } catch(e) {
      return 'error: ' + e.message;
    }
  `)
  console.log(`    PnP setup: ${resolveResult}`)

  // Rubber band drag to create a selection
  const rubberbandArea = await d.wait(
    until.elementLocated(By.css('[data-testid="rubberband_controls"]')),
    15000,
  )
  const size = await rubberbandArea.getRect()
  const dragStartX = Math.round(-size.width * 0.2)
  const dragEndX = Math.round(size.width * 0.2)

  await d
    .actions()
    .move({ origin: rubberbandArea, x: dragStartX, y: 0 })
    .press()
    .move({ origin: rubberbandArea, x: dragEndX, y: 0, duration: 500 })
    .release()
    .perform()

  const addNewFeatureItem = await d.wait(
    until.elementLocated(By.xpath("//*[contains(text(), 'Add new feature')]")),
    10000,
  )
  await d.executeScript('arguments[0].click();', addNewFeatureItem)
  await delay(500)

  await d.wait(
    until.elementLocated(By.css('[data-testid="add-feature-dialog"]')),
    10000,
  )

  const strandTrigger = await d.wait(
    until.elementLocated(By.css('[id="demo-simple-select"]')),
    5000,
  )
  await d.executeScript(
    'arguments[0].dispatchEvent(new MouseEvent("mousedown", {bubbles: true}));',
    strandTrigger,
  )

  const plusStrand = await d.wait(
    until.elementLocated(
      By.xpath("//li[@role='option' and contains(text(), '+')]"),
    ),
    5000,
  )
  await d.executeScript('arguments[0].click();', plusStrand)
  await delay(200)

  const submitButton = await d.wait(
    until.elementLocated(
      By.xpath(
        "//div[contains(@class, 'MuiDialogActions')]//button[contains(., 'Submit')]",
      ),
    ),
    5000,
  )
  await d.executeScript('arguments[0].click();', submitButton)

  // Wait for the add-feature dialog to close
  await d.wait(async () => {
    const dialogs = await d.findElements(
      By.css('[data-testid="add-feature-dialog"]'),
    )
    return dialogs.length === 0
  }, 10000)

  // Wait for the change to persist to SQLite
  await delay(2000)

  // Intercept file-saver downloads by patching URL.createObjectURL.
  // file-saver creates a detached <a> element and dispatches a click event,
  // so document listeners and prototype.click patches don't work.
  await d.executeScript(`
    window.__exportedGFF3 = null;
    var origCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function(blob) {
      var url = origCreateObjectURL(blob);
      if (blob instanceof Blob && blob.type && blob.type.indexOf('text') >= 0) {
        blob.text().then(function(text) {
          window.__exportedGFF3 = text;
        });
      }
      return url;
    };
  `)

  await clickButton(d, 'Apollo')

  const downloadGFF3Item = await d.wait(
    until.elementLocated(By.xpath("//*[contains(text(), 'Download GFF3')]")),
    5000,
  )
  await d.executeScript('arguments[0].click();', downloadGFF3Item)

  await d.wait(
    until.elementLocated(By.css('[data-testid="download-gff3"]')),
    10000,
  )

  const assemblySelect = await d.wait(
    until.elementLocated(
      By.css('[data-testid="download-gff3"] .MuiSelect-select'),
    ),
    5000,
  )
  await d.executeScript(
    'arguments[0].dispatchEvent(new MouseEvent("mousedown", {bubbles: true}));',
    assemblySelect,
  )

  const allOptions = await d.wait(async () => {
    const opts = await d.findElements(By.css('li[role="option"]'))
    return opts.length > 0 ? opts : null
  }, 5000)
  if (!allOptions || allOptions.length === 0) {
    throw new Error('No assemblies available in GFF3 export dropdown')
  }
  await d.executeScript('arguments[0].click();', allOptions[0])
  await delay(200)

  const downloadButton = await d.wait(
    until.elementLocated(
      By.xpath(
        "//div[contains(@class, 'MuiDialogActions')]//button[contains(., 'Download')]",
      ),
    ),
    5000,
  )
  await d.executeScript('arguments[0].click();', downloadButton)

  // Poll for the captured GFF3 content
  const gff3Content = await d.wait(async () => {
    const content = (await d.executeScript('return window.__exportedGFF3')) as
      | string
      | null
    return content || null
  }, 15000)

  if (!gff3Content) {
    throw new Error('GFF3 export produced no output')
  }
  console.log(
    `    GFF3 result (${gff3Content.length} chars): ${gff3Content.slice(0, 500)}`,
  )
  if (!gff3Content.includes('gene')) {
    throw new Error('GFF3 does not contain "gene" feature')
  }
  if (!gff3Content.includes('mRNA')) {
    throw new Error('GFF3 does not contain "mRNA" feature')
  }
}

// --- Cleanup and main ---

async function cleanup() {
  const { execSync } = await import('child_process')
  try {
    if (isWindows) {
      execSync('taskkill /F /IM chromedriver.exe 2>nul', { stdio: 'ignore' })
      execSync('taskkill /F /IM "jbrowse-desktop.exe" 2>nul', {
        stdio: 'ignore',
      })
    } else {
      execSync('pkill -f chromedriver || true', { stdio: 'ignore' })
      execSync('pkill -f jbrowse-desktop || true', { stdio: 'ignore' })
    }
  } catch {
    // ignore
  }
  await delay(500)
}

async function killProcesses() {
  if (pluginServer) {
    pluginServer.close()
  }
  if (driver) {
    try {
      await driver.quit()
    } catch {
      // ignore
    }
  }
  if (chromedriverProcess) {
    chromedriverProcess.kill('SIGKILL')
  }
  const { execSync } = await import('child_process')
  try {
    if (isWindows) {
      execSync('taskkill /F /IM "jbrowse-desktop.exe" 2>nul', {
        stdio: 'ignore',
      })
    } else {
      execSync('pkill -f jbrowse-desktop || true', { stdio: 'ignore' })
    }
  } catch {
    // ignore
  }
}

async function main() {
  console.log(`Running in ${isHeadless ? 'headless' : 'headed'} mode`)
  console.log(`Platform: ${process.platform}`)
  console.log(`App binary: ${APP_BINARY}`)
  console.log(`Test data dir: ${TEST_DATA_DIR}`)
  console.log(`Apollo test data: ${APOLLO_TEST_DATA}`)

  if (!existsSync(APP_BINARY)) {
    console.error(`ERROR: App binary not found at ${APP_BINARY}`)
    process.exit(1)
  }
  console.log('App binary exists: yes')

  console.log('Starting plugin HTTP server...')
  await startPluginServer()

  console.log('Cleaning up leftover processes...')
  await cleanup()

  console.log('Starting ChromeDriver...')
  await startChromedriver()

  console.log('Creating WebDriver and launching Electron app...')
  try {
    driver = await createDriver()
    console.log('WebDriver created successfully')
  } catch (e) {
    console.error('Failed to create WebDriver:', e)
    throw e
  }

  console.log('\nWaiting for start screen...')
  await waitForStartScreen(driver, 30000)

  // ChromeDriver uses a temp userData, so we install the plugin via IPC then reload
  const pluginUmdUrl = `http://localhost:${PLUGIN_SERVER_PORT}/jbrowse-plugin-apollo.umd.development.js`
  console.log(`Installing Apollo plugin via IPC: ${pluginUmdUrl}`)
  try {
    await driver.executeScript(
      `return await window.require("electron").ipcRenderer.invoke("setGlobalPlugins", [{"umdUrl": "${pluginUmdUrl}", "name": "Apollo"}])`,
    )
    console.log('Plugin installed, reloading page...')
    await driver.navigate().refresh()
    await waitForStartScreen(driver, 30000)
    await flushBrowserLogs(driver)
  } catch (e) {
    console.log('Failed to install plugin via IPC:', e)
  }

  // Verify plugin loaded
  try {
    const plugins = await driver.executeScript(
      'try { return await window.require("electron").ipcRenderer.invoke("getGlobalPlugins"); } catch(e) { return "ERROR: " + e.message; }',
    )
    console.log('Global plugins after install:', JSON.stringify(plugins))
  } catch (e) {
    console.log('Could not query global plugins:', e)
  }

  // Check page content
  try {
    const bodyText = await driver.findElement(By.css('body')).getText()
    console.log(`Page text (first 500 chars): ${bodyText.slice(0, 500)}`)
  } catch {
    console.log('Could not get page text')
  }

  console.log('\nRunning Apollo Desktop E2E tests...\n')

  console.log('Start Screen:')
  await runTest(
    'should show Apollo button on start screen',
    testApolloStartScreenButton,
    driver,
  )
  await runTest('should show Apollo menu entry', testApolloMenuEntry, driver)
  await runTest(
    'should open and close Apollo project dialog',
    testOpenApolloDialog,
    driver,
  )

  console.log('\nProject Creation:')
  await runTest(
    'should create Apollo project from FASTA',
    testCreateApolloProject,
    driver,
  )
  await runTest(
    'should create Apollo project from FASTA + GFF3',
    testCreateApolloProjectWithGFF3,
    driver,
  )

  console.log('\nAnnotation Workflow:')
  await runTest(
    'should create annotation and export GFF3',
    testCreateAnnotationAndExportGFF3,
    driver,
  )

  // Summary
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  Tests: ${passed} passed, ${failed} failed`)
  console.log(`${'─'.repeat(50)}\n`)

  console.log('\nCleaning up...')
  await killProcesses()

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error('Fatal error:', e)
  await killProcesses()
  process.exit(1)
})
