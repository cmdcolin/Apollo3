import type { PipeTransform, ArgumentMetadata } from '@nestjs/common'
import { BadRequestException } from '@nestjs/common'
import type { ZodSchema } from 'zod'

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException(result.error.issues)
    }
    return result.data
  }
}
