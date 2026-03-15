/**
 * Apollo3 Performance Benchmark
 *
 * Compares MikroORM branch vs main branch (MongoDB) using real genomic data.
 * Fully reproducible — downloads data if not present, builds both branches,
 * starts servers, runs workloads, reports results.
 *
 * Prerequisites:
 *   - Node.js 22+
 *   - curl and gunzip available
 *   - For MongoDB comparison: MongoDB running on localhost:27017
 *
 * Usage:
 *   cd packages/apollo-cli
 *
 *   # Run MikroORM-only benchmark (no MongoDB needed):
 *   tsx src/test/benchmark.ts
 *
 *   # Run comparison (requires MongoDB for main branch):
 *   tsx src/test/benchmark.ts --compare
 *
 *   # Use smaller synthetic dataset (faster, for CI):
 *   tsx src/test/benchmark.ts --synthetic
 *
 *   # Skip data download (if already downloaded):
 *   tsx src/test/benchmark.ts --skip-download
 */

import { type ChildProcess, execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// --- Configuration ---

const MIKRO_ORM_DIR = path.resolve(os.homedir(), 'src/Apollo3')
const MAIN_DIR = path.resolve(os.homedir(), 'src/Apollo3-main')
const CLI_DIR = path.resolve(MIKRO_ORM_DIR, 'packages/apollo-cli')
const DATA_DIR = path.resolve(CLI_DIR, 'test_data/benchmark')
const MIKRO_ORM_PORT = 3999
const MAIN_PORT = 4999
const ITERATIONS = 3

const GENCODE_GFF3_URL =
  'https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.chr_patch_hapl_scaff.annotation.gff3.gz'
const GENCODE_FASTA_URL =
  'https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/GRCh38.p14.genome.fa.gz'

const args = new Set(process.argv.slice(2))
const compareMode = args.has('--compare')
const syntheticMode = args.has('--synthetic')
const skipDownload = args.has('--skip-download')

// --- Utilities ---

function shell(cmd: string, cwd?: string) {
  return execSync(cmd, {
    cwd: cwd ?? CLI_DIR,
    encoding: 'utf8',
    timeout: 600_000,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: '/bin/bash',
  }).trim()
}

function shellTimed(cmd: string, cwd?: string) {
  const start = performance.now()
  shell(cmd, cwd)
  return performance.now() - start
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function p95(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.ceil(0.95 * sorted.length) - 1
  return sorted[idx]
}

function formatMs(ms: number) {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

// --- Data preparation ---

function downloadData() {
  fs.mkdirSync(DATA_DIR, { recursive: true })

  const gffGz = path.join(DATA_DIR, 'gencode.v49.annotation.gff3.gz')
  const gff = path.join(DATA_DIR, 'gencode.v49.annotation.gff3')
  const chr22Gff = path.join(DATA_DIR, 'gencode.v49.chr22.gff3')
  const fastaGz = path.join(DATA_DIR, 'GRCh38.p14.genome.fa.gz')

  if (
    !fs.existsSync(gffGz) &&
    !fs.existsSync(gff) &&
    !fs.existsSync(chr22Gff)
  ) {
    console.log('Downloading GENCODE v49 GFF3 (124MB)...')
    shell(`curl -L -o ${gffGz} '${GENCODE_GFF3_URL}'`)
  }

  if (!fs.existsSync(gff) && !fs.existsSync(chr22Gff) && fs.existsSync(gffGz)) {
    console.log('Decompressing GFF3...')
    shell(`gunzip -k ${gffGz}`)
  }

  if (!fs.existsSync(chr22Gff) && fs.existsSync(gff)) {
    console.log('Extracting chr22 features...')
    shell(`(grep '^#' ${gff}; grep '^chr22\t' ${gff}) > ${chr22Gff}`)
    const lineCount = shell(`wc -l < ${chr22Gff}`)
    console.log(`chr22 subset: ${lineCount} lines`)
  }

  if (
    !fs.existsSync(fastaGz) &&
    !fs.existsSync(path.join(DATA_DIR, 'GRCh38.chr22.fa'))
  ) {
    console.log('Downloading GRCh38 FASTA (900MB)...')
    console.log('(This is large. For quick testing, use --synthetic instead)')
    shell(`curl -L -o ${fastaGz} '${GENCODE_FASTA_URL}'`)
  }

  return chr22Gff
}

function generateSyntheticData() {
  const outputPath = path.join(DATA_DIR, 'synthetic_1000.gff3')
  if (fs.existsSync(outputPath)) {
    return outputPath
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })
  console.log('Generating synthetic dataset (1000 genes, ~5000 features)...')

  const lines: string[] = [
    '##gff-version 3',
    '##sequence-region ctgA 1 5000000',
  ]
  const fastaLines: string[] = ['>ctgA']
  const seqLen = 5_000_000
  for (let i = 0; i < seqLen; i += 80) {
    fastaLines.push('A'.repeat(Math.min(80, seqLen - i)))
  }

  let pos = 100
  for (let g = 0; g < 1000; g++) {
    const gs = pos
    const ge = pos + 3000
    lines.push(
      `ctgA\t.\tgene\t${gs}\t${ge}\t.\t+\t.\tID=gene_${g};Name=gene_${g}`,
      `ctgA\t.\tmRNA\t${gs}\t${ge}\t.\t+\t.\tID=mRNA_${g};Parent=gene_${g};Name=mRNA_${g}`,
      `ctgA\t.\texon\t${gs}\t${gs + 500}\t.\t+\t.\tID=exon_${g}_1;Parent=mRNA_${g}`,
      `ctgA\t.\texon\t${gs + 1500}\t${gs + 2000}\t.\t+\t.\tID=exon_${g}_2;Parent=mRNA_${g}`,
      `ctgA\t.\tCDS\t${gs + 50}\t${ge - 50}\t.\t+\t0\tID=CDS_${g};Parent=mRNA_${g}`,
    )
    pos = ge + 500
  }

  lines.push('###', '##FASTA', ...fastaLines)
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`)
  console.log(`Generated ${outputPath}`)
  return outputPath
}

// --- Server management ---

function waitForServer(port: number, maxWaitMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const result = execSync(
        `curl -s -o /dev/null -w '%{http_code}' http://localhost:${port}/assemblies`,
        { encoding: 'utf8', timeout: 5000 },
      ).trim()
      if (result === '200' || result === '401' || result === '403') {
        return
      }
    } catch {
      // server not ready yet
    }
    execSync('sleep 1')
  }
  throw new Error(`Server on port ${port} did not start within ${maxWaitMs}ms`)
}

