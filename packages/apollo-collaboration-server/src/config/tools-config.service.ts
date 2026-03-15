import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

interface ToolConfig {
  enabled: boolean
  singularity: boolean
  executable: string
  script?: string
  model?: string
  maxRegionSize: number
  timeout: number
}

interface ToolsFileConfig {
  tools?: Record<string, Partial<ToolConfig>>
}

const defaultToolConfig: ToolConfig = {
  enabled: false,
  singularity: false,
  executable: 'python',
  maxRegionSize: 10_000_000,
  timeout: 3_600_000,
}

@Injectable()
export class ToolsConfigService implements OnModuleInit {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<{
      APOLLO_TOOLS_CONFIG: string
    }>,
  ) {}

  private readonly logger = new Logger(ToolsConfigService.name)
  private toolConfigs = new Map<string, ToolConfig>()
  private detectedBinaries = new Map<string, boolean>()

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
    if (parsed?.tools) {
      for (const [name, config] of Object.entries(parsed.tools)) {
        this.toolConfigs.set(name, { ...defaultToolConfig, ...config })
      }
      this.logger.log(
        `Loaded tools config: ${[...this.toolConfigs.keys()].join(', ')}`,
      )
    }
  }

  private autoDetect() {
    for (const binary of ['tiberius.py', 'singularity']) {
      const found = this.whichExists(binary)
      this.detectedBinaries.set(binary, found)
      if (found) {
        this.logger.log(`Auto-detected "${binary}" on PATH`)
      }
    }

    if (
      !this.toolConfigs.has('tiberius') &&
      this.detectedBinaries.get('tiberius.py')
    ) {
      this.toolConfigs.set('tiberius', {
        ...defaultToolConfig,
        enabled: true,
        script: 'tiberius.py',
        singularity: this.detectedBinaries.get('singularity') ?? false,
      })
      this.logger.log('Auto-configured Tiberius from PATH detection')
    }
  }

  private whichExists(binary: string) {
    try {
      execSync(`which ${binary}`, { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  getToolConfig(toolName: string) {
    return this.toolConfigs.get(toolName)
  }

  isToolAvailable(toolName: string) {
    const config = this.toolConfigs.get(toolName)
    return config?.enabled ?? false
  }

  isSingularityAvailable() {
    return this.detectedBinaries.get('singularity') ?? false
  }
}
