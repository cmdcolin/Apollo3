import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'

import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

interface TiberiusConfig {
  enabled: boolean
  tiberiusPath: string
  modelCfg?: string
  useSingularity: boolean
  maxRegionSize: number
  timeout: number
}

interface ToolsFileConfig {
  tools?: {
    tiberius?: Partial<TiberiusConfig>
  }
}

const defaultTiberiusConfig: TiberiusConfig = {
  enabled: false,
  tiberiusPath: '',
  useSingularity: false,
  maxRegionSize: 10_000_000,
  timeout: 3_600_000,
}

// Common locations to probe for tiberius.py
const TIBERIUS_PROBE_PATHS = [
  '~/src/Tiberius/tiberius.py',
  '~/Tiberius/tiberius.py',
  '/opt/Tiberius/tiberius.py',
]

@Injectable()
export class ToolsConfigService implements OnModuleInit {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<{
      APOLLO_TOOLS_CONFIG: string
      TIBERIUS_PATH: string
      TIBERIUS_MODEL_CFG: string
    }>,
  ) {}

  private readonly logger = new Logger(ToolsConfigService.name)
  private tiberiusConfig: TiberiusConfig = { ...defaultTiberiusConfig }

  onModuleInit() {
    this.loadConfigFile()
    this.autoDetect()
  }

  private loadConfigFile() {
    const configPath =
      this.configService.get('APOLLO_TOOLS_CONFIG') ?? 'apollo-tools.json'
    if (!existsSync(configPath)) {
      this.logger.log(
        `No tools config file found at "${configPath}", using auto-detection`,
      )
      return
    }
    const raw = readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw) as ToolsFileConfig | undefined
    if (parsed?.tools?.tiberius) {
      this.tiberiusConfig = {
        ...defaultTiberiusConfig,
        ...parsed.tools.tiberius,
      }
      this.logger.log(`Loaded Tiberius config from ${configPath}`)
    }
  }

  private autoDetect() {
    // Environment variable takes highest priority
    const envPath = this.configService.get('TIBERIUS_PATH')
    if (envPath) {
      const resolved = this.expandHome(envPath)
      if (existsSync(resolved)) {
        this.tiberiusConfig = {
          ...this.tiberiusConfig,
          enabled: true,
          tiberiusPath: resolved,
        }
        this.logger.log(`Tiberius configured from TIBERIUS_PATH: ${resolved}`)
        this.applyEnvModelCfg()
        return
      }
      this.logger.warn(`TIBERIUS_PATH set but not found: ${resolved}`)
    }

    // If already configured from file, don't auto-detect
    if (this.tiberiusConfig.enabled) {
      this.applyEnvModelCfg()
      return
    }

    // Check if tiberius.py is on PATH
    const onPath = this.whichPath('tiberius.py')
    if (onPath) {
      this.tiberiusConfig = {
        ...this.tiberiusConfig,
        enabled: true,
        tiberiusPath: onPath,
      }
      this.logger.log(`Auto-detected tiberius.py on PATH: ${onPath}`)
      this.applyEnvModelCfg()
      return
    }

    // Probe common filesystem locations
    for (const probePath of TIBERIUS_PROBE_PATHS) {
      const resolved = this.expandHome(probePath)
      if (existsSync(resolved)) {
        this.tiberiusConfig = {
          ...this.tiberiusConfig,
          enabled: true,
          tiberiusPath: resolved,
        }
        this.logger.log(`Auto-detected Tiberius at ${resolved}`)
        this.applyEnvModelCfg()
        return
      }
    }

    this.logger.log(
      'Tiberius not found. Set TIBERIUS_PATH or install tiberius.py on PATH.',
    )
  }

  private applyEnvModelCfg() {
    const envModelCfg = this.configService.get('TIBERIUS_MODEL_CFG')
    if (envModelCfg && !this.tiberiusConfig.modelCfg) {
      this.tiberiusConfig.modelCfg = envModelCfg
      this.logger.log(`Tiberius model config from env: ${envModelCfg}`)
    }
  }

  private expandHome(p: string) {
    if (p.startsWith('~/')) {
      return resolve(homedir(), p.slice(2))
    }
    return resolve(p)
  }

  private whichPath(binary: string) {
    try {
      return execSync(`which ${binary}`, { stdio: 'pipe' }).toString().trim()
    } catch {
      return undefined
    }
  }

  getTiberiusConfig() {
    return this.tiberiusConfig
  }

  listTiberiusModelConfigs() {
    if (!this.tiberiusConfig.enabled || !this.tiberiusConfig.tiberiusPath) {
      return []
    }
    const tiberiusDir = dirname(this.tiberiusConfig.tiberiusPath)
    const modelCfgDir = resolve(tiberiusDir, 'model_cfg')
    if (!existsSync(modelCfgDir)) {
      return []
    }
    const files = readdirSync(modelCfgDir)
    return files
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map((f) => f.replace(/\.(yaml|yml)$/, ''))
      .sort()
  }

  isToolAvailable(toolName: string) {
    if (toolName === 'tiberius') {
      return this.tiberiusConfig.enabled
    }
    return false
  }

  // Keep for backwards compatibility with availability endpoint
  getToolConfig(toolName: string) {
    if (toolName === 'tiberius') {
      return this.tiberiusConfig
    }
    return undefined
  }

  isSingularityAvailable() {
    try {
      execSync('which singularity', { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }
}
