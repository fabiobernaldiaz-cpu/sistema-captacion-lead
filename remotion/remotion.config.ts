import { Config } from "@remotion/cli/config";

// WebGL sin GPU: SwiftShader a través de ANGLE. Más lento que una GPU, pero
// determinista y funciona en cualquier máquina (también en CI).
Config.setChromiumOpenGlRenderer("swangle");
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);

// En el contenedor de trabajo usamos el Chromium preinstalado; en tu equipo,
// si no defines la variable, Remotion descarga el suyo automáticamente.
if (process.env.REMOTION_BROWSER) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
}
