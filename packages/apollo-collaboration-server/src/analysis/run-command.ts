import { execFile } from 'node:child_process'

export function runCommand(
  cmd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      cmd,
      args,
      { signal, maxBuffer: 100 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`${cmd} failed: ${stderr || err.message}`))
        } else {
          resolve({ stdout, stderr })
        }
      },
    )
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          proc.kill()
        },
        { once: true },
      )
    }
  })
}
