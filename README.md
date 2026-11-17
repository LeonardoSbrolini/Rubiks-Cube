# Cubo Mágico · Resolvedor

App web (Next.js 16 + Tailwind CSS 4 + three.js) para **sincronizar o seu cubo mágico físico** com um cubo 3D e **ver o passo a passo da solução**.

- Tamanhos 2×2 (solução ótima) e 3×3 (Kociemba).
- Variações visuais: Clássico, Sem adesivo, Cromado, Dourado, Neon e Pastel.
- Arraste sobre o cubo para girar a camada (ela acompanha o mouse/dedo e encaixa sozinha); arraste o fundo para mudar a vista.

## Como usar

1. **Pinte o cubo**: escolha uma cor e clique nos adesivos (no cubo 3D ou na planificação em cruz) até ficar igual ao seu. Comece por "Começar do zero" para deixar tudo cinza (só os centros pintados).
2. **Validação automática**: o app confere se há 9 adesivos de cada cor, centros diferentes, peças que existem de verdade, quinas torcidas, meios invertidos e paridade. Adesivos com problema piscam em vermelho.
3. **Resolver**: calcula a solução com o algoritmo de duas fases de Kociemba (biblioteca `cubejs`, rodando num Web Worker), normalmente com 18 a 22 movimentos.
4. **Passo a passo**: ▶ reproduz, ◀ / ▶︎▏ avançam um movimento por vez (com animação no cubo 3D), clique num movimento para pular até ele. Atalhos: ← →, espaço.
5. **Girar manualmente**: botões U R F D L B (e ', 2) ou teclado (Shift = anti-horário). Arraste o cubo para girar a vista.

Notação: U = cima, D = baixo, R = direita, L = esquerda, F = frente, B = trás. Sem sufixo = 90° horário olhando de frente para a face; `'` = anti-horário; `2` = meia volta.

## Rodando

```bash
npm install
npm run dev   # http://localhost:3000
```

## Estrutura

- `src/lib/cube.ts`: modelo do cubo (54 adesivos, ordem URFDLB), movimentos, validação.
- `src/lib/solver.ts` + `src/workers/solver.worker.ts`: solver Kociemba (cubejs) em Web Worker.
- `src/components/MetalCube.tsx`: cubo 3D (three.js) com acabamento metálico ou adesivos, clique para pintar e animação dos giros. Props no mesmo estilo do componente "Metal Rubik's" da OriginKit (`tint`, `gap`, `dragSensitivity`, `sizePercent`, `colorMode`).
- `src/components/FaceNet.tsx`: planificação 2D para pintar.
- `src/components/CubeSolverApp.tsx`: a página.
