import type { OmniDeckPlugin, PluginContext } from "../../types.js";

export const corePlugin: OmniDeckPlugin = {
  id: "omnideck-core",
  name: "OmniDeck Core",
  version: "1.0.0",

  async init(ctx: PluginContext) {
    const pageHistory: string[] = [];

    ctx.registerAction({
      id: "change_page",
      name: "Change Page",
      async execute(params) {
        const { page } = params as { page: string };
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
      async execute() {
        const prev = pageHistory.pop();
        if (prev !== undefined) {
          ctx.state.set("omnideck-core", "current_page", prev);
        }
      },
    });

    ctx.registerAction({
      id: "set_brightness",
      name: "Set Brightness",
      async execute(params) {
        const { brightness } = params as { brightness: number };
        ctx.state.set("omnideck-core", "brightness", brightness);
      },
    });

    ctx.registerAction({
      id: "sleep_deck",
      name: "Sleep Deck",
      async execute() {
        ctx.state.set("omnideck-core", "sleeping", true);
      },
    });

    ctx.registerAction({
      id: "reload_config",
      name: "Reload Config",
      async execute() {
        ctx.state.set("omnideck-core", "reload_requested", true);
      },
    });
  },

  async destroy() {},
};
