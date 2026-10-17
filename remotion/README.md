# Escenas 3D de RedesiaNet (Remotion)

| Composición | Uso | Tamaño |
|---|---|---|
| `HeroCore` | Vídeo en bucle de la portada: esfera negra (el agente) con órbitas y destellos cian (tareas que pasan entre tus sistemas) | 1280×1280, 12 s |
| `AgentFlow` | Cabecera de Método: cubos desordenados que salen ordenados al cruzar el anillo | 1920×820, 12 s |
| `OgImage` | Imagen para compartir en redes (`og:image`) | 1200×630 |

Todo el movimiento depende del fotograma y da un número entero de vueltas por bucle, así que los vídeos enlazan sin salto.

```bash
npm install
npm run studio     # previsualizar y ajustar
npm run render     # genera out/*.mp4 y out/*.png
```

Sin GPU (servidores, CI) se usa SwiftShader (`swangle`, ya configurado en `remotion.config.ts`). Para usar un Chrome concreto: `REMOTION_BROWSER=/ruta/a/chrome npm run render`.

## De los masters a la web

```bash
V=../web/assets/video
# Portada
ffmpeg -i out/hero-core-master.mp4 -vf scale=1080:1080:flags=lanczos -c:v libx264 -crf 26 -preset slower -tune animation -pix_fmt yuv420p -movflags +faststart -an $V/hero-core-1080.mp4
ffmpeg -i out/hero-core-master.mp4 -vf scale=720:720:flags=lanczos   -c:v libx264 -crf 27 -preset slower -tune animation -pix_fmt yuv420p -movflags +faststart -an $V/hero-core-720.mp4
ffmpeg -i out/hero-core-master.mp4 -vf scale=1080:1080:flags=lanczos -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 -pix_fmt yuv420p -an $V/hero-core-1080.webm
ffmpeg -i out/hero-core-master.mp4 -vf scale=720:720:flags=lanczos   -c:v libvpx-vp9 -crf 39 -b:v 0 -row-mt 1 -pix_fmt yuv420p -an $V/hero-core-720.webm
# Método
ffmpeg -i out/agent-flow-master.mp4 -vf scale=1600:684:flags=lanczos -c:v libx264 -crf 27 -preset slower -tune animation -pix_fmt yuv420p -movflags +faststart -an $V/agent-flow-1600.mp4
ffmpeg -i out/agent-flow-master.mp4 -vf scale=960:410:flags=lanczos  -c:v libx264 -crf 28 -preset slower -tune animation -pix_fmt yuv420p -movflags +faststart -an $V/agent-flow-960.mp4
ffmpeg -i out/agent-flow-master.mp4 -vf scale=1600:684:flags=lanczos -c:v libvpx-vp9 -crf 39 -b:v 0 -row-mt 1 -pix_fmt yuv420p -an $V/agent-flow-1600.webm
ffmpeg -i out/agent-flow-master.mp4 -vf scale=960:410:flags=lanczos  -c:v libvpx-vp9 -crf 40 -b:v 0 -row-mt 1 -pix_fmt yuv420p -an $V/agent-flow-960.webm
```

Para renderizar los masters: `npx remotion render HeroCore out/hero-core-master.mp4 --codec=h264 --crf=12` (igual con `AgentFlow`). Los pósteres salen de `npx remotion still HeroCore out/hero-core-poster.png --frame=0`.

Licencia: Remotion es gratuito para particulares y empresas de hasta 3 personas; a partir de 4 requiere licencia de empresa (remotion.pro).
