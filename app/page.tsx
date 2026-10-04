import AiOrb from "@/components/AiOrb";
import AiPanel from "@/components/AiPanel";
import DrawingBoard from "@/components/DrawingBoard";
import Toast from "@/components/Toast";
import Toolbar from "@/components/Toolbar";

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-100">
      <DrawingBoard>
        {/* 面板挂进画板内部，定位基准就是那块画板 */}
        <AiPanel />
      </DrawingBoard>
      <Toolbar />
      <AiOrb />
      <Toast />
      {/* 窄屏下工具栏会折成两行并顶到左上角，这里直接隐藏标题让位 */}
      <p className="pointer-events-none absolute left-6 top-6 z-20 hidden text-xs font-semibold tracking-widest text-slate-400 sm:block">
        你画我猜
      </p>
    </main>
  );
}