function startServer(
  repoDir: string,
  port: number,
  useMongo: boolean,
): ChildProcess {
  const serverDir = path.join(repoDir, 'packages/apollo-collaboration-server')
  const dbFile = path.join(serverDir, `benchmark-${port}.sqlite`)
  if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile)
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PORT: String(port),
    ALLOW_ROOT_USER: 'true',
    ROOT_USER_PASSWORD: 'pass',
    ALLOW_GUEST_USER: 'true',
    GUEST_USER_ROLE: 'admin',
    LOG_LEVELS: 'error,warn',
    NODE_ENV: 'development',
    FILE_UPLOAD_FOLDER: path.join(serverDir, 'uploads'),
    CORS: 'true',
    JWT_SECRET: 'benchmarksecret',
    SESSION_SECRET: 'benchmarksessionsecret',
    URL: `http://localhost:${port}`,
  }

  if (useMongo) {
    env.MONGODB_URI =
      'mongodb://localhost:27017/apolloBenchmarkDb?directConnection=true'
    try {
      shell(
        'docker exec apollo-mongo-bench mongosh --quiet --eval "use apolloBenchmarkDb" --eval "db.dropDatabase()"',
      )
    } catch {
      // docker container might not be named this
    }
  } else {
    env.DB_BACKEND = 'sqlite'
    env.DB_CONNECTION_URL = dbFile
  }

  const child = spawn('node', ['dist/main.js'], {
    cwd: serverDir,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  })

  child.stderr.on('data', (data: Buffer) => {
    const msg = data.toString()
    if (msg.includes('Error') || msg.includes('EADDRINUSE')) {
      console.error(`[port ${port}] ${msg.trim()}`)
    }
  })

  return child
}

