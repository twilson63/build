export const anthropicBrandGuidelines = `Anthropic brand guide:
- Main colors: Dark #141413, Light #faf9f5, Mid Gray #b0aea5, Light Gray #e8e6dc.
- Accent colors: Orange #d97757, Blue #6a9bcc, Green #788c5d.
- Typography: headings use Poppins with Arial fallback; body text uses Lora with Georgia fallback.
- Use brand colors with restrained confidence, preserving readability and hierarchy.`

export const anthropicFrontendDesignSkill = `Frontend design skill:
- Build distinctive, production-grade interfaces with a clear aesthetic point of view.
- Avoid generic AI aesthetics: predictable SaaS layouts, purple gradients, nested cards, default fonts, and cookie-cutter components.
- Make deliberate choices in typography, color, spacing, layout, motion, and visual details.
- Match implementation complexity to the aesthetic vision: maximal designs need rich details; minimal designs need precision.
- Use accessible, working code and preserve app functionality.`

export const scoutBrandStyles = `Scout Studio observed brand styles from https://studio.scoutos.com:
- Overall register: restrained product UI, crisp, quiet, high-trust, monochrome-first.
- Font: GeistSans with GeistSans Fallback; use system sans fallback only after Geist.
- Base background: white / oklch(1 0 0); primary text around oklch(0.3211 0 0) or rgb(33 33 38).
- Secondary text: dark text at roughly 65% opacity.
- Primary controls: near-charcoal rgb(47 48 55) backgrounds with white text.
- Inputs/buttons: compact 13px text, 6px border radius, 6px 12px padding, subtle 1px ring shadows instead of heavy borders.
- Shadows: minimal layered rings and tiny elevation, e.g. 0 0 0 1px low-alpha black plus small 1-3px y shadow.
- Layout: compact, centered authentication/product surfaces with generous surrounding whitespace.
- Avoid decorative gradients; prefer precise spacing, crisp controls, and quiet contrast.`

export function designGuidancePrompt() {
  return `${anthropicFrontendDesignSkill}\n\n${anthropicBrandGuidelines}\n\n${scoutBrandStyles}`
}
