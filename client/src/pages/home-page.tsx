import { useState } from "react";
import HeaderNavigation from "@/components/header-navigation";
import TaskCaptureInterface from "@/components/task-capture-interface";
import StrategicPlanningMatrix from "@/components/strategic-planning-matrix";
import DailyWorksheet from "@/components/daily-worksheet";

type TabType = "capture" | "planning" | "daily";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabType>("capture");

  return (
    <div className="min-h-screen bg-background">
      <HeaderNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "capture" && <TaskCaptureInterface />}
        {activeTab === "planning" && <StrategicPlanningMatrix />}
        {activeTab === "daily" && <DailyWorksheet />}
      </main>
    </div>
  );
}