function killServer(child: ChildProcess) {
  if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already dead
    }
  }
}

// --- Profile setup ---

function configureProfile(profileName: string, port: number, cliDir?: string) {
  const apollo = 'pnpm dev'
  const dir = cliDir ?? CLI_DIR
  shell(
    `${apollo} config --profile ${profileName} address http://localhost:${port}`,
    dir,
  )
  shell(`${apollo} config --profile ${profileName} accessType root`, dir)
  shell(`${apollo} config --profile ${profileName} rootPassword pass`, dir)
  shell(`${apollo} login --profile ${profileName} -f`, dir)
}

// --- Benchmark scenarios ---

interface BenchmarkResult {
  scenario: string
  medianMs: number
  p95Ms: number
  iterations: number
}

function runBenchmarks(
  profile: string,
  gffFile: string,
  label: string,
  cliDir?: string,
): BenchmarkResult[] {
  const results: BenchmarkResult[] = []
  const effectiveCliDir = cliDir ?? CLI_DIR
  const apollo = 'pnpm dev'
  const P = `--profile ${profile}`

  function cliShell(cmd: string) {
    return shell(cmd, effectiveCliDir)
  }
  function cliShellTimed(cmd: string) {
    const start = performance.now()
    cliShell(cmd)
    return performance.now() - start
  }

  console.log(
    `\n  [${label}] Starting benchmarks with ${ITERATIONS} iterations each...`,
  )

  function cleanup() {
    try {
      const result = cliShell(`${apollo} assembly get ${P}`)
      const assemblies = JSON.parse(result) as { _id: string }[]
      for (const asm of assemblies) {
        cliShell(`${apollo} assembly delete ${P} -a ${asm._id}`)
      }
    } catch {
      // no assemblies
    }
  }

  // 1: Assembly import
  console.log(`  [${label}] Assembly import...`)
  const importTimes: number[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    cleanup()
    const ms = cliShellTimed(
      `${apollo} assembly add-from-gff ${gffFile} -a bench_asm -f ${P}`,
    )
    importTimes.push(ms)
    process.stdout.write(`    iteration ${i + 1}: ${formatMs(ms)}\n`)
  }
  results.push({
    scenario: 'Assembly import',
    medianMs: median(importTimes),
    p95Ms: p95(importTimes),
    iterations: ITERATIONS,
  })

  // Ensure assembly exists for remaining tests
  cleanup()
  cliShell(`${apollo} assembly add-from-gff ${gffFile} -a bench_asm -f ${P}`)

  // 2: Feature get (all features)
  console.log(`  [${label}] Feature get...`)
  const getTimes: number[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    const ms = cliShellTimed(
      `${apollo} feature get -a bench_asm ${P} > /dev/null`,
    )
    getTimes.push(ms)
    process.stdout.write(`    iteration ${i + 1}: ${formatMs(ms)}\n`)
  }
  results.push({
    scenario: 'Feature get (all)',
    medianMs: median(getTimes),
    p95Ms: p95(getTimes),
    iterations: ITERATIONS,
  })

  // 3: Feature search
  console.log(`  [${label}] Feature search...`)
  const searchTimes: number[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    const ms = cliShellTimed(
      `${apollo} feature search -a bench_asm -t mRNA ${P} > /dev/null`,
    )
    searchTimes.push(ms)
    process.stdout.write(`    iteration ${i + 1}: ${formatMs(ms)}\n`)
  }
  results.push({
    scenario: 'Feature search',
    medianMs: median(searchTimes),
    p95Ms: p95(searchTimes),
    iterations: ITERATIONS,
  })

  // 4: GFF3 export
  console.log(`  [${label}] GFF3 export...`)
  const exportTimes: number[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    const ms = cliShellTimed(`${apollo} export gff3 bench_asm ${P} > /dev/null`)
    exportTimes.push(ms)
    process.stdout.write(`    iteration ${i + 1}: ${formatMs(ms)}\n`)
  }
  results.push({
    scenario: 'GFF3 export',
    medianMs: median(exportTimes),
    p95Ms: p95(exportTimes),
    iterations: ITERATIONS,
  })

  // 5: Assembly delete (with cascade)
  console.log(`  [${label}] Assembly delete...`)
  const deleteTimes: number[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    cliShell(`${apollo} assembly add-from-gff ${gffFile} -a bench_del -f ${P}`)
    const ms = cliShellTimed(`${apollo} assembly delete -a bench_del ${P}`)
    deleteTimes.push(ms)
    process.stdout.write(`    iteration ${i + 1}: ${formatMs(ms)}\n`)
  }
  results.push({
    scenario: 'Assembly delete',
    medianMs: median(deleteTimes),
    p95Ms: p95(deleteTimes),
    iterations: ITERATIONS,
  })

  cleanup()
  return results
}

