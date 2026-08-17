import vinext from "vinext";
import { defineConfig } from "vite";
import packageJson from "./package.json";

const appVersion = process.env.APP_VERSION ?? packageJson.version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [vinext()],
});
