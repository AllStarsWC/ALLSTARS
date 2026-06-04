import { Switch, Route, Router as WouterRouter, Link } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GachaMachine } from "@/components/GachaMachine";
import { Collection } from "@/components/Collection";
import { Leaderboard } from "@/components/Leaderboard";
import { LiveFeed } from "@/components/LiveFeed";
import { Chat } from "@/components/Chat";
import AllStarsBountyPage from "./AllStarsBounty";
import { useState, useEffect } from "react";

const queryClient = new QueryClient();

function MainApp() {
  const [username, setUsername] = useState(() => localStorage.getItem("gacha_username") || "");

  // Polling to keep username in sync if updated in GachaMachine
  // A better way is context, but for a single page app this works for simple setup
  useEffect(() => {
    const handleStorage = () => {
      setUsername(localStorage.getItem("gacha_username") || "");
    };
    window.addEventListener("storage", handleStorage);
    // Setup interval just to catch local changes without dispatching events
    const interval = setInterval(() => {
      const current = localStorage.getItem("gacha_username") || "";
      if (current !== username) setUsername(current);
    }, 1000);
    return () => {
      window.removeEventListener("storage", handleStorage);
      clearInterval(interval);
    };
  }, [username]);

  return (
    <div className="min-h-[100dvh] w-full flex flex-col pb-20">
      <header className="w-full py-6 border-b border-white/5 bg-black/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-primary rounded transform rotate-45 flex items-center justify-center shadow-[0_0_15px_rgba(34,197,94,0.5)]">
                <div className="w-4 h-4 bg-background transform -rotate-45" />
             </div>
             <div>
               <h1 className="text-xl md:text-2xl font-black tracking-tighter uppercase text-white leading-none">
                 All Stars <span className="text-primary">Gacha</span>
               </h1>
               <p className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase mt-1">WC 2026 Edition</p>
             </div>
          </div>
          <Link
            href="/bounties"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono font-semibold text-[#4ade80] hover:bg-white/5 hover:border-[#4ade8040] transition-all"
          >
            <span style={{ fontSize: "10px" }}>★</span>
            BOUNTIES
          </Link>
          {username && (
             <div className="hidden md:flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-full border border-white/5">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-bold font-mono text-gray-300">{username}</span>
             </div>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 mt-8">
        <Tabs defaultValue="pull" className="w-full">
          <TabsList className="w-full flex bg-black/40 border border-white/5 p-1 rounded-xl h-auto flex-wrap justify-center sm:justify-start gap-1">
            <TabsTrigger value="pull" className="flex-1 sm:flex-none uppercase tracking-wider font-bold text-xs py-2 px-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Pull</TabsTrigger>
            <TabsTrigger value="collection" className="flex-1 sm:flex-none uppercase tracking-wider font-bold text-xs py-2 px-6 data-[state=active]:bg-white data-[state=active]:text-black">Vault</TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex-1 sm:flex-none uppercase tracking-wider font-bold text-xs py-2 px-6 data-[state=active]:bg-white data-[state=active]:text-black">Rankings</TabsTrigger>
            <TabsTrigger value="feed" className="flex-1 sm:flex-none uppercase tracking-wider font-bold text-xs py-2 px-6 data-[state=active]:bg-white data-[state=active]:text-black">Live Feed</TabsTrigger>
            <TabsTrigger value="chat" className="flex-1 sm:flex-none uppercase tracking-wider font-bold text-xs py-2 px-6 data-[state=active]:bg-white data-[state=active]:text-black">Chat</TabsTrigger>
          </TabsList>
          
          <div className="mt-8">
            <TabsContent value="pull" className="m-0 focus-visible:outline-none">
              <GachaMachine />
            </TabsContent>
            
            <TabsContent value="collection" className="m-0 focus-visible:outline-none">
              {username ? <Collection username={username} /> : (
                <div className="text-center py-20 text-muted-foreground border border-dashed border-card-border rounded-xl">
                   Set your Player ID on the Pull tab to view your vault.
                </div>
              )}
            </TabsContent>

            <TabsContent value="leaderboard" className="m-0 focus-visible:outline-none">
              <Leaderboard />
            </TabsContent>

            <TabsContent value="feed" className="m-0 focus-visible:outline-none">
              <LiveFeed />
            </TabsContent>

            <TabsContent value="chat" className="m-0 focus-visible:outline-none">
              <Chat username={username} />
            </TabsContent>
          </div>
        </Tabs>
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={MainApp} />
      <Route path="/bounties" component={AllStarsBountyPage} />
      <Route path="*" component={() => <div className="p-8">404 - Not Found</div>} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;