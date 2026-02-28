/**
 * Extract button custom_ids from message components.
 * MJ messages include action rows with buttons like U1-U4, V1-V4,
 * vary strong/subtle, zoom, pan, upscale subtle/creative, etc.
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
      const combined = label + emoji;

      // Upscale buttons U1-U4
      if (/U1/i.test(combined)) buttons.U1 = customId;
      else if (/U2/i.test(combined)) buttons.U2 = customId;
      else if (/U3/i.test(combined)) buttons.U3 = customId;
      else if (/U4/i.test(combined)) buttons.U4 = customId;

      // Variation buttons V1-V4
      else if (/V1/i.test(combined)) buttons.V1 = customId;
      else if (/V2/i.test(combined)) buttons.V2 = customId;
      else if (/V3/i.test(combined)) buttons.V3 = customId;
      else if (/V4/i.test(combined)) buttons.V4 = customId;

      // Reroll
      else if (/🔄|redo/i.test(combined)) buttons.reroll = customId;

      // Vary (Strong / Subtle) — on upscaled images
      else if (/vary.*strong/i.test(label)) buttons.vary_strong = customId;
      else if (/vary.*subtle/i.test(label)) buttons.vary_subtle = customId;
      else if (/vary.*region/i.test(label)) buttons.vary_region = customId;

      // Upscale (Subtle / Creative) — on upscaled images (v5+)
      else if (/upscale.*subtle/i.test(label)) buttons.upscale_subtle = customId;
      else if (/upscale.*creative/i.test(label)) buttons.upscale_creative = customId;
      else if (/upscale.*\(2x\)/i.test(label)) buttons.upscale_2x = customId;
      else if (/upscale.*\(4x\)/i.test(label)) buttons.upscale_4x = customId;

      // Zoom out
      else if (/zoom out 2x/i.test(label)) buttons.zoom_out_2x = customId;
      else if (/zoom out 1\.5x/i.test(label)) buttons.zoom_out_1_5x = customId;
      else if (/custom zoom/i.test(label)) buttons.custom_zoom = customId;

      // Pan directions
      else if (/⬅️|pan.*left/i.test(combined)) buttons.pan_left = customId;
      else if (/➡️|pan.*right/i.test(combined)) buttons.pan_right = customId;
      else if (/⬆️|pan.*up/i.test(combined)) buttons.pan_up = customId;
      else if (/⬇️|pan.*down/i.test(combined)) buttons.pan_down = customId;

      // Make Square
      else if (/make.*square/i.test(label)) buttons.make_square = customId;

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

      // Pattern-based extraction from custom_id strings
      if (/vary_strong|high_variation/i.test(customId)) buttons.vary_strong = buttons.vary_strong || customId;
      if (/vary_subtle|low_variation/i.test(customId)) buttons.vary_subtle = buttons.vary_subtle || customId;
      if (/vary_region|inpaint/i.test(customId)) buttons.vary_region = buttons.vary_region || customId;
      if (/zoom_out_2x|outpaint::50/i.test(customId)) buttons.zoom_out_2x = buttons.zoom_out_2x || customId;
      if (/zoom_out_1\.5x|outpaint::75/i.test(customId)) buttons.zoom_out_1_5x = buttons.zoom_out_1_5x || customId;
      if (/custom_zoom/i.test(customId)) buttons.custom_zoom = buttons.custom_zoom || customId;
      if (/pan_left/i.test(customId)) buttons.pan_left = buttons.pan_left || customId;
      if (/pan_right/i.test(customId)) buttons.pan_right = buttons.pan_right || customId;
      if (/pan_up/i.test(customId)) buttons.pan_up = buttons.pan_up || customId;
      if (/pan_down/i.test(customId)) buttons.pan_down = buttons.pan_down || customId;
      if (/reroll/i.test(customId)) buttons.reroll = buttons.reroll || customId;
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

/**
 * Get a button custom_id by action name.
 * Action names: reroll, vary_strong, vary_subtle, vary_region,
 *   upscale_subtle, upscale_creative, upscale_2x, upscale_4x,
 *   zoom_out_2x, zoom_out_1_5x, custom_zoom,
 *   pan_left, pan_right, pan_up, pan_down, make_square
 */
export function getActionButtonId(components, action) {
  const buttons = extractButtons(components);
  return buttons[action] || null;
}
