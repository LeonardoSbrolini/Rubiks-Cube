declare module "cubejs" {
  interface CubeInstance {
    solve(maxDepth?: number): string;
    move(alg: string): CubeInstance;
    asString(): string;
  }
  interface CubeStatic {
    new (state?: unknown): CubeInstance;
    fromString(s: string): CubeInstance;
    initSolver(): void;
  }
  const Cube: CubeStatic;
  export default Cube;
}
declare module "cubejs/lib/solve";
