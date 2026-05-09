import { FONT_LOAD_PROBE_PX } from "@/lib/constants";
import { BUNDLED_NERD_FONT_FAMILY, type TerminalFont } from "@/lib/terminal-fonts";

const FONT_LOAD_PROBE_TEXT = "BESbswy \ue0b0 \uf120";

export const awaitFontReady = async (font: TerminalFont): Promise<void> => {
  if (typeof document === "undefined") return;
  if (!font.name) return;
  const fontFamilies = Array.from(new Set([font.name, BUNDLED_NERD_FONT_FAMILY]));
  try {
    await Promise.all(
      fontFamilies.flatMap((fontFamily) => [
        document.fonts.load(`${FONT_LOAD_PROBE_PX}px "${fontFamily}"`, FONT_LOAD_PROBE_TEXT),
        document.fonts.load(`bold ${FONT_LOAD_PROBE_PX}px "${fontFamily}"`, FONT_LOAD_PROBE_TEXT),
      ]),
    );
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`[localterm] failed to load font "${font.name}":`, error);
    }
  }
};