// --- Reporting ---

function buildMarkdownTable(
  mikroResults: BenchmarkResult[],
  mainResults: BenchmarkResult[] | null,
  datasetName: string,
) {
  let md = `# Apollo3 Performance Benchmark Results\n\n`
  md += `- **Date**: ${new Date().toISOString().split('T')[0]}\n`
  md += `- **Dataset**: ${datasetName}\n`
  md += `- **Iterations**: ${ITERATIONS}\n`
  md += `- **Node.js**: ${process.version}\n`
  md += `- **Platform**: ${os.platform()} ${os.arch()}\n\n`

  if (mainResults) {
    md +=
      '| Scenario | MikroORM/SQLite (median) | MikroORM/SQLite (p95) | MongoDB (median) | MongoDB (p95) | Speedup |\n'
    md +=
      '|----------|------------------------|----------------------|-----------------|--------------|--------|\n'
    for (const [i, mikroResult] of mikroResults.entries()) {
      const m = mikroResult
      const o = mainResults[i]
      const speedup = o.medianMs / m.medianMs
      const speedupStr =
        speedup >= 1
          ? `${speedup.toFixed(1)}x faster`
          : `${(1 / speedup).toFixed(1)}x slower`
      md += `| ${m.scenario} | ${formatMs(m.medianMs)} | ${formatMs(m.p95Ms)} | ${formatMs(o.medianMs)} | ${formatMs(o.p95Ms)} | ${speedupStr} |\n`
    }
  } else {
    md += '| Scenario | Median | p95 |\n'
    md += '|----------|--------|-----|\n'
    for (const m of mikroResults) {
      md += `| ${m.scenario} | ${formatMs(m.medianMs)} | ${formatMs(m.p95Ms)} |\n`
    }
  }

  md += '\n## Reproduction\n\n'
  md += '```bash\n'
  md += 'cd packages/apollo-cli\n'
  md += mainResults
    ? 'tsx src/test/benchmark.ts --compare\n'
    : 'tsx src/test/benchmark.ts\n'
  md += '```\n'

  return md
}

// --- Main ---

