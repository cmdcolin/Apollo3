import { nanoid } from 'nanoid'

const ID_LENGTH = 12

export function featureId() {
  return `f-${nanoid(ID_LENGTH)}`
}

export function assemblyId() {
  return `asm-${nanoid(ID_LENGTH)}`
}

export function refSeqId() {
  return `rs-${nanoid(ID_LENGTH)}`
}

export function userId() {
  return `u-${nanoid(ID_LENGTH)}`
}

export function changeId() {
  return `ch-${nanoid(ID_LENGTH)}`
}

export function checkResultId() {
  return `cr-${nanoid(ID_LENGTH)}`
}

export function fileId() {
  return `fl-${nanoid(ID_LENGTH)}`
}

export function organismId() {
  return `org-${nanoid(ID_LENGTH)}`
}

export function trackConfigId() {
  return `tc-${nanoid(ID_LENGTH)}`
}

export function historyId() {
  return `fh-${nanoid(ID_LENGTH)}`
}

export function analysisId() {
  return `an-${nanoid(ID_LENGTH)}`
}

export function permissionId() {
  return `pm-${nanoid(ID_LENGTH)}`
}

export function genericId() {
  return `id-${nanoid(ID_LENGTH)}`
}
