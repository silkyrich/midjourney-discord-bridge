/**
 * Extract button custom_ids from message components.
 * MJ messages include action rows with buttons like U1-U4, V1-V4, etc.
 */
export function extractButtons(components) {
  const buttons = {};

  for (const row of components) {
    const rowComponents = row.components || [];
    for (const comp of rowComponents) {
      if (comp.type !== 2) continue; // Only buttons
      const customId = comp.custom_id || comp.customId;
      if (!customId) continue;

      const label = comp.label || '';
      const emoji = comp.emoji?.name || '';

      // Map known button patterns
      if (/U1/i.test(label) || /U1/i.test(emoji)) buttons.U1 = customId;
      else if (/U2/i.test(label) || /U2/i.test(emoji)) buttons.U2 = customId;
      else if (/U3/i.test(label) || /U3/i.test(emoji)) buttons.U3 = customId;
      else if (/U4/i.test(label) || /U4/i.test(emoji)) buttons.U4 = customId;
      else if (/V1/i.test(label) || /V1/i.test(emoji)) buttons.V1 = customId;
      else if (/V2/i.test(label) || /V2/i.test(emoji)) buttons.V2 = customId;
      else if (/V3/i.test(label) || /V3/i.test(emoji)) buttons.V3 = customId;
      else if (/V4/i.test(label) || /V4/i.test(emoji)) buttons.V4 = customId;
      else if (/🔄|redo/i.test(label + emoji)) buttons.reroll = customId;

      // Also store by custom_id pattern for direct lookups
      // MJ custom_ids follow patterns like: MJ::JButton::xxxx::1 (upscale index 1)
      const indexMatch = customId.match(/::(\d)$/);
      if (indexMatch) {
        const idx = indexMatch[1];
        if (customId.includes('upsample') || customId.includes('Upscale')) {
          buttons[`U${idx}`] = buttons[`U${idx}`] || customId;
        } else if (customId.includes('variation') || customId.includes('Variation')) {
          buttons[`V${idx}`] = buttons[`V${idx}`] || customId;
        }
      }
    }
  }

  return buttons;
}

/**
 * Get the custom_id for an upscale button (1-4).
 */
export function getUpscaleButtonId(components, index) {
  const buttons = extractButtons(components);
  return buttons[`U${index}`] || null;
}

/**
 * Get the custom_id for a variation button (1-4).
 */
export function getVariationButtonId(components, index) {
  const buttons = extractButtons(components);
  return buttons[`V${index}`] || null;
}
