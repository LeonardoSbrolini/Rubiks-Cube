import type { Metadata } from "next";
import CubeSolverApp from "@/components/CubeSolverApp";

export const metadata: Metadata = {
  title: "Resolver · Cubo Mágico",
};

export default function ResolverPage() {
  return <CubeSolverApp />;
}
