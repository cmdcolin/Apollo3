import { ForbiddenException, UnauthorizedException } from '@nestjs/common'

import { Role } from './role/role.enum.js'
import { RolesGuard } from './roles.guard.js'

function makeUser(role: Role) {
  return {
    username: 'testuser',
    email: 'test@example.com',
    role,
    id: 'user-123',
    iat: 1000,
    exp: 2000,
  }
}

function makeReflector(metadata: Record<string, unknown>) {
  return {
    getAllAndOverride(key: string) {
      return metadata[key]
    },
  }
}

function makeContext(user?: ReturnType<typeof makeUser>) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  }
}

describe('RolesGuard', () => {
  describe('public routes', () => {
    it('allows access with no user', () => {
      const reflector = makeReflector({ isPublic: true })
      const guard = new RolesGuard(reflector as never)
      const context = makeContext()
      expect(guard.canActivate(context as never)).toBe(true)
    })

    it('allows access with any user', () => {
      const reflector = makeReflector({ isPublic: true })
      const guard = new RolesGuard(reflector as never)
      const context = makeContext(makeUser(Role.ReadOnly))
      expect(guard.canActivate(context as never)).toBe(true)
    })
  })

  describe('missing user', () => {
    it('throws UnauthorizedException when no user is present', () => {
      const reflector = makeReflector({ roles: Role.None })
      const guard = new RolesGuard(reflector as never)
      const context = makeContext()
      expect(() => guard.canActivate(context as never)).toThrow(
        UnauthorizedException,
      )
    })
  })

  describe('@Authenticated() (Role.None)', () => {
    const roles = [Role.None, Role.ReadOnly, Role.User, Role.Admin] as const
    for (const role of roles) {
      it(`allows ${role} user`, () => {
        const reflector = makeReflector({ roles: Role.None })
        const guard = new RolesGuard(reflector as never)
        const context = makeContext(makeUser(role))
        expect(guard.canActivate(context as never)).toBe(true)
      })
    }
  })

  describe('admin user', () => {
    const allowed = [Role.None, Role.ReadOnly, Role.User, Role.Admin] as const
    for (const requiredRole of allowed) {
      it(`can access ${requiredRole} endpoint`, () => {
        const reflector = makeReflector({ roles: requiredRole })
        const guard = new RolesGuard(reflector as never)
        const context = makeContext(makeUser(Role.Admin))
        expect(guard.canActivate(context as never)).toBe(true)
      })
    }
  })

  describe('user role', () => {
    const allowed = [Role.None, Role.ReadOnly, Role.User] as const
    for (const requiredRole of allowed) {
      it(`can access ${requiredRole} endpoint`, () => {
        const reflector = makeReflector({ roles: requiredRole })
        const guard = new RolesGuard(reflector as never)
        const context = makeContext(makeUser(Role.User))
        expect(guard.canActivate(context as never)).toBe(true)
      })
    }

    it('cannot access admin endpoint', () => {
      const reflector = makeReflector({ roles: Role.Admin })
      const guard = new RolesGuard(reflector as never)
      const context = makeContext(makeUser(Role.User))
      expect(() => guard.canActivate(context as never)).toThrow(
        ForbiddenException,
      )
    })
  })

  describe('readOnly role', () => {
    const allowed = [Role.None, Role.ReadOnly] as const
    for (const requiredRole of allowed) {
      it(`can access ${requiredRole} endpoint`, () => {
        const reflector = makeReflector({ roles: requiredRole })
        const guard = new RolesGuard(reflector as never)
        const context = makeContext(makeUser(Role.ReadOnly))
        expect(guard.canActivate(context as never)).toBe(true)
      })
    }

    const denied = [Role.User, Role.Admin] as const
    for (const requiredRole of denied) {
      it(`cannot access ${requiredRole} endpoint`, () => {
        const reflector = makeReflector({ roles: requiredRole })
        const guard = new RolesGuard(reflector as never)
        const context = makeContext(makeUser(Role.ReadOnly))
        expect(() => guard.canActivate(context as never)).toThrow(
          ForbiddenException,
        )
      })
    }
  })

  describe('none role', () => {
    it('can access none endpoint', () => {
      const reflector = makeReflector({ roles: Role.None })
      const guard = new RolesGuard(reflector as never)
      const context = makeContext(makeUser(Role.None))
      expect(guard.canActivate(context as never)).toBe(true)
    })

    const denied = [Role.ReadOnly, Role.User, Role.Admin] as const
    for (const requiredRole of denied) {
      it(`cannot access ${requiredRole} endpoint`, () => {
        const reflector = makeReflector({ roles: requiredRole })
        const guard = new RolesGuard(reflector as never)
        const context = makeContext(makeUser(Role.None))
        expect(() => guard.canActivate(context as never)).toThrow(
          ForbiddenException,
        )
      })
    }
  })
})
