import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { OmniDeckPlugin, PluginContext } from "../../types.js";

export const corePlugin: OmniDeckPlugin = {
  id: "omnideck-core",
  name: "OmniDeck Core",
  version: "1.0.0",
  icon: "ms:settings",

  async init(ctx: PluginContext) {
    const pageHistory: string[] = [];

    const changePageSchema = z.object({
      page: field(z.string(), { label: "Page", fieldType: "page" }),
    });

    ctx.registerAction({
      id: "change_page",
      name: "Change Page",
      description: "Navigate to a different page",
      icon: "ms:tab",
      paramsSchema: changePageSchema,
      async execute(params) {
        const { page } = changePageSchema.parse(params);
        const current = ctx.state.get("omnideck-core", "current_page") as
          | string
          | undefined;
        if (current !== undefined) {
          pageHistory.push(current);
        }
        ctx.state.set("omnideck-core", "current_page", page);
      },
    });

    ctx.registerAction({
      id: "go_back",
      name: "Go Back",
      description: "Go back to the previous page",
      icon: "ms:arrow-back",
      async execute() {
        const prev = pageHistory.pop();
        if (prev !== undefined) {
          ctx.state.set("omnideck-core", "current_page", prev);
        }
      },
    });

    const setBrightnessSchema = z.object({
      brightness: field(z.number().min(0).max(100), { label: "Brightness" }),
    });

    ctx.registerAction({
      id: "set_brightness",
      name: "Set Brightness",
      description: "Set deck brightness",
      icon: "ms:brightness-6",
      paramsSchema: setBrightnessSchema,
      async execute(params) {
        const { brightness } = setBrightnessSchema.parse(params);
        ctx.state.set("omnideck-core", "brightness", brightness);
      },
    });

    ctx.registerAction({
      id: "sleep_deck",
      name: "Sleep Deck",
      description: "Put the deck to sleep",
      icon: "ms:bedtime",
      async execute() {
        ctx.state.set("omnideck-core", "sleeping", true);
      },
    });

    ctx.registerAction({
      id: "reload_config",
      name: "Reload Config",
      description: "Reload the configuration",
      icon: "ms:refresh",
      async execute() {
        ctx.state.set("omnideck-core", "reload_requested", true);
      },
    });

    ctx.setHealth({ status: "ok" });
  },

  async destroy() {},
};