async function main() {
  console.log('Apollo3 Performance Benchmark')
  console.log('=============================\n')

  // Prepare data
  let gffFile: string
  let datasetName: string
  if (syntheticMode) {
    gffFile = generateSyntheticData()
    datasetName = 'Synthetic (1000 genes, ~5000 features)'
  } else if (skipDownload) {
    const chr22 = path.join(DATA_DIR, 'gencode.v49.chr22.gff3')
    if (!fs.existsSync(chr22)) {
      console.error(
        `Expected ${chr22} but --skip-download was set. Run without --skip-download first.`,
      )
      process.exit(1)
    }
    gffFile = chr22
    datasetName = 'GENCODE v49 chr22'
  } else {
    gffFile = downloadData()
    datasetName = 'GENCODE v49 chr22'
  }

  const featureCount = shell(`grep -c $'\t' ${gffFile} || true`)
  console.log(`Dataset: ${datasetName} (${featureCount} feature lines)\n`)

  // Build MikroORM branch
  console.log('Building MikroORM branch server...')
  shell('pnpm tsc -b', MIKRO_ORM_DIR)
  shell('pnpm build:shared', MIKRO_ORM_DIR)
  shell(
    'pnpm build',
    path.join(MIKRO_ORM_DIR, 'packages/apollo-collaboration-server'),
  )

  // Start MikroORM server
  console.log('Starting MikroORM server on port 3999...')
  const mikroServer = startServer(MIKRO_ORM_DIR, MIKRO_ORM_PORT, false)
  try {
    waitForServer(MIKRO_ORM_PORT)
  } catch (error) {
    killServer(mikroServer)
    throw new Error(`MikroORM server failed to start: ${error}`)
  }
  console.log('MikroORM server ready.')

  configureProfile('benchMikro', MIKRO_ORM_PORT, CLI_DIR)
  const mikroResults = runBenchmarks(
    'benchMikro',
    gffFile,
    'MikroORM/SQLite',
    CLI_DIR,
  )
  killServer(mikroServer)

  // Optionally run main branch comparison
  let mainResults: BenchmarkResult[] | null = null
  if (compareMode) {
    if (!fs.existsSync(MAIN_DIR)) {
      console.log(`\nCloning main branch to ${MAIN_DIR}...`)
      shell(
        `git clone ${MIKRO_ORM_DIR} ${MAIN_DIR} --branch main --single-branch`,
      )
      shell('pnpm install', MAIN_DIR)
    }

    console.log('\nBuilding main branch server...')
    try {
      shell('pnpm tsc -b', MAIN_DIR)
      shell('pnpm build:shared', MAIN_DIR)
      shell(
        'pnpm build',
        path.join(MAIN_DIR, 'packages/apollo-collaboration-server'),
      )
    } catch (error) {
      console.warn(`Main branch build failed: ${error}`)
      console.warn('Skipping MongoDB comparison.')
    }

    if (!mainResults) {
      console.log('Starting main branch server on port 4999...')
      const mainServer = startServer(MAIN_DIR, MAIN_PORT, true)
      try {
        waitForServer(MAIN_PORT)
        console.log('Main branch server ready.')

        const mainCliDir = path.join(MAIN_DIR, 'packages/apollo-cli')
        configureProfile('benchMain', MAIN_PORT, mainCliDir)
        mainResults = runBenchmarks('benchMain', gffFile, 'MongoDB', mainCliDir)
      } catch (error) {
        console.warn(`Main branch server failed: ${error}`)
      } finally {
        killServer(mainServer)
      }
    }
  }

  // Report
  const md = buildMarkdownTable(mikroResults, mainResults, datasetName)
  console.log(`\n${md}`)

  const resultsFile = path.join(MIKRO_ORM_DIR, 'docs/benchmark-results.md')
  fs.writeFileSync(resultsFile, md)
  console.log(`Results saved to ${resultsFile}`)
}

main().catch((error) => {
  console.error('Benchmark failed:', error)
  // Try to kill any stray servers
  try {
    shell(`lsof -ti:${MIKRO_ORM_PORT} | xargs kill -9 2>/dev/null || true`)
  } catch {
    /* */
  }
  try {
    shell(`lsof -ti:${MAIN_PORT} | xargs kill -9 2>/dev/null || true`)
  } catch {
    /* */
  }
  process.exit(1)
})
