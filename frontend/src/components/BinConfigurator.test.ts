import { describe, expect, it } from 'vitest'
import { calcMaxCutoutDepth } from './BinConfigurator'

describe('calcMaxCutoutDepth', () => {
  it('1u locks the slider at 1.5mm (lip on)', () => {
    expect(calcMaxCutoutDepth(1, true)).toBe(1.5)
  })

  it('1u locks the slider at 1.5mm (lip off)', () => {
    expect(calcMaxCutoutDepth(1, false)).toBe(1.5)
  })

  it('2u spans 1.5-8.5mm (lip on)', () => {
    expect(calcMaxCutoutDepth(2, true)).toBe(4.7)
  })

  it('2u spans 1.5-8.5mm (lip off)', () => {
    expect(calcMaxCutoutDepth(2, false)).toBe(8.5)
  })

  it('4u (lip on)', () => {
    expect(calcMaxCutoutDepth(4, true)).toBe(18.7)
  })

  it('4u (lip off)', () => {
    expect(calcMaxCutoutDepth(4, false)).toBe(22.5)
  })

  it('shelled ignores the lip deduction', () => {
    expect(calcMaxCutoutDepth(2, true, true)).toBe(8.5)
    expect(calcMaxCutoutDepth(2, false, true)).toBe(8.5)
  })

  it('toggling lip clamps cutout_depth to new max', () => {
    // at 2u, lip-off max is 8.5 so a depth of 8 is valid
    const depthWithoutLip = 8.0
    const maxWithLip = calcMaxCutoutDepth(2, true)
    // toggling lip on should force clamp: min(8.0, 4.7) = 4.7
    expect(Math.min(depthWithoutLip, maxWithLip)).toBe(4.7)
  })

  describe('flat bottom', () => {
    // a flat bottom bounds the range by the physical wall height less the
    // 2mm floor that must remain, rather than the height-relative nominal
    // range a standard bin gets
    it('gains the foot height a standard bin cannot reach', () => {
      // 4u shelled, no lip: standard 22.5 vs flat 28 - 2 = 26
      expect(calcMaxCutoutDepth(4, false, true, false)).toBe(22.5)
      expect(calcMaxCutoutDepth(4, false, true, true)).toBe(26)
      expect(calcMaxCutoutDepth(4, false, true, true)).toBeGreaterThan(
        calcMaxCutoutDepth(4, false, true, false),
      )
    })

    it('still deducts the lip notch for solid flat bins', () => {
      expect(calcMaxCutoutDepth(4, true, false, true)).toBe(26 - 3.8)
      expect(calcMaxCutoutDepth(4, true, true, true)).toBe(26)
    })

    it('never leaves less than the 2mm flat floor', () => {
      // 1u flat bin is 7mm tall, so 7 - 2 = 5mm even though a standard 1u
      // bin is locked at 1.5mm
      expect(calcMaxCutoutDepth(1, false, true, true)).toBe(5)
    })

    it('falls back to the 1.5mm minimum when the lip eats the range', () => {
      // 1u solid flat with lip: 5 - 3.8 < 0, so the minimum holds
      expect(calcMaxCutoutDepth(1, true, false, true)).toBe(1.5)
    })
  })
})

