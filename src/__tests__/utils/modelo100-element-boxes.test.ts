/**
 * Unit tests for modelo100ElementBoxes (src/utils/crypto/fifo.ts).
 *
 * Verifies the net-of-fee rule: 1804 = transmissionValue - transmissionFee,
 * 1806 = acquisitionValue + acquisitionFee, and 1804-1806 splits into
 * 1809 (gain) or 1807 (loss), with break-even producing zeros on both.
 */

import { modelo100ElementBoxes } from '@/utils/crypto/fifo';

describe('modelo100ElementBoxes', () => {
  it('subtracts the transmission fee for 1804 and adds the acquisition fee for 1806 (gain)', () => {
    const boxes = modelo100ElementBoxes({
      transmissionValueCents: 100_000,
      transmissionFeeCents: 500,
      acquisitionValueCents: 60_000,
      acquisitionFeeCents: 1_000,
    });
    expect(boxes.box1804Cents).toBe(99_500); // 100000 - 500 (net of selling fee)
    expect(boxes.box1806Cents).toBe(61_000); // 60000 + 1000 (incl. buying fee)
    expect(boxes.box1809Cents).toBe(38_500); // gain = 99500 - 61000
    expect(boxes.box1807Cents).toBe(0);
  });

  it('routes a negative result to 1807 (loss) and keeps 1809 zero', () => {
    const boxes = modelo100ElementBoxes({
      transmissionValueCents: 50_000,
      transmissionFeeCents: 2_000,
      acquisitionValueCents: 60_000,
      acquisitionFeeCents: 1_000,
    });
    expect(boxes.box1804Cents).toBe(48_000);
    expect(boxes.box1806Cents).toBe(61_000);
    expect(boxes.box1807Cents).toBe(13_000); // |48000 - 61000|
    expect(boxes.box1809Cents).toBe(0);
  });

  it('produces zero gain and zero loss at break-even', () => {
    const boxes = modelo100ElementBoxes({
      transmissionValueCents: 61_000,
      transmissionFeeCents: 1_000,
      acquisitionValueCents: 59_000,
      acquisitionFeeCents: 1_000,
    });
    expect(boxes.box1804Cents).toBe(60_000);
    expect(boxes.box1806Cents).toBe(60_000);
    expect(boxes.box1807Cents).toBe(0);
    expect(boxes.box1809Cents).toBe(0);
  });
});
