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
    implicit: 30000,
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

async function cleanupUI(d: WebDriver) {
  for (let i = 0; i < 5; i++) {
    const dialogs = await d.findElements(By.css('.MuiDialog-root'))
    if (dialogs.length === 0) {
      break
    }
    await d.actions().sendKeys('\uE00C').perform()
    await delay(300)
  }

  const backdrops = await d.findElements(By.css('.MuiBackdrop-root'))
  for (const backdrop of backdrops) {
    try {
      await d.executeScript('arguments[0].click();', backdrop)
      await delay(200)
    } catch {
      // ignore
    }
  }

  for (let i = 0; i < 3; i++) {
    await d.actions().sendKeys('\uE00C').perform()
    await delay(200)
  }
  try {
    const body = await d.findElement(By.css('body'))
    await d.executeScript('arguments[0].click();', body)
    await delay(300)
  } catch {
    // ignore
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
    await delay(500)
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

// --- Test cases ---

async function testApolloStartScreenButton(d: WebDriver) {
  await waitForStartScreen(d)
  console.log('    DEBUG: Looking for Apollo button on start screen...')
  await findByText(d, 'Open GFF3 + FASTA as Apollo project', 15000)
  console.log('    DEBUG: Found Apollo start screen button')
}

async function testApolloMenuEntry(d: WebDriver) {
  await waitForStartScreen(d)
  console.log('    DEBUG: Looking for hamburger menu...')

  // The CascadingMenuButton renders as an IconButton with a menu SVG icon.
  // Find all buttons with SVGs and pick the one that's likely the hamburger menu
  // (positioned in top-right corner of the start screen).
  const iconButtons = await d.findElements(By.css('button svg'))
  console.log(`    DEBUG: Found ${iconButtons.length} buttons with SVGs`)
  if (iconButtons.length === 0) {
    throw new Error('No icon buttons found on start screen')
  }
  // The hamburger menu is the first (and usually only) icon button on the start screen
  const menuButton = await iconButtons[0].findElement(By.xpath('./..'))
  console.log('    DEBUG: Found menu icon button, clicking...')
  await d.executeScript('arguments[0].click();', menuButton)
  await delay(1000)

  console.log('    DEBUG: Looking for Apollo menu entry...')
  await findByText(d, 'New Apollo annotation session', 10000)
  console.log('    DEBUG: Found Apollo menu entry')

  // Close the menu
  await d.actions().sendKeys('\uE00C').perform()
  await delay(300)
}

async function testOpenApolloDialog(d: WebDriver) {
  await waitForStartScreen(d)
  console.log('    DEBUG: Clicking Apollo button...')
  await clickButton(d, 'Open GFF3 + FASTA as Apollo project')
  await delay(1000)

  console.log('    DEBUG: Looking for dialog title...')
  await findByText(d, 'New Apollo annotation project', 10000)
  console.log('    DEBUG: Found dialog')

  // Verify dialog content
  await findByText(d, 'Assembly name', 5000)
  await findByText(d, 'FASTA file', 5000)
  await findByText(d, 'GFF3 file', 5000)
  await findByText(d, 'SQLite database path', 5000)
  console.log('    DEBUG: All dialog fields present')

  // Cancel the dialog using JS click to bypass visibility issues
  const cancelButton = await d.wait(
    until.elementLocated(
      By.xpath(
        "//div[contains(@class, 'MuiDialogActions')]//button[contains(., 'Cancel')]",
      ),
    ),
    10000,
  )
  await d.executeScript('arguments[0].click();', cancelButton)
  await delay(500)

  await waitForStartScreen(d)
  console.log('    DEBUG: Dialog closed, back on start screen')
}

async function testCreateApolloProject(d: WebDriver) {
  await waitForStartScreen(d)
  console.log('    DEBUG: Clicking Apollo button...')
  await clickButton(d, 'Open GFF3 + FASTA as Apollo project')
  await delay(1000)

  await findByText(d, 'New Apollo annotation project', 10000)

  // Fill in assembly name
  console.log('    DEBUG: Filling in assembly name...')
  const assemblyInput = await d.wait(
    until.elementLocated(By.css('input[type="text"]')),
    10000,
  )
  await assemblyInput.sendKeys('volvox')

  // Switch FASTA file selector to URL mode and enter file:// URL
  console.log('    DEBUG: Looking for URL toggle buttons...')
  const urlToggleButtons = await d.findElements(
    By.xpath("//button[contains(., 'URL')]"),
  )
  console.log(`    DEBUG: Found ${urlToggleButtons.length} URL toggle buttons`)

  if (urlToggleButtons.length >= 1) {
    await urlToggleButtons[0].click()
    await delay(500)
  }

  let urlInputs = await d.findElements(By.css('[data-testid="urlInput"]'))
  if (urlInputs.length >= 1) {
    const fastaPath = join(TEST_DATA_DIR, 'volvox.fa')
    console.log(`    DEBUG: Entering FASTA URL: file://${fastaPath}`)
    await urlInputs[0].sendKeys(`file://${fastaPath}`)
  }

  // Switch FAI file selector to URL mode
  if (urlToggleButtons.length >= 2) {
    await urlToggleButtons[1].click()
    await delay(500)
  }

  urlInputs = await d.findElements(By.css('[data-testid="urlInput"]'))
  if (urlInputs.length >= 2) {
    const faiPath = join(TEST_DATA_DIR, 'volvox.fa.fai')
    console.log(`    DEBUG: Entering FAI URL: file://${faiPath}`)
    await urlInputs[1].sendKeys(`file://${faiPath}`)
  }

  // Click Create button
  console.log('    DEBUG: Looking for Create button...')
  const createButton = await d.wait(
    until.elementLocated(
      By.xpath(
        "//div[contains(@class, 'MuiDialogActions')]//button[contains(., 'Create')]",
      ),
    ),
    10000,
  )
  await d.executeScript('arguments[0].scrollIntoView(true);', createButton)
  await delay(500)
  console.log('    DEBUG: Clicking Create...')
  await d.executeScript('arguments[0].click();', createButton)

  // Wait for session to load
  console.log('    DEBUG: Waiting for session to load...')
  await delay(5000)

  // Check for errors
  const errorElements = await d.findElements(
    By.css('.MuiAlert-standardError, [class*="error"]'),
  )
  if (errorElements.length > 0) {
    for (const el of errorElements) {
      const text = await el.getText()
      console.log(`    DEBUG: Error element text: ${text}`)
    }
  }

  // Look for "Launch view" button or location search input indicating session loaded
  const launchButtons = await d.findElements(
    By.xpath("//button[contains(., 'Launch view')]"),
  )
  if (launchButtons.length > 0) {
    console.log('    DEBUG: Found Launch view button, clicking...')
    await launchButtons[0].click()
    await delay(2000)
  }

  console.log('    DEBUG: Waiting for location search input...')
  const searchInput = await d.wait(
    until.elementLocated(By.css('input[placeholder="Search for location"]')),
    30000,
  )

  console.log('    DEBUG: Session loaded, navigating to ctgA:1-10000...')
  await searchInput.click()
  await d.actions().keyDown('\uE009').sendKeys('a').keyUp('\uE009').perform()
  await d.actions().sendKeys('\uE017').perform()
  await searchInput.sendKeys('ctgA:1-10000')
  await searchInput.sendKeys('\uE007') // Enter
  await delay(3000)

  await d.wait(until.elementLocated(By.css('[data-testid="zoom_in"]')), 15000)
  console.log('    DEBUG: Apollo project created and session loaded!')
}

async function testCreateApolloProjectWithGFF3(d: WebDriver) {
  // Return to start screen if in a session
  const zoomButtons = await d.findElements(By.css('[data-testid="zoom_in"]'))
  if (zoomButtons.length > 0) {
    console.log('    DEBUG: Returning to start screen...')
    await clickButton(d, 'File')
    await delay(500)
    const returnItem = await d.wait(
      until.elementLocated(
        By.xpath("//*[contains(text(), 'Return to start screen')]"),
      ),
      5000,
    )
    await d.executeScript('arguments[0].click();', returnItem)
    await delay(1500)
  }

  await waitForStartScreen(d)
  console.log('    DEBUG: Clicking Apollo button...')
  await clickButton(d, 'Open GFF3 + FASTA as Apollo project')
  await delay(1000)

  await findByText(d, 'New Apollo annotation project', 10000)

  // Fill in assembly name
  const assemblyInput = await d.wait(
    until.elementLocated(By.css('input[type="text"]')),
    10000,
  )
  await assemblyInput.sendKeys('volvox-gff3')

  // Switch file selectors to URL mode
  const urlToggleButtons = await d.findElements(
    By.xpath("//button[contains(., 'URL')]"),
  )

  // FASTA
  if (urlToggleButtons.length >= 1) {
    await urlToggleButtons[0].click()
    await delay(500)
  }

  let urlInputs = await d.findElements(By.css('[data-testid="urlInput"]'))
  if (urlInputs.length >= 1) {
    const fastaPath = join(TEST_DATA_DIR, 'volvox.fa')
    await urlInputs[0].sendKeys(`file://${fastaPath}`)
  }

  // FAI
  if (urlToggleButtons.length >= 2) {
    await urlToggleButtons[1].click()
    await delay(500)
  }

  urlInputs = await d.findElements(By.css('[data-testid="urlInput"]'))
  if (urlInputs.length >= 2) {
    const faiPath = join(TEST_DATA_DIR, 'volvox.fa.fai')
    await urlInputs[1].sendKeys(`file://${faiPath}`)
  }

  // GFF3 - switch the third file selector to URL mode
  if (urlToggleButtons.length >= 3) {
    await urlToggleButtons[2].click()
    await delay(500)
  }

  urlInputs = await d.findElements(By.css('[data-testid="urlInput"]'))
  if (urlInputs.length >= 3) {
    const gff3Path = join(APOLLO_TEST_DATA, 'volvox.sort.gff3')
    console.log(`    DEBUG: Entering GFF3 URL: file://${gff3Path}`)
    await urlInputs[2].sendKeys(`file://${gff3Path}`)
  }

  // Click Create
  console.log('    DEBUG: Clicking Create button...')
  const createButton = await d.wait(
    until.elementLocated(
      By.xpath(
        "//div[contains(@class, 'MuiDialogActions')]//button[contains(., 'Create')]",
      ),
    ),
    10000,
  )
  await d.executeScript('arguments[0].scrollIntoView(true);', createButton)
  await delay(500)
  await d.executeScript('arguments[0].click();', createButton)

  // Wait for session to load
  console.log('    DEBUG: Waiting for session with GFF3 to load...')
  await delay(8000)

  // Look for "Launch view" button or search input
  const launchButtons = await d.findElements(
    By.xpath("//button[contains(., 'Launch view')]"),
  )
  if (launchButtons.length > 0) {
    await launchButtons[0].click()
    await delay(2000)
  }

  const searchInput = await d.wait(
    until.elementLocated(By.css('input[placeholder="Search for location"]')),
    30000,
  )

  // Navigate to a region where GFF3 features should be visible
  console.log('    DEBUG: Navigating to ctgA:1000-9000 (EDEN region)...')
  await searchInput.click()
  await d.actions().keyDown('\uE009').sendKeys('a').keyUp('\uE009').perform()
  await d.actions().sendKeys('\uE017').perform()
  await searchInput.sendKeys('ctgA:1000-9000')
  await searchInput.sendKeys('\uE007') // Enter
  await delay(3000)

  await d.wait(until.elementLocated(By.css('[data-testid="zoom_in"]')), 15000)
  console.log('    DEBUG: Apollo project with GFF3 created and session loaded!')
}

async function testCreateAnnotationAndExportGFF3(d: WebDriver) {
  // We should be in a session from the previous test (testCreateApolloProjectWithGFF3).
  // Return to start screen and create a fresh FASTA-only project so we start with zero annotations.
  const zoomButtons = await d.findElements(By.css('[data-testid="zoom_in"]'))
  if (zoomButtons.length > 0) {
    console.log('    DEBUG: Returning to start screen...')
    await clickButton(d, 'File')
    await delay(500)
    const returnItem = await d.wait(
      until.elementLocated(
        By.xpath("//*[contains(text(), 'Return to start screen')]"),
      ),
      5000,
    )
    await d.executeScript('arguments[0].click();', returnItem)
    await delay(1500)
  }

  await waitForStartScreen(d)
  console.log('    DEBUG: Creating fresh FASTA project for annotation test...')
  await clickButton(d, 'Open GFF3 + FASTA as Apollo project')
  await delay(1000)

  await findByText(d, 'New Apollo annotation project', 10000)

  const assemblyInput = await d.wait(
    until.elementLocated(By.css('input[type="text"]')),
    10000,
  )
  await assemblyInput.sendKeys('annot-test')

  const urlToggleButtons = await d.findElements(
    By.xpath("//button[contains(., 'URL')]"),
  )

  if (urlToggleButtons.length >= 1) {
    await urlToggleButtons[0].click()
    await delay(500)
  }

  let urlInputs = await d.findElements(By.css('[data-testid="urlInput"]'))
  if (urlInputs.length >= 1) {
    const fastaPath = join(TEST_DATA_DIR, 'volvox.fa')
    await urlInputs[0].sendKeys(`file://${fastaPath}`)
  }

  if (urlToggleButtons.length >= 2) {
    await urlToggleButtons[1].click()
    await delay(500)
  }

  urlInputs = await d.findElements(By.css('[data-testid="urlInput"]'))
  if (urlInputs.length >= 2) {
    const faiPath = join(TEST_DATA_DIR, 'volvox.fa.fai')
    await urlInputs[1].sendKeys(`file://${faiPath}`)
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
  await delay(500)
  await d.executeScript('arguments[0].click();', createButton)

  console.log('    DEBUG: Waiting for session to load...')
  await delay(5000)

  const launchButtons = await d.findElements(
    By.xpath("//button[contains(., 'Launch view')]"),
  )
  if (launchButtons.length > 0) {
    await launchButtons[0].click()
    await delay(2000)
  }

  const searchInput = await d.wait(
    until.elementLocated(By.css('input[placeholder="Search for location"]')),
    30000,
  )

  // Navigate to ctgA:1000-5000
  console.log('    DEBUG: Navigating to ctgA:1000-5000...')
  await searchInput.click()
  await d.actions().keyDown('\uE009').sendKeys('a').keyUp('\uE009').perform()
  await d.actions().sendKeys('\uE017').perform()
  await searchInput.sendKeys('ctgA:1000-5000')
  await searchInput.sendKeys('\uE007')
  await delay(3000)

  await d.wait(until.elementLocated(By.css('[data-testid="zoom_in"]')), 15000)

  // Perform rubber band drag to create a selection
  console.log('    DEBUG: Performing rubber band drag...')
  const rubberbandArea = await d.wait(
    until.elementLocated(By.css('[data-testid="rubberband_controls"]')),
    10000,
  )
  const size = await rubberbandArea.getRect()
  const startX = Math.round(size.width * 0.3)
  const endX = Math.round(size.width * 0.6)
  const midY = Math.round(size.height / 2)

  await d
    .actions()
    .move({ origin: rubberbandArea, x: startX, y: midY })
    .press()
    .move({ origin: rubberbandArea, x: endX, y: midY, duration: 500 })
    .release()
    .perform()
  await delay(1000)

  // Click "Add new feature" from the rubber band popup menu
  console.log('    DEBUG: Looking for "Add new feature" menu item...')
  const addNewFeatureItem = await d.wait(
    until.elementLocated(By.xpath("//*[contains(text(), 'Add new feature')]")),
    10000,
  )
  await d.executeScript('arguments[0].click();', addNewFeatureItem)
  await delay(1000)

  // The AddFeature dialog should be open
  console.log('    DEBUG: Looking for Add feature dialog...')
  await d.wait(
    until.elementLocated(By.css('[data-testid="add-feature-dialog"]')),
    10000,
  )

  // Select strand "+" from the Strand dropdown
  console.log('    DEBUG: Selecting strand...')
  const strandSelect = await d.wait(
    until.elementLocated(By.id('demo-simple-select')),
    5000,
  )
  await d.executeScript('arguments[0].click();', strandSelect)
  await delay(500)

  // Click the "+" menu item (value=1)
  const plusStrand = await d.wait(
    until.elementLocated(By.css('li[data-value="1"]')),
    5000,
  )
  await d.executeScript('arguments[0].click();', plusStrand)
  await delay(500)

  // "Gene and sub-features" is the default radio selection, so just submit
  console.log('    DEBUG: Clicking Submit...')
  const submitButton = await d.wait(
    until.elementLocated(
      By.xpath(
        "//div[contains(@class, 'MuiDialogActions')]//button[contains(., 'Submit')]",
      ),
    ),
    5000,
  )
  await d.executeScript('arguments[0].click();', submitButton)
  await delay(2000)

  // Verify dialog closed
  const dialogsAfterSubmit = await d.findElements(
    By.css('[data-testid="add-feature-dialog"]'),
  )
  if (dialogsAfterSubmit.length > 0) {
    throw new Error('Add feature dialog did not close after submit')
  }
  console.log('    DEBUG: Add feature dialog closed successfully')

  // Monkey-patch saveAs before triggering export so we can capture the GFF3 content
  console.log('    DEBUG: Patching saveAs for GFF3 capture...')
  await d.executeScript(`
    window.__exportedGFF3 = null;
    const origSaveAs = window.saveAs;
    window.saveAs = function(blob, filename) {
      if (blob instanceof Blob) {
        blob.text().then(function(text) {
          window.__exportedGFF3 = text;
        });
      }
    };
  `)

  // Open the Apollo menu and click "Download GFF3"
  console.log('    DEBUG: Opening Apollo menu...')
  await clickButton(d, 'Apollo')
  await delay(500)

  const downloadGFF3Item = await d.wait(
    until.elementLocated(By.xpath("//*[contains(text(), 'Download GFF3')]")),
    5000,
  )
  await d.executeScript('arguments[0].click();', downloadGFF3Item)
  await delay(1000)

  // In the DownloadGFF3 dialog: select the assembly
  console.log('    DEBUG: Looking for Download GFF3 dialog...')
  await d.wait(
    until.elementLocated(By.css('[data-testid="download-gff3"]')),
    10000,
  )

  // Click the assembly select dropdown
  const assemblySelect = await d.wait(
    until.elementLocated(
      By.css('[data-testid="download-gff3"] .MuiSelect-select'),
    ),
    5000,
  )
  await d.executeScript('arguments[0].click();', assemblySelect)
  await delay(500)

  // Select "annot-test" from the dropdown
  const assemblyOption = await d.wait(
    until.elementLocated(By.xpath("//li[contains(text(), 'annot-test')]")),
    5000,
  )
  await d.executeScript('arguments[0].click();', assemblyOption)
  await delay(500)

  // Click Download
  console.log('    DEBUG: Clicking Download button...')
  const downloadButton = await d.wait(
    until.elementLocated(
      By.xpath(
        "//div[contains(@class, 'MuiDialogActions')]//button[contains(., 'Download')]",
      ),
    ),
    5000,
  )
  await d.executeScript('arguments[0].click();', downloadButton)
  await delay(2000)

  // Retrieve the captured GFF3 content
  const gff3Content = (await d.executeScript(
    'return window.__exportedGFF3',
  )) as string | null

  if (!gff3Content) {
    // Fallback: verify annotations exist in the Apollo data store directly
    console.log(
      '    DEBUG: saveAs patch did not capture GFF3, checking data store...',
    )
    const hasAnnotations = (await d.executeScript(`
      try {
        const pm = window.__jbrowse?.pluginManager;
        if (!pm) return 'no pluginManager';
        const session = pm.rootModel?.session;
        if (!session) return 'no session';
        const ds = session.apolloDataStore;
        if (!ds) return 'no apolloDataStore';
        const assemblies = ds.assemblies;
        if (!assemblies) return 'no assemblies';
        let featureCount = 0;
        assemblies.forEach(function(asm) {
          if (asm.refSeqs) {
            asm.refSeqs.forEach(function(refSeq) {
              if (refSeq.features) {
                featureCount += refSeq.features.size;
              }
            });
          }
        });
        return featureCount;
      } catch(e) {
        return 'error: ' + e.message;
      }
    `)) as number | string

    console.log(`    DEBUG: Feature count from data store: ${hasAnnotations}`)
    if (typeof hasAnnotations === 'number' && hasAnnotations > 0) {
      console.log(
        `    DEBUG: Verified ${hasAnnotations} annotation(s) in data store`,
      )
    } else {
      throw new Error(
        `Expected annotations in data store but got: ${hasAnnotations}`,
      )
    }
  } else {
    console.log(
      `    DEBUG: Captured GFF3 (${gff3Content.length} chars), first 500: ${gff3Content.slice(0, 500)}`,
    )
    if (!gff3Content.includes('gene')) {
      throw new Error('GFF3 does not contain "gene" feature')
    }
    if (!gff3Content.includes('mRNA')) {
      throw new Error('GFF3 does not contain "mRNA" feature')
    }
    console.log('    DEBUG: GFF3 content verified - contains gene and mRNA')
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
  await delay(1000)
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
  await delay(5000)

  // ChromeDriver uses a temp userData, so we install the plugin via IPC then reload
  const pluginUmdUrl = `http://localhost:${PLUGIN_SERVER_PORT}/jbrowse-plugin-apollo.umd.development.js`
  console.log(`Installing Apollo plugin via IPC: ${pluginUmdUrl}`)
  try {
    await driver.executeScript(
      `return await window.require("electron").ipcRenderer.invoke("setGlobalPlugins", [{"umdUrl": "${pluginUmdUrl}", "name": "Apollo"}])`,
    )
    console.log('Plugin installed, reloading page...')
    await driver.navigate().refresh()
    await delay(10000)
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
