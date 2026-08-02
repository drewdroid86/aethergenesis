import { SpeedInsights } from "@vercel/speed-insights/react";
import { AetherGenesis } from "./components/AetherGenesis";

export default function App() {
  return (
    <div className="w-full h-screen bg-black overflow-hidden">
      <AetherGenesis />
      <SpeedInsights />
    </div>
  );
}

