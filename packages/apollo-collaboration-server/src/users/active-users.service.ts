import { Injectable } from '@nestjs/common'

const ACTIVE_WINDOW_MS = 5 * 60 * 1000

@Injectable()
export class ActiveUsersService {
  private readonly lastSeen = new Map<string, number>()

  touch(userId: string) {
    this.lastSeen.set(userId, Date.now())
  }

  getActiveCount() {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS
    let count = 0
    for (const [id, ts] of this.lastSeen) {
      if (ts >= cutoff) {
        count++
      } else {
        this.lastSeen.delete(id)
      }
    }
    return count
  }
}
